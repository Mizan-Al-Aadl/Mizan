/**
 * Mizan (ميزان) — Node/Express + TypeScript backend
 * Lebanese Legal Assistant chatbot server
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient, Db } from "mongodb";
import { v4 as uuid } from "uuid";
import { z } from "zod";

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? "8001", 10);
const MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME ?? "mizan";
const CHATBOT_LOCAL_URL = (process.env.CHATBOT_LOCAL_URL ?? "").trim();
const USE_AZURE_ENDPOINT = (process.env.USE_AZURE_ENDPOINT ?? "true").toLowerCase() === "true";
const AZURE_ML_ENDPOINT = (process.env.AZURE_ML_ENDPOINT ?? "").trim();
const AZURE_ML_API_KEY = (process.env.AZURE_ML_API_KEY ?? "").trim();
const AZURE_ML_DEPLOYMENT = (process.env.AZURE_ML_DEPLOYMENT ?? "").trim();
const AZURE_TEMPERATURE = Number(process.env.AZURE_TEMPERATURE ?? "0.4");
const AZURE_MAX_TOKENS = Number(process.env.AZURE_MAX_TOKENS ?? "128");
const AZURE_FREQUENCY_PENALTY = Number(process.env.AZURE_FREQUENCY_PENALTY ?? "1.15");
const AZURE_PRESENCE_PENALTY = Number(process.env.AZURE_PRESENCE_PENALTY ?? "1.0");
const AZURE_INCLUDE_SYSTEM_PROMPT = (process.env.AZURE_INCLUDE_SYSTEM_PROMPT ?? "false").toLowerCase() === "true";
const AZURE_HISTORY_MAX_MESSAGES = Number(process.env.AZURE_HISTORY_MAX_MESSAGES ?? "6");
const AZURE_CONTEXT_WINDOW = Number(process.env.AZURE_CONTEXT_WINDOW ?? "512");
const MODEL_HTTP_TIMEOUT_SECONDS = Number(process.env.MODEL_HTTP_TIMEOUT_SECONDS ?? "300");
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "*").split(",");

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

// Domain models
export const ChatSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const MessageSchema = z.object({
  id: z.string().uuid(),
  chat_id: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  source: z.enum(["local", "local_url", "finetuned", "claude", "azure_endpoint"]).nullable().optional(),
  created_at: z.string().datetime(),
});

// Request bodies
export const CreateChatBodySchema = z.object({
  title: z.string().max(200).optional(),
});

export const SendMessageBodySchema = z.object({
  chat_id: z.string().uuid(),
  content: z.string().min(1).max(10000).trim(),
});

// Inferred types
export type Chat = z.infer<typeof ChatSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type CreateChatBody = z.infer<typeof CreateChatBodySchema>;
export type SendMessageBody = z.infer<typeof SendMessageBodySchema>;

// ─── System Prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `أنت \"ميزان\"، مساعد قانوني لبناني ذكي ومتخصص في القانون اللبناني والقضايا الدولية.

مهمتك:
- الإجابة عن الأسئلة المتعلقة بالقوانين اللبنانية (قانون العقوبات، الموجبات والعقود، الأحوال الشخصية، العمل، التجارة، الإيجارات، السير، الضرائب، إلخ).
- شرح القضايا الدولية ذات الصلة بلبنان أو القانون المقارن عند الحاجة.
- مساعدة المستخدم في صياغة المستندات والإفادات والاستحضارات والعرائض والعقود البسيطة باللغة العربية الفصحى القانونية.
- ذكر أرقام المواد القانونية ومصدرها كلما أمكن (مثلاً: \"المادة 547 من قانون العقوبات اللبناني\").

أسلوبك:
- أجب دائماً باللغة العربية الفصحى ما لم يطلب المستخدم خلاف ذلك.
- كن دقيقاً، موضوعياً، ومنظماً. استخدم نقاطاً وعناوين فرعية عند الحاجة.
- إذا كان السؤال غامضاً، اطلب توضيحاً قبل الإجابة.
- نبّه دائماً بأن إجاباتك للاطلاع العام ولا تغني عن استشارة محامٍ مختص.

ابدأ المحادثة بترحيب موجز إن كانت أول رسالة.`;

// ─── MongoDB ──────────────────────────────────────────────────────────────────
const mongoClient = new MongoClient(MONGO_URL);
let db: Db;

async function connectMongo(): Promise<void> {
  await mongoClient.connect();
  db = mongoClient.db(DB_NAME);
  console.log(`✓ MongoDB connected → ${DB_NAME}`);
}

// ─── LLM helpers ─────────────────────────────────────────────────────────────
type HistoryItem = { role: "user" | "assistant"; content: string };

function buildAzureHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${AZURE_ML_API_KEY}`,
  };
  if (AZURE_ML_DEPLOYMENT) {
    headers["azureml-model-deployment"] = AZURE_ML_DEPLOYMENT;
  }
  return headers;
}

function buildAzureMessages(history: HistoryItem[]): Array<{ role: string; content: string }> {
  const recent = AZURE_HISTORY_MAX_MESSAGES > 0 ? history.slice(-AZURE_HISTORY_MAX_MESSAGES) : history;
  const msgs: Array<{ role: string; content: string }> = [];

  if (AZURE_INCLUDE_SYSTEM_PROMPT) {
    msgs.push({ role: "system", content: SYSTEM_PROMPT });
  }

  const approxTokens = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return Math.max(1, trimmed.split(/\s+/).length);
  };

  const maxTokensForContext = Math.max(0, AZURE_CONTEXT_WINDOW - AZURE_MAX_TOKENS);
  let used = msgs.reduce((sum, msg) => sum + approxTokens(msg.content) + 4, 0);

  for (const item of recent) {
    const cost = approxTokens(item.content) + 4;
    if (used + cost > maxTokensForContext) continue;
    msgs.push({ role: item.role, content: item.content });
    used += cost;
  }

  return msgs;
}

async function callAzureChatbot(history: HistoryItem[]): Promise<string | null> {
  if (!USE_AZURE_ENDPOINT || !AZURE_ML_ENDPOINT || !AZURE_ML_API_KEY) return null;

  const payload = {
    messages: buildAzureMessages(history),
    temperature: AZURE_TEMPERATURE,
    max_tokens: AZURE_MAX_TOKENS,
    frequency_penalty: AZURE_FREQUENCY_PENALTY,
    presence_penalty: AZURE_PRESENCE_PENALTY,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MODEL_HTTP_TIMEOUT_SECONDS * 1000);
    try {
      const response = await fetch(AZURE_ML_ENDPOINT, {
        method: "POST",
        headers: buildAzureHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Azure HTTP ${response.status}: ${detail}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
        error?: unknown;
      };

      if (data.error) {
        throw new Error(`Azure endpoint error: ${String(data.error)}`);
      }

      const content = data.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) {
        return content.trim();
      }

      throw new Error("Azure endpoint response missing expected choices/message content");
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.warn("Azure chatbot unreachable:", err);
    return null;
  }
}

async function callLocalChatbot(history: HistoryItem[]): Promise<string | null> {
  if (!CHATBOT_LOCAL_URL) return null;
  try {
    const res = await fetch(`${CHATBOT_LOCAL_URL.replace(/\/$/, "")}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system: SYSTEM_PROMPT, messages: history }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { reply?: string };
    return data.reply ?? null;
  } catch {
    console.warn("Local chatbot unreachable");
    return null;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function now(): string {
  return new Date().toISOString();
}

function deriveTitle(content: string): string {
  const t = content.trim().replace(/\n/g, " ");
  return t.length > 40 ? `${t.slice(0, 40)}…` : t || "محادثة جديدة";
}

// ─── Express App ─────────────────────────────────────────────────────────────
const app = express();

app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: "1mb" }));

const api = express.Router();

// GET /api/health
api.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    local_chatbot: !!CHATBOT_LOCAL_URL,
  });
});

// POST /api/chats
api.post("/chats", async (req, res) => {
  const parsed = CreateChatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ detail: parsed.error.flatten() });
  }
  const chat: Chat = {
    id: uuid(),
    title: parsed.data.title ?? "محادثة جديدة",
    created_at: now(),
    updated_at: now(),
  };
  await db.collection("chats").insertOne({ ...chat });
  res.status(201).json(chat);
});

// GET /api/chats
api.get("/chats", async (_req, res) => {
  const docs = await db
    .collection("chats")
    .find({}, { projection: { _id: 0 } })
    .sort({ updated_at: -1 })
    .limit(500)
    .toArray();
  res.json(docs);
});

// GET /api/chats/:id
api.get("/chats/:id", async (req, res) => {
  const doc = await db
    .collection("chats")
    .findOne({ id: req.params.id }, { projection: { _id: 0 } });
  if (!doc) return res.status(404).json({ detail: "Chat not found" });
  res.json(doc);
});

// DELETE /api/chats/:id
api.delete("/chats/:id", async (req, res) => {
  await db.collection("messages").deleteMany({ chat_id: req.params.id });
  const result = await db.collection("chats").deleteOne({ id: req.params.id });
  if (result.deletedCount === 0)
    return res.status(404).json({ detail: "Chat not found" });
  res.json({ ok: true });
});

// GET /api/chats/:id/messages
api.get("/chats/:id/messages", async (req, res) => {
  const docs = await db
    .collection("messages")
    .find({ chat_id: req.params.id }, { projection: { _id: 0 } })
    .sort({ created_at: 1 })
    .limit(1000)
    .toArray();
  res.json(docs);
});

// POST /api/chat/stream  — Server-Sent Events
api.post("/chat/stream", async (req, res) => {
  const parsed = SendMessageBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ detail: parsed.error.flatten() });
  }
  const { chat_id, content } = parsed.data;

  const chat = await db.collection("chats").findOne({ id: chat_id });
  if (!chat) return res.status(404).json({ detail: "Chat not found" });

  // Persist user message
  const userMsg: Message = {
    id: uuid(),
    chat_id,
    role: "user",
    content,
    created_at: now(),
  };
  await db.collection("messages").insertOne({ ...userMsg });

  // Build history
  const historyDocs = await db
    .collection("messages")
    .find({ chat_id }, { projection: { _id: 0 } })
    .sort({ created_at: 1 })
    .toArray();
  const history: HistoryItem[] = historyDocs.map((d) => ({
    role: d.role as "user" | "assistant",
    content: d.content as string,
  }));

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let replyText = "";
    let source: "azure_endpoint" | "local_url" = "local_url";

    // Prefer Azure if configured, otherwise fall back to the local chatbot.
    if (USE_AZURE_ENDPOINT && AZURE_ML_ENDPOINT && AZURE_ML_API_KEY) {
      const azure = await callAzureChatbot(history);
      if (azure) {
        replyText = azure;
        source = "azure_endpoint";
      }
    }

    if (!replyText && CHATBOT_LOCAL_URL) {
      const local = await callLocalChatbot(history);
      if (local) {
        replyText = local;
        source = "local_url";
        // Fake stream the local reply in chunks
        const step = 32;
        for (let i = 0; i < replyText.length; i += step) {
          sendEvent("token", { text: replyText.slice(i, i + step) });
          await new Promise((r) => setTimeout(r, 15));
        }
      }
    }

    if (!replyText) {
      sendEvent("error", {
        error: "No chatbot configured. Set Azure env vars or CHATBOT_LOCAL_URL.",
      });
      res.end();
      return;
    }

    if (source === "azure_endpoint") {
      const step = 32;
      for (let i = 0; i < replyText.length; i += step) {
        sendEvent("token", { text: replyText.slice(i, i + step) });
        await new Promise((r) => setTimeout(r, 15));
      }
    }

    // Persist assistant message
    const aiMsg: Message = {
      id: uuid(),
      chat_id,
      role: "assistant",
      content: replyText,
      source,
      created_at: now(),
    };
    await db.collection("messages").insertOne({ ...aiMsg });

    // Update chat title + timestamp
    const newTitle =
      (chat.title as string) === "محادثة جديدة"
        ? deriveTitle(content)
        : (chat.title as string);
    await db
      .collection("chats")
      .updateOne(
        { id: chat_id },
        { $set: { title: newTitle, updated_at: now() } }
      );

    sendEvent("done", { message_id: aiMsg.id, source });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Stream error:", message);
    sendEvent("error", { error: message });
  } finally {
    res.end();
  }
});

app.use("/api", api);

// ─── Start ────────────────────────────────────────────────────────────────────
connectMongo().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✓ Mizan server listening on :${PORT}`);
  });
});

process.on("SIGTERM", async () => {
  await mongoClient.close();
  process.exit(0);
});
