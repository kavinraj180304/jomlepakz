import { Suspense } from "react";
import { ActivityCollections } from "@/components/activities/activity-collections";
import { getActivityDashboard } from "@/lib/activities/dashboard-server";
import { parseDashboardFilters } from "@/lib/activities/dashboard";
import { RouteLoading } from "@/components/ui/route-loading";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export default function MyActivitiesPage({ searchParams }: { searchParams: SearchParams }) {
  return <Suspense fallback={<RouteLoading title="My Activities" />}><MyActivities searchParams={searchParams} /></Suspense>;
}
async function MyActivities({ searchParams }: { searchParams: SearchParams }) {
  const { filters, invalid } = parseDashboardFilters(await searchParams);
  const result = await getActivityDashboard(filters);
  return <ActivityCollections {...result} filters={filters} invalid={invalid} />;
}
