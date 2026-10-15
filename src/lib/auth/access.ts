import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const prefill = z.object({
  full_name: z.string().max(100).nullable(),
  faculty: z.string().max(150).nullable(),
  programme: z.string().max(150).nullable(),
}).strict();
export const accountAccessSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("eligible") }).strict(),
  z.object({ state: z.literal("needs_onboarding"), profile: prefill.optional() }).strict(),
  z.object({ state: z.literal("restricted") }).strict(),
]);
export type AccountAccess = z.infer<typeof accountAccessSchema>;
export type AccessResult = AccountAccess | { state: "signed_out" | "unavailable" };

// Technical errors are never converted into a business permission decision.
export async function readAccountAccess(client: SupabaseClient): Promise<AccessResult> {
  try {
    const { data, error } = await client.rpc("jomlepakz_account_access");
    if (error) return { state: "unavailable" };
    const parsed = accountAccessSchema.safeParse(data);
    return parsed.success ? parsed.data : { state: "unavailable" };
  } catch { return { state: "unavailable" }; }
}

export async function authenticatedAccess(client: SupabaseClient) {
  try {
    const { data, error } = await client.auth.getUser();
    if (error) return { access: { state: error.name === "AuthSessionMissingError" ? "signed_out" : "unavailable" } as AccessResult, user: null };
    if (!data.user) return { access: { state: "signed_out" } as AccessResult, user: null };
    return { access: await readAccountAccess(client), user: data.user };
  } catch { return { access: { state: "unavailable" } as AccessResult, user: null }; }
}

export function accessDestination(access: AccessResult, eligiblePath = "/") {
  if (access.state === "eligible") return eligiblePath;
  if (access.state === "needs_onboarding") return "/onboarding";
  if (access.state === "signed_out") return "/sign-in";
  return "/account-status";
}
