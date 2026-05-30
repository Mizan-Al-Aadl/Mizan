import { type LucideIcon, Scale } from "lucide-react";

interface Suggestion {
  icon: LucideIcon;
  title: string;
  prompt: string;
}

interface EmptyStateProps {
  suggestions: Suggestion[];
  onPick: (prompt: string) => void;
}

export default function EmptyState({ suggestions, onPick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-12 text-center font-cairo">
      <div className="flex items-center gap-3 mb-3">
        <Scale className="w-10 h-10 text-primary" />
        <span className="font-amiri text-5xl font-bold text-primary">
          ميزان
        </span>
      </div>
      <p className="text-base-content/60 mb-8 max-w-sm">
        مساعدك القانوني اللبناني. اسأل عن أي موضوع قانوني أو اطلب صياغة وثيقة.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
        {suggestions.map(({ icon: Icon, title, prompt }) => (
          <button
            key={title}
            onClick={() => onPick(prompt)}
            className="flex items-start gap-3 p-4 bg-base-100 border border-base-200 rounded-xl text-right hover:border-primary/30 hover:bg-primary/5 transition-colors shadow-sm group"
          >
            <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-content transition-colors">
              <Icon className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium text-base-content/80 leading-snug">
              {title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}