import "server-only";
import { requireEligibleUser } from "@/lib/auth/server";
import { adminFiltersSchema, adminDashboardSchema, type AdminFilters } from "./validation";
export async function getAdminDashboard(filters: AdminFilters) {
  const input = adminFiltersSchema.parse(filters);
  const { client } = await requireEligibleUser("/admin", true);
  const { data, error } = await client.rpc("jomlepakz_admin_dashboard", { p_section: input.section, p_page: input.page });
  const parsed = adminDashboardSchema.safeParse(data);
  if (error || !parsed.success) throw new Error("Admin data is unavailable. Please try again later.");
  return parsed.data;
}
