# Mizan

Mizan is a Lebanese legal assistant with Arabic chat support, conversation history, and optional local model inference.

## Repository layout

- `client/` - React + Vite frontend
- `backend/` - FastAPI + MongoDB backend
- `chatbot/` - Local GGUF quantization and inference tools (optional)

## Setup

### 1. Backend

```powershell
cd backend
pip install -r requirements.txt
python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

Create `backend/.env` from `backend/.env.example` and set the values you need.

Common environment variables:

- `MONGO_URL`
- `DB_NAME`
- `USE_AZURE_ENDPOINT`
- `AZURE_ML_ENDPOINT`
- `AZURE_ML_API_KEY`
- `AZURE_ML_DEPLOYMENT`
- `CHATBOT_LOCAL_URL`
- `CORS_ORIGINS`

### 2. Frontend

```bash
cd client
npm install
npm run dev
```

### 3. Optional local model

If you want to run the local GGUF chatbot, follow [`chatbot/README.md`](./chatbot/README.md) and then set `CHATBOT_LOCAL_URL` in `backend/.env`.

## API

The backend exposes its routes under `/api`.

Main endpoints:

- `GET /api/health`
- `GET /api/chats`
- `POST /api/chats`
- `GET /api/chats/{chat_id}`
- `DELETE /api/chats/{chat_id}`
- `GET /api/chats/{chat_id}/messages`
- `POST /api/chat`
- `POST /api/chat/stream`
