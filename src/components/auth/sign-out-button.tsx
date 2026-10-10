"use client";
import { useActionState } from "react";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import type { AuthState } from "@/lib/auth/validation";

export function SignOutButton() {
  const [state, action, pending] = useActionState(signOut, {} as AuthState);
  return <form action={action} className="space-y-3">
    {state.message && <p role="status" className="helper-text">{state.message}</p>}
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  </form>;
}
