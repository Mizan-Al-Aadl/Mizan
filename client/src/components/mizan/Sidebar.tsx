import { Plus, Scale, Trash2, MessageSquare, X } from "lucide-react";
import type { Chat } from "@/types";

interface SidebarProps {
  chats: Chat[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function Sidebar({
  chats,
  activeId,
  onSelect,
  onNew,
  onDelete,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
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
          bg-base-200 border-l border-base-300
          flex flex-col
          transition-transform duration-300 ease-out
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-base-300">
          <div className="flex items-center gap-2">
            <Scale className="w-6 h-6 text-primary" />
            <span className="font-amiri text-3xl font-bold text-primary leading-none">
              ميزان
            </span>
          </div>
          <button
            data-testid="close-sidebar-btn"
            className="md:hidden btn btn-ghost btn-sm btn-square"
            onClick={onCloseMobile}
            aria-label="إغلاق القائمة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New chat button */}
        <div className="p-4">
          <button
            data-testid="new-chat-btn"
            onClick={onNew}
            className="btn btn-primary w-full rounded-xl font-cairo shadow-sm"
          >
            <Plus className="w-4 h-4" />
            محادثة جديدة
          </button>
        </div>

        {/* Chat list */}
        <div className="px-2 pb-4 flex-1 overflow-y-auto">
          <p className="px-3 py-2 text-xs uppercase tracking-wider text-base-content/50 font-cairo">
            المحادثات السابقة
          </p>
          {chats.length === 0 ? (
            <p className="px-3 py-4 text-sm text-base-content/50 font-cairo">
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
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-base-300 text-base-content"
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
                    className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100"
                    aria-label="حذف المحادثة"
                  >
                    <Trash2 className="w-4 h-4 text-base-content/60" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-base-300 text-xs text-base-content/50 font-cairo">
          مساعد قانوني لبناني — قيد التطوير.
        </div>
      </aside>
    </>
  );
}