import { Plus, Scale, Trash2, MessageSquare, X } from "lucide-react";

export default function Sidebar({
  chats,
  activeId,
  onSelect,
  onNew,
  onDelete,
  mobileOpen,
  onCloseMobile,
}) {
  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/30 z-40"
          onClick={onCloseMobile}
        />
      )}

      <aside
        data-testid="sidebar"
        className={`
          ${mobileOpen ? "translate-x-0" : "translate-x-[-100%] md:translate-x-0"}
          fixed md:static top-0 right-0 z-50 md:z-auto
          h-full w-72 md:w-80
          bg-[#EBE6D9] border-l border-black/5
          flex flex-col
          transition-transform duration-300 ease-out
        `}
      >
        <div className="flex items-center justify-between p-4 border-b border-black/5">
          <div className="flex items-center gap-2">
            <Scale className="w-6 h-6 text-[#0F4C3A]" />
            <span className="font-amiri text-3xl font-bold text-[#0F4C3A] leading-none">
              ميزان
            </span>
          </div>
          <button
            data-testid="close-sidebar-btn"
            className="md:hidden p-2 rounded-lg hover:bg-black/5"
            onClick={onCloseMobile}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <button
            data-testid="new-chat-btn"
            onClick={onNew}
            className="w-full bg-[#0F4C3A] text-white rounded-xl px-4 py-3 font-semibold hover:bg-[#0A3326] transition-colors flex items-center justify-center gap-2 font-cairo shadow-sm"
          >
            <Plus className="w-4 h-4" />
            محادثة جديدة
          </button>
        </div>

        <div className="px-2 pb-4 flex-1 overflow-y-auto">
          <p className="px-3 py-2 text-xs uppercase tracking-wider text-gray-500 font-cairo">
            المحادثات السابقة
          </p>
          {chats.length === 0 ? (
            <p className="px-3 py-4 text-sm text-gray-500 font-cairo">
              لا توجد محادثات بعد.
            </p>
          ) : (
            <ul className="flex flex-col gap-1" data-testid="chat-list">
              {chats.map((c) => (
                <li
                  key={c.id}
                  data-testid={`chat-item-${c.id}`}
                  onClick={() => onSelect(c.id)}
                  className={`
                    group flex items-center gap-2 p-3 rounded-lg cursor-pointer
                    transition-colors font-cairo
                    ${
                      activeId === c.id
                        ? "bg-[#0F4C3A]/10 text-[#0F4C3A]"
                        : "hover:bg-black/5 text-gray-800"
                    }
                  `}
                >
                  <MessageSquare className="w-4 h-4 shrink-0 opacity-70" />
                  <span className="truncate flex-1 text-sm">{c.title}</span>
                  <button
                    data-testid={`delete-chat-${c.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(c.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-black/10 transition-opacity"
                    aria-label="حذف المحادثة"
                  >
                    <Trash2 className="w-4 h-4 text-gray-600" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 border-t border-black/5 text-xs text-gray-500 font-cairo">
          مساعد قانوني لبناني — قيد التطوير.
        </div>
      </aside>
    </>
  );
}
