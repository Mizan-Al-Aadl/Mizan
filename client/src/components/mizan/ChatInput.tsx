import { useRef, useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { SendMessageSchema } from "@/types";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const result = SendMessageSchema.safeParse({ content: value });
    if (!result.success) {
      setError(result.error.errors[0]?.message ?? "خطأ في الإدخال");
      return;
    }
    if (disabled) return;
    setError(null);
    onSend(result.data.content);
    setValue("");
    if (taRef.current) taRef.current.style.height = "auto";
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    if (error) setError(null);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  return (
    <div data-testid="chat-input-container" className="sticky bottom-0 pt-6 pb-3">
      {error && (
        <p className="text-error text-xs font-cairo mb-1 text-right px-1">
          {error}
        </p>
      )}
      <div
        className={`
          flex items-center bg-base-100 border rounded-2xl p-2 shadow-sm
          transition-all focus-within:ring-2 focus-within:ring-primary/20
          ${error ? "border-error" : "border-base-300 focus-within:border-primary"}
        `}
      >
        <textarea
          ref={taRef}
          data-testid="message-input"
          dir="rtl"
          value={value}
          onChange={onInput}
          onKeyDown={onKey}
          placeholder="اكتب سؤالك القانوني هنا… (Enter للإرسال، Shift+Enter لسطر جديد)"
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none bg-transparent outline-none p-3 font-cairo max-h-40 min-h-[50px] text-base disabled:opacity-50"
        />
        <button
          data-testid="send-btn"
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="btn btn-primary btn-sm p-3 rounded-xl self-center m-1 flex items-center justify-center flex-shrink-0 disabled:opacity-40"          aria-label="إرسال"
        >
          {disabled ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5 -scale-x-100" />
          )}
        </button>
      </div>
    </div>
  );
}