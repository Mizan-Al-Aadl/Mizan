# Mizan

Mizan is a Lebanese legal assistant with Arabic chat support, conversation history, and optional local model inference.

## Repository layout

- `client/` - React + Vite frontend
- `backend/` - FastAPI + MongoDB backend
- `server/` - Node/Express + TypeScript alternative backend
- `chatbot/` - Local GGUF quantization and inference tools

## Recommended setup

The default path is the FastAPI backend plus the React client.

### 1. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Create `backend/.env` from `backend/.env.example` and set the values you need.

Common environment variables:

- `MONGO_URL`
- `DB_NAME`
- `USE_AZURE_ENDPOINT`
- `AZURE_ML_ENDPOINT`
- `AZURE_ML_API_KEY`
- `AZURE_ML_DEPLOYMENT`
- `USE_FINETUNED`
- `FINETUNED_MODEL_PATH`
- `FINETUNED_HF_REPO`
- `FINETUNED_HF_FILE`
- `CHATBOT_LOCAL_URL`
- `CORS_ORIGINS`

### 2. Frontend

```bash
cd client
npm install
npm run dev
```

Create a client env file if you want to override the default API target:

```env
VITE_API_BASE_URL=/api
VITE_BACKEND_URL=http://localhost:8001
```

The frontend also supports optional timeout overrides:

- `VITE_API_TIMEOUT_MS`
- `VITE_STREAM_TIMEOUT_MS`

### 3. Optional local model

If you want to run the local GGUF chatbot, follow [`chatbot/README.md`](./chatbot/README.md) and then set `CHATBOT_LOCAL_URL` in `backend/.env`.

## Alternative backend

The `server/` folder contains a Node/Express + TypeScript backend. Use it if you prefer a JavaScript stack instead of FastAPI.

```bash
cd server
npm install
npm run dev
```

## API

The FastAPI backend exposes its routes under `/api`.

Main endpoints:

- `GET /api/health`
- `GET /api/chats`
- `POST /api/chats`
- `GET /api/chats/{chat_id}`
- `DELETE /api/chats/{chat_id}`
- `GET /api/chats/{chat_id}/messages`
- `POST /api/chat`
- `POST /api/chat/stream`

## Notes

- Do not commit local `.env` files.
- Large generated artifacts such as virtual environments, build folders, and model exports should stay out of the repo.
- Mizan is an educational tool and does not provide legal advice.
