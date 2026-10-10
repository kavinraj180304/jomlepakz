const protectedRoots = ["/activities", "/my-activities", "/saved-activities",
  "/messages", "/notifications", "/profile", "/settings", "/admin"];

export function isProtectedPath(path: string) {
  return path === "/" || protectedRoots.some(root => path === root || path.startsWith(`${root}/`));
}

// Redirects are restricted to known internal destinations. Never trust a form
// field, query string, Host header, or provider error as a redirect destination.
export function safeNextPath(value: unknown, fallback = "/profile") {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/")) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (/^[\/]{2}|[\\\u0000-\u0020\u007f]/.test(decoded)) return fallback;
    const url = new URL(value, "https://internal.invalid");
    if (url.origin !== "https://internal.invalid" ||
      !(url.pathname === "/" || isProtectedPath(url.pathname))) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

export const authNotices: Record<string, string> = {
  confirmed: "Your email is confirmed. You can now sign in.",
  confirmation_failed: "That confirmation link is invalid or has expired. Try signing in, or request help with a new link.",
  signed_out: "You have been signed out of this browser.",
  unavailable: "Sign in is temporarily unavailable. Please try again shortly.",
  auth_failed: "We couldn't complete sign-in. Please try again using an approved UM account.",
  account_denied: "This account cannot access JomLepakz. Use an approved UM account, or contact the team if you need help.",
  reset_failed: "That reset link is invalid or has expired. Request a new link below.",
  password_updated: "Your password has been updated. Sign in with your new password.",
};

export function safeOAuthUrl(value: string, supabaseUrl: string, callback: string) {
  try {
    const expected = new URL(supabaseUrl);
    const url = new URL(value);
    if (url.origin !== expected.origin || url.username || url.password || url.hash ||
      url.pathname !== "/auth/v1/authorize" || url.searchParams.get("provider") !== "google" ||
      url.searchParams.get("redirect_to") !== callback ||
      !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) return null;
    return url.href;
  } catch { return null; }
}

export function friendlyAuthError(code: string | undefined, mode: "sign-in" | "sign-up") {
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") {
    return "Too many attempts. Please wait a little before trying again.";
  }
  if (mode === "sign-in" && code === "email_not_confirmed") {
    return "Check your email for a confirmation link before signing in.";
  }
  if (mode === "sign-in") return "We couldn't sign you in. Check your email and password, then try again.";
  if (code === "weak_password") return "Choose a stronger password and try again.";
  return "We couldn't complete signup. Use an approved UM email address and try again shortly.";
}
