import { z } from "zod";

// ─── Domain schemas ───────────────────────────────────────────────────────────

export const ChatSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const AttachmentSchema = z.object({
  filename: z.string(),
  mime_type: z.string(),
  size: z.number(),
});

export const MessageSchema = z.object({
  id: z.string(),
  chat_id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  source: z
    .enum(["local", "local_url", "finetuned", "claude", "gemini_rag", "gemini_document", "short_circuit"])
    .nullable()
    .optional(),
  attachment: AttachmentSchema.nullable().optional(),
  created_at: z.string(),
});

export const CaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  case_number: z.string(),
  court: z.string(),
  client_name: z.string(),
  opponent_name: z.string(),
  status: z.enum(["pending", "won", "lost"]),
  next_hearing_date: z.string().nullable().optional(),
  reply_memo_done: z.boolean(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Case = z.infer<typeof CaseSchema>;
export type CaseStatus = Case["status"];

export type CaseInput = {
  title: string;
  case_number?: string;
  court?: string;
  client_name?: string;
  opponent_name?: string;
  status?: CaseStatus;
  next_hearing_date?: string | null;
  reply_memo_done?: boolean;
  notes?: string;
};

export const HealthSchema = z.object({
  status: z.string(),
  local_chatbot: z.boolean(),
});

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  created_at: z.string(),
});

export type User = z.infer<typeof UserSchema>;

// ─── Request schemas ──────────────────────────────────────────────────────────

export const SendMessageSchema = z.object({
  content: z.string().min(1, "لا يمكن إرسال رسالة فارغة").max(10000),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type Chat = z.infer<typeof ChatSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type Health = z.infer<typeof HealthSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;

// ─── SSE event payloads ───────────────────────────────────────────────────────

export const TokenEventSchema = z.object({ text: z.string() });
export const DoneEventSchema = z.object({
  message_id: z.string(),
  source: z.enum(["local", "local_url", "finetuned", "claude", "gemini_rag", "short_circuit"]),
});
export const ErrorEventSchema = z.object({ error: z.string() });

export type TokenEvent = z.infer<typeof TokenEventSchema>;
export type DoneEvent = z.infer<typeof DoneEventSchema>;
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;
