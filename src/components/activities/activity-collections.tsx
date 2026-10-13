import Link from "next/link";
import { ScreenHeader } from "@/components/ui/screen";
import { EmptyState } from "@/components/ui/screen-states";
import { dashboardSections, dashboardUrl, type DashboardFilters } from "@/lib/activities/dashboard";
import type { DiscoveredActivity } from "@/lib/activities/discovery";
import { cn } from "@/lib/utils";
import { RealActivityTile } from "./real-activity-tile";

const emptyStates = {
  Hosting: ["No activities hosted yet", "Create an activity to bring people together.", "/activities/create", "Create activity"],
  Joined: ["No joined activities yet", "Activities you have joined will appear here.", "/", "Explore activities"],
  Saved: ["No saved activities yet", "Save activities from their details to find them here later.", "/", "Explore activities"],
  Past: ["No past activities yet", "Ended, completed and cancelled activities you hosted or joined appear here.", "/", "Explore activities"],
} as const;
export function ActivityCollections({ items, hasNext, filters, invalid }: {
  items: { id: string; activity: DiscoveredActivity | null; relationship: "host" | "joined" | "saved" }[];
  hasNext: boolean; filters: DashboardFilters; invalid: boolean;
}) {
  const [title, message, href, action] = emptyStates[filters.section];
  return <main id="main-content" tabIndex={-1}><ScreenHeader title="My Activities" /><div className="space-y-6 p-4">
    <Link href="/activities/create" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-semibold text-white">Create activity</Link>
    <nav className="horizontal-scroll flex gap-2 overflow-x-auto" aria-label="My activity sections">{dashboardSections.map(section => <Link key={section} href={dashboardUrl({ section, page: 1 })} scroll={false} aria-current={section === filters.section ? "page" : undefined} className={cn("min-h-11 shrink-0 rounded-full px-4 py-2 text-sm font-semibold", section === filters.section ? "bg-primary text-white" : "text-muted-foreground")}>{section}</Link>)}</nav>
    {invalid && <p role="status" className="helper-text">Those filters were invalid. Showing Hosting page one.</p>}
    <p className="helper-text">{filters.section === "Saved" ? "Saved for later. Saving does not join an activity or reserve a spot." : filters.section === "Past" ? "Ended, completed and cancelled activities." : "Upcoming and in-progress activities."}</p>
    {items.map(item => <RealActivityTile key={item.id} {...item} />)}
    {!items.length && <EmptyState title={filters.page > 1 ? "No activities on this page" : title} message={message} href={href} action={action} />}
    <nav aria-label="My activity pages" className="flex min-h-11 items-center justify-between gap-4">
      {filters.page > 1 ? <Link className="inline-flex min-h-11 items-center text-primary underline" href={dashboardUrl({ ...filters, page: filters.page - 1 })}>Previous</Link> : <span />}
      <span className="text-sm text-muted-foreground">Page {filters.page}</span>
      {hasNext && filters.page < 500 ? <Link className="inline-flex min-h-11 items-center text-primary underline" href={dashboardUrl({ ...filters, page: filters.page + 1 })}>Next</Link> : <span />}
    </nav>
  </div></main>;
}
