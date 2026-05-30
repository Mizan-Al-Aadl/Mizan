import os
import json
import uuid
import asyncio
import logging
import threading
import re
import contextlib
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional, AsyncGenerator

try:
    from googletrans import Translator
except ImportError:
    Translator = None

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "mizan")
MONGO_SERVER_SELECTION_TIMEOUT_MS = int(os.environ.get("MONGO_SERVER_SELECTION_TIMEOUT_MS", "5000"))

USE_FINETUNED = os.environ.get("USE_FINETUNED", "false").lower() == "true"
FINETUNED_MODEL_PATH = os.environ.get(
    "FINETUNED_MODEL_PATH", "C:/tmp/mizan-chatbot/mizan-q4_k_m.gguf"
)
FINETUNED_HF_REPO = os.environ.get("FINETUNED_HF_REPO", "olaasm/mizan")
FINETUNED_HF_FILE = os.environ.get(
    "FINETUNED_HF_FILE", "llama-3-8b-instruct.Q4_K_M.gguf"
)
FINETUNED_N_CTX = int(os.environ.get("FINETUNED_N_CTX", "2048"))
FINETUNED_N_THREADS = int(os.environ.get("FINETUNED_N_THREADS", "4"))

CHATBOT_LOCAL_URL = os.environ.get("CHATBOT_LOCAL_URL", "").strip()

AZURE_ML_ENDPOINT = os.environ.get("AZURE_ML_ENDPOINT", "").strip()
AZURE_ML_API_KEY = os.environ.get("AZURE_ML_API_KEY", "").strip()
AZURE_ML_DEPLOYMENT = os.environ.get("AZURE_ML_DEPLOYMENT", "").strip()
USE_AZURE_ENDPOINT = os.environ.get("USE_AZURE_ENDPOINT", "true").lower() == "true"
AZURE_TEMPERATURE = float(os.environ.get("AZURE_TEMPERATURE", "0.4"))
AZURE_MAX_TOKENS = int(os.environ.get("AZURE_MAX_TOKENS", "128"))
AZURE_FREQUENCY_PENALTY = float(os.environ.get("AZURE_FREQUENCY_PENALTY", "1.15"))
AZURE_PRESENCE_PENALTY = float(os.environ.get("AZURE_PRESENCE_PENALTY", "1.0"))
AZURE_INCLUDE_SYSTEM_PROMPT = os.environ.get("AZURE_INCLUDE_SYSTEM_PROMPT", "false").lower() == "true"
AZURE_HISTORY_MAX_MESSAGES = int(os.environ.get("AZURE_HISTORY_MAX_MESSAGES", "6"))
AZURE_CONTEXT_WINDOW = int(os.environ.get("AZURE_CONTEXT_WINDOW", "512"))
AZURE_AUTO_CONTINUE_ROUNDS = int(os.environ.get("AZURE_AUTO_CONTINUE_ROUNDS", "2"))
MODEL_HTTP_TIMEOUT_SECONDS = float(os.environ.get("MODEL_HTTP_TIMEOUT_SECONDS", "60"))
STREAM_KEEPALIVE_SECONDS = float(os.environ.get("STREAM_KEEPALIVE_SECONDS", "10"))
AZURE_REQUEST_MAX_RETRIES = int(os.environ.get("AZURE_REQUEST_MAX_RETRIES", "2"))
AZURE_RETRY_BACKOFF_BASE = float(os.environ.get("AZURE_RETRY_BACKOFF_BASE", "1.5"))

_llm_instance = None
_llm_lock = asyncio.Lock()

client = AsyncIOMotorClient(
    MONGO_URL,
    serverSelectionTimeoutMS=MONGO_SERVER_SELECTION_TIMEOUT_MS,
)
db = client[DB_NAME]

# Configure logging to output to stderr with proper formatting
logger = logging.getLogger("mizan")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
handler.setFormatter(formatter)
if not logger.handlers:
    logger.addHandler(handler)

# Initialize translator for Arabic translation (lazy-loaded)
translator = None

async def _get_translator():
    """Get or initialize the translator"""
    global translator
    if translator is None and Translator:
        translator = Translator()
    return translator

app = FastAPI(title="Mizan API")
api = APIRouter(prefix="/api")

SYSTEM_PROMPT = """You are Mizan, a Lebanese legal assistant specialized in Lebanese law. Answer all questions based exclusively on Lebanese laws. Cite article numbers. You will receive questions in both Arabic and English. Always respond in Arabic."""


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
    role: str
    content: str
    source: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ChatCreate(BaseModel):
    title: Optional[str] = None


