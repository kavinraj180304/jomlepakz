import "server-only";
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { ANALYTICS_COOKIE, analyticsConfig, productEvents, type ProductEvent } from "./config";

export async function recordProductEvent(event: ProductEvent) {
  // Analytics must never turn a confirmed app operation into a failure.
  try {
    const config = analyticsConfig();
    if (!config || !productEvents.includes(event)) return;
    const [store, requestHeaders] = await Promise.all([cookies(), headers()]);
    if (store.get(ANALYTICS_COOKIE)?.value !== "allow" || requestHeaders.get("dnt") === "1" || requestHeaders.get("sec-gpc") === "1") return;
    after(async () => {
      try {
        await fetch(`${config.host}/i/v0/e/`, {
          method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(2000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: config.key, event, distinct_id: randomUUID(),
            properties: { $process_person_profile: false, $geoip_disable: true, $ip: null } }),
        });
      } catch { /* Best effort; no request data, credentials or provider errors logged. */ }
    });
  } catch { /* Preference/network context failures also fail closed. */ }
}
