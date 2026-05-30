import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerSchema, type RegisterFormData } from "@/schemas/auth";

interface RegisterFormProps {
  onSubmit: (data: RegisterFormData) => Promise<void>;
  error?: string | null;
}

export default function RegisterForm({ onSubmit, error }: RegisterFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    criteriaMode: "all",
  });

  const passwordValue = watch("password", "");
  const passwordValidationMessages = errors.password
    ? [
        passwordValue.length < 8 ? "كلمة المرور يجب أن تكون على الأقل 8 أحرف" : null,
        !/[A-Z]/.test(passwordValue)
          ? "يجب أن تحتوي كلمة المرور على حرف كبير واحد على الأقل"
          : null,
        !/[a-z]/.test(passwordValue)
          ? "يجب أن تحتوي كلمة المرور على حرف صغير واحد على الأقل"
          : null,
        !/[0-9]/.test(passwordValue)
          ? "يجب أن تحتوي كلمة المرور على رقم واحد على الأقل"
          : null,
        !/[!@#$%^&*()_+\-=[\]{};:'"\\|,.<>/?`~]/.test(passwordValue)
          ? "يجب أن تحتوي كلمة المرور على رمز خاص واحد على الأقل"
          : null,
      ].filter((message): message is string => Boolean(message))
    : [];

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

      <div>
        <Label htmlFor="name">الاسم</Label>
        <Input id="name" type="text" {...register("name")} />
        {errors.name ? (
          <p className="mt-2 text-sm text-red-600">{errors.name.message}</p>
        ) : null}
      </div>

      <div>
        <Label htmlFor="email">البريد الإلكتروني</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        {errors.email ? (
          <p className="mt-2 text-sm text-red-600">{errors.email.message}</p>
        ) : null}
      </div>

      <div>
        <Label htmlFor="password">كلمة المرور</Label>
        <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        {passwordValidationMessages.length > 0 ? (
          <ul className="mt-2 list-disc pl-5 text-sm text-red-600 space-y-1">
            {passwordValidationMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <Label htmlFor="confirmPassword">تأكيد كلمة المرور</Label>
        <Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />
        {errors.confirmPassword ? (
          <p className="mt-2 text-sm text-red-600">{errors.confirmPassword.message}</p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "جاري إنشاء الحساب..." : "إنشاء حساب"}
      </Button>
    </form>
  );
}
