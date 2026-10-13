export const ANALYTICS_COOKIE = "jomlepakz_analytics";
export const productEvents = ["discover_viewed", "activity_viewed", "activity_created", "join_completed"] as const;
export type ProductEvent = (typeof productEvents)[number];

export function analyticsConfig() {
  if (process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "true") return null;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "";
  // Only public project tokens and explicit Cloud ingestion origins; no redirects.
  if (!/^phc_[A-Za-z0-9_-]{8,200}$/.test(key) || !["https://us.i.posthog.com", "https://eu.i.posthog.com"].includes(host)) return null;
  return { key, host };
}
