import { z } from "zod";
import { discoveredActivitySchema, discoveryFiltersSchema, type DiscoveredActivity } from "./discovery";

export const dashboardSections = ["Hosting", "Joined", "Saved", "Past"] as const;
export const dashboardFiltersSchema = z.object({
  section: z.enum(dashboardSections).default("Hosting"), page: discoveryFiltersSchema.shape.page,
});
export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;
export function parseDashboardFilters(input: Record<string, string | string[] | undefined>) {
  const parsed = dashboardFiltersSchema.safeParse(input);
  return { filters: parsed.success ? parsed.data : dashboardFiltersSchema.parse({}), invalid: !parsed.success };
}
export function dashboardUrl(filters: DashboardFilters) {
  const params = new URLSearchParams();
  if (filters.section !== "Hosting") params.set("section", filters.section);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params.size ? `/my-activities?${params}` : "/my-activities";
}
export const dashboardItemSchema = z.object({
  id: z.uuid(), relationship: z.enum(["host", "joined"]), activity: discoveredActivitySchema,
}).strict().refine(item => item.id === item.activity.id && (item.relationship === "host") === item.activity.isHost);
export const dashboardPageSchema = z.object({ items: z.array(dashboardItemSchema).max(20), hasNext: z.boolean() }).strict();
export type DashboardItem = z.infer<typeof dashboardItemSchema>;
export function activityStatusLabel(activity: Pick<DiscoveredActivity, "status" | "upcoming" | "inProgress">) {
  if (activity.status === "cancelled") return "Cancelled";
  if (activity.status === "completed") return "Completed";
  if (activity.inProgress) return "In progress";
  return activity.upcoming ? "Upcoming" : "Ended";
}
