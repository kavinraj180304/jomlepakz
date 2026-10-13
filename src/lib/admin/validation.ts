import { z } from "zod";
import { discoveryFiltersSchema } from "@/lib/activities/discovery";
export const adminSections = ["Overview", "Reports", "Activities", "Users", "Categories"] as const;
export const adminFiltersSchema = z.object({ section: z.enum(adminSections).default("Overview"), page: discoveryFiltersSchema.shape.page });
export type AdminFilters = z.infer<typeof adminFiltersSchema>;
export function parseAdminFilters(input: Record<string, string | string[] | undefined>) {
  const parsed = adminFiltersSchema.safeParse(input);
  return { filters: parsed.success ? parsed.data : adminFiltersSchema.parse({}), invalid: !parsed.success };
}
export function adminUrl(filters: AdminFilters) {
  const params = new URLSearchParams();
  if (filters.section !== "Overview") params.set("section", filters.section);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params.size ? `/admin?${params}` : "/admin";
}
const revision = z.string().regex(/^[1-9]\d{0,18}$/)
  .refine(value => value.length < 19 || value <= "9223372036854775807");
const common = { id: z.uuid(), revision };
export const adminItemSchema = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("report"), status: z.enum(["pending", "in_review", "resolved", "dismissed"]), reason: z.enum(["harassment", "unsafe_activity", "spam", "inappropriate_content", "other"]), details: z.string().max(2000).nullable(), targetType: z.enum(["user", "activity"]), targetId: z.uuid(), subject: z.string() }).strict(),
  z.object({ ...common, type: z.literal("activity"), title: z.string(), status: z.enum(["scheduled", "cancelled", "completed"]), visibility: z.enum(["visible", "hidden"]) }).strict(),
  z.object({ ...common, type: z.literal("user"), name: z.string(), status: z.enum(["pending_verification", "active", "suspended", "banned", "deleted"]) }).strict(),
  z.object({ ...common, type: z.literal("category"), name: z.string(), slug: z.string(), active: z.boolean() }).strict(),
]);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const adminDashboardSchema = z.object({ items: z.array(adminItemSchema).max(20), hasNext: z.boolean(), counts: z.object({ pending: count, inReview: count, hiddenActivities: count, suspendedUsers: count, bannedUsers: count, activeCategories: count }).strict() }).strict();
export type AdminDashboard = z.infer<typeof adminDashboardSchema>;
export type AdminItem = z.infer<typeof adminItemSchema>;
export const adminActionSchema = z.object({
  action: z.enum(["hide_activity", "cancel_activity", "complete_activity", "suspend_user", "ban_user", "enable_category", "disable_category", "set_report_status"]),
  targetId: z.uuid(), revision,
  reason: z.string().trim().min(1).max(500).refine(value => !/[\u0000-\u001f\u007f-\u009f]/u.test(value)),
  status: z.enum(["in_review", "resolved", "dismissed"]).optional(),
}).strict().refine(value => (value.action === "set_report_status") === (value.status !== undefined));
export type AdminAction = z.infer<typeof adminActionSchema>;
