import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Send,
  Trash2,
  Scale,
  MessageSquare,
  Menu,
  Sparkles,
  FileText,
  Gavel,
  BookOpen,
  Loader2,
  Cpu,
  Bot,
} from "lucide-react";

import {
  listChats,
  createChat,
  deleteChat,
  listMessages,
  sendMessageStream,
} from "@/lib/api";

import Sidebar from "@/components/mizan/Sidebar";
import EmptyState from "@/components/mizan/EmptyState";
import MessageBubble from "@/components/mizan/MessageBubble";
import TypingIndicator from "@/components/mizan/TypingIndicator";
import ChatInput from "@/components/mizan/ChatInput";

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

export default function MizanApp() {
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [useFinetuned, setUseFinetuned] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const scrollRef = useRef(null);
  const skipNextLoadRef = useRef(false);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeId) || null,
    [chats, activeId]
  );

  const refreshChats = async () => {
    try {
      const data = await listChats();
      setChats(data);
      return data;
    } catch (e) {
      toast.error("تعذّر تحميل المحادثات");
      return [];
    }
  };

  useEffect(() => {
    refreshChats();
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
    (async () => {
      setLoadingMsgs(true);
      try {
        const data = await listMessages(activeId);
        setMessages(data);
      } catch (e) {
        toast.error("تعذّر تحميل الرسائل");
      } finally {
        setLoadingMsgs(false);
      }
    })();
  }, [activeId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const handleNewChat = async () => {
    try {
      const c = await createChat();
      setChats((prev) => [c, ...prev]);
      setActiveId(c.id);
      setMessages([]);
      setSidebarOpen(false);
    } catch (e) {
      toast.error("تعذّر إنشاء محادثة جديدة");
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteChat(id);
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
      toast.success("تم حذف المحادثة");
    } catch (e) {
      toast.error("تعذّر الحذف");
    }
  };

  const handleSend = async (text) => {
    const content = (text || "").trim();
    if (!content || sending) return;

    let chatId = activeId;
    // Create chat on the fly if none active
    if (!chatId) {
      try {
        const c = await createChat();
        setChats((prev) => [c, ...prev]);
        skipNextLoadRef.current = true;   // we already know it's empty
        setActiveId(c.id);
        chatId = c.id;
      } catch (e) {
        toast.error("تعذّر بدء محادثة");
        return;
      }
    }

    // Optimistic user message
    const tempUser = {
      id: `temp-${Date.now()}`,
      chat_id: chatId,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUser]);
    setSending(true);
    setStreamingText("");

    await new Promise((resolve) => {
      let acc = "";
      sendMessageStream(
        chatId,
        content,
        { use_finetuned: useFinetuned },
        {
          onToken: (chunk) => {
            acc += chunk;
            setStreamingText(acc);
          },
          onDone: async () => {
            // Reload full message list to capture persisted IDs and ordering
            try {
              const data = await listMessages(chatId);
              setMessages(data);
              refreshChats();
            } catch (e) {
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

  return (
    <div className="h-screen w-full flex flex-col bg-[#F9F6F0] text-[#111827] overflow-hidden">
      {/* Top bar (mobile) */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-black/5 bg-[#F9F6F0]/90 backdrop-blur">
        <button
          data-testid="open-sidebar-btn"
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg hover:bg-black/5"
          aria-label="فتح القائمة"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-[#0F4C3A]" />
          <span className="font-amiri text-2xl font-bold text-[#0F4C3A]">ميزان</span>
        </div>
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
        {/* Sidebar first in DOM → RTL flex places it on the RIGHT side */}
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

        {/* Chat area (second → RTL flex places it on the LEFT) */}
        <main className="flex-1 flex flex-col min-w-0 relative">
          <div
            ref={scrollRef}
            data-testid="messages-scroll"
            className="flex-1 overflow-y-auto"
          >
            {!activeId && messages.length === 0 ? (
              <EmptyState
                suggestions={SUGGESTED}
                onPick={(p) => handleSend(p)}
              />
            ) : (
              <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 flex flex-col gap-4">
                {loadingMsgs && (
                  <div className="flex items-center justify-center py-12 text-gray-500">
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
                    source={useFinetuned ? "finetuned" : "claude"}
                  />
                )}
                {sending && !streamingText && (
                  <TypingIndicator finetuned={useFinetuned} />
                )}
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="w-full">
            <div className="max-w-4xl mx-auto w-full px-4">
              {/* Model selector */}
              <div className="flex items-center justify-end gap-2 pt-3 pb-1 text-xs font-cairo">
                <span className="text-gray-500">المحرّك:</span>
                <button
                  data-testid="model-toggle-claude"
                  onClick={() => setUseFinetuned(false)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors ${
                    !useFinetuned
                      ? "bg-[#0F4C3A] text-white border-[#0F4C3A]"
                      : "bg-white text-gray-700 border-black/10 hover:border-[#0F4C3A]/40"
                  }`}
                >
                  <Bot className="w-3.5 h-3.5" />
                  Claude Sonnet 4.5 — سريع
                </button>
                <button
                  data-testid="model-toggle-finetuned"
                  onClick={() => setUseFinetuned(true)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors ${
                    useFinetuned
                      ? "bg-[#B8860B] text-white border-[#B8860B]"
                      : "bg-white text-gray-700 border-black/10 hover:border-[#B8860B]/40"
                  }`}
                  title="نموذجك المدرّب — أبطأ بسبب التشغيل على المعالج"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  نموذجك المدرّب — بطيء
                </button>
              </div>
              <ChatInput onSend={handleSend} disabled={sending} />
            </div>
            <footer
              data-testid="legal-disclaimer"
              className="text-center text-xs text-gray-500 py-3 px-6 font-cairo"
            >
              المعلومات المقدّمة من "ميزان" للاطلاع العام ولا تُعتبر استشارة قانونية رسمية.
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
