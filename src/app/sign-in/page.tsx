import { AuthForm } from "@/components/auth/auth-form";
import { Suspense } from "react";
import { authNotices, safeNextPath } from "@/lib/auth/navigation";

async function SignIn({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const notice = typeof params.notice === "string" && Object.hasOwn(authNotices, params.notice)
    ? authNotices[params.notice] : "";
  return <AuthForm mode="sign-in" next={safeNextPath(params.next)} notice={notice} />;
}

export default function SignInPage(props: PageProps<"/sign-in">) {
  return <Suspense fallback={<p className="p-6 helper-text">Loading sign in…</p>}><SignIn {...props} /></Suspense>;
}
