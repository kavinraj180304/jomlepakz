"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { appOrigin, isEligible, hasApprovedIdentity } from "@/lib/auth/server";
import { friendlyAuthError, safeNextPath, safeOAuthUrl } from "@/lib/auth/navigation";
import { signInSchema, signUpSchema, resetRequestSchema, updatePasswordSchema, validationErrors, type AuthState } from "@/lib/auth/validation";

export async function signUp(_previous: AuthState, form: FormData): Promise<AuthState> {
  const result = signUpSchema.safeParse({ name: form.get("name"), email: form.get("email"), password: form.get("password") });
  if (!result.success) return validationErrors(result.error);
  try {
    const client = await createClient();
    const { data, error } = await client.auth.signUp({
      email: result.data.email, password: result.data.password,
      options: { emailRedirectTo: `${appOrigin()}/auth/callback`, data: { full_name: result.data.name } },
    });
    if (error && error.code !== "user_already_exists") {
      return { message: friendlyAuthError(error.code, "sign-up") };
    }
    // Confirm Email must be enabled. Do not keep an auto-confirmed signup
    // session if the hosted project has accidentally disabled that setting.
    if (data.session) await client.auth.signOut({ scope: "local" });
    return { message: "If signup can be completed, check your email for a confirmation link. If you already have an account, sign in." };
  } catch {
    return { message: "Signup is temporarily unavailable. Please try again shortly." };
  }
}

export async function signIn(_previous: AuthState, form: FormData): Promise<AuthState> {
  const result = signInSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!result.success) return validationErrors(result.error);
  let destination = "/account-status";
  try {
    const client = await createClient();
    const { error } = await client.auth.signInWithPassword(result.data);
    if (error) return { message: friendlyAuthError(error.code, "sign-in") };
    if (await isEligible(client)) destination = safeNextPath(form.get("next"));
  } catch {
    return { message: "Sign in is temporarily unavailable. Please try again shortly." };
  }
  revalidatePath("/", "layout");
  redirect(destination);
}

export async function signOut(): Promise<AuthState> {
  try {
    const client = await createClient();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) return { message: "We couldn't sign you out. Please try again." };
  } catch {
    return { message: "Sign out is temporarily unavailable. Please try again shortly." };
  }
  revalidatePath("/", "layout");
  redirect("/sign-in?notice=signed_out");
}

export async function continueWithGoogle(): Promise<AuthState> {
  let destination: string | null = null;
  try {
    const callback = `${appOrigin()}/auth/callback`;
    const client = await createClient();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google", options: { redirectTo: callback, skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" } },
    });
    if (!error && data.url) destination = safeOAuthUrl(data.url,
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", callback);
  } catch { /* Never return provider errors or credentials. */ }
  if (!destination) return { message: "Google sign-in is unavailable. Please try again or sign in with your password." };
  redirect(destination);
}

export async function requestPasswordReset(_previous: AuthState, form: FormData): Promise<AuthState> {
  const result = resetRequestSchema.safeParse({ email: form.get("email") });
  if (!result.success) return validationErrors(result.error);
  try {
    const client = await createClient();
    const { error } = await client.auth.resetPasswordForEmail(result.data.email, {
      redirectTo: `${appOrigin()}/auth/recovery`,
    });
    if (error?.code === "over_request_rate_limit" || error?.code === "over_email_send_rate_limit") {
      return { message: "Too many attempts. Please wait a little before trying again." };
    }
  } catch { /* Keep valid-address responses neutral, including delivery errors. */ }
  return { message: "If an account can receive a reset email, a link will arrive shortly. Check your inbox and spam folder." };
}

export async function updatePassword(_previous: AuthState, form: FormData): Promise<AuthState> {
  const result = updatePasswordSchema.safeParse({ password: form.get("password"), confirmPassword: form.get("confirmPassword") });
  if (!result.success) return validationErrors(result.error);
  try {
    const client = await createClient();
    if (!(await hasApprovedIdentity(client))) {
      return { message: "Your reset session is unavailable or this account is not approved. Request a new link or contact the team." };
    }
    const { error } = await client.auth.updateUser({ password: result.data.password });
    if (error) return { message: error.code === "weak_password" || error.code === "same_password"
      ? "Choose a stronger password that differs from your previous password."
      : "We couldn't update your password. Request a fresh reset link and try again." };
    // Do not claim sign-out on failure; let the user explicitly retry it.
    const signedOut = await client.auth.signOut({ scope: "local" });
    if (signedOut.error) return { message: "Your password was updated. Please use Sign out below, then sign in with your new password." };
  } catch {
    return { message: "We couldn't finish updating your password. Please try again shortly." };
  }
  revalidatePath("/", "layout");
  redirect("/sign-in?notice=password_updated");
}
