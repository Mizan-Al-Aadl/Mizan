import { Scale } from "lucide-react";

export default function EmptyState({ suggestions, onPick }) {
  return (
    <div
      className="relative w-full h-full flex flex-col items-center justify-start"
      data-testid="empty-state"
    >
      {/* Ambient background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10 bg-center bg-no-repeat bg-contain"
        style={{
          backgroundImage:
            "url('https://static.prod-images.emergentagent.com/jobs/343531f2-1dab-4740-8ab3-9f7012c03454/images/84c827454a4bd2cd4194281c536d3c12f3e74cb9d4f54ec96419e48cfe690e3b.png')",
        }}
      />
      <div className="relative max-w-3xl mx-auto w-full px-4 sm:px-6 pt-12 sm:pt-20 pb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#0F4C3A] text-white mb-6 shadow-md">
          <Scale className="w-8 h-8" />
        </div>
        <h1 className="font-amiri text-4xl sm:text-5xl lg:text-6xl font-bold text-[#0F4C3A] mb-3 tracking-tight">
          مَرحَباً بك في ميزان
        </h1>
        <p className="font-cairo text-base sm:text-lg text-gray-700 leading-relaxed max-w-2xl mx-auto">
          مساعدك القانوني اللبناني — اسأل عن قانون العقوبات، الموجبات والعقود،
          الأحوال الشخصية، أو اطلب صياغة مستند أو إفادة باللغة العربية.
        </p>
      </div>

      <div className="relative w-full max-w-3xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {suggestions.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.title}
                data-testid={`suggested-${s.title}`}
                onClick={() => onPick(s.prompt)}
                className="text-right p-5 bg-white border border-black/5 rounded-2xl hover:border-[#B8860B] hover:shadow-md transition-all cursor-pointer group flex flex-col gap-2"
              >
                <div className="flex items-center gap-2 text-[#0F4C3A]">
                  <Icon className="w-5 h-5" />
                  <span className="font-cairo font-semibold text-base">
                    {s.title}
                  </span>
                </div>
                <p className="font-cairo text-sm text-gray-600 group-hover:text-gray-800 leading-relaxed">
                  {s.prompt}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
