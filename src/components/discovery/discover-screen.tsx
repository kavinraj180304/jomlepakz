"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bookmark, Search } from "lucide-react";
import { demoActivities, dateFilters, type Category, type DateFilter } from "@/lib/demo/activities";
import { ActivityCard } from "@/components/activities/activity-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CategoryChips } from "./category-chips";
import { DiscoveryFilterControl, type DiscoveryFilters } from "./discovery-filters";
import { cn } from "@/lib/utils";

export function DiscoverScreen() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const [date, setDate] = useState<DateFilter>("Upcoming");
  const [filters, setFilters] = useState<DiscoveryFilters>({ availableOnly: false, onCampusOnly: false });
  const term = query.trim().toLowerCase();
  const activities = demoActivities.filter(activity =>
    (category === "All" || category === activity.category) &&
    (date === "Upcoming" || date === activity.day) &&
    (!filters.onCampusOnly || activity.onCampus) &&
    (!filters.availableOnly || activity.participants.length < activity.capacity) &&
    `${activity.title} ${activity.location} ${activity.category} ${activity.description}`.toLowerCase().includes(term)
  );
  return (
    <main id="main-content" className="space-y-4 px-4 pb-8 pt-4">
      <h1 className="sr-only">Discover activities</h1>
      <div className="flex gap-3">
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-4 top-4 size-5 text-muted-foreground" aria-hidden="true" /><Input aria-label="Search demo activities" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search activities..." className="rounded-full border-transparent bg-secondary pl-12 pr-4" /></div>
        <DiscoveryFilterControl value={filters} onChange={setFilters} />
      </div>
      <div className="horizontal-scroll flex gap-2 overflow-x-auto" aria-label="Activity dates">
        {dateFilters.map(day => <button type="button" key={day} aria-pressed={date === day} onClick={() => setDate(day)} className={cn("h-10 shrink-0 rounded-full px-5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring", date === day ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{day}</button>)}
      </div>
      <CategoryChips value={category} onChange={setCategory} />
      <p className="text-xs text-muted-foreground">Static demo · Illustrative activities and dates</p>
      <p role="status" className="sr-only">{activities.length} demo activities found</p>
      <div className="space-y-8">
        {activities.map((activity, index) => {
          const spots = activity.capacity - activity.participants.length;
          return <Link href={`/activities/${activity.id}`} key={activity.id} aria-label={`View ${activity.title} details`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <ActivityCard title={activity.title} schedule={activity.schedule} location={activity.location} attendance={`${activity.participants.length} going`} participantInitials={activity.participants} dayLabel={activity.dayLabel} capacityLabel={spots > 0 ? `${spots} spots left` : "Full"} cover={<Image src={activity.image} alt={activity.imageAlt} fill sizes="(max-width: 512px) calc(100vw - 32px), 480px" className="object-cover" priority={index === 0} />} action={<span className="flex size-11 items-center justify-center rounded-full bg-background/95 text-secondary-foreground" aria-hidden="true"><Bookmark className="size-5" /></span>} />
          </Link>;
        })}
        {activities.length === 0 && <div className="rounded-xl bg-muted p-6 text-center"><h2 className="section-title">No matching activities</h2><p className="helper-text mt-2">Try another search or reset the demo filters.</p><Button variant="outline" className="mt-4" onClick={() => { setQuery(""); setCategory("All"); setDate("Upcoming"); setFilters({ availableOnly: false, onCampusOnly: false }); }}>Reset search and filters</Button></div>}
      </div>
    </main>
  );
}
