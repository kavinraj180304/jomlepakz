import { Suspense } from "react";
import { DiscoverScreen } from "@/components/discovery/discover-screen";
import { discoverActivities, getActivityCategories } from "@/lib/activities/server";
import { parseDiscoveryFilters } from "@/lib/activities/discovery";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return <Suspense fallback={<main id="main-content" className="p-6"><h1 className="page-title">Discover activities</h1><p role="status" className="helper-text mt-4">Loading activities...</p></main>}><DiscoveryContent searchParams={searchParams} /></Suspense>;
}
async function DiscoveryContent({ searchParams }: { searchParams: SearchParams }) {
  const { filters, invalid } = parseDiscoveryFilters(await searchParams);
  const [page, categories] = await Promise.all([discoverActivities(filters), getActivityCategories()]);
  return <DiscoverScreen key={JSON.stringify(filters)} activities={page.items} hasNext={page.hasNext} categories={categories} filters={filters} invalid={invalid} />;
}
