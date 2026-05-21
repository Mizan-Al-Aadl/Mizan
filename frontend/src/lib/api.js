import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, timeout: 180000 });

export const listChats = () => api.get("/chats").then((r) => r.data);
export const createChat = (title) =>
  api.post("/chats", { title: title || null }).then((r) => r.data);
export const deleteChat = (id) => api.delete(`/chats/${id}`).then((r) => r.data);
export const listMessages = (id) => api.get(`/chats/${id}/messages`).then((r) => r.data);
export const sendMessage = (chat_id, content, opts = {}) =>
  api
    .post("/chat", {
      chat_id,
      content,
      use_local: !!opts.use_local,
      use_finetuned: !!opts.use_finetuned,
    })
    .then((r) => r.data);

/**
 * Stream a chat reply via Server-Sent Events.
 * Callbacks: { onToken(text), onDone({message_id, source}), onError(msg) }
 * Returns an AbortController so the caller can cancel.
 */
export const sendMessageStream = (chat_id, content, opts, callbacks) => {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${API}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          content,
          use_local: !!opts?.use_local,
          use_finetuned: !!opts?.use_finetuned,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // Parse SSE event blocks separated by blank lines
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let evt = "message";
          let data = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) evt = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;
          try {
            const payload = JSON.parse(data);
            if (evt === "token") callbacks.onToken?.(payload.text || "");
            else if (evt === "done") callbacks.onDone?.(payload);
            else if (evt === "error") callbacks.onError?.(payload.error || "error");
          } catch (parseErr) {
            // ignore malformed event
          }
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        callbacks.onError?.(e.message || String(e));
      }
    }
  })();

  return controller;
};
export const getHealth = () => api.get("/health").then((r) => r.data);
