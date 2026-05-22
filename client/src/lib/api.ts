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

const BASE = "/api";

// ─── Generic fetch helper ─────────────────────────────────────────────────────
async function apiFetch<T>(
  path: string,
  schema: z.ZodSchema<T>,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
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
    body: JSON.stringify({ title: title ?? null }),
  });

export const deleteChat = (id: string): Promise<{ ok: boolean }> =>
  apiFetch(`/chats/${id}`, z.object({ ok: z.boolean() }), {
    method: "DELETE",
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
    try {
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
              if (parsed.success) callbacks.onDone(parsed.data);
            } else if (event === "error") {
              const parsed = ErrorEventSchema.safeParse(payload);
              callbacks.onError(parsed.success ? parsed.data.error : "Unknown error");
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
    }
  })();

  return controller;
}
