import { useState } from "react";
import { Scale, User, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Message } from "@/types";
import { openDocument } from "@/lib/api";

interface MessageBubbleProps {
  role: Message["role"];
  content: string;
  source?: Message["source"];
  attachment?: Message["attachment"];
  messageId?: string;
  streaming?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MessageBubble({
  role,
  content,
  attachment,
  messageId,
  streaming = false,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const [opening, setOpening] = useState(false);

  const isPending = !messageId || messageId.startsWith("temp-");

  const handleOpenAttachment = async () => {
    if (!messageId || isPending || opening) return;
    setOpening(true);
    try {
      await openDocument(messageId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "خطأ غير معروف";
      toast.error(`تعذّر فتح المستند: ${msg}`);
    } finally {
      setOpening(false);
    }
  };

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
        dir="auto"
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
        {attachment && (
          <button
            type="button"
            data-testid="attachment-chip"
            onClick={handleOpenAttachment}
            disabled={opening || isPending}
            dir="ltr"
            className={`
              flex items-center gap-2 rounded-xl px-3 py-2 mb-2 text-sm w-full text-left
              transition-colors disabled:opacity-60
              ${
                isUser
                  ? "bg-primary-content/10 hover:bg-primary-content/20"
                  : "bg-base-200 hover:bg-base-300"
              }
            `}
          >
            {opening ? (
              <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
            ) : (
              <FileText className="w-4 h-4 shrink-0" />
            )}
            <span className="truncate flex-1 font-cairo">{attachment.filename}</span>
            <span className="text-xs opacity-70 shrink-0">{formatFileSize(attachment.size)}</span>
          </button>
        )}

        {content}

        {/* Streaming cursor */}
        {streaming && (
          <span
            className="inline-block w-2 h-4 align-middle bg-secondary ml-1 animate-pulse"
            aria-hidden
          />
        )}

      </div>
    </div>
  );
}