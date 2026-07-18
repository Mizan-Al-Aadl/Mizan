import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Plus,
  Scale,
  Trash2,
  Edit3,
  ArrowRight,
  CalendarDays,
  Landmark,
  Users,
  Loader2,
  FileCheck2,
  FileX2,
  Briefcase,
  MessageSquare,
  AlertTriangle,
  BellRing,
  Paperclip,
  FileText,
  Upload,
  ChevronDown,
  ChevronUp,
  Gavel,
} from "lucide-react";

import {
  listCases,
  createCase,
  updateCase,
  deleteCase,
  createChat,
  addHearing,
  deleteHearing,
  listCaseDocuments,
  uploadCaseDocument,
  deleteCaseDocument,
  openCaseDocument,
} from "@/lib/api";
import type { Case, CaseDocument, CaseInput, CaseStatus } from "@/types";

const STATUS_LABELS: Record<CaseStatus, string> = {
  pending: "قيد النظر",
  won: "رابحة",
  lost: "خاسرة",
};

const STATUS_BADGE: Record<CaseStatus, string> = {
  pending: "badge-warning",
  won: "badge-success",
  lost: "badge-error",
};

const EMPTY_FORM: CaseInput = {
  title: "",
  case_number: "",
  court: "",
  client_name: "",
  opponent_name: "",
  status: "pending",
  next_hearing_date: "",
  reply_memo_done: false,
  notes: "",
};

const REMINDER_WINDOW_DAYS = 7;

function formToPayload(form: CaseInput): CaseInput {
  return {
    ...form,
    title: form.title.trim(),
    next_hearing_date: form.next_hearing_date ? form.next_hearing_date : null,
  };
}

