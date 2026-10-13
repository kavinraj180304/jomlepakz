"use server";
import { cookies } from "next/headers";
import { ANALYTICS_COOKIE, analyticsConfig } from "@/lib/analytics/config";
import { recordProductEvent } from "@/lib/analytics/server";
import { currentIdentity, isEligible } from "@/lib/auth/server";

export async function analyticsPreference() {
  if (!analyticsConfig()) return "disabled";
  return (await cookies()).get(ANALYTICS_COOKIE)?.value === "allow" ? "allow" : "deny";
}
export async function setAnalyticsPreference(choice: unknown) {
  if (choice !== "allow" && choice !== "deny") return false;
  if (!analyticsConfig()) return false;
  (await cookies()).set(ANALYTICS_COOKIE, choice, {
    httpOnly: true, secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") === true,
    sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 180,
  });
  return true;
}
export async function recordProductView(event: unknown) {
  if (!analyticsConfig() || (event !== "discover_viewed" && event !== "activity_viewed")) return;
  try {
    const identity = await currentIdentity();
    if (!identity || !(await isEligible(identity.client))) return;
    await recordProductEvent(event);
  } catch { /* Optional measurement cannot interrupt a page. */ }
}