class ChatUpdate(BaseModel):
    title: str


class SendMessageBody(BaseModel):
    chat_id: str
    content: str
    use_local: bool = False
    use_azure: bool = False
    use_finetuned: bool = False


async def _generate_title_from_first_message(text: str) -> str:
    t = text.strip().replace("\n", " ")
    return (t[:40] + "…") if len(t) > 40 else (t or "محادثة جديدة")


async def _call_local_chatbot(history: List[dict]) -> Optional[str]:
    if not CHATBOT_LOCAL_URL:
        return None
    try:
        async with httpx.AsyncClient(timeout=MODEL_HTTP_TIMEOUT_SECONDS) as cx:
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


def _azure_headers() -> dict:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {AZURE_ML_API_KEY}",
    }
    if AZURE_ML_DEPLOYMENT:
        headers["azureml-model-deployment"] = AZURE_ML_DEPLOYMENT
    return headers


def _extract_reply_from_azure(data: dict) -> Optional[str]:
    choices = data.get("choices") or []
    if not choices:
        return None
    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    return None


def _extract_finish_reason_from_azure(data: dict) -> Optional[str]:
    choices = data.get("choices") or []
    if not choices:
        return None
    reason = choices[0].get("finish_reason")
    if isinstance(reason, str):
        return reason
    return None


def _looks_truncated(reply: str, finish_reason: Optional[str]) -> bool:
    if not reply:
        return False
    if finish_reason in {"length", "max_tokens"}:
        return True

    # If the model stops without closing punctuation, try one continuation pass.
    return bool(re.search(r"[\w\u0600-\u06FF]\s*$", reply))


def _build_azure_messages(history: List[dict]) -> List[dict]:
    """Build messages for Azure, ensuring valid conversation structure
    
    Strategy: Keep the most recent message (user's current question) and 
    one or more prior messages to provide context, prioritizing assistant messages.
    """
    if not history:
        return []
    
    logger.info("_build_azure_messages: input history=%d", len(history))

    def _approx_tokens(text: str) -> int:
        # Conservative token estimate: words ~= tokens
        if not text:
            return 0
        return max(1, len(re.findall(r"\S+", text)))

    # Reserve tokens for the model's response
    reserved_for_response = AZURE_MAX_TOKENS
    max_context = AZURE_CONTEXT_WINDOW
    available_for_context = max(0, max_context - reserved_for_response)

    msgs: List[dict] = []
    system_tokens = 0
    
    # Add system prompt if enabled
    if AZURE_INCLUDE_SYSTEM_PROMPT:
        system_tokens = _approx_tokens(SYSTEM_PROMPT) + 4
        if system_tokens >= available_for_context:
            short_sys = SYSTEM_PROMPT[:1024]
            msgs.append({"role": "system", "content": short_sys})
            available_for_context = max(0, available_for_context - _approx_tokens(short_sys) - 4)
        else:
            msgs.append({"role": "system", "content": SYSTEM_PROMPT})
            available_for_context = max(0, available_for_context - system_tokens)

    # Build conversation history: keep most recent messages that fit in token budget
    # Prioritize including: last user message + at least one recent assistant message if available
    kept: List[dict] = []
    tokens = 0
    
    # Iterate from most recent backwards
    for idx in range(len(history) - 1, -1, -1):
        msg = history[idx]
        msg_tokens = _approx_tokens(str(msg.get("content", ""))) + 4
        
        # Always keep the most recent message (current user question)
        if idx == len(history) - 1:
            kept.insert(0, msg)
            tokens += msg_tokens
            continue
        
        # For earlier messages, only keep if we have token budget
        if tokens + msg_tokens <= available_for_context:
            kept.insert(0, msg)
            tokens += msg_tokens
            # Stop after collecting enough context (max AZURE_HISTORY_MAX_MESSAGES)
            if len(kept) >= AZURE_HISTORY_MAX_MESSAGES:
                break
        else:
            break
    
    # Context is now handled by English system prompt to avoid encoding issues
    
    msgs.extend(kept)
    logger.info("_build_azure_messages: returning %d messages (tokens=%d)", len(msgs), tokens)
    return msgs


async def _call_azure_endpoint(history: List[dict]) -> Optional[str]:
    if not AZURE_ML_ENDPOINT or not AZURE_ML_API_KEY:
        return None

    msgs = _build_azure_messages(history)
    collected_parts: List[str] = []

    try:
        async with httpx.AsyncClient(timeout=MODEL_HTTP_TIMEOUT_SECONDS) as cx:
            for round_idx in range(max(0, AZURE_AUTO_CONTINUE_ROUNDS) + 1):
                payload = {
                    "messages": msgs,
                    "temperature": AZURE_TEMPERATURE,
                    "max_tokens": AZURE_MAX_TOKENS,
                    "frequency_penalty": AZURE_FREQUENCY_PENALTY,
                    "presence_penalty": AZURE_PRESENCE_PENALTY,
                }
                # Log first 500 chars of payload (truncate for readability)
                logger.info("Sending to Azure: %s", json.dumps(payload, ensure_ascii=False)[:500])

                last_exc = None
                for attempt in range(1, AZURE_REQUEST_MAX_RETRIES + 2):
                    try:
                        # Ensure UTF-8 encoding for the request body
                        r = await cx.post(
                            AZURE_ML_ENDPOINT, 
                            headers=_azure_headers(),
                            json=payload,
                            # httpx will automatically UTF-8 encode the JSON content
                        )
                        r.raise_for_status()
                        data = r.json()
                        break
                    except httpx.HTTPStatusError as e:
                        status = getattr(e.response, "status_code", None)
                        # Retry on transient server/client errors like 408/429/5xx
                        if status in {408, 429, 500, 502, 503, 504} and attempt <= AZURE_REQUEST_MAX_RETRIES:
                            backoff = AZURE_RETRY_BACKOFF_BASE ** (attempt - 1)
                            logger.warning("Azure HTTP %s on attempt %s, retrying after %.1fs", status, attempt, backoff)
                            await asyncio.sleep(backoff)
                            last_exc = e
                            continue
                        # otherwise re-raise
                        raise
                    except httpx.TimeoutException as e:
                        if attempt <= AZURE_REQUEST_MAX_RETRIES:
                            backoff = AZURE_RETRY_BACKOFF_BASE ** (attempt - 1)
                            logger.warning("Azure request timed out on attempt %s, retrying after %.1fs", attempt, backoff)
                            await asyncio.sleep(backoff)
                            last_exc = e
                            continue
                        raise

                if last_exc is not None and (not isinstance(last_exc, httpx.HTTPStatusError)):
                    # propagate last exception if retries exhausted
                    raise last_exc

                if isinstance(data, dict) and data.get("error"):
                    raise RuntimeError(f"Azure endpoint error: {data.get('error')}")

                parsed = data if isinstance(data, dict) else {}
                reply = _extract_reply_from_azure(parsed)
                finish_reason = _extract_finish_reason_from_azure(parsed)
                if not reply:
                    raise RuntimeError("Azure endpoint response missing expected choices/message content")

                collected_parts.append(reply)

                if not _looks_truncated(reply, finish_reason):
                    break
                if round_idx >= AZURE_AUTO_CONTINUE_ROUNDS:
                    break

                msgs.append({"role": "assistant", "content": reply})
                msgs.append(
                    {
                        "role": "user",
                        "content": "تابع من حيث توقفت في نفس الجواب، من آخر كلمة، دون إعادة المقدمة أو تكرار ما سبق.",
                    }
                )

            final_reply = "".join(collected_parts).strip()
            if final_reply:
                return final_reply

            raise RuntimeError("Azure endpoint returned empty reply")
    except httpx.HTTPStatusError as e:
        detail = ""
        try:
            detail = e.response.text[:500]
        except Exception:
            detail = ""
        raise RuntimeError(f"Azure HTTP {e.response.status_code}: {detail}")
    except httpx.TimeoutException:
        raise RuntimeError(f"Azure request timed out after {MODEL_HTTP_TIMEOUT_SECONDS} seconds")
    except Exception as e:
        raise RuntimeError(f"Azure endpoint unreachable: {e}")


async def _detect_and_translate(text: str) -> str:
    """Detect language of text and translate to Arabic if not already"""
    try:
        if not Translator:
            logger.warning("Translator class not imported")
            return text
        
        t = await _get_translator()
        if not t:
            logger.warning("Translator instance could not be initialized")
            return text
        
        # Detect the language
        detection = await t.detect(text)
        detected_lang = detection.get('lang', 'en') if isinstance(detection, dict) else getattr(detection, 'lang', 'en')
        
        logger.info("Detected language: %s", detected_lang)
        
        # If already in Arabic, return as-is
        if detected_lang in ('ar', 'und'):  # und = undetermined, likely Arabic
            logger.info("Response already in Arabic, not translating")
            return text
        
        # Otherwise translate to Arabic
        result = await t.translate(text, 'ar')
        
        # Result is a Translated object with .text attribute
        if hasattr(result, 'text'):
            return result.text
        else:
            logger.warning("Translation result has no .text attribute")
            return text
    except Exception as e:
        logger.error("Detection/translation failed: %s", str(e)[:100])
        return text


