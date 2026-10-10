import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "./navigation";

export function appOrigin() {
  // Configuration, never an incoming Host/X-Forwarded-Host header.
  const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
  if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password ||
    url.pathname !== "/" || url.search || url.hash ||
    (url.protocol === "http:" && !["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Invalid application origin configuration");
  }
  return url.origin;
}

export async function currentIdentity() {
  try {
    const client = await createClient();
    const { data, error } = await client.auth.getClaims();
    if (error || !data?.claims.sub) return null;
    return { client, userId: data.claims.sub };
  } catch {
    return null;
  }
}

export async function isEligible(client: Awaited<ReturnType<typeof createClient>>) {
  try {
    const { data, error } = await client.rpc("jomlepakz_current_user_is_eligible");
    return !error && data === true;
  } catch {
    return false;
  }
}

// getUser performs a live Auth-server check after code/token exchange; a
// signature-valid old JWT or frontend provider metadata alone is insufficient.
export async function hasApprovedIdentity(client: Awaited<ReturnType<typeof createClient>>) {
  try {
    const { data: identity, error: authError } = await client.auth.getUser();
    if (authError || !identity.user || !identity.user.email_confirmed_at) return false;
    const { data, error } = await client.rpc("jomlepakz_current_user_has_approved_identity");
    return !error && data === true;
  } catch {
    return false;
  }
}

// Call at the data/operation boundary too. This does not replace RLS or the
// ownership, membership, blocking and field restrictions of each operation.
export async function requireEligibleUser(next: string = "/profile", admin = false) {
  const identity = await currentIdentity();
  if (!identity) redirect(`/sign-in?next=${encodeURIComponent(safeNextPath(next))}`);
  if (!(await isEligible(identity.client))) redirect("/account-status");
  if (admin) {
    // No privileged client or metadata shortcut. Until narrow read policies
    // are approved, this query fails closed and the demo admin stays blocked.
    let permitted = false;
    try {
      const { data, error } = await identity.client.from("admin_memberships")
        .select("user_id, profiles!admin_memberships_user_id_fkey!inner(auth_user_id)")
        .eq("profiles.auth_user_id", identity.userId).eq("status", "active").limit(1);
      permitted = !error && Boolean(data?.length);
    } catch { /* Fail closed without revealing database errors. */ }
    if (!permitted) redirect("/account-status");
  }
  return identity;
}
