import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import LoginForm from "@/components/auth/LoginForm";
import { useAuth } from "@/hooks/useAuth";
import type { LoginFormData } from "@/schemas/auth";

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  const getLoginErrorMessage = (err: unknown) => {
    if (err instanceof Error) {
      const message = err.message;
      if (message.includes("API 401")) return "Email or password is incorrect.";
      if (message.includes("API 500")) return "Server error occurred. Please try again later.";
      if (message.includes("API 400")) return "Invalid data. Please check the form fields.";
      return message.replace(/^API \d+:\s*/, "");
    }
    return "An error occurred while logging in.";
  };

  const handleSubmit = async (data: LoginFormData) => {
    setError(null);
    try {
      await login(data.email, data.password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(getLoginErrorMessage(err));
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-5 text-sm text-slate-700 shadow-sm">
          Checking authentication...
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6 space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Log in to Mizan</h1>
          <p className="text-sm text-slate-500">Enter your email and password to continue.</p>
        </div>
        <LoginForm onSubmit={handleSubmit} error={error} />
        <p className="mt-6 text-center text-sm text-slate-600">
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-slate-900 underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
