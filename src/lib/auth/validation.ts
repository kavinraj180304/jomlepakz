import { z } from "zod";

const email = z.string().trim().toLowerCase().max(254, "Enter a valid email address.")
  .pipe(z.email("Enter a valid email address."));

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(128, "Password is too long."),
});

export const signUpSchema = signInSchema.extend({
  name: z.string().trim().min(1, "Enter your full name.").max(100, "Use 100 characters or fewer."),
  password: z.string().min(8, "Use at least 8 characters.").max(72, "Use 72 characters or fewer."),
});

export const confirmationSchema = z.object({
  token_hash: z.string().regex(/^[a-zA-Z0-9_-]{16,512}$/),
  type: z.enum(["email", "signup"]),
});
export const callbackSchema = z.object({ code: z.string().min(1).max(1024) });
export const recoverySchema = confirmationSchema.extend({ type: z.literal("recovery") });
export const resetRequestSchema = z.object({ email });
export const updatePasswordSchema = z.object({
  password: signUpSchema.shape.password,
  confirmPassword: z.string().min(1, "Confirm your new password.").max(72, "Use 72 characters or fewer."),
}).refine(value => value.password === value.confirmPassword, {
  path: ["confirmPassword"], message: "Passwords do not match.",
});

export type AuthState = {
  message?: string;
  errors?: Partial<Record<"name" | "email" | "password" | "confirmPassword", string>>;
};

export function validationErrors(error: z.ZodError): AuthState {
  const errors: NonNullable<AuthState["errors"]> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (field === "name" || field === "email" || field === "password" || field === "confirmPassword") {
      errors[field] ??= issue.message;
    }
  }
  return { errors, message: "Please check the highlighted fields." };
}
