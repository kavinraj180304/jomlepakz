import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authenticatedAccess, accessDestination } from "@/lib/auth/access";
import { onboardingPrefill } from "@/lib/onboarding/validation";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { SignOutButton } from "@/components/auth/sign-out-button";

async function Onboarding() {
  const { access, user } = await authenticatedAccess(await createClient());
  if (access.state !== "needs_onboarding") redirect(accessDestination(access));
  const profile = access.profile;
  const values = onboardingPrefill(profile ? {
    full_name: profile.full_name ?? undefined, faculty: profile.faculty ?? undefined, programme: profile.programme ?? undefined,
  } : undefined, user?.user_metadata.full_name);
  return <main id="main-content" tabIndex={-1} className="flex min-h-dvh flex-col justify-center space-y-6 p-6">
    <Link href="/" className="text-xl font-extrabold tracking-tight">JomLepakz</Link>
    <div><h1 className="page-title">Complete your profile</h1><p className="helper-text mt-2">Enter your name, faculty and programme to start using JomLepakz. Faculty and programme are self-declared.</p></div>
    <OnboardingForm values={values} /><SignOutButton />
  </main>;
}
export default function OnboardingPage() {
  return <Suspense fallback={<p role="status" className="p-6 helper-text">Checking your account…</p>}><Onboarding /></Suspense>;
}
