"use client";
import { useState } from "react";
import { demoActivities } from "@/lib/demo/activities";
import { hostingActivityIds, joinedActivityIds, savedActivityIds } from "@/lib/demo/screens";
import { DemoActivityTile } from "./demo-activity-tile";
import { ScreenHeader, DemoBanner } from "@/components/ui/screen";
import { EmptyState } from "@/components/ui/screen-states";
import { cn } from "@/lib/utils";

export function ActivityCollections({ saved = false }: { saved?: boolean }) {
  const [tab, setTab] = useState("Upcoming");
  const activities = demoActivities.filter(activity => saved ? savedActivityIds.includes(activity.id) : tab === "Hosting" ? hostingActivityIds.includes(activity.id) : tab === "Joined" ? joinedActivityIds.includes(activity.id) : tab === "Past" ? false : [...hostingActivityIds, ...joinedActivityIds].includes(activity.id));
  return <main id="main-content"><ScreenHeader title={saved ? "Saved Activities" : "My Activities"} back={saved ? "/profile" : undefined} /><div className="space-y-6 p-4"><DemoBanner>Fictional {saved ? "saved activities" : "hosting and participation"}. These do not represent your account.</DemoBanner>{!saved && <div className="horizontal-scroll flex gap-2 overflow-x-auto" aria-label="My activity filters">{["Upcoming", "Hosting", "Joined", "Past"].map(value => <button type="button" key={value} onClick={() => setTab(value)} aria-pressed={tab === value} className={cn("min-h-11 shrink-0 rounded-full px-4 py-2 text-sm font-semibold", tab === value ? "bg-primary text-white" : "text-muted-foreground")}>{value}</button>)}</div>}{activities.map(activity => <DemoActivityTile key={activity.id} activity={activity} saved={saved} hosting={!saved && hostingActivityIds.includes(activity.id)} />)}{!activities.length && <EmptyState title="No past activities" message="This demo has no completed activities yet." />}</div></main>;
}
