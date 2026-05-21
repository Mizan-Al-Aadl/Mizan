import { Scale, User, Cpu, Bot } from "lucide-react";

export default function MessageBubble({ role, content, source, streaming }) {
  const isUser = role === "user";
  return (
    <div
      data-testid={`message-${role}${streaming ? "-streaming" : ""}`}
      className={`fade-in flex gap-3 ${
        isUser ? "flex-row" : "flex-row-reverse"
      } items-start`}
    >
      <div
        className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
          isUser
            ? "bg-[#0F4C3A] text-white"
            : "bg-[#B8860B]/10 text-[#B8860B] border border-[#B8860B]/30"
        }`}
      >
        {isUser ? <User className="w-4 h-4" /> : <Scale className="w-4 h-4" />}
      </div>
      <div
        className={`
          font-cairo text-base leading-relaxed whitespace-pre-wrap break-words
          max-w-[85%] sm:max-w-[75%] p-4 sm:p-5 shadow-sm
          ${
            isUser
              ? "bg-[#0F4C3A] text-white rounded-2xl rounded-tr-none"
              : "bg-white text-[#111827] border border-black/5 rounded-2xl rounded-tl-none"
          }
        `}
      >
        {content}
        {streaming && (
          <span
            className="inline-block w-2 h-4 align-middle bg-[#B8860B] ml-1 animate-pulse"
            aria-hidden
          />
        )}
        {!isUser && source && !streaming && (
          <div
            data-testid={`source-${source}`}
            className="mt-3 pt-2 border-t border-black/5 flex items-center gap-1.5 text-[11px] font-cairo text-gray-500"
          >
            {source === "finetuned" ? (
              <>
                <Cpu className="w-3 h-3 text-[#B8860B]" />
                نموذج Mizan المدرّب (Llama-3 8B, Q4_K_M)
              </>
            ) : source === "local_url" ? (
              <>
                <Cpu className="w-3 h-3" />
                نموذج محلي عبر CHATBOT_LOCAL_URL
              </>
            ) : (
              <>
                <Bot className="w-3 h-3" />
                Claude Sonnet 4.5
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
