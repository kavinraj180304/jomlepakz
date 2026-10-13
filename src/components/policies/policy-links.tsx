import Link from "next/link";
import { policyLinks } from "@/lib/policies/content";
import { AnalyticsPreferences } from "@/components/analytics/preferences";

export function PolicyLinks() {
  return <footer className="border-t border-secondary px-4 py-5">
    <nav aria-label="Policies and safety" className="flex flex-wrap justify-center gap-x-4 gap-y-1">
      {policyLinks.map(({ href, label }) => <Link key={href} href={href} className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">{label}</Link>)}
    </nav>
    <p className="mt-2 text-center text-xs text-muted-foreground">Student-run project. Not an official Universiti Malaya service.</p>
    <AnalyticsPreferences />
  </footer>;
}
