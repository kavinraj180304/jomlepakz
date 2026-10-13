import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminDashboard } from "@/lib/admin/server";
import { parseAdminFilters } from "@/lib/admin/validation";
import { RouteLoading } from "@/components/ui/route-loading";
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export default function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  return <Suspense fallback={<RouteLoading title="Administration" />}><AdminContent searchParams={searchParams} /></Suspense>;
}
async function AdminContent({ searchParams }: { searchParams: SearchParams }) {
  const { filters, invalid } = parseAdminFilters(await searchParams);
  const data = await getAdminDashboard(filters);
  return <AdminShell data={data} filters={filters} invalid={invalid} />;
}
