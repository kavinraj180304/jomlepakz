"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import { ActivityCard } from "@/components/activities/activity-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CategoryChips } from "./category-chips";
import { DiscoveryFilterControl } from "./discovery-filters";
import { cn } from "@/lib/utils";
import { changedDiscoveryFilters, dateFilters, discoveryUrl, type DiscoveryFilters, type DiscoveredActivity } from "@/lib/activities/discovery";
import { activitySchedule, type ActivityCategory } from "@/lib/activities/validation";

export function DiscoverScreen({ activities, categories, filters, hasNext, invalid }: {
  activities: DiscoveredActivity[]; categories: ActivityCategory[]; filters: DiscoveryFilters; hasNext: boolean; invalid: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(filters.q);
  const [pending, startTransition] = useTransition();
  const active = !!(filters.q || filters.category || filters.date !== "Upcoming" || filters.available === "1" || filters.campus === "1");
  function apply(changes: Partial<Omit<DiscoveryFilters, "page">>) {
    startTransition(() => router.push(discoveryUrl(changedDiscoveryFilters(filters, changes)), { scroll: false }));
  }
  function clear() {
    setQuery("");
    startTransition(() => router.push("/", { scroll: false }));
  }
  return <main id="main-content" tabIndex={-1} className="space-y-4 px-4 pb-8 pt-4" aria-busy={pending}>
    <h1 className="sr-only">Discover activities</h1>
    <div className="flex gap-3">
      <form onSubmit={e => { e.preventDefault(); apply({ q: query }); }} className="relative min-w-0 flex-1">
        <Input aria-label="Search activities" maxLength={120} value={query} onChange={e => setQuery(e.target.value.replace(/[\u0000-\u001f\u007f-\u009f]/gu, ""))} placeholder="Search activities..." className="rounded-full border-transparent bg-secondary pl-4 pr-14" />
        <button type="submit" disabled={pending} aria-label="Search" className="absolute right-1 top-1 flex size-12 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-ring"><Search className="size-5 text-muted-foreground" /></button>
      </form>
      <DiscoveryFilterControl value={filters} categories={categories} disabled={pending} onApply={apply} />
    </div>
    <div className="horizontal-scroll flex gap-2 overflow-x-auto" aria-label="Activity dates">
      {dateFilters.map(day => <button type="button" key={day} disabled={pending} aria-pressed={filters.date === day} onClick={() => apply({ date: day })} className={cn("h-11 shrink-0 rounded-full px-5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring", filters.date === day ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{day}</button>)}
    </div>
    <CategoryChips categories={categories} value={filters.category} disabled={pending} onChange={category => apply({ category })} />
    {active && <div className="flex flex-wrap items-center justify-between gap-2"><p className="helper-text min-w-0 break-words">{[filters.q && `Search: ${filters.q}`, filters.available === "1" && "Spots available", filters.campus === "1" && "On campus", "Filters applied"].filter(Boolean).join(" / ")}</p><Button variant="outline" disabled={pending} onClick={clear}>Clear search and filters</Button></div>}
    {invalid && <p role="status" className="helper-text">Those filters were invalid. Showing upcoming activities.</p>}
    <p role="status" className="helper-text">{pending ? "Loading activities..." : `${activities.length} activities on page ${filters.page}`}</p>
    <div className="space-y-8">
      {activities.map((activity, index) => {
        const spots = Math.max(0, activity.capacity - activity.occupied);
        return <Link href={`/activities/${activity.id}`} key={activity.id} aria-label={`View ${activity.title} details`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
          <ActivityCard title={activity.title} schedule={activitySchedule(activity)} location={activity.location} attendance={`${activity.occupied} going · ${activity.capacity} total spots`} dayLabel="Scheduled" capacityLabel={spots > 0 ? `${spots} spots left` : "Full"} cover={activity.coverPath ? <Image src={activity.coverPath} alt={activity.coverAlt ?? "Activity image"} fill sizes="(max-width: 512px) calc(100vw - 32px), 480px" className="object-cover" loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} /> : undefined} />
          <p className="helper-text mt-2">{activity.categoryName} · Hosted by {activity.hostName}</p>
        </Link>;
      })}
      {activities.length === 0 && <div className="rounded-xl bg-muted p-6 text-center"><h2 className="section-title">No matching activities</h2><p className="helper-text mt-2">Try another search or check back for new activities.</p><Button variant="outline" disabled={pending} className="mt-4" onClick={clear}>Reset search and filters</Button></div>}
    </div>
    <nav aria-label="Activity pages" className="flex min-h-11 items-center justify-between gap-4">
      {filters.page > 1 ? <Link className="inline-flex min-h-11 items-center text-primary underline" href={discoveryUrl({ ...filters, page: filters.page - 1 })}>Previous</Link> : <span />}
      <span className="text-sm text-muted-foreground">Page {filters.page}</span>
      {hasNext && filters.page < 500 ? <Link className="inline-flex min-h-11 items-center text-primary underline" href={discoveryUrl({ ...filters, page: filters.page + 1 })}>Next</Link> : <span />}
    </nav>
  </main>;
}
