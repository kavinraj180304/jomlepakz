"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, requestPasswordReset } from "@/app/auth/actions";
import { GoogleButton } from "./google-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/screen";
import type { AuthState } from "@/lib/auth/validation";

type AuthMode = "sign-in" | "sign-up" | "password-reset";

export function AuthForm({ mode, next = "/profile", notice = "" }: { mode: AuthMode; next?: string; notice?: string }) {
  const [state, action, pending] = useActionState(mode === "sign-up" ? signUp : mode === "password-reset" ? requestPasswordReset : signIn, {} as AuthState);
  const reset = mode === "password-reset";
  const title = mode === "sign-in" ? "Welcome back" : mode === "sign-up" ? "Find your people at UM" : "Reset your password";
  const errors = state.errors ?? {};
  const message = state.message || notice;
  return <main id="main-content" className="flex min-h-dvh flex-col justify-center space-y-6 p-6">
    <Link href="/" className="text-xl font-extrabold tracking-tight">JomLepakz</Link>
    <div><h1 className="page-title">{title}</h1><p className="helper-text mt-2">{reset ?
      "Enter your email and we'll help you get back into your account." : "Meet students through activities you enjoy."}</p></div>
    <form className="space-y-5" action={action}>
      {!reset && <input type="hidden" name="next" value={next} />}
      {mode === "sign-up" && <Field label="Full Name" htmlFor="auth-name">
        <Input id="auth-name" name="name" required maxLength={100} placeholder="Your full name" autoComplete="name"
          aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "auth-name-error" : undefined} />
        {errors.name && <p id="auth-name-error" className="text-sm text-destructive">{errors.name}</p>}
      </Field>}
      <Field label="Student email" htmlFor="auth-email">
        <Input id="auth-email" name="email" type="email" required maxLength={254}
          placeholder="you@siswa.um.edu.my" autoComplete="email"
          aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "auth-email-error" : undefined} />
        {errors.email && <p id="auth-email-error" className="text-sm text-destructive">{errors.email}</p>}
      </Field>
      {!reset && <Field label="Password" htmlFor="auth-password">
        <Input id="auth-password" name="password" type="password" required
          minLength={mode === "sign-up" ? 8 : 1} maxLength={mode === "sign-up" ? 72 : 128}
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"} placeholder="Your password"
          aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "auth-password-error" : undefined} />
        {errors.password && <p id="auth-password-error" className="text-sm text-destructive">{errors.password}</p>}
      </Field>}
      {mode === "sign-in" && <Link href="/password-reset" className="block text-right text-sm text-primary">Forgot password?</Link>}
      {message && <p role="status" className="rounded-lg bg-accent p-3 text-sm">{message}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Please wait…" : mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Sign up" : "Send reset link"}
      </Button>
    </form>
    {!reset && <GoogleButton />}
    <div className="space-y-3 text-center text-sm">{mode === "sign-in" ?
      <p>New to JomLepakz? <Link href="/sign-up" className="font-semibold text-primary">Sign up</Link></p> :
      <Link href="/sign-in" className="text-primary">Back to sign in</Link>}
      <Link href="/" className="block text-muted-foreground underline">Explore the demo</Link>
    </div>
  </main>;
}
