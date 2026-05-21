import { useRef, useState } from "react";
import { Send, Loader2 } from "lucide-react";

export default function ChatInput({ onSend, disabled }) {
  const [value, setValue] = useState("");
  const taRef = useRef(null);

  const submit = () => {
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue("");
    if (taRef.current) taRef.current.style.height = "auto";
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onInput = (e) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  return (
    <div
      data-testid="chat-input-container"
      className="sticky bottom-0 pt-6 pb-3"
    >
      <div className="flex items-end bg-white border border-black/10 rounded-2xl p-2 shadow-[0_8px_32px_rgba(0,0,0,0.04)] focus-within:ring-2 focus-within:ring-[#0F4C3A]/20 focus-within:border-[#0F4C3A] transition-all">
        <textarea
          ref={taRef}
          data-testid="message-input"
          dir="rtl"
          value={value}
          onChange={onInput}
          onKeyDown={onKey}
          placeholder="اكتب سؤالك القانوني هنا… (Enter للإرسال، Shift+Enter لسطر جديد)"
          rows={1}
          className="flex-1 resize-none bg-transparent outline-none p-3 font-cairo max-h-40 min-h-[50px] text-base"
        />
        <button
          data-testid="send-btn"
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="p-3 bg-[#0F4C3A] text-white rounded-xl hover:bg-[#0A3326] transition-colors self-end m-1 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="إرسال"
        >
          {disabled ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            // In RTL we want the send arrow to visually point left (toward the
            // chat area). The default Lucide Send icon already points that way
            // visually, so we flip it horizontally to match Arabic reading flow.
            <Send className="w-5 h-5 -scale-x-100" />
          )}
        </button>
      </div>
    </div>
  );
}
