"""
Chatbot server that can use either:
1) Azure ML managed endpoint (/score), or
2) Local GGUF model via llama-cpp-python.

Run (Azure mode, default when configured):
    python server.py --host 0.0.0.0 --port 8009

Run (local GGUF mode):
    python server.py --model ./mizan-q4_k_m.gguf --host 0.0.0.0 --port 8009
"""
import argparse
import os
from pathlib import Path
from typing import List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# Imported lazily inside main() because llama-cpp-python loads native libs
LLM = None
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
load_dotenv(ROOT_DIR.parent / "backend" / ".env")

DEFAULT_HF_REPO = os.environ.get("CHATBOT_HF_REPO", "olaasm/mizan")
DEFAULT_HF_FILE = os.environ.get("CHATBOT_HF_FILE", "llama-3-8b-instruct.Q4_K_M.gguf")

USE_AZURE_ENDPOINT = os.environ.get("USE_AZURE_ENDPOINT", "true").lower() == "true"
AZURE_ML_ENDPOINT = os.environ.get("AZURE_ML_ENDPOINT", "").strip()
AZURE_ML_API_KEY = os.environ.get("AZURE_ML_API_KEY", "").strip()
AZURE_ML_DEPLOYMENT = os.environ.get("AZURE_ML_DEPLOYMENT", "").strip()


def is_azure_configured() -> bool:
    return bool(AZURE_ML_ENDPOINT and AZURE_ML_API_KEY)


def azure_headers() -> dict:
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {AZURE_ML_API_KEY}",
    }
    if AZURE_ML_DEPLOYMENT:
        headers["azureml-model-deployment"] = AZURE_ML_DEPLOYMENT
    return headers


def ensure_model_file(model_path: str) -> str:
    path = Path(model_path)
    if path.exists():
        return str(path)

    from huggingface_hub import hf_hub_download

    target_dir = path.parent if path.parent != Path("") else ROOT_DIR
    target_dir.mkdir(parents=True, exist_ok=True)

    print(f"Model not found locally, downloading {DEFAULT_HF_REPO}/{DEFAULT_HF_FILE}...")
    downloaded = hf_hub_download(
        repo_id=DEFAULT_HF_REPO,
        filename=DEFAULT_HF_FILE,
        local_dir=str(target_dir),
    )

    downloaded_path = Path(downloaded)
    if downloaded_path != path and downloaded_path.exists():
        downloaded_path.replace(path)

    if not path.exists():
        raise FileNotFoundError(f"Unable to obtain model file: {path}")

    return str(path)


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    system: Optional[str] = None
    messages: List[ChatMessage]
    temperature: float = 0.4
    max_tokens: int = 128
    frequency_penalty: float = 1.15
    presence_penalty: float = 1.0


class ChatResponse(BaseModel):
    reply: str


app = FastAPI(title="Mizan Local Chatbot")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    mode = "azure" if USE_AZURE_ENDPOINT and is_azure_configured() else "local"
    return {
        "status": "ok",
        "mode": mode,
        "azure_configured": is_azure_configured(),
        "model_loaded": LLM is not None,
    }


def azure_chat(req: ChatRequest) -> str:
    msgs = []
    if req.system:
        msgs.append({"role": "system", "content": req.system})
    for m in req.messages:
        msgs.append({"role": m.role, "content": m.content})

    payload = {
        "messages": msgs,
        "temperature": req.temperature,
        "max_tokens": req.max_tokens,
        "frequency_penalty": req.frequency_penalty,
        "presence_penalty": req.presence_penalty,
    }

    with httpx.Client(timeout=120.0) as client:
        response = client.post(AZURE_ML_ENDPOINT, headers=azure_headers(), json=payload)
        response.raise_for_status()
        data = response.json()

    if isinstance(data, dict) and data.get("error"):
        raise RuntimeError(str(data.get("error")))

    choices = data.get("choices") if isinstance(data, dict) else None
    if not choices:
        raise RuntimeError("Azure response did not include choices")

    message = choices[0].get("message", {})
    content = message.get("content", "")
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("Azure response did not include message content")

    return content.strip()


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    if USE_AZURE_ENDPOINT and is_azure_configured():
        try:
            return ChatResponse(reply=azure_chat(req))
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Azure endpoint error: {e}")

    if LLM is None:
        raise HTTPException(status_code=503, detail="Model not loaded and Azure endpoint not configured")

    # Build a Llama-3 chat prompt
    msgs = []
    if req.system:
        msgs.append({"role": "system", "content": req.system})
    for m in req.messages:
        msgs.append({"role": m.role, "content": m.content})

    out = LLM.create_chat_completion(
        messages=msgs,
        temperature=req.temperature,
        max_tokens=req.max_tokens,
    )
    reply = out["choices"][0]["message"]["content"]
    return ChatResponse(reply=reply.strip())


def main():
    global LLM
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=False, help="Path to quantized .gguf file")
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8009)
    p.add_argument("--ctx", type=int, default=4096, help="Context length")
    p.add_argument(
        "--threads",
        type=int,
        default=max(2, (os.cpu_count() or 4) - 1),
        help="CPU threads for inference",
    )
    args = p.parse_args()

    if USE_AZURE_ENDPOINT and is_azure_configured():
        print(f"Using Azure endpoint: {AZURE_ML_ENDPOINT}")
        uvicorn.run(app, host=args.host, port=args.port)
        return

    if not args.model:
        raise SystemExit("Missing --model. Provide GGUF path, or configure Azure endpoint env vars.")

    from llama_cpp import Llama

    model_path = ensure_model_file(args.model)

    print(f"Loading model: {model_path} (ctx={args.ctx}, threads={args.threads})")
    LLM = Llama(
        model_path=model_path,
        n_ctx=args.ctx,
        n_threads=args.threads,
        chat_format="llama-3",
        verbose=False,
    )
    print("Model loaded. Starting server…")
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