/** Days from today until an ISO date; negative = past. */
function daysUntil(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${isoDate}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function hearingLabel(days: number): string {
  if (days === 0) return "الجلسة اليوم!";
  if (days === 1) return "الجلسة غداً";
  return `الجلسة بعد ${days} أيام`;
}

// ─── Case card ────────────────────────────────────────────────────────────────

interface CaseCardProps {
  c: Case;
  onEdit: (c: Case) => void;
  onDelete: (id: string) => void;
  onPatch: (id: string, patch: Partial<CaseInput>, successMsg?: string) => Promise<void>;
  onUpdated: (c: Case) => void;
}

function CaseCard({ c, onEdit, onDelete, onPatch, onUpdated }: CaseCardProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [docs, setDocs] = useState<CaseDocument[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [hearingDate, setHearingDate] = useState("");
  const [hearingNote, setHearingNote] = useState("");
  const [hearingOutcome, setHearingOutcome] = useState("");
  const [addingHearing, setAddingHearing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const days = c.next_hearing_date ? daysUntil(c.next_hearing_date) : null;
  const hearingSoon = days !== null && days >= 0 && days <= REMINDER_WINDOW_DAYS;
  const memoWarning = hearingSoon && !c.reply_memo_done;

  useEffect(() => {
    if (expanded && docs === null) {
      void listCaseDocuments(c.id)
        .then(setDocs)
        .catch(() => toast.error("تعذّر تحميل المستندات"));
    }
  }, [expanded, docs, c.id]);

  const handleAskChat = async () => {
    setOpeningChat(true);
    try {
      const chat = await createChat(undefined, c.id);
      navigate(`/app?chat=${chat.id}`);
    } catch {
      toast.error("تعذّر فتح محادثة للقضية");
      setOpeningChat(false);
    }
  };

  const handleAddHearing = async () => {
    if (!hearingDate) {
      toast.error("تاريخ الجلسة مطلوب");
      return;
    }
    setAddingHearing(true);
    try {
      const updated = await addHearing(c.id, {
        date: hearingDate,
        note: hearingNote,
        outcome: hearingOutcome,
      });
      onUpdated(updated);
      setHearingDate("");
      setHearingNote("");
      setHearingOutcome("");
      toast.success("تمت إضافة الجلسة");
    } catch {
      toast.error("تعذّر إضافة الجلسة");
    } finally {
      setAddingHearing(false);
    }
  };

  const handleDeleteHearing = async (hearingId: string) => {
    try {
      onUpdated(await deleteHearing(c.id, hearingId));
    } catch {
      toast.error("تعذّر حذف الجلسة");
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const doc = await uploadCaseDocument(c.id, file);
      setDocs((prev) => [...(prev ?? []), doc]);
      toast.success(
        doc.has_text
          ? "تم رفع المستند وقراءة نصه — المساعد يستطيع الإجابة عنه الآن"
          : "تم رفع المستند (تعذّر استخراج نص منه)"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر رفع المستند");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    try {
      await deleteCaseDocument(c.id, docId);
      setDocs((prev) => (prev ?? []).filter((d) => d.id !== docId));
      toast.success("تم حذف المستند");
    } catch {
      toast.error("تعذّر حذف المستند");
    }
  };

  const sortedHearings = [...c.hearings].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <li
      data-testid={`case-item-${c.id}`}
      className={`bg-base-100 border rounded-2xl p-5 shadow-sm ${
        memoWarning ? "border-warning" : hearingSoon ? "border-primary/40" : "border-black/5"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-lg truncate">{c.title}</h2>
            <span className={`badge ${STATUS_BADGE[c.status]} badge-sm text-white`}>
              {STATUS_LABELS[c.status]}
            </span>
            {hearingSoon && days !== null && (
              <span className="badge badge-primary badge-sm badge-outline gap-1">
                <BellRing className="w-3 h-3" />
                {hearingLabel(days)}
              </span>
            )}
          </div>
          {c.case_number && (
            <p className="text-sm text-gray-500 mt-0.5">رقم القضية: {c.case_number}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            data-testid={`ask-case-${c.id}`}
            onClick={() => void handleAskChat()}
            disabled={openingChat}
            className="btn btn-primary btn-sm rounded-xl gap-1"
          >
            {openingChat ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MessageSquare className="w-4 h-4" />
            )}
            اسأل عن هذه القضية
          </button>
          <button
            data-testid={`edit-case-${c.id}`}
            onClick={() => onEdit(c)}
            className="btn btn-ghost btn-sm btn-square"
            aria-label="تعديل القضية"
          >
            <Edit3 className="w-4 h-4 text-base-content/60" />
          </button>
          <button
            data-testid={`delete-case-${c.id}`}
            onClick={() => onDelete(c.id)}
            className="btn btn-ghost btn-sm btn-square"
            aria-label="حذف القضية"
          >
            <Trash2 className="w-4 h-4 text-base-content/60" />
          </button>
        </div>
      </div>

      {memoWarning && (
        <div
          data-testid={`memo-warning-${c.id}`}
          className="mt-3 flex items-center gap-2 text-sm text-warning-content bg-warning/20 border border-warning/40 rounded-xl px-3 py-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          الجلسة قريبة واللائحة الجوابية غير جاهزة بعد!
        </div>
      )}

      <div className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-gray-600">
        {c.court && (
          <span className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-gray-400" />
            {c.court}
          </span>
        )}
        {(c.client_name || c.opponent_name) && (
          <span className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" />
            {c.client_name || "—"}
            {c.opponent_name ? ` ضد ${c.opponent_name}` : ""}
          </span>
        )}
        <span className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-gray-400" />
          {c.next_hearing_date
            ? `الجلسة القادمة: ${c.next_hearing_date}`
            : "لا يوجد موعد جلسة محدد"}
        </span>
        <button
          data-testid={`toggle-memo-${c.id}`}
          onClick={() => void onPatch(c.id, { reply_memo_done: !c.reply_memo_done })}
          className={`flex items-center gap-2 text-right ${
            c.reply_memo_done ? "text-success" : "text-gray-500"
          } hover:opacity-80`}
          title="اضغط للتبديل"
        >
          {c.reply_memo_done ? <FileCheck2 className="w-4 h-4" /> : <FileX2 className="w-4 h-4" />}
          اللائحة الجوابية: {c.reply_memo_done ? "جاهزة" : "غير جاهزة"}
        </button>
      </div>

      {c.notes && (
        <p className="mt-3 text-sm text-gray-500 whitespace-pre-wrap border-t border-black/5 pt-3">
          {c.notes}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400">تحديث الحالة:</span>
        <select
          data-testid={`status-select-${c.id}`}
          className="select select-bordered select-xs rounded-lg"
          value={c.status}
          onChange={(e) =>
            void onPatch(c.id, { status: e.target.value as CaseStatus }, "تم تحديث الحالة")
          }
        >
          <option value="pending">قيد النظر</option>
          <option value="won">رابحة</option>
          <option value="lost">خاسرة</option>
        </select>

        <button
          data-testid={`expand-case-${c.id}`}
          onClick={() => setExpanded((v) => !v)}
          className="btn btn-ghost btn-xs rounded-lg gap-1 mr-auto"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          الجلسات والمستندات
          {(c.hearings.length > 0 || (docs?.length ?? 0) > 0) && (
            <span className="badge badge-ghost badge-xs">
              {c.hearings.length + (docs?.length ?? 0)}
            </span>
          )}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 border-t border-black/5 pt-4 grid md:grid-cols-2 gap-6">
          {/* Hearings timeline */}
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
              <Gavel className="w-4 h-4 text-gray-400" />
              سجل الجلسات
            </h3>
            {sortedHearings.length === 0 ? (
              <p className="text-sm text-gray-400 mb-3">لا توجد جلسات مسجّلة.</p>
            ) : (
              <ul className="mb-3 space-y-2">
                {sortedHearings.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-start gap-2 text-sm bg-base-200 rounded-xl px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{h.date}</span>
                      {h.outcome && <span className="text-gray-600"> — {h.outcome}</span>}
                      {h.note && (
                        <p className="text-gray-500 text-xs mt-0.5 whitespace-pre-wrap">{h.note}</p>
                      )}
                    </div>
                    <button
                      onClick={() => void handleDeleteHearing(h.id)}
                      className="btn btn-ghost btn-xs btn-square shrink-0"
                      aria-label="حذف الجلسة"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-base-content/50" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-2">
              <div className="flex gap-2">
                <input
                  type="date"
                  className="input input-bordered input-sm rounded-xl flex-1"
                  value={hearingDate}
                  onChange={(e) => setHearingDate(e.target.value)}
                />
                <input
                  className="input input-bordered input-sm rounded-xl flex-1"
                  placeholder="النتيجة (اختياري)"
                  value={hearingOutcome}
                  onChange={(e) => setHearingOutcome(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <input
                  className="input input-bordered input-sm rounded-xl flex-1"
                  placeholder="ملاحظة (اختياري)"
                  value={hearingNote}
                  onChange={(e) => setHearingNote(e.target.value)}
                />
                <button
                  data-testid={`add-hearing-${c.id}`}
                  onClick={() => void handleAddHearing()}
                  disabled={addingHearing}
                  className="btn btn-primary btn-sm rounded-xl"
                >
                  {addingHearing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  إضافة جلسة
                </button>
              </div>
            </div>
          </div>

          {/* Documents */}
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
              <Paperclip className="w-4 h-4 text-gray-400" />
              مستندات القضية
            </h3>
            {docs === null ? (
              <p className="text-sm text-gray-400 mb-3">جارٍ التحميل…</p>
            ) : docs.length === 0 ? (
              <p className="text-sm text-gray-400 mb-3">لا توجد مستندات مرفوعة.</p>
            ) : (
              <ul className="mb-3 space-y-2">
                {docs.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-2 text-sm bg-base-200 rounded-xl px-3 py-2"
                  >
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <button
                      onClick={() =>
                        void openCaseDocument(c.id, d.id).catch(() =>
                          toast.error("تعذّر فتح المستند")
                        )
                      }
                      className="flex-1 min-w-0 text-right truncate hover:underline"
                      title={d.filename}
                    >
                      {d.filename}
                    </button>
                    {!d.has_text && (
                      <span
                        className="badge badge-ghost badge-xs shrink-0"
                        title="لم يُستخرج نص — المساعد لا يستطيع قراءته"
                      >
                        بدون نص
                      </span>
                    )}
                    <button
                      onClick={() => void handleDeleteDoc(d.id)}
                      className="btn btn-ghost btn-xs btn-square shrink-0"
                      aria-label="حذف المستند"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-base-content/50" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
            <button
              data-testid={`upload-doc-${c.id}`}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn btn-outline btn-primary btn-sm rounded-xl"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              رفع مستند (PDF / Word / نص)
            </button>
            <p className="text-xs text-gray-400 mt-2">
              يقرأ المساعد نص المستندات المرفوعة عند فتح محادثة خاصة بهذه القضية.
            </p>
          </div>
        </div>
      )}
    </li>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CasesPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CaseInput>(EMPTY_FORM);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const confirmDeleteCase = cases.find((c) => c.id === confirmDeleteId);

  useEffect(() => {
    void (async () => {
      try {
        setCases(await listCases());
      } catch {
        toast.error("تعذّر تحميل القضايا");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const upcoming = cases
    .filter((c) => c.next_hearing_date)
    .map((c) => ({ c, days: daysUntil(c.next_hearing_date!) }))
    .filter(({ days }) => days >= 0 && days <= REMINDER_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (c: Case) => {
    setEditingId(c.id);
    setForm({
      title: c.title,
      case_number: c.case_number,
      court: c.court,
      client_name: c.client_name,
      opponent_name: c.opponent_name,
      status: c.status,
      next_hearing_date: c.next_hearing_date ?? "",
      reply_memo_done: c.reply_memo_done,
      notes: c.notes,
    });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error("عنوان القضية مطلوب");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const updated = await updateCase(editingId, formToPayload(form));
        setCases((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
        toast.success("تم تحديث القضية");
      } else {
        const created = await createCase(formToPayload(form));
        setCases((prev) => [created, ...prev]);
        toast.success("تمت إضافة القضية");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر حفظ القضية");
    } finally {
      setSaving(false);
    }
  };

  const patchCase = async (id: string, patch: Partial<CaseInput>, successMsg?: string) => {
    try {
      const updated = await updateCase(id, patch);
      setCases((prev) => prev.map((c) => (c.id === id ? updated : c)));
      if (successMsg) toast.success(successMsg);
    } catch {
      toast.error("تعذّر تحديث القضية");
    }
  };

  const handleCaseUpdated = (updated: Case) =>
    setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));

  const handleDelete = async (id: string) => {
    try {
      await deleteCase(id);
      setCases((prev) => prev.filter((c) => c.id !== id));
      toast.success("تم حذف القضية");
    } catch {
      toast.error("تعذّر الحذف");
    }
  };

  const setField = <K extends keyof CaseInput>(key: K, value: CaseInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="min-h-screen bg-mizan-bg text-gray-900 font-cairo">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-mizan-bg/90 backdrop-blur border-b border-black/5">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-6 h-6 text-primary" />
            <span className="font-amiri text-2xl font-bold text-mizan-green">ميزان</span>
            <span className="text-sm text-gray-400 mr-2">— قضاياي</span>
          </div>
          <Link
            to="/app"
            data-testid="back-to-chat-link"
            className="btn btn-ghost btn-sm gap-2 rounded-xl"
          >
            العودة للمحادثة
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">القضايا</h1>
            <p className="text-sm text-gray-500 mt-1">
              تابع جلساتك القادمة وحالة كل قضية واللوائح الجوابية. المساعد الذكي
              يمكنه الإجابة عن أسئلتك حول هذه القضايا في المحادثة.
            </p>
          </div>
          <button
            data-testid="add-case-btn"
            onClick={openCreate}
            className="btn btn-primary rounded-xl shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            إضافة قضية
          </button>
        </div>

        {/* Upcoming hearings banner */}
        {upcoming.length > 0 && (
          <div
            data-testid="upcoming-banner"
            className="mb-6 bg-primary/5 border border-primary/20 rounded-2xl p-4"
          >
            <h2 className="font-bold flex items-center gap-2 text-primary mb-2">
              <BellRing className="w-5 h-5" />
              جلسات هذا الأسبوع
            </h2>
            <ul className="space-y-1 text-sm">
              {upcoming.map(({ c, days }) => (
                <li key={c.id} className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{c.title}</span>
                  <span className="text-gray-500">
                    — {c.next_hearing_date} ({days === 0 ? "اليوم" : days === 1 ? "غداً" : `بعد ${days} أيام`})
                  </span>
                  {!c.reply_memo_done && (
                    <span className="badge badge-warning badge-sm gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      اللائحة الجوابية غير جاهزة
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin ml-2" />
            جارٍ التحميل…
          </div>
        ) : cases.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-black/10 rounded-2xl bg-base-100">
            <Briefcase className="w-10 h-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 mb-4">لا توجد قضايا مسجّلة بعد.</p>
            <button onClick={openCreate} className="btn btn-primary btn-sm rounded-xl">
              <Plus className="w-4 h-4" />
              أضف قضيتك الأولى
            </button>
          </div>
        ) : (
          <ul className="grid gap-4" data-testid="cases-list">
            {cases.map((c) => (
              <CaseCard
                key={c.id}
                c={c}
                onEdit={openEdit}
                onDelete={setConfirmDeleteId}
                onPatch={patchCase}
                onUpdated={handleCaseUpdated}
              />
            ))}
          </ul>
        )}
      </main>

      {/* Create / edit modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 overflow-y-auto"
          onClick={() => !saving && setFormOpen(false)}
        >
          <div
            dir="rtl"
            role="dialog"
            aria-modal="true"
            className="bg-base-100 rounded-2xl p-6 w-full max-w-lg shadow-xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg mb-4">
              {editingId ? "تعديل القضية" : "إضافة قضية جديدة"}
            </h3>

            <div className="grid gap-3">
              <label className="form-control">
                <span className="label-text mb-1">عنوان القضية *</span>
                <input
                  data-testid="case-title-input"
                  className="input input-bordered rounded-xl"
                  value={form.title}
                  onChange={(e) => setField("title", e.target.value)}
                  placeholder="مثال: نزاع إيجار — عقار الأشرفية"
                />
              </label>

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="form-control">
                  <span className="label-text mb-1">رقم القضية</span>
                  <input
                    className="input input-bordered rounded-xl"
                    value={form.case_number}
                    onChange={(e) => setField("case_number", e.target.value)}
                  />
                </label>
                <label className="form-control">
                  <span className="label-text mb-1">المحكمة</span>
                  <input
                    className="input input-bordered rounded-xl"
                    value={form.court}
                    onChange={(e) => setField("court", e.target.value)}
                    placeholder="مثال: محكمة بيروت الابتدائية"
                  />
                </label>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="form-control">
                  <span className="label-text mb-1">اسم الموكّل</span>
                  <input
                    className="input input-bordered rounded-xl"
                    value={form.client_name}
                    onChange={(e) => setField("client_name", e.target.value)}
                  />
                </label>
                <label className="form-control">
                  <span className="label-text mb-1">الخصم</span>
                  <input
                    className="input input-bordered rounded-xl"
                    value={form.opponent_name}
                    onChange={(e) => setField("opponent_name", e.target.value)}
                  />
                </label>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="form-control">
                  <span className="label-text mb-1">الحالة</span>
                  <select
                    className="select select-bordered rounded-xl"
                    value={form.status}
                    onChange={(e) => setField("status", e.target.value as CaseStatus)}
                  >
                    <option value="pending">قيد النظر</option>
                    <option value="won">رابحة</option>
                    <option value="lost">خاسرة</option>
                  </select>
                </label>
                <label className="form-control">
                  <span className="label-text mb-1">موعد الجلسة القادمة</span>
                  <input
                    type="date"
                    data-testid="case-date-input"
                    className="input input-bordered rounded-xl"
                    value={form.next_hearing_date ?? ""}
                    onChange={(e) => setField("next_hearing_date", e.target.value)}
                  />
                </label>
              </div>

              <label className="flex items-center gap-3 cursor-pointer py-1">
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={!!form.reply_memo_done}
                  onChange={(e) => setField("reply_memo_done", e.target.checked)}
                />
                <span className="label-text">اللائحة الجوابية جاهزة</span>
              </label>

              <label className="form-control">
                <span className="label-text mb-1">ملاحظات</span>
                <textarea
                  className="textarea textarea-bordered rounded-xl min-h-20"
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                />
              </label>
            </div>

            <div className="flex gap-2 justify-start mt-5">
              <button
                data-testid="save-case-btn"
                className="btn btn-primary btn-sm rounded-xl"
                disabled={saving}
                onClick={() => void handleSubmit()}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? "حفظ التعديلات" : "إضافة"}
              </button>
              <button
                className="btn btn-ghost btn-sm rounded-xl"
                disabled={saving}
                onClick={() => setFormOpen(false)}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            dir="rtl"
            role="alertdialog"
            aria-modal="true"
            className="bg-base-100 rounded-2xl p-6 w-full max-w-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg mb-2">حذف القضية؟</h3>
            <p className="text-sm text-base-content/70 mb-1 truncate">
              «{confirmDeleteCase?.title ?? "قضية"}»
            </p>
            <p className="text-sm text-base-content/70 mb-5">
              سيتم حذف القضية وجلساتها ومستنداتها نهائياً ولن يتمكن المساعد من
              الإجابة عنها بعد الآن.
            </p>
            <div className="flex gap-2 justify-start">
              <button
                data-testid="confirm-delete-case-btn"
                className="btn btn-error btn-sm text-white"
                onClick={() => {
                  void handleDelete(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
              >
                حذف
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmDeleteId(null)}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
