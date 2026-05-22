import { Scale } from "lucide-react";

export default function TypingIndicator() {
  return (
    <div
      data-testid="typing-indicator"
      className="animate-fade-in flex gap-3 flex-row-reverse items-start"
    >
      <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-secondary/10 text-secondary border border-secondary/30">
        <Scale className="w-4 h-4" />
      </div>
      <div className="bg-base-100 border border-base-200 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-secondary animate-pulse"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}