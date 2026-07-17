import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { registerSchema, type RegisterFormData } from "@/schemas/auth";
import AuthSubmitButton from "./AuthSubmitButton";
import FormField from "./FormField";
import PasswordInput from "./PasswordInput";
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
        passwordValue.length < 8 ? "Password must be at least 8 characters." : null,
        !/[A-Z]/.test(passwordValue)
          ? "Password must contain at least one uppercase letter."
          : null,
        !/[a-z]/.test(passwordValue)
          ? "Password must contain at least one lowercase letter."
          : null,
        !/[0-9]/.test(passwordValue)
          ? "Password must contain at least one number."
          : null,
        !/[!@#$%^&*()_+\-=[\]{};:'"\\|,.<>/?`~]/.test(passwordValue)
          ? "Password must contain at least one special character."
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

      <FormField id="name" label="Name" error={errors.name?.message}>
        <Input id="name" type="text" {...register("name")} />
      </FormField>

      <FormField id="email" label="Email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
      </FormField>

      <FormField id="password" label="Password">
        <PasswordInput id="password" autoComplete="new-password" {...register("password")} />
        <PasswordRequirements messages={passwordValidationMessages} />
      </FormField>

      <FormField id="confirmPassword" label="Confirm Password" error={errors.confirmPassword?.message}>
        <PasswordInput id="confirmPassword" autoComplete="new-password" {...register("confirmPassword")} />
      </FormField>

      <AuthSubmitButton
        isSubmitting={isSubmitting}
        label="Create account"
        submittingLabel="Creating account..."
      />
    </form>
  );
}
