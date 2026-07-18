import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
} from "lucide-react";

import { listCases, createCase, updateCase, deleteCase } from "@/lib/api";
import type { Case, CaseInput, CaseStatus } from "@/types";

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

function formToPayload(form: CaseInput): CaseInput {
  return {
    ...form,
    title: form.title.trim(),
    next_hearing_date: form.next_hearing_date ? form.next_hearing_date : null,
  };
}

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
              <li
                key={c.id}
                data-testid={`case-item-${c.id}`}
                className="bg-base-100 border border-black/5 rounded-2xl p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-bold text-lg truncate">{c.title}</h2>
                      <span className={`badge ${STATUS_BADGE[c.status]} badge-sm text-white`}>
                        {STATUS_LABELS[c.status]}
                      </span>
                    </div>
                    {c.case_number && (
                      <p className="text-sm text-gray-500 mt-0.5">رقم القضية: {c.case_number}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      data-testid={`edit-case-${c.id}`}
                      onClick={() => openEdit(c)}
                      className="btn btn-ghost btn-sm btn-square"
                      aria-label="تعديل القضية"
                    >
                      <Edit3 className="w-4 h-4 text-base-content/60" />
                    </button>
                    <button
                      data-testid={`delete-case-${c.id}`}
                      onClick={() => setConfirmDeleteId(c.id)}
                      className="btn btn-ghost btn-sm btn-square"
                      aria-label="حذف القضية"
                    >
                      <Trash2 className="w-4 h-4 text-base-content/60" />
                    </button>
                  </div>
                </div>

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
                    onClick={() =>
                      void patchCase(c.id, { reply_memo_done: !c.reply_memo_done })
                    }
                    className={`flex items-center gap-2 text-right ${
                      c.reply_memo_done ? "text-success" : "text-gray-500"
                    } hover:opacity-80`}
                    title="اضغط للتبديل"
                  >
                    {c.reply_memo_done ? (
                      <FileCheck2 className="w-4 h-4" />
                    ) : (
                      <FileX2 className="w-4 h-4" />
                    )}
                    اللائحة الجوابية: {c.reply_memo_done ? "جاهزة" : "غير جاهزة"}
                  </button>
                </div>

                {c.notes && (
                  <p className="mt-3 text-sm text-gray-500 whitespace-pre-wrap border-t border-black/5 pt-3">
                    {c.notes}
                  </p>
                )}

                <div className="mt-4 flex items-center gap-2">
                  <span className="text-xs text-gray-400">تحديث الحالة:</span>
                  <select
                    data-testid={`status-select-${c.id}`}
                    className="select select-bordered select-xs rounded-lg"
                    value={c.status}
                    onChange={(e) =>
                      void patchCase(c.id, { status: e.target.value as CaseStatus }, "تم تحديث الحالة")
                    }
                  >
                    <option value="pending">قيد النظر</option>
                    <option value="won">رابحة</option>
                    <option value="lost">خاسرة</option>
                  </select>
                </div>
              </li>
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
              سيتم حذف القضية نهائياً ولن يتمكن المساعد من الإجابة عنها بعد الآن.
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
