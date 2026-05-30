import { z } from "zod";
import {
  Chat,
  ChatSchema,
  Message,
  MessageSchema,
  TokenEventSchema,
  DoneEventSchema,
  ErrorEventSchema,
} from "@/types";

const RAW_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const BASE = (RAW_BASE && RAW_BASE.length > 0 ? RAW_BASE : "/api").replace(/\/$/, "");
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 15000);
const STREAM_TIMEOUT_MS = Number(import.meta.env.VITE_STREAM_TIMEOUT_MS ?? 180000); // Increased from 60s to 180s for Azure processing time

// ─── Generic fetch helper ─────────────────────────────────────────────────────
async function apiFetch<T>(
  path: string,
  schema: z.ZodSchema<T>,
  init?: RequestInit
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
    signal: init?.signal ?? controller.signal,
  }).finally(() => {
    window.clearTimeout(timer);
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body}`);
  }
  const json = await res.json();
  return schema.parse(json);
}

// ─── Chat endpoints ───────────────────────────────────────────────────────────

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

      const res = await fetch(`${BASE}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
