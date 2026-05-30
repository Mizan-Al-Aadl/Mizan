import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { loginSchema, type LoginFormData } from "@/schemas/auth";
import AuthSubmitButton from "./AuthSubmitButton";
import FormField from "./FormField";

interface LoginFormProps {
  onSubmit: (data: LoginFormData) => Promise<void>;
  error?: string | null;
}

export default function LoginForm({ onSubmit, error }: LoginFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });

  return (
    <form
      className="space-y-5"
      onSubmit={handleSubmit(async (data) => {
        await onSubmit(data);
      })}
    >
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <FormField id="email" label="البريد الإلكتروني" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
      </FormField>

      <FormField id="password" label="كلمة المرور" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
      </FormField>

      <AuthSubmitButton
        isSubmitting={isSubmitting}
        label="تسجيل الدخول"
        submittingLabel="جاري تسجيل الدخول..."
      />
    </form>
  );
}
