import { z } from "zod";

const passwordSchema = z.string().superRefine((value, ctx) => {
  if (value.length < 8) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Password must be at least 8 characters.",
    });
  }

  if (!/[A-Z]/.test(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Password must contain at least one uppercase letter.",
    });
  }

  if (!/[a-z]/.test(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Password must contain at least one lowercase letter.",
    });
  }

  if (!/[0-9]/.test(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Password must contain at least one number.",
    });
  }

  if (!/[!@#$%^&*()_+\-=[\]{};:'"\\|,.<>/?`~]/.test(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Password must contain at least one special character.",
    });
  }
});

export const registerSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters."),
    email: z.string().email("Invalid email address."),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

export const loginSchema = z.object({
  email: z.string().email("Invalid email address."),
  password: z.string().min(1, "Password is required."),
});

export type RegisterFormData = z.infer<typeof registerSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
