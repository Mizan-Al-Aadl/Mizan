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
      navigate("/app", { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  const getRegisterErrorMessage = (err: unknown) => {
    if (err instanceof Error) {
      const message = err.message;
      if (message.includes("API 409")) return "This email is already registered.";
      if (message.includes("API 400")) return "Invalid data. Please check the form fields.";
      if (message.includes("API 500")) return "Server error occurred. Please try again later.";
      return message.replace(/^API \d+:\s*/, "");
    }
    return "An error occurred while creating your account.";
  };

  const handleSubmit = async (data: RegisterFormData) => {
    setError(null);
    try {
      const email = await register(data.name, data.email, data.password);
      navigate("/verify-email", { state: { email } });
    } catch (err) {
      setError(getRegisterErrorMessage(err));
    }
  };

  if (isLoading) {
    return (
      <div dir="ltr" className="flex min-h-screen items-center justify-center bg-base-100 p-4 font-sans">
        <div className="rounded-lg border border-base-200 bg-base-100 px-6 py-5 text-sm text-base-content shadow-sm">
          Checking authentication...
        </div>
      </div>
    );
  }

  return (
    <div dir="ltr" className="flex min-h-screen items-center justify-center bg-base-100 px-4 py-10 font-sans">
      <div className="w-full max-w-md rounded-3xl border border-base-200 bg-base-100 p-8 shadow-lg">
        <div className="mb-6 space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-base-content">Create an account</h1>
          <p className="text-sm text-base-content/70">Sign up to start your legal chat experience.</p>
        </div>
        <RegisterForm onSubmit={handleSubmit} error={error} />
        <p className="mt-6 text-center text-sm text-base-content/70">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
