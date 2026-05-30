import { z } from "zod";

const passwordSchema = z.string().superRefine((value, ctx) => {
  if (value.length < 8) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "كلمة المرور يجب أن تكون على الأقل 8 أحرف",
    });
  }

  if (!/[A-Z]/.test(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يجب أن تحتوي كلمة المرور على حرف كبير واحد على الأقل",
    });
  }

  if (!/[a-z]/.test(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يجب أن تحتوي كلمة المرور على حرف صغير واحد على الأقل",
    });
  }

  if (!/[0-9]/.test(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يجب أن تحتوي كلمة المرور على رقم واحد على الأقل",
    });
  }

  if (!/[!@#$%^&*()_+\-=[\]{};:'"\\|,.<>/?`~]/.test(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يجب أن تحتوي كلمة المرور على رمز خاص واحد على الأقل",
    });
  }
});

export const registerSchema = z
  .object({
    name: z.string().min(2, "الاسم يجب أن يكون على الأقل حرفين"),
    email: z.string().email("البريد الإلكتروني غير صالح"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "كلمتا المرور غير متطابقتين",
      });
    }
  });

export const loginSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export type RegisterFormData = z.infer<typeof registerSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
