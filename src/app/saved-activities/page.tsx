import { Suspense } from "react";
import Link from "next/link";
import { ScreenHeader } from "@/components/ui/screen";
import { EmptyState } from "@/components/ui/screen-states";
import { RealActivityTile } from "@/components/activities/real-activity-tile";
import { getSavedActivities } from "@/lib/activities/bookmarks-server";
import { savedActivitiesUrl } from "@/lib/activities/bookmarks";
import { parseDiscoveryFilters } from "@/lib/activities/discovery";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export default function SavedActivitiesPage({ searchParams }: { searchParams: SearchParams }) {
  return <main id="main-content" tabIndex={-1}><ScreenHeader title="Saved Activities" back="/profile" />
    <Suspense fallback={<p role="status" className="helper-text p-4">Loading saved activities...</p>}><SavedContent searchParams={searchParams} /></Suspense>
  </main>;
}
async function SavedContent({ searchParams }: { searchParams: SearchParams }) {
  const { page } = await searchParams;
  const { filters, invalid } = parseDiscoveryFilters({ page });
  const result = await getSavedActivities(filters.page);
  return <div className="space-y-6 p-4">
    <p className="helper-text">Saved for later. Saving does not join an activity or reserve a spot.</p>
    {invalid && <p role="status" className="helper-text">That page was invalid. Showing page one.</p>}
    {result.items.map(item => <RealActivityTile key={item.id} {...item} relationship="saved" />)}
    {result.items.length === 0 && <EmptyState title={filters.page === 1 ? "No saved activities yet" : "No saved activities on this page"} message="Save activities from their details to find them here later." />}
    <nav aria-label="Saved activity pages" className="flex min-h-11 items-center justify-between gap-4">
      {filters.page > 1 ? <Link className="inline-flex min-h-11 items-center text-primary underline" href={savedActivitiesUrl(filters.page - 1)}>Previous</Link> : <span />}
      <span className="text-sm text-muted-foreground">Page {filters.page}</span>
      {result.hasNext && filters.page < 500 ? <Link className="inline-flex min-h-11 items-center text-primary underline" href={savedActivitiesUrl(filters.page + 1)}>Next</Link> : <span />}
    </nav>
  </div>;
}
