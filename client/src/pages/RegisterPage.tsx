import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import RegisterForm from "@/components/auth/RegisterForm";
import { useAuth } from "@/hooks/useAuth";
import type { RegisterFormData } from "@/schemas/auth";

export default function RegisterPage() {
  const { register, isAuthenticated, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  const getRegisterErrorMessage = (err: unknown) => {
    if (err instanceof Error) {
      const message = err.message;
      if (message.includes("API 409")) return "هذا البريد الإلكتروني مسجل بالفعل.";
      if (message.includes("API 400")) return "البيانات غير صحيحة، يرجى التحقق من الحقول.";
      if (message.includes("API 500")) return "حدث خطأ في الخادم. حاول مرة أخرى لاحقًا.";
      return message.replace(/^API \d+:\s*/, "");
    }
    return "حدث خطأ أثناء إنشاء الحساب.";
  };

  const handleSubmit = async (data: RegisterFormData) => {
    setError(null);
    try {
      await register(data.name, data.email, data.password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(getRegisterErrorMessage(err));
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-5 text-sm text-slate-700 shadow-sm">
          جارٍ التحقق من المصادقة...
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6 space-y-2 text-center">
          <h1 className="text-2xl font-semibold">إنشاء حساب</h1>
          <p className="text-sm text-slate-500">سجّل للبدء في الدردشة القانونية الخاصة بك.</p>
        </div>
        <RegisterForm onSubmit={handleSubmit} error={error} />
        <p className="mt-6 text-center text-sm text-slate-600">
          لديك حساب بالفعل؟{' '}
          <Link to="/login" className="font-medium text-slate-900 underline">
            تسجيل الدخول
          </Link>
        </p>
      </div>
    </div>
  );
}
