/**
 * Mizan (ميزان) — Node/Express + TypeScript backend
 *
 * This mirrors the FastAPI backend in /app/backend so the project can be
 * deployed as a pure Node stack. The Emergent preview environment runs the
 * Python version (supervisor-managed), but this Node version is what you'll
 * push to GitHub and run locally / on Render / Railway / etc.
 */
import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import { MongoClient, Db } from "mongodb";
import { v4 as uuid } from "uuid";
import Anthropic from "@anthropic-ai/sdk";

// ---------- Config ----------
const PORT = parseInt(process.env.PORT || "8001", 10);
const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "mizan";
const EMERGENT_LLM_KEY = process.env.EMERGENT_LLM_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || EMERGENT_LLM_KEY;
const CHATBOT_LOCAL_URL = (process.env.CHATBOT_LOCAL_URL || "").trim();

// Emergent universal key proxies through their gateway; with the official
// Anthropic SDK you need a real Anthropic key. If you're using the Emergent
// universal key, the Python backend (which uses emergentintegrations) handles
// that for you in /app/backend. For pure Node usage, drop your real
// ANTHROPIC_API_KEY into .env.
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `أنت "ميزان"، مساعد قانوني لبناني ذكي ومتخصص في القانون اللبناني والقضايا الدولية.

مهمتك:
- الإجابة عن الأسئلة المتعلقة بالقوانين اللبنانية (قانون العقوبات، الموجبات والعقود، الأحوال الشخصية، العمل، التجارة، الإيجارات، السير، الضرائب، إلخ).
- شرح القضايا الدولية ذات الصلة بلبنان أو القانون المقارن عند الحاجة.
- مساعدة المستخدم في صياغة المستندات والإفادات والاستحضارات والعرائض والعقود البسيطة باللغة العربية الفصحى القانونية.
- ذكر أرقام المواد القانونية ومصدرها كلما أمكن.

أسلوبك:
- أجب دائماً باللغة العربية الفصحى ما لم يطلب المستخدم خلاف ذلك.
- كن دقيقاً، موضوعياً، ومنظماً. استخدم نقاطاً وعناوين فرعية عند الحاجة.
- إذا كان السؤال غامضاً، اطلب توضيحاً قبل الإجابة.
- نبّه دائماً بأن إجاباتك للاطلاع العام ولا تغني عن استشارة محامٍ مختص.`;

// ---------- Mongo ----------
const mongo = new MongoClient(MONGO_URL);
let db: Db;

async function connectMongo() {
  await mongo.connect();
  db = mongo.db(DB_NAME);
  console.log(`Mongo connected → ${DB_NAME}`);
}

// ---------- Types ----------
interface Chat {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}
interface Message {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

// ---------- LLM ----------
async function callLocalChatbot(history: { role: string; content: string }[]) {
  if (!CHATBOT_LOCAL_URL) return null;
  try {
    const r = await fetch(`${CHATBOT_LOCAL_URL.replace(/\/$/, "")}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system: SYSTEM_PROMPT, messages: history }),
    });
    if (!r.ok) return null;
    const data: any = await r.json();
    return data.reply as string;
  } catch (e) {
    console.warn("Local chatbot unreachable", e);
    return null;
  }
}

async function callClaude(history: { role: string; content: string }[]) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY / EMERGENT_LLM_KEY missing");
  }
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: history.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    })),
  });
  const part = msg.content[0];
  return part.type === "text" ? part.text : "";
}

// ---------- App ----------
const app = express();
app.use(cors({ origin: (process.env.CORS_ORIGINS || "*").split(",") }));
app.use(express.json({ limit: "1mb" }));

const api = express.Router();

api.get("/", (_req, res) => res.json({ app: "Mizan", status: "ok" }));
api.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    llm: ANTHROPIC_API_KEY ? "configured" : "missing",
    local_chatbot: !!CHATBOT_LOCAL_URL,
  })
);

api.post("/chats", async (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const chat: Chat = {
    id: uuid(),
    title: (req.body?.title as string) || "محادثة جديدة",
    created_at: now,
    updated_at: now,
  };
  await db.collection("chats").insertOne({ ...chat });
  res.json(chat);
});

api.get("/chats", async (_req, res) => {
  const docs = await db
    .collection("chats")
    .find({}, { projection: { _id: 0 } })
    .sort({ updated_at: -1 })
    .limit(500)
    .toArray();
  res.json(docs);
});

api.get("/chats/:id", async (req, res) => {
  const doc = await db
    .collection("chats")
    .findOne({ id: req.params.id }, { projection: { _id: 0 } });
  if (!doc) return res.status(404).json({ detail: "Chat not found" });
  res.json(doc);
});

api.delete("/chats/:id", async (req, res) => {
  await db.collection("messages").deleteMany({ chat_id: req.params.id });
  const r = await db.collection("chats").deleteOne({ id: req.params.id });
  if (r.deletedCount === 0)
    return res.status(404).json({ detail: "Chat not found" });
  res.json({ ok: true });
});

api.get("/chats/:id/messages", async (req, res) => {
  const docs = await db
    .collection("messages")
    .find({ chat_id: req.params.id }, { projection: { _id: 0 } })
    .sort({ created_at: 1 })
    .limit(1000)
    .toArray();
  res.json(docs);
});

api.post("/chat", async (req: Request, res: Response) => {
  const { chat_id, content, use_local } = req.body || {};
  if (!chat_id || !content || !String(content).trim()) {
    return res.status(400).json({ detail: "chat_id and content required" });
  }

  const chat = await db.collection("chats").findOne({ id: chat_id });
  if (!chat) return res.status(404).json({ detail: "Chat not found" });

  const now = new Date().toISOString();
  const userMsg: Message = {
    id: uuid(),
    chat_id,
    role: "user",
    content: String(content).trim(),
    created_at: now,
  };
  await db.collection("messages").insertOne({ ...userMsg });

  const historyDocs = await db
    .collection("messages")
    .find({ chat_id }, { projection: { _id: 0 } })
    .sort({ created_at: 1 })
    .toArray();
  const history = historyDocs.map((d: any) => ({
    role: d.role,
    content: d.content,
  }));

  let reply: string | null = null;
  if (use_local) reply = await callLocalChatbot(history);
  if (reply === null) {
    try {
      reply = await callClaude(history);
    } catch (e: any) {
      console.error(e);
      return res.status(500).json({ detail: `LLM error: ${e.message}` });
    }
  }

  const aiMsg: Message = {
    id: uuid(),
    chat_id,
    role: "assistant",
    content: reply || "",
    created_at: new Date().toISOString(),
  };
  await db.collection("messages").insertOne({ ...aiMsg });

  let newTitle = chat.title || "محادثة جديدة";
  if (newTitle === "محادثة جديدة") {
    const t = String(content).trim().replace(/\n/g, " ");
    newTitle = t.length > 40 ? t.slice(0, 40) + "…" : t || "محادثة جديدة";
  }
  await db
    .collection("chats")
    .updateOne(
      { id: chat_id },
      { $set: { title: newTitle, updated_at: new Date().toISOString() } }
    );

  res.json(aiMsg);
});

app.use("/api", api);

connectMongo().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Mizan Node backend listening on :${PORT}`);
  });
});
