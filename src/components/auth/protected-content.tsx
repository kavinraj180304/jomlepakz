import { Suspense, type ReactNode } from "react";
import { requireEligibleUser } from "@/lib/auth/server";

async function VerifiedContent({ children, admin }: { children: ReactNode; admin: boolean }) {
  await requireEligibleUser("/profile", admin);
  return children;
}

export function ProtectedContent({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  return <Suspense fallback={<p role="status" className="p-6 helper-text">Checking access…</p>}>
    <VerifiedContent admin={admin}>{children}</VerifiedContent>
  </Suspense>;
}
