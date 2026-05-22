import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Menu,
  Sparkles,
  FileText,
  Gavel,
  BookOpen,
  Loader2,
} from "lucide-react";

import {
  listChats,
  createChat,
  deleteChat,
  listMessages,
  sendMessageStream,
} from "@/lib/api";
import type { Chat, Message } from "@/types";

import Sidebar from "@/components/mizan/Sidebar";
import EmptyState from "@/components/mizan/EmptyState";
import MessageBubble from "@/components/mizan/MessageBubble";
import TypingIndicator from "@/components/mizan/TypingIndicator";
import ChatInput from "@/components/mizan/ChatInput";

// ─── Suggested prompts ────────────────────────────────────────────────────────
const SUGGESTED = [
  {
    icon: Gavel,
    title: "حقوق العامل عند الصرف التعسفي",
    prompt:
      "ما هي حقوق العامل في لبنان عند الصرف التعسفي وفقاً لقانون العمل، وكيف تُحسب التعويضات؟",
  },
  {
    icon: FileText,
    title: "صياغة عقد إيجار سكني",
    prompt:
      "ساعدني في صياغة عقد إيجار سكني وفق القانون اللبناني يتضمن مدة سنتين وبدل إيجار شهري.",
  },
  {
    icon: BookOpen,
    title: "قانون السير والمخالفات",
    prompt:
      "ما هي عقوبات قطع الإشارة الحمراء في لبنان وفقاً لقانون السير الجديد؟",
  },
  {
    icon: Sparkles,
    title: "إفادة شهادة في قضية مدنية",
    prompt:
      "اكتب لي مسودة إفادة شهادة لتقديمها أمام محكمة الدرجة الأولى في قضية نزاع تجاري.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function MizanApp() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [streamingText, setStreamingText] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const skipNextLoadRef = useRef(false);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeId) ?? null,
    [chats, activeId]
  );

  // ── Data fetchers ──
  const refreshChats = async (): Promise<Chat[]> => {
    try {
      const data = await listChats();
      setChats(data);
      return data;
    } catch {
      toast.error("تعذّر تحميل المحادثات");
      return [];
    }
  };

  useEffect(() => {
    void refreshChats();
  }, []);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false;
      return;
    }
    void (async () => {
      setLoadingMsgs(true);
      try {
        const data = await listMessages(activeId);
        setMessages(data);
      } catch {
        toast.error("تعذّر تحميل الرسائل");
      } finally {
        setLoadingMsgs(false);
      }
    })();
  }, [activeId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // ── Handlers ──
  const handleNewChat = async () => {
    try {
      const c = await createChat();
      setChats((prev) => [c, ...prev]);
      setActiveId(c.id);
      setMessages([]);
      setSidebarOpen(false);
    } catch {
      toast.error("تعذّر إنشاء محادثة جديدة");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteChat(id);
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
      toast.success("تم حذف المحادثة");
    } catch {
      toast.error("تعذّر الحذف");
    }
  };

  const handleSend = async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;

    let chatId = activeId;

    // Auto-create chat if none active
    if (!chatId) {
      try {
        const c = await createChat();
        setChats((prev) => [c, ...prev]);
        skipNextLoadRef.current = true;
        setActiveId(c.id);
        chatId = c.id;
      } catch {
        toast.error("تعذّر بدء محادثة");
        return;
      }
    }

    // Optimistic user message
    const tempUser: Message = {
      id: `temp-${Date.now()}`,
      chat_id: chatId,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUser]);
    setSending(true);
    setStreamingText("");

    await new Promise<void>((resolve) => {
      let acc = "";
      sendMessageStream(
        chatId!,
        content,
        {},
        {
          onToken: (chunk) => {
            acc += chunk;
            setStreamingText(acc);
          },
          onDone: async () => {
            try {
              const data = await listMessages(chatId!);
              setMessages(data);
              void refreshChats();
            } catch {
              // non-fatal
            }
            setStreamingText("");
            setSending(false);
            resolve();
          },
          onError: (msg) => {
            toast.error(`خطأ من المساعد: ${msg}`);
            setMessages((prev) => prev.filter((m) => m.id !== tempUser.id));
            setStreamingText("");
            setSending(false);
            resolve();
          },
        }
      );
    });
  };

  const showEmpty = !activeId && messages.length === 0;

  // ── Render ──
  return (
    <div className="h-screen w-full flex flex-col bg-mizan-bg text-gray-900 overflow-hidden">
      {/* Mobile top bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-black/5 bg-mizan-bg/90 backdrop-blur">
        <button
          data-testid="open-sidebar-btn"
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg hover:bg-black/5"
          aria-label="فتح القائمة"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="font-amiri text-2xl font-bold text-mizan-green">
          ميزان
        </span>
        <button
          data-testid="new-chat-btn-mobile"
          onClick={handleNewChat}
          className="p-2 rounded-lg hover:bg-black/5"
          aria-label="محادثة جديدة"
        >
          <Plus className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          chats={chats}
          activeId={activeId}
          onSelect={(id) => {
            setActiveId(id);
            setSidebarOpen(false);
          }}
          onNew={handleNewChat}
          onDelete={handleDelete}
          mobileOpen={sidebarOpen}
          onCloseMobile={() => setSidebarOpen(false)}
        />

        <main className="flex-1 flex flex-col min-w-0 relative">
          {/* Messages area */}
          <div
            ref={scrollRef}
            data-testid="messages-scroll"
            className="flex-1 overflow-y-auto"
          >
            {showEmpty ? (
              <EmptyState suggestions={SUGGESTED} onPick={handleSend} />
            ) : (
              <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 flex flex-col gap-4">
                {loadingMsgs && (
                  <div className="flex items-center justify-center py-12 text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin ml-2" />
                    جارٍ التحميل…
                  </div>
                )}
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    role={m.role}
                    content={m.content}
                    source={m.source}
                  />
                ))}
                {sending && streamingText && (
                  <MessageBubble
                    role="assistant"
                    content={streamingText}
                    streaming
                    source="claude"
                  />
                )}
                {sending && !streamingText && <TypingIndicator />}
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="w-full">
            <div className="max-w-4xl mx-auto w-full px-4">
              <ChatInput onSend={handleSend} disabled={sending} />
            </div>
            <footer
              data-testid="legal-disclaimer"
              className="text-center text-xs text-gray-400 py-3 px-6 font-cairo"
            >
              المعلومات المقدّمة من "ميزان" للاطلاع العام ولا تُعتبر استشارة
              قانونية رسمية.
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
