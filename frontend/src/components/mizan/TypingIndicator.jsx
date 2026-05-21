import { Scale } from "lucide-react";

export default function TypingIndicator({ finetuned = false }) {
  return (
    <div
      data-testid="typing-indicator"
      className="fade-in flex gap-3 flex-row-reverse items-start"
    >
      <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-[#B8860B]/10 text-[#B8860B] border border-[#B8860B]/30">
        <Scale className="w-4 h-4" />
      </div>
      <div className="bg-white border border-black/5 rounded-2xl rounded-tl-none p-4 sm:p-5 shadow-sm flex gap-1.5 items-center">
        <span className="typing-dot w-2 h-2 rounded-full bg-[#B8860B]" />
        <span className="typing-dot w-2 h-2 rounded-full bg-[#B8860B]" />
        <span className="typing-dot w-2 h-2 rounded-full bg-[#B8860B]" />
        <span className="font-cairo text-sm text-gray-500 mr-2">
          {finetuned
            ? "نموذجك المدرّب يفكّر… (قد يستغرق دقيقة على المعالج)"
            : "يفكّر ميزان…"}
        </span>
      </div>
    </div>
  );
}