async def _stream_azure(history: List[dict]) -> AsyncGenerator[str, None]:
    reply = await _call_azure_endpoint(history)
    if not reply:
        raise RuntimeError("Azure endpoint unreachable or returned empty reply")
    
    logger.info("Raw Azure reply (first 300 chars): %s", reply[:300])
    
    # Detect language and translate to Arabic if needed
    arabic_reply = await _detect_and_translate(reply)
    
    logger.info("After language processing (first 300 chars): %s", arabic_reply[:300])
    
    # Stream character by character for better Arabic support
    for char in arabic_reply:
        yield char
        if char in (' ', '\n'):  # Small delay after spaces/newlines
            await asyncio.sleep(0.01)


def _ensure_model_file() -> bool:
    if os.path.exists(FINETUNED_MODEL_PATH):
        return True
    try:
        from huggingface_hub import hf_hub_download

        logger.info("Downloading fine-tuned GGUF from HF: %s/%s", FINETUNED_HF_REPO, FINETUNED_HF_FILE)
        model_dir = os.path.dirname(FINETUNED_MODEL_PATH)
        if model_dir:
            os.makedirs(model_dir, exist_ok=True)

        path = hf_hub_download(
            repo_id=FINETUNED_HF_REPO,
            filename=FINETUNED_HF_FILE,
            local_dir=model_dir or None,
        )

        if path != FINETUNED_MODEL_PATH and os.path.exists(path):
            os.replace(path, FINETUNED_MODEL_PATH)

        return os.path.exists(FINETUNED_MODEL_PATH)
    except Exception as e:
        logger.exception("Failed to download fine-tuned model: %s", e)
        return False


def _load_llm():
    global _llm_instance
    if _llm_instance is not None:
        return _llm_instance
    if not _ensure_model_file():
        return None
    try:
        from llama_cpp import Llama

        logger.info("Loading GGUF model from %s (ctx=%d, threads=%d)", FINETUNED_MODEL_PATH, FINETUNED_N_CTX, FINETUNED_N_THREADS)
        _llm_instance = Llama(
            model_path=FINETUNED_MODEL_PATH,
            n_ctx=FINETUNED_N_CTX,
            n_threads=FINETUNED_N_THREADS,
            chat_format="llama-3",
            verbose=False,
        )
        logger.info("GGUF model loaded")
        return _llm_instance
    except Exception as e:
        logger.exception("Failed to load GGUF model: %s", e)
        return None


def _run_finetuned_sync(history: List[dict]) -> str:
    llm = _load_llm()
    if llm is None:
        raise RuntimeError("Fine-tuned model not available")

    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in history:
        msgs.append({"role": m["role"], "content": m["content"]})

    out = llm.create_chat_completion(messages=msgs, temperature=0.4, max_tokens=256)
    return out["choices"][0]["message"]["content"].strip()


async def _call_finetuned(history: List[dict]) -> Optional[str]:
    try:
        async with _llm_lock:
            return await asyncio.to_thread(_run_finetuned_sync, history)
    except Exception as e:
        logger.warning("Fine-tuned model error, will fall back: %s", e)
        return None


async def _stream_finetuned(history: List[dict]) -> AsyncGenerator[str, None]:
    llm = _load_llm()
    if llm is None:
        raise RuntimeError("Fine-tuned model not available")

    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in history:
        msgs.append({"role": m["role"], "content": m["content"]})

    loop = asyncio.get_running_loop()
    q: asyncio.Queue = asyncio.Queue()
    sentinel = object()

    def producer() -> None:
        try:
            for chunk in llm.create_chat_completion(messages=msgs, temperature=0.4, max_tokens=256, stream=True):
                delta = chunk["choices"][0].get("delta", {}).get("content", "")
                if delta:
                    asyncio.run_coroutine_threadsafe(q.put(delta), loop)
        except Exception as e:
            asyncio.run_coroutine_threadsafe(q.put(e), loop)
        finally:
            asyncio.run_coroutine_threadsafe(q.put(sentinel), loop)

    async with _llm_lock:
        t = threading.Thread(target=producer, daemon=True)
        t.start()
        try:
            while True:
                item = await q.get()
                if item is sentinel:
                    return
                if isinstance(item, Exception):
                    raise item
                yield item
        finally:
            t.join(timeout=5)


