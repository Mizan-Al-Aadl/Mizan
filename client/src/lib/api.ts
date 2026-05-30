import { z } from "zod";
import { getToken } from "./auth.ts";
import {
  Chat,
  ChatSchema,
  Message,
  MessageSchema,
  TokenEventSchema,
  DoneEventSchema,
  ErrorEventSchema,
  User,
  UserSchema,
} from "@/types";

const RAW_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const BASE = (RAW_BASE && RAW_BASE.length > 0 ? RAW_BASE : "/api").replace(/\/$/, "");
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 15000);
const STREAM_TIMEOUT_MS = Number(import.meta.env.VITE_STREAM_TIMEOUT_MS ?? 180000); // Increased from 60s to 180s for Azure processing time

function parseApiErrorBody(body: string): string {
  if (!body) return "حدث خطأ غير متوقع";
  try {
    const json = JSON.parse(body);
    const detail = json.detail || json.error || json.message;
    if (typeof detail === "string" && detail.length > 0) {
      return detail;
    }
  } catch {
    // fall back to raw body
  }
  return body;
}

function buildApiErrorMessage(status: number, body: string): string {
  const detail = parseApiErrorBody(body);
  if (status === 401 || status === 409) return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
  if (status === 400) return detail || "البيانات غير صحيحة، يرجى التحقق من الحقول.";
  if (status >= 500) return "حدث خطأ في الخادم. حاول مرة أخرى لاحقًا.";
  return detail;
}

// ─── Generic fetch helper ─────────────────────────────────────────────────────
async function apiFetch<T>(
  path: string,
  schema: z.ZodSchema<T>,
  init?: RequestInit
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    signal: init?.signal ?? controller.signal,
  }).finally(() => {
    window.clearTimeout(timer);
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const message = buildApiErrorMessage(res.status, body);
    throw new Error(`API ${res.status}: ${message}`);
  }
  const json = await res.json();
  return schema.parse(json);
}

// ─── Chat endpoints ───────────────────────────────────────────────────────────

export const apiRegister = (
  name: string,
  email: string,
  password: string
): Promise<{ token: string }> =>
  apiFetch(
    "/auth/register",
    z.object({ token: z.string() }),
    {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }
  );

export const apiLogin = (
  email: string,
  password: string
): Promise<{ token: string }> =>
  apiFetch(
    "/auth/login",
    z.object({ token: z.string() }),
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }
  );

export const apiGetMe = (): Promise<User> =>
  apiFetch("/auth/me", UserSchema);

export const listChats = (): Promise<Chat[]> =>
  apiFetch("/chats", z.array(ChatSchema));

export const createChat = (title?: string): Promise<Chat> =>
  apiFetch("/chats", ChatSchema, {
    method: "POST",
    body: JSON.stringify(title ? { title } : {}),
  });

export const deleteChat = (id: string): Promise<{ ok: boolean }> =>
  apiFetch(`/chats/${id}`, z.object({ ok: z.boolean() }), {
    method: "DELETE",
  });

export const updateChat = (id: string, title: string): Promise<Chat> =>
  apiFetch(`/chats/${id}`, ChatSchema, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });

export const listMessages = (chatId: string): Promise<Message[]> =>
  apiFetch(`/chats/${chatId}/messages`, z.array(MessageSchema));

// ─── Streaming chat ───────────────────────────────────────────────────────────

export interface StreamCallbacks {
  onToken: (text: string) => void;
  onDone: (payload: { message_id: string; source: string }) => void;
  onError: (message: string) => void;
}

export function sendMessageStream(
  chatId: string,
  content: string,
  callbacks: StreamCallbacks
): AbortController {
  const controller = new AbortController();

  void (async () => {
    let timeoutHandle: number | undefined;
    const resetTimeout = () => {
      if (timeoutHandle !== undefined) {
        window.clearTimeout(timeoutHandle);
      }
      timeoutHandle = window.setTimeout(() => {
        controller.abort();
        callbacks.onError("Request timed out. Please check backend connectivity.");
      }, STREAM_TIMEOUT_MS);
    };

    try {
      resetTimeout();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token = getToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch(`${BASE}/chat/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          chat_id: chatId,
          content,
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        resetTimeout();
        buf += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);

          let event = "message";
          let data = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;

          try {
            const payload = JSON.parse(data) as unknown;
            if (event === "token") {
              const parsed = TokenEventSchema.safeParse(payload);
              if (parsed.success) callbacks.onToken(parsed.data.text);
            } else if (event === "done") {
              const parsed = DoneEventSchema.safeParse(payload);
              if (parsed.success) {
                callbacks.onDone(parsed.data);
                if (timeoutHandle !== undefined) {
                  window.clearTimeout(timeoutHandle);
                }
              }
            } else if (event === "error") {
              const parsed = ErrorEventSchema.safeParse(payload);
              callbacks.onError(parsed.success ? parsed.data.error : "Unknown error");
              if (timeoutHandle !== undefined) {
                window.clearTimeout(timeoutHandle);
              }
            }
          } catch {
            // malformed SSE block — skip
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        callbacks.onError(err.message);
      }
    } finally {
      if (timeoutHandle !== undefined) {
        window.clearTimeout(timeoutHandle);
      }
    }
  })();

  return controller;
}
