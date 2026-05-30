import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { registerSchema, type RegisterFormData } from "@/schemas/auth";
import AuthSubmitButton from "./AuthSubmitButton";
import FormField from "./FormField";
import PasswordRequirements from "./PasswordRequirements";

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

      <FormField id="name" label="الاسم" error={errors.name?.message}>
        <Input id="name" type="text" {...register("name")} />
      </FormField>

      <FormField id="email" label="البريد الإلكتروني" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
      </FormField>

      <FormField id="password" label="كلمة المرور">
        <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        <PasswordRequirements messages={passwordValidationMessages} />
      </FormField>

      <FormField id="confirmPassword" label="تأكيد كلمة المرور" error={errors.confirmPassword?.message}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />
      </FormField>

      <AuthSubmitButton
        isSubmitting={isSubmitting}
        label="إنشاء حساب"
        submittingLabel="جاري إنشاء الحساب..."
      />
    </form>
  );
}
