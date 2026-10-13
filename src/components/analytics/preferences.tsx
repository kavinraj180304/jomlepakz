"use client";
import { useEffect, useState, useTransition } from "react";
import { analyticsPreference, setAnalyticsPreference } from "@/app/analytics/actions";
import { analyticsConfig } from "@/lib/analytics/config";
import { Button } from "@/components/ui/button";

export function AnalyticsPreferences() {
  const [choice, setChoice] = useState<"allow" | "deny" | "disabled" | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!analyticsConfig()) return;
    let active = true;
    analyticsPreference().then(value => { if (active) setChoice(value); }).catch(() => {});
    return () => { active = false; };
  }, []);
  if (!analyticsConfig() || choice === "disabled" || choice === null) return null;
  return <section className="mt-4 space-y-2 text-sm" aria-label="Optional analytics">
    <p className="helper-text">Optional anonymous event counts with PostHog are {choice === "allow" ? "allowed" : "off"} in this browser. No account identity or content is sent. Do Not Track and Global Privacy Control are respected.</p>
    <Button variant="outline" disabled={pending} onClick={() => startTransition(async () => {
      const next = choice === "allow" ? "deny" : "allow";
      try {
        if (await setAnalyticsPreference(next)) { setChoice(next); setNotice(next === "allow" ? "Analytics allowed for future events." : "Analytics turned off for future events."); }
        else setNotice("Preference could not be saved. Try again.");
      } catch { setNotice("Preference could not be saved. Try again."); }
    })}>{pending ? "Saving..." : choice === "allow" ? "Turn off analytics" : "Allow anonymous analytics"}</Button>
    {notice && <p role="status" className="helper-text">{notice}</p>}
  </section>;
}
