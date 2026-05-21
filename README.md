# Mizan — Lebanese Legal Assistant (ميزان)

> An Arabic chatbot specialized in **Lebanese law** and **international cases**, with conversation memory, document drafting (statements, contracts, pleadings), token-by-token streaming, and an optional **CPU-quantized** local LLM mode using a fine-tuned Llama-3 8B LoRA.

## Project layout

```
mizan/
├── frontend/      React + Tailwind + RTL Arabic UI (Amiri + Cairo fonts)
├── backend/       FastAPI + MongoDB + Claude Sonnet 4.5 + GGUF (your model)
├── server-node/   Node/Express + TypeScript equivalent of `backend/`
└── chatbot/       LoRA → GGUF Q4_K_M quantization + local llama.cpp server
```

You can run Mizan in **three modes**:

| Mode | Backend | LLM | Best for |
|------|---------|-----|----------|
| **A. Hosted (default)**  | `backend/` (FastAPI)   | Claude Sonnet 4.5 via Emergent Universal Key | Fast demos (5–10 s replies) |
| **B. Fine-tuned in-process** | `backend/` (FastAPI) | Your `olaasm/mizan` GGUF loaded by llama-cpp-python | Use your own model, ~10 tok/s on a decent CPU |
| **C. Local sidecar server** | `backend/` + `chatbot/server.py` | Your GGUF via a separate FastAPI process | Scale the LLM independently from the API |

The backend always **falls back to Claude Sonnet 4.5** if the selected model errors out, so the website never goes down.

---

## 1. Frontend (React + Tailwind, RTL Arabic)

```bash
cd frontend
yarn install
yarn start    # http://localhost:3000
```

`.env`:
```
REACT_APP_BACKEND_URL=http://localhost:8001
```

Highlights:
- Right-to-left layout, Amiri (display) + Cairo (body) fonts.
- Sidebar on the right with chat history + "محادثة جديدة" button.
- Empty state with 4 suggested legal prompts.
- **Streaming token-by-token replies** with animated cursor.
- Model toggle: Claude Sonnet 4.5 (fast) or your fine-tuned model (slower CPU inference).
- Source badge on every assistant bubble showing which model produced the reply.
- Disclaimer footer (not legal advice).

---

## 2. Backend — FastAPI

```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

`.env`:
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=mizan
EMERGENT_LLM_KEY=sk-emergent-...        # for Claude fallback
USE_FINETUNED=false                     # true to use your GGUF by default
FINETUNED_MODEL_PATH=/app/models/llama-3-8b-instruct.Q4_K_M.gguf
FINETUNED_HF_REPO=olaasm/mizan
FINETUNED_HF_FILE=llama-3-8b-instruct.Q4_K_M.gguf
FINETUNED_N_CTX=2048
FINETUNED_N_THREADS=6
CHATBOT_LOCAL_URL=                      # optional sidecar server URL
CORS_ORIGINS=*
```

Endpoints (all prefixed with `/api`):

- `GET  /health` — also reports whether the fine-tuned model is downloaded/loaded
- `POST /chats` `{title?}`
- `GET  /chats`
- `GET  /chats/:id`
- `DELETE /chats/:id`
- `GET  /chats/:id/messages`
- `POST /chat` `{chat_id, content, use_local?, use_finetuned?}` → returns full assistant Message
- `POST /chat/stream` same payload → **text/event-stream** with `event: token` / `event: done` / `event: error`

The backend keeps **full conversation memory** in MongoDB and re-feeds prior turns to the model on every call. Each assistant message stores a `source` field (`claude` / `finetuned` / `local_url`) so you can audit which model produced what.

On first request with `use_finetuned: true`, the backend will auto-download the GGUF from `FINETUNED_HF_REPO` to `FINETUNED_MODEL_PATH` and cache it in RAM.

---

## 3. Backend — Node/Express + TypeScript (`server-node/`)

A line-for-line equivalent of the FastAPI backend if you prefer a pure JS stack.

```bash
cd server-node
cp .env.example .env
# fill in ANTHROPIC_API_KEY (your real Anthropic key for the Node SDK)
yarn install
yarn dev      # http://localhost:8001
# yarn build && yarn start   # production
```

> Note: The Emergent Universal Key works with the FastAPI backend via `emergentintegrations`. With the official Anthropic Node SDK you need a real Anthropic key.

---

## 4. Local quantized model on CPU (`chatbot/`)

See **`chatbot/README.md`** for the full step-by-step. TL;DR:

```bash
cd chatbot
pip install -r requirements.txt
git clone https://github.com/ggerganov/llama.cpp.git && (cd llama.cpp && make -j)
huggingface-cli login                          # accept Llama-3 license once
python quantize.py \
  --adapter ./results/baseline_lora \
  --base meta-llama/Meta-Llama-3-8B-Instruct \
  --llamacpp ./llama.cpp \
  --quant Q4_K_M
python server.py --model ./mizan-q4_k_m.gguf --port 8009
```

Then set `CHATBOT_LOCAL_URL=http://localhost:8009` in `backend/.env` and call `/api/chat` with `use_local: true`.

> The published quantized model is on Hugging Face at **[`olaasm/mizan`](https://huggingface.co/olaasm/mizan)** (file: `llama-3-8b-instruct.Q4_K_M.gguf`, ~4.5 GB). The backend pulls it automatically on first use.

---

## Disclaimer

Mizan is an educational/assistive tool. Its output **does not constitute official legal advice** and should not be relied upon for any binding legal decision. Always consult a licensed Lebanese attorney for specific cases.
