"""
Mizan (ميزان) - Lebanese Legal Assistant Backend
FastAPI + MongoDB + (your fine-tuned LoRA via GGUF / Claude Sonnet 4.5 fallback)
"""
import os
import json
import uuid
import asyncio
import logging
import threading
import httpx
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional, AsyncGenerator

from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict

# `emergentintegrations` is used only for the Claude Sonnet fallback.
# Import it lazily inside `_call_claude` so the package is optional.

# ---------- Setup ----------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
MONGO_URL = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
DB_NAME = os.environ.get("DB_NAME", "mizan")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

# ---- Fine-tuned local model (your Hugging Face GGUF) ----
# When USE_FINETUNED=true, the backend loads the GGUF on first request and uses
# it as the default model. This is enabled by default so the chatbot uses your
# Hugging Face model unless you explicitly turn it off.
USE_FINETUNED = os.environ.get("USE_FINETUNED", "true").lower() == "true"

# Keep Claude as an explicit opt-in escape hatch only.
ALLOW_CLAUDE_FALLBACK = os.environ.get("ALLOW_CLAUDE_FALLBACK", "false").lower() == "true"
FINETUNED_MODEL_PATH = os.environ.get(
    "FINETUNED_MODEL_PATH", "/app/models/llama-3-8b-instruct.Q4_K_M.gguf"
)
FINETUNED_HF_REPO = os.environ.get("FINETUNED_HF_REPO", "olaasm/mizan")
FINETUNED_HF_FILE = os.environ.get(
    "FINETUNED_HF_FILE", "llama-3-8b-instruct.Q4_K_M.gguf"
)
FINETUNED_N_CTX = int(os.environ.get("FINETUNED_N_CTX", "2048"))
FINETUNED_N_THREADS = int(os.environ.get("FINETUNED_N_THREADS", "6"))

# Optional: external local quantized chatbot server (separate process).
CHATBOT_LOCAL_URL = os.environ.get("CHATBOT_LOCAL_URL", "").strip()

# Lazy-loaded llama_cpp.Llama instance + an asyncio lock so we serialise inference
_llm_instance = None
_llm_lock = asyncio.Lock()

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("mizan")

app = FastAPI(title="Mizan API")
api = APIRouter(prefix="/api")

# ---------- System Prompt (Arabic, Lebanese law focused) ----------
SYSTEM_PROMPT = """أنت "ميزان"، مساعد قانوني لبناني ذكي ومتخصص في القانون اللبناني والقضايا الدولية.

مهمتك:
- الإجابة عن الأسئلة المتعلقة بالقوانين اللبنانية (قانون العقوبات، الموجبات والعقود، الأحوال الشخصية، العمل، التجارة، الإيجارات، السير، الضرائب، إلخ).
- شرح القضايا الدولية ذات الصلة بلبنان أو القانون المقارن عند الحاجة.
- مساعدة المستخدم في صياغة المستندات والإفادات والاستحضارات والعرائض والعقود البسيطة باللغة العربية الفصحى القانونية.
- ذكر أرقام المواد القانونية ومصدرها كلما أمكن (مثلاً: "المادة 547 من قانون العقوبات اللبناني").

أسلوبك:
- أجب دائماً باللغة العربية الفصحى ما لم يطلب المستخدم خلاف ذلك.
- كن دقيقاً، موضوعياً، ومنظماً. استخدم نقاطاً وعناوين فرعية عند الحاجة.
- إذا كان السؤال غامضاً، اطلب توضيحاً قبل الإجابة.
- نبّه دائماً بأن إجاباتك للاطلاع العام ولا تغني عن استشارة محامٍ مختص.

ابدأ المحادثة بترحيب موجز إن كانت أول رسالة."""

