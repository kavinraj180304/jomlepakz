"use client";

import { useActionState } from "react";
import { completeOnboarding } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/screen";
import type { OnboardingState, OnboardingValues } from "@/lib/onboarding/validation";

export function OnboardingForm({ values }: { values: OnboardingValues }) {
  const [state, action, pending] = useActionState(completeOnboarding, {} as OnboardingState);
  return <form action={action} className="space-y-5">
    {([ ["full_name", "Full Name", 100], ["faculty", "Faculty", 150], ["programme", "Programme", 150] ] as const).map(([name, label, max]) =>
      <Field key={name} label={label} htmlFor={name}>
        <Input id={name} name={name} required maxLength={max} defaultValue={values[name]} autoComplete={name === "full_name" ? "name" : "off"}
          aria-invalid={Boolean(state.errors?.[name])} aria-describedby={state.errors?.[name] ? `${name}-error` : undefined} />
        {state.errors?.[name] && <p id={`${name}-error`} className="text-sm text-destructive">{state.errors[name]}</p>}
      </Field>)}
    {state.message && <p role="status" className="rounded-lg bg-accent p-3 text-sm">{state.message}</p>}
    <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? "Please wait…" : "Complete profile"}</Button>
  </form>;
}
