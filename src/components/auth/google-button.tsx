"use client";
import { useActionState } from "react";
import { continueWithGoogle } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import type { AuthState } from "@/lib/auth/validation";

export function GoogleButton() {
  const [state, action, pending] = useActionState(continueWithGoogle, {} as AuthState);
  return <form action={action} className="space-y-3">
    {state.message && <p role="status" className="rounded-lg bg-accent p-3 text-sm">{state.message}</p>}
    <Button type="submit" variant="outline" size="lg" className="w-full" disabled={pending}>
      {pending ? "Connecting…" : "Continue with Google"}
    </Button>
  </form>;
}
