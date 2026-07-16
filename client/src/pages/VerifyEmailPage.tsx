import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { apiResendCode } from "@/lib/api";

const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailPage() {
  const { verifyEmail, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email ?? "";

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/app", { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  // No email in navigation state means the user landed here directly — send them back.
  useEffect(() => {
    if (!email) {
      navigate("/register", { replace: true });
    }
  }, [email, navigate]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const getErrorMessage = (err: unknown) => {
    if (err instanceof Error) {
      const message = err.message;
      if (message.includes("Invalid verification code")) return "Incorrect code. Please try again.";
      if (message.includes("expired")) return "This code has expired. Request a new one below.";
      if (message.includes("Too many")) return "Too many incorrect attempts. Request a new code below.";
      if (message.includes("API 429")) return "Please wait a moment before requesting another code.";
      if (message.includes("API 404")) return "Account not found. Please register again.";
      return message.replace(/^API \d+:\s*/, "");
    }
    return "Verification failed. Please try again.";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setError(null);
    setInfo(null);
    setIsSubmitting(true);
    try {
      await verifyEmail(email, trimmed);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setInfo(null);
    setIsResending(true);
    try {
      await apiResendCode(email);
      setInfo("A new code has been sent to your email.");
      setCode("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      inputRef.current?.focus();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsResending(false);
    }
  };

  if (isLoading || !email) {
    return (
      <div dir="ltr" className="flex min-h-screen items-center justify-center bg-base-100 p-4 font-sans">
        <div className="rounded-lg border border-base-200 bg-base-100 px-6 py-5 text-sm text-base-content shadow-sm">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div dir="ltr" className="flex min-h-screen items-center justify-center bg-base-100 px-4 py-10 font-sans">
      <div className="w-full max-w-md rounded-3xl border border-base-200 bg-base-100 p-8 shadow-lg">
        <div className="mb-6 space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-base-content">Verify your email</h1>
          <p className="text-sm text-base-content/70">
            We sent a 6-digit code to <span className="font-medium text-base-content">{email}</span>.
            Enter it below to activate your account.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {info ? (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {info}
            </div>
          ) : null}

          <Input
            ref={inputRef}
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, ""));
              if (error) setError(null);
            }}
            className="text-center text-2xl tracking-[0.5em] font-mono"
            data-testid="verification-code-input"
          />

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting || code.length !== 6}
            data-testid="verify-btn"
          >
            {isSubmitting ? "Verifying..." : "Verify"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => void handleResend()}
            disabled={isResending || cooldown > 0}
            data-testid="resend-btn"
          >
            {isResending
              ? "Sending..."
              : cooldown > 0
                ? `Resend code (${cooldown}s)`
                : "Resend code"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-base-content/70">
          Wrong email?{" "}
          <Link to="/register" className="font-medium text-primary underline">
            Register again
          </Link>
        </p>
      </div>
    </div>
  );
}