# ---------- Models ----------
class Chat(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str = "محادثة جديدة"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Message(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    chat_id: str
    role: str  # "user" | "assistant"
    content: str
    source: Optional[str] = None  # "finetuned" | "claude" | "local_url"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ChatCreate(BaseModel):
    title: Optional[str] = None


class SendMessageBody(BaseModel):
    chat_id: str
    content: str
    use_local: bool = False        # external CHATBOT_LOCAL_URL server
    use_finetuned: bool = False    # in-process GGUF fine-tuned model


# ---------- Helpers ----------
async def _generate_title_from_first_message(text: str) -> str:
    # Take first ~40 chars of user content as title
    t = text.strip().replace("\n", " ")
    return (t[:40] + "…") if len(t) > 40 else (t or "محادثة جديدة")


async def _call_local_chatbot(history: List[dict]) -> Optional[str]:
    """Try calling the user's local quantized GGUF chatbot server. Returns None on failure."""
    if not CHATBOT_LOCAL_URL:
        return None
    try:
        async with httpx.AsyncClient(timeout=120.0) as cx:
            r = await cx.post(
                f"{CHATBOT_LOCAL_URL.rstrip('/')}/chat",
                json={"system": SYSTEM_PROMPT, "messages": history},
            )
            r.raise_for_status()
            data = r.json()
            return data.get("reply")
    except Exception as e:
        logger.warning("Local chatbot unreachable: %s", e)
        return None


def _ensure_model_file() -> bool:
    """Make sure the GGUF file is on disk. Download from HF if missing."""
    if os.path.exists(FINETUNED_MODEL_PATH):
        return True
    try:
        from huggingface_hub import hf_hub_download
        logger.info("Downloading fine-tuned GGUF from HF: %s/%s",
                    FINETUNED_HF_REPO, FINETUNED_HF_FILE)
        os.makedirs(os.path.dirname(FINETUNED_MODEL_PATH), exist_ok=True)
        path = hf_hub_download(
            repo_id=FINETUNED_HF_REPO,
            filename=FINETUNED_HF_FILE,
            local_dir=os.path.dirname(FINETUNED_MODEL_PATH),
        )
        # hf_hub_download may place the file under <local_dir>/<filename>; make sure
        # FINETUNED_MODEL_PATH points to it.
        if path != FINETUNED_MODEL_PATH and os.path.exists(path):
            os.replace(path, FINETUNED_MODEL_PATH)
        return os.path.exists(FINETUNED_MODEL_PATH)
    except Exception as e:
        logger.exception("Failed to download fine-tuned model: %s", e)
        return False


def _load_llm():
    """Load the GGUF model into RAM once, then reuse for every request."""
    global _llm_instance
    if _llm_instance is not None:
        return _llm_instance
    if not _ensure_model_file():
        return None
    try:
        from llama_cpp import Llama
        logger.info("Loading GGUF model from %s (ctx=%d, threads=%d)…",
                    FINETUNED_MODEL_PATH, FINETUNED_N_CTX, FINETUNED_N_THREADS)
        _llm_instance = Llama(
            model_path=FINETUNED_MODEL_PATH,
            n_ctx=FINETUNED_N_CTX,
            n_threads=FINETUNED_N_THREADS,
            chat_format="llama-3",
            verbose=False,
        )
        logger.info("GGUF model loaded.")
        return _llm_instance
    except Exception as e:
        logger.exception("Failed to load GGUF model: %s", e)
        return None


def _run_finetuned_sync(history: List[dict]) -> str:
    """Synchronous inference call (runs in a thread to avoid blocking the loop)."""
    llm = _load_llm()
    if llm is None:
        raise RuntimeError("Fine-tuned model not available")
    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in history:
        msgs.append({"role": m["role"], "content": m["content"]})
    out = llm.create_chat_completion(
        messages=msgs,
        temperature=0.4,
        max_tokens=256,
    )
    return out["choices"][0]["message"]["content"].strip()


async def _call_finetuned(history: List[dict]) -> Optional[str]:
    """Call the fine-tuned LoRA via llama-cpp-python in a worker thread."""
    try:
        async with _llm_lock:
            return await asyncio.to_thread(_run_finetuned_sync, history)
    except Exception as e:
        logger.warning("Fine-tuned model error, will fall back: %s", e)
        return None


async def _stream_finetuned(history: List[dict]) -> AsyncGenerator[str, None]:
    """Yield tokens from the fine-tuned model one chunk at a time."""
    llm = _load_llm()
    if llm is None:
        raise RuntimeError("Fine-tuned model not available")

    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in history:
        msgs.append({"role": m["role"], "content": m["content"]})

    loop = asyncio.get_running_loop()
    q: asyncio.Queue = asyncio.Queue()
    SENTINEL = object()

    def producer() -> None:
        try:
            for chunk in llm.create_chat_completion(
                messages=msgs,
                temperature=0.4,
                max_tokens=256,
                stream=True,
            ):
                delta = chunk["choices"][0].get("delta", {}).get("content", "")
                if delta:
                    asyncio.run_coroutine_threadsafe(q.put(delta), loop)
        except Exception as e:  # noqa: BLE001
            asyncio.run_coroutine_threadsafe(q.put(e), loop)
        finally:
            asyncio.run_coroutine_threadsafe(q.put(SENTINEL), loop)

    async with _llm_lock:
        t = threading.Thread(target=producer, daemon=True)
        t.start()
        try:
            while True:
                item = await q.get()
                if item is SENTINEL:
                    return
                if isinstance(item, Exception):
                    raise item
                yield item
        finally:
            t.join(timeout=5)


async def _stream_claude(session_id: str, history: List[dict]) -> AsyncGenerator[str, None]:
    """Claude doesn't expose streaming via emergentintegrations, so emit the
    full reply as a single chunk. The UI still gets a 'done' event afterwards.
    """
    reply = await _call_claude(session_id, history)
    if reply:
        # Chunk by ~30 chars so the UI animates a little even without real streaming
        step = 32
        for i in range(0, len(reply), step):
            yield reply[i : i + step]
            await asyncio.sleep(0.015)


async def _call_claude(session_id: str, history: List[dict]) -> str:
    """Call Claude Sonnet 4.5 via emergentintegrations. History is a list of {role, content}."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception:
        raise HTTPException(
            500,
            "Claude integration unavailable: install 'emergentintegrations' or enable a different LLM (set `USE_FINETUNED` or configure `CHATBOT_LOCAL_URL`).",
        )

    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY missing in backend/.env")

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    # Replay all but the last message as context, then send the last one.
    # The library maintains its own session memory keyed by session_id so on each
    # request we re-send only the latest user message after a fresh LlmChat.
    # Simpler: send the concatenated history as one message to ensure context.
    # We'll feed messages sequentially.
    last_user_text = ""
    for m in history:
        if m["role"] == "user":
            last_user_text = m["content"]

    # Build a context block from previous turns (excluding the last user msg)
    prior = history[:-1]
    if prior:
        ctx_lines = []
        for m in prior:
            who = "المستخدم" if m["role"] == "user" else "ميزان"
            ctx_lines.append(f"{who}: {m['content']}")
        context_block = "سياق المحادثة السابقة:\n" + "\n".join(ctx_lines) + "\n\nرسالة المستخدم الحالية:\n" + last_user_text
    else:
        context_block = last_user_text

    response = await chat.send_message(UserMessage(text=context_block))
    return response if isinstance(response, str) else str(response)


# ---------- Routes ----------
@api.get("/")
async def root():
    return {"app": "Mizan", "status": "ok"}


@api.get("/health")
async def health():
    return {
        "status": "ok",
        "llm": "configured" if EMERGENT_LLM_KEY else "missing",
        "local_chatbot": bool(CHATBOT_LOCAL_URL),
        "finetuned": {
            "enabled": USE_FINETUNED,
            "model_path": FINETUNED_MODEL_PATH,
            "downloaded": os.path.exists(FINETUNED_MODEL_PATH),
            "loaded": _llm_instance is not None,
            "hf_repo": FINETUNED_HF_REPO,
        },
    }


@api.post("/chats", response_model=Chat)
async def create_chat(body: ChatCreate):
    chat_obj = Chat(title=body.title or "محادثة جديدة")
    await db.chats.insert_one(chat_obj.model_dump())
    return chat_obj


@api.get("/chats", response_model=List[Chat])
async def list_chats():
    docs = await db.chats.find({}, {"_id": 0}).sort("updated_at", -1).to_list(500)
    return docs


@api.get("/chats/{chat_id}", response_model=Chat)
async def get_chat(chat_id: str):
    doc = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Chat not found")
    return doc


@api.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str):
    await db.messages.delete_many({"chat_id": chat_id})
    res = await db.chats.delete_one({"id": chat_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Chat not found")
    return {"ok": True}


@api.get("/chats/{chat_id}/messages", response_model=List[Message])
async def list_messages(chat_id: str):
    docs = await db.messages.find({"chat_id": chat_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return docs


@api.post("/chat", response_model=Message)
async def send_message(body: SendMessageBody):
    chat = await db.chats.find_one({"id": body.chat_id}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")

    if not body.content.strip():
        raise HTTPException(400, "Empty message")

    # Persist user message
    user_msg = Message(chat_id=body.chat_id, role="user", content=body.content.strip())
    await db.messages.insert_one(user_msg.model_dump())

    # Build history
    history_docs = await db.messages.find(
        {"chat_id": body.chat_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    history = [{"role": d["role"], "content": d["content"]} for d in history_docs]

    # Order of preference:
    #   1. External CHATBOT_LOCAL_URL (if configured and use_local=true)
    #   2. In-process fine-tuned GGUF (your Hugging Face model) if use_finetuned=true
    #      OR USE_FINETUNED env flag is true (server-wide default)
    #   3. Claude Sonnet 4.5 only if ALLOW_CLAUDE_FALLBACK=true
    reply_text: Optional[str] = None
    source = "claude"

    if body.use_local:
        reply_text = await _call_local_chatbot(history)
        if reply_text is not None:
            source = "local_url"

    if reply_text is None and (body.use_finetuned or USE_FINETUNED):
        reply_text = await _call_finetuned(history)
        if reply_text is not None:
            source = "finetuned"

    if reply_text is None:
        if ALLOW_CLAUDE_FALLBACK:
            try:
                reply_text = await _call_claude(body.chat_id, history)
            except HTTPException:
                raise
            except Exception as e:
                logger.exception("LLM error")
                raise HTTPException(500, f"LLM error: {e}")
        else:
            raise HTTPException(
                503,
                "Fine-tuned model unavailable. Enable ALLOW_CLAUDE_FALLBACK=true only if you want Claude as a backup.",
            )

    # Persist assistant message
    ai_msg = Message(
        chat_id=body.chat_id, role="assistant", content=reply_text, source=source
    )
    await db.messages.insert_one(ai_msg.model_dump())

    # Update chat title (if still default) and updated_at
    new_title = chat.get("title", "محادثة جديدة")
    if new_title == "محادثة جديدة":
        new_title = await _generate_title_from_first_message(body.content)
    await db.chats.update_one(
        {"id": body.chat_id},
        {"$set": {"title": new_title, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )

    return ai_msg


@api.post("/chat/stream")
async def send_message_stream(body: SendMessageBody):
    """Server-Sent Events endpoint. Emits:
        event: token   data: {"text": "..."}
        event: done    data: {"message_id": "...", "source": "..."}
        event: error   data: {"error": "..."}
    """
    chat = await db.chats.find_one({"id": body.chat_id}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    if not body.content.strip():
        raise HTTPException(400, "Empty message")

    # Persist user message synchronously so the UI's optimistic copy lines up
    user_msg = Message(
        chat_id=body.chat_id, role="user", content=body.content.strip()
    )
    await db.messages.insert_one(user_msg.model_dump())

    history_docs = (
        await db.messages.find({"chat_id": body.chat_id}, {"_id": 0})
        .sort("created_at", 1)
        .to_list(1000)
    )
    history = [{"role": d["role"], "content": d["content"]} for d in history_docs]

    use_finetuned_now = body.use_finetuned or USE_FINETUNED

    async def event_gen():
        full_chunks: List[str] = []
        source = "finetuned" if use_finetuned_now else "claude"
        try:
            if use_finetuned_now:
                gen = _stream_finetuned(history)
            elif ALLOW_CLAUDE_FALLBACK:
                gen = _stream_claude(body.chat_id, history)
            else:
                raise HTTPException(
                    503,
                    "Fine-tuned model unavailable. Enable ALLOW_CLAUDE_FALLBACK=true only if you want Claude as a backup.",
                )

            async for token in gen:
                full_chunks.append(token)
                yield f"event: token\ndata: {json.dumps({'text': token}, ensure_ascii=False)}\n\n"

            reply_text = "".join(full_chunks)

            # Persist assistant message
            ai_msg = Message(
                chat_id=body.chat_id,
                role="assistant",
                content=reply_text,
                source=source,
            )
            await db.messages.insert_one(ai_msg.model_dump())

            # Title + updated_at
            new_title = chat.get("title", "محادثة جديدة")
            if new_title == "محادثة جديدة":
                new_title = await _generate_title_from_first_message(body.content)
            await db.chats.update_one(
                {"id": body.chat_id},
                {
                    "$set": {
                        "title": new_title,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }
                },
            )

            yield f"event: done\ndata: {json.dumps({'message_id': ai_msg.id, 'source': source}, ensure_ascii=False)}\n\n"
        except Exception as e:  # noqa: BLE001
            logger.exception("Stream error")
            yield f"event: error\ndata: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()