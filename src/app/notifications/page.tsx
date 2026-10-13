import { Suspense } from "react";
import { NotificationsScreen } from "@/components/notifications/notifications-screen";
import { getNotifications } from "@/lib/notifications/server";
import { parseDiscoveryFilters } from "@/lib/activities/discovery";
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export default function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  return <Suspense fallback={<main id="main-content" tabIndex={-1} className="p-4"><h1 className="page-title">Notifications</h1><p role="status" className="helper-text mt-4">Loading notifications...</p></main>}><NotificationsContent searchParams={searchParams} /></Suspense>;
}
async function NotificationsContent({ searchParams }: { searchParams: SearchParams }) {
  const { page } = await searchParams;
  const { filters, invalid } = parseDiscoveryFilters({ page });
  const result = await getNotifications(filters.page);
  return <NotificationsScreen {...result} page={filters.page} invalid={invalid} />;
}
