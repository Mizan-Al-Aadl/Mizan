"""
Local CPU inference server for the quantized Mizan model (GGUF) using
llama-cpp-python. Exposes a single POST /chat endpoint that the Mizan
backend can call when CHATBOT_LOCAL_URL is set in backend/.env.

Run:
    python server.py --model ./mizan-q4_k_m.gguf --host 0.0.0.0 --port 8009
"""
import argparse
import os
from typing import List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# Imported lazily inside main() because llama-cpp-python loads native libs
LLM = None


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    system: Optional[str] = None
    messages: List[ChatMessage]
    temperature: float = 0.4
    max_tokens: int = 768


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
    return {"status": "ok", "model_loaded": LLM is not None}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    assert LLM is not None, "Model not loaded"

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
    p.add_argument("--model", required=True, help="Path to quantized .gguf file")
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

    from llama_cpp import Llama

    print(f"Loading model: {args.model} (ctx={args.ctx}, threads={args.threads})")
    LLM = Llama(
        model_path=args.model,
        n_ctx=args.ctx,
        n_threads=args.threads,
        chat_format="llama-3",
        verbose=False,
    )
    print("Model loaded. Starting server…")
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