async def _stream_local(history: List[dict]) -> AsyncGenerator[str, None]:
    reply = await _call_local_chatbot(history)
    if not reply:
        raise RuntimeError("Local chatbot unreachable or returned empty reply")
    for part in re.findall(r"\S+\s*", reply):
        yield part
        await asyncio.sleep(0.01)


async def _with_keepalive(gen: AsyncGenerator[str, None], interval_seconds: float) -> AsyncGenerator[str, None]:
    q: asyncio.Queue = asyncio.Queue()
    sentinel = object()

    async def producer() -> None:
        try:
            async for item in gen:
                await q.put(item)
        except Exception as e:
            await q.put(e)
        finally:
            await q.put(sentinel)

    task = asyncio.create_task(producer())
    try:
        while True:
            try:
                item = await asyncio.wait_for(q.get(), timeout=interval_seconds)
            except asyncio.TimeoutError:
                yield "event: ping\ndata: {}\n\n"
                continue

            if item is sentinel:
                break
            if isinstance(item, Exception):
                raise item

            yield item
    finally:
        if not task.done():
            task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


@api.get("/")
async def root():
    return {"app": "Mizan", "status": "ok"}


@api.get("/health")
async def health():
    return {
        "status": "ok",
        "local_chatbot": bool(CHATBOT_LOCAL_URL),
        "azure": {
            "enabled": USE_AZURE_ENDPOINT,
            "configured": bool(AZURE_ML_ENDPOINT and AZURE_ML_API_KEY),
            "endpoint": AZURE_ML_ENDPOINT,
            "deployment": AZURE_ML_DEPLOYMENT,
        },
        "finetuned": {
            "enabled": USE_FINETUNED,
            "model_path": FINETUNED_MODEL_PATH,
            "downloaded": os.path.exists(FINETUNED_MODEL_PATH),
            "loaded": _llm_instance is not None,
            "hf_repo": FINETUNED_HF_REPO,
        },
    }


@api.post("/debug/raw")
async def debug_raw(request: Request):
    """Temporary debug endpoint: logs raw request body for troubleshooting malformed requests."""
    try:
        body = await request.body()
        try:
            text = body.decode("utf-8")
        except Exception:
            text = repr(body)
        client_host = getattr(request.client, "host", None) if request.client else None
        logger.info("DEBUG RAW received from=%s path=%s body=%s", client_host, request.url.path, (text[:10000] if isinstance(text, str) else str(text)))
        return {"received": text, "length": len(body)}
    except Exception as e:
        logger.exception("Failed to read raw body: %s", e)
        raise HTTPException(500, "Failed to read body")


@api.post("/debug/azure_test")
async def debug_azure_test():
    """Temporary debug endpoint: call AZURE endpoint with minimal payload and return status/result."""
    if not AZURE_ML_ENDPOINT or not AZURE_ML_API_KEY:
        raise HTTPException(400, "Azure endpoint or API key not configured")
    history = [{"role": "user", "content": "سلام"}]
    try:
        result = await _call_azure_endpoint(history)
        return {"ok": True, "reply_preview": (result[:400] if result else None)}
    except Exception as e:
        logger.exception("Azure test call failed: %s", e)
        raise HTTPException(502, str(e))


@api.post("/chats", response_model=Chat)
async def create_chat(body: ChatCreate):
    logger.info("POST /api/chats title=%s", body.title or "<default>")
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


@api.patch("/chats/{chat_id}", response_model=Chat)
async def update_chat(chat_id: str, body: ChatUpdate):
    doc = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Chat not found")
    title = body.title.strip() or "محادثة جديدة"
    updated_at = datetime.now(timezone.utc).isoformat()
    await db.chats.update_one(
        {"id": chat_id},
        {"$set": {"title": title, "updated_at": updated_at}},
    )
    doc["title"] = title
    doc["updated_at"] = updated_at
    return doc


