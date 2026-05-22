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
  source: z.literal("local").optional(),
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

    // Try local chatbot
    if (CHATBOT_LOCAL_URL) {
      const local = await callLocalChatbot(history);
      if (local) {
        replyText = local;
        // Fake stream the local reply in chunks
        const step = 32;
        for (let i = 0; i < replyText.length; i += step) {
          sendEvent("token", { text: replyText.slice(i, i + step) });
          await new Promise((r) => setTimeout(r, 15));
        }
      }
    }

    if (!replyText) {
      sendEvent("error", { error: "No chatbot configured. Please set CHATBOT_LOCAL_URL." });
      res.end();
      return;
    }

    // Persist assistant message
    const aiMsg: Message = {
      id: uuid(),
      chat_id,
      role: "assistant",
      content: replyText,
      source: "local",
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

    sendEvent("done", { message_id: aiMsg.id, source: "local" });
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
