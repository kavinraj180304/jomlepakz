import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasApprovedIdentity } from "@/lib/auth/server";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";
import { SignOutButton } from "@/components/auth/sign-out-button";

async function PasswordScreen() {
  const client = await createClient();
  if (!(await hasApprovedIdentity(client))) redirect("/password-reset?notice=reset_failed");
  return <main id="main-content" className="flex min-h-dvh flex-col justify-center space-y-6 p-6">
    <Link href="/" className="text-xl font-extrabold tracking-tight">JomLepakz</Link>
    <div><h1 className="page-title">Choose a new password</h1><p className="helper-text mt-2">Use 8–72 characters. Your account access rules stay the same.</p></div>
    <UpdatePasswordForm /><SignOutButton />
    <Link href="/password-reset" className="text-sm text-primary">Request another reset link</Link>
  </main>;
}

export default function UpdatePasswordPage() {
  return <Suspense fallback={<p role="status" className="p-6 helper-text">Checking your reset session…</p>}><PasswordScreen /></Suspense>;
}
