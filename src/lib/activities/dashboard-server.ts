import "server-only";
import { requireEligibleUser } from "@/lib/auth/server";
import { getSavedActivities } from "./bookmarks-server";
import { dashboardFiltersSchema, dashboardPageSchema, type DashboardFilters } from "./dashboard";

export async function getActivityDashboard(filters: DashboardFilters) {
  const input = dashboardFiltersSchema.parse(filters);
  if (input.section === "Saved") {
    const saved = await getSavedActivities(input.page);
    return { items: saved.items.map(item => ({ ...item, relationship: "saved" as const })), hasNext: saved.hasNext };
  }
  const { client } = await requireEligibleUser("/my-activities");
  const { data, error } = await client.rpc("jomlepakz_activity_dashboard", { p_section: input.section, p_page: input.page });
  const parsed = dashboardPageSchema.safeParse(data);
  if (error || !parsed.success) throw new Error("Your activities are unavailable. Please try again later.");
  return parsed.data;
}
