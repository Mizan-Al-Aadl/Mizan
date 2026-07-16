import { useRef, useState } from "react";
import { Send, Loader2, Paperclip, X, FileText } from "lucide-react";
import { SendMessageSchema } from "@/types";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ["application/pdf", "text/plain", "image/png", "image/jpeg"];

interface ChatInputProps {
  onSend: (text: string) => void;
  onSendFile?: (file: File, question: string) => void;
  disabled: boolean;
}

export default function ChatInput({ onSend, onSendFile, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (file) {
      if (disabled) return;
      setError(null);
      onSendFile?.(file, value.trim());
      setFile(null);
      setValue("");
      if (taRef.current) taRef.current.style.height = "auto";
      return;
    }

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

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    if (!ALLOWED_FILE_TYPES.includes(picked.type)) {
      setError("نوع الملف غير مدعوم. يُسمح بـ PDF أو نص أو صورة (PNG/JPEG)");
      return;
    }
    if (picked.size > MAX_FILE_BYTES) {
      setError("حجم الملف كبير جداً (الحد الأقصى 15 ميغابايت)");
      return;
    }
    setError(null);
    setFile(picked);
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
        <p className="text-error text-xs font-cairo mb-1 text-left px-1">
          {error}
        </p>
      )}
      {file && (
        <div className="flex items-center gap-2 bg-base-200 rounded-xl px-3 py-2 mb-2 text-sm font-cairo">
          <FileText className="w-4 h-4 shrink-0 text-secondary" />
          <span className="truncate flex-1">{file.name}</span>
          <button
            type="button"
            onClick={() => setFile(null)}
            className="p-1 rounded-full hover:bg-black/10 shrink-0"
            aria-label="إزالة الملف"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div
        className={`
          flex items-center bg-base-100 border rounded-2xl p-2 shadow-sm
          transition-all focus-within:ring-2 focus-within:ring-primary/20
          ${error ? "border-error" : "border-base-300 focus-within:border-primary"}
        `}
      >
        {onSendFile && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_FILE_TYPES.join(",")}
              onChange={onFilePick}
              className="hidden"
              data-testid="file-input"
            />
            <button
              type="button"
              data-testid="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="btn btn-ghost btn-sm h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 disabled:opacity-40"
              aria-label="إرفاق مستند"
            >
              <Paperclip className="w-5 h-5" />
            </button>
          </>
        )}
        <textarea
          ref={taRef}
          data-testid="message-input"
          dir="auto"
          value={value}
          onChange={onInput}
          onKeyDown={onKey}
          placeholder={
            file
              ? "اسأل عن المستند المرفق (اختياري)…"
              : "اكتب سؤالك القانوني هنا… (Enter للإرسال، Shift+Enter لسطر جديد)"
          }
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none bg-transparent outline-none p-3 font-cairo max-h-40 min-h-[50px] text-base disabled:opacity-50"
        />
        <button
          data-testid="send-btn"
          onClick={submit}
          disabled={disabled || (!file && !value.trim())}
          className="btn btn-primary btn-sm h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          aria-label="إرسال"
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