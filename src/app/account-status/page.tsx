import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authenticatedAccess } from "@/lib/auth/access";
import { SignOutButton } from "@/components/auth/sign-out-button";

async function AccountStatus() {
  let access;
  try { access = (await authenticatedAccess(await createClient())).access; }
  catch { access = { state: "unavailable" } as const; }
  if (access.state === "signed_out") redirect("/sign-in");
  if (access.state === "eligible") redirect("/");
  if (access.state === "needs_onboarding") redirect("/onboarding");
  const unavailable = access.state === "unavailable";
  return <main id="main-content" tabIndex={-1} className="flex min-h-dvh flex-col justify-center space-y-6 p-6">
    <Link href="/" className="text-xl font-extrabold tracking-tight">JomLepakz</Link>
    <h1 className="page-title">{unavailable ? "Account access unavailable" : "Account access restricted"}</h1>
    <p role={unavailable ? "alert" : undefined} className="helper-text">{unavailable ?
      "We could not check your account access. Please try again shortly." :
      "Your email confirmation, approved email domain or account status does not currently permit app access. Contact the team if you need help."}</p>
    {unavailable && <a href="/account-status" className="inline-flex min-h-11 items-center font-semibold text-primary">Try again</a>}
    <SignOutButton />
    <Link href="/sign-in" className="text-sm text-muted-foreground underline">Back to sign in</Link>
  </main>;
}

export default function AccountStatusPage() {
  return <Suspense fallback={<p role="status" className="p-6 helper-text">Checking your account…</p>}><AccountStatus /></Suspense>;
}
