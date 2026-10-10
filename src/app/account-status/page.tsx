import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentIdentity, isEligible } from "@/lib/auth/server";
import { SignOutButton } from "@/components/auth/sign-out-button";

async function AccountStatus() {
  const identity = await currentIdentity();
  if (!identity) redirect("/sign-in");
  const eligible = await isEligible(identity.client);
  return <main id="main-content" className="flex min-h-dvh flex-col justify-center space-y-6 p-6">
    <Link href="/" className="text-xl font-extrabold tracking-tight">JomLepakz</Link>
    <h1 className="page-title">{eligible ? "You're signed in" : "Account access pending"}</h1>
    <p className="helper-text">{eligible ? "Your account is eligible for app access." :
      "You're signed in, but protected app access isn't available yet. Your email, profile verification or account access may need review. Confirmation alone does not complete profile onboarding."}</p>
    {eligible && <Link href="/profile" className="font-semibold text-primary">Continue to your profile</Link>}
    <SignOutButton />
    <Link href="/" className="text-sm text-muted-foreground underline">Explore the demo</Link>
  </main>;
}

export default function AccountStatusPage() {
  return <Suspense fallback={<p role="status" className="p-6 helper-text">Checking your account…</p>}><AccountStatus /></Suspense>;
}
