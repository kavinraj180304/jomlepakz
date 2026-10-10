import { AuthForm } from "@/components/auth/auth-form";
import { Suspense } from "react";
import { authNotices } from "@/lib/auth/navigation";

async function ResetRequest({ searchParams }: PageProps<"/password-reset">) {
  const params = await searchParams;
  const notice = params.notice === "reset_failed" ? authNotices.reset_failed : "";
  return <AuthForm mode="password-reset" notice={notice} />;
}
export default function PasswordResetPage(props: PageProps<"/password-reset">) {
  return <Suspense fallback={<p className="p-6 helper-text">Loading password reset…</p>}><ResetRequest {...props} /></Suspense>;
}
