import { Scale, User, Bot } from "lucide-react";
import type { Message } from "@/types";

interface MessageBubbleProps {
  role: Message["role"];
  content: string;
  source?: Message["source"];
  streaming?: boolean;
}

export default function MessageBubble({
  role,
  content,
  source,
  streaming = false,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const sourceLabel =
    source === "gemini_rag"
      ? "Gemini RAG"
      : source === "finetuned"
      ? "Mizan Fine-tuned"
      : source === "claude"
      ? "Claude Fallback"
      : "Mizan Local";

  return (
    <div
      data-testid={`message-${role}${streaming ? "-streaming" : ""}`}
      className={`animate-fade-in flex gap-3 ${
        isUser ? "flex-row" : "flex-row-reverse"
      } items-start`}
    >
      {/* Avatar */}
      <div
        className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
          isUser
            ? "bg-primary text-primary-content"
            : "bg-secondary/10 text-secondary border border-secondary/30"
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4" />
        ) : (
          <Scale className="w-4 h-4" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`
          font-cairo text-base leading-relaxed whitespace-pre-wrap break-words
          max-w-[85%] sm:max-w-[75%] p-4 sm:p-5 shadow-sm
          ${
            isUser
              ? "bg-primary text-primary-content rounded-2xl rounded-tr-none"
              : "bg-base-100 text-base-content border border-base-200 rounded-2xl rounded-tl-none"
          }
        `}
      >
        {content}

        {/* Streaming cursor */}
        {streaming && (
          <span
            className="inline-block w-2 h-4 align-middle bg-secondary ml-1 animate-pulse"
            aria-hidden
          />
        )}

        {/* Source badge */}
        {!isUser && source && !streaming && (
          <div
            data-testid={`source-${source}`}
            className="mt-3 pt-2 border-t border-base-200 flex items-center gap-1.5 text-[11px] font-cairo text-base-content/40"
          >
            <Bot className="w-3 h-3" />
            {sourceLabel}
          </div>
        )}
      </div>
    </div>
  );
}