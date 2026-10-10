"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { activitySchedule, type OwnedActivity } from "@/lib/activities/validation";
import { ActivityCard } from "./activity-card";
import { ScreenHeader } from "@/components/ui/screen";
import { cn } from "@/lib/utils";

export function HostedActivities({ activities }: { activities: OwnedActivity[] }) {
  const [tab, setTab] = useState("Upcoming");
  const visible = activities.filter(activity => tab === "Hosting" || (tab === "Upcoming" ? activity.upcoming : tab === "Past" ? !activity.upcoming : false));
  return <main id="main-content"><ScreenHeader title="My Activities" /><div className="space-y-6 p-4">
    <Link href="/activities/create" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-semibold text-white">Create activity</Link>
    <div className="horizontal-scroll flex gap-2 overflow-x-auto" aria-label="My activity filters">{["Upcoming", "Hosting", "Joined", "Past"].map(value => <button type="button" key={value} onClick={() => setTab(value)} aria-pressed={tab === value} className={cn("min-h-11 shrink-0 rounded-full px-4 py-2 text-sm font-semibold", tab === value ? "bg-primary text-white" : "text-muted-foreground")}>{value}</button>)}</div>
    {visible.map(activity => <Link key={activity.id} href={`/activities/${activity.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring"><ActivityCard title={activity.title} schedule={activitySchedule(activity)} location={activity.location} dayLabel={activity.status} attendance={`${activity.occupied} going, including the host`} capacityLabel={activity.status === "scheduled" ? `${Math.max(0, activity.capacity - activity.occupied)} spots left` : undefined} cover={activity.coverPath ? <Image src={activity.coverPath} alt={activity.coverAlt ?? "Activity image"} fill sizes="(max-width: 512px) calc(100vw - 32px), 480px" className="object-cover" /> : undefined} /></Link>)}
    {visible.length === 0 && <p className="helper-text">{tab === "Joined" ? "Joining is not available yet." : "No activities here yet."}</p>}
  </div></main>;
}