@api.get("/chats/{chat_id}/messages", response_model=List[Message])
async def list_messages(chat_id: str):
    docs = await db.messages.find({"chat_id": chat_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return docs


@api.post("/chat", response_model=Message)
async def send_message(body: SendMessageBody):
    logger.info("POST /api/chat chat_id=%s use_local=%s use_azure=%s use_finetuned=%s", body.chat_id, body.use_local, body.use_azure, body.use_finetuned)
    chat = await db.chats.find_one({"id": body.chat_id}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    if not body.content.strip():
        raise HTTPException(400, "Empty message")

    user_msg = Message(chat_id=body.chat_id, role="user", content=body.content.strip())
    await db.messages.insert_one(user_msg.model_dump())

    history_docs = await db.messages.find({"chat_id": body.chat_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    history = [{"role": d["role"], "content": d["content"]} for d in history_docs]

    reply_text: Optional[str] = None
    source = "unavailable"
    azure_error: Optional[str] = None

    if body.use_local:
        reply_text = await _call_local_chatbot(history)
        if reply_text is not None:
            source = "local_url"

    if reply_text is None and (body.use_azure or USE_AZURE_ENDPOINT):
        try:
            reply_text = await _call_azure_endpoint(history)
            if reply_text is not None:
                source = "azure_endpoint"
            else:
                azure_error = "Azure endpoint is not configured"
        except Exception as e:
            azure_error = str(e)
            logger.warning("Azure call failed: %s", azure_error)

    if reply_text is None and (body.use_finetuned or USE_FINETUNED):
        reply_text = await _call_finetuned(history)
        if reply_text is not None:
            source = "finetuned"

    if reply_text is None:
        raise HTTPException(
            503,
            azure_error or "No available model response. Ensure Azure endpoint is reachable or enable local/fine-tuned model.",
        )

    ai_msg = Message(chat_id=body.chat_id, role="assistant", content=reply_text, source=source)
    await db.messages.insert_one(ai_msg.model_dump())

    new_title = chat.get("title", "محادثة جديدة")
    if new_title == "محادثة جديدة":
        new_title = await _generate_title_from_first_message(body.content)
    await db.chats.update_one({"id": body.chat_id}, {"$set": {"title": new_title, "updated_at": datetime.now(timezone.utc).isoformat()}})

    return ai_msg


@api.post("/chat/stream")
async def send_message_stream(body: SendMessageBody):
    logger.info("POST /api/chat/stream chat_id=%s use_local=%s use_azure=%s use_finetuned=%s", body.chat_id, body.use_local, body.use_azure, body.use_finetuned)
    chat = await db.chats.find_one({"id": body.chat_id}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    if not body.content.strip():
        raise HTTPException(400, "Empty message")

    user_msg = Message(chat_id=body.chat_id, role="user", content=body.content.strip())
    await db.messages.insert_one(user_msg.model_dump())

    history_docs = await db.messages.find({"chat_id": body.chat_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    history = [{"role": d["role"], "content": d["content"]} for d in history_docs]
    logger.info("History for chat %s: found %d messages", body.chat_id, len(history_docs))

    use_local_now = body.use_local and bool(CHATBOT_LOCAL_URL)
    use_azure_now = (body.use_azure or USE_AZURE_ENDPOINT) and not use_local_now
    use_finetuned_now = (body.use_finetuned or USE_FINETUNED) and not use_local_now and not use_azure_now

    async def event_gen():
        full_chunks: List[str] = []
        source = "local_url" if use_local_now else ("azure_endpoint" if use_azure_now else "finetuned")
        try:
            if use_local_now:
                gen = _stream_local(history)
            elif use_azure_now:
                gen = _stream_azure(history)
            elif use_finetuned_now:
                gen = _stream_finetuned(history)
            else:
                raise HTTPException(
                    503,
                    "No available model response. Ensure Azure endpoint is reachable or enable local/fine-tuned model.",
                )

            async for token in _with_keepalive(gen, STREAM_KEEPALIVE_SECONDS):
                if token.startswith("event: ping"):
                    yield token
                    continue
                full_chunks.append(token)
                yield f"event: token\ndata: {json.dumps({'text': token}, ensure_ascii=False)}\n\n"

            reply_text = "".join(full_chunks)
            ai_msg = Message(chat_id=body.chat_id, role="assistant", content=reply_text, source=source)
            await db.messages.insert_one(ai_msg.model_dump())

            new_title = chat.get("title", "محادثة جديدة")
            if new_title == "محادثة جديدة":
                new_title = await _generate_title_from_first_message(body.content)
            await db.chats.update_one({"id": body.chat_id}, {"$set": {"title": new_title, "updated_at": datetime.now(timezone.utc).isoformat()}})

            yield f"event: done\ndata: {json.dumps({'message_id': ai_msg.id, 'source': source}, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.exception("Stream error")
            yield f"event: error\ndata: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
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


