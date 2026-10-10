"use client";
import { useActionState } from "react";
import { updatePassword } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/screen";
import type { AuthState } from "@/lib/auth/validation";

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, {} as AuthState);
  return <form action={action} className="space-y-5">
    {([['password', 'New password'], ['confirmPassword', 'Confirm new password']] as const).map(([name, label]) =>
      <Field key={name} label={label} htmlFor={name}>
        <Input id={name} name={name} type="password" autoComplete="new-password" required minLength={8} maxLength={72}
          aria-invalid={Boolean(state.errors?.[name])} aria-describedby={state.errors?.[name] ? `${name}-error` : undefined} />
        {state.errors?.[name] && <p id={`${name}-error`} className="text-sm text-destructive">{state.errors[name]}</p>}
      </Field>)}
    {state.message && <p role="status" className="rounded-lg bg-accent p-3 text-sm">{state.message}</p>}
    <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? "Updating…" : "Update password"}</Button>
  </form>;
}
