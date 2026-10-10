import { z } from "zod";
import { ownedActivitySchema } from "./validation";

export const dateFilters = ["Upcoming", "Today", "Tomorrow", "Weekend"] as const;
export const discoveryFiltersSchema = z.object({
  q: z.string().trim().max(120).default(""), category: z.string().regex(/^$|^[a-z][a-z0-9-]{0,49}$/).default(""),
  date: z.enum(dateFilters).default("Upcoming"), available: z.enum(["0", "1"]).default("0"),
  campus: z.enum(["0", "1"]).default("0"), page: z.coerce.number().int().min(1).max(500).default(1),
});
export type DiscoveryFilters = z.infer<typeof discoveryFiltersSchema>;
export function parseDiscoveryFilters(input: Record<string, string | string[] | undefined>) {
  // Reject malformed/repeated parameters without passing them to the database.
  const parsed = discoveryFiltersSchema.safeParse(input);
  return { filters: parsed.success ? parsed.data : discoveryFiltersSchema.parse({}), invalid: !parsed.success };
}
export function discoveryUrl(filters: DiscoveryFilters) {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.category) query.set("category", filters.category);
  if (filters.date !== "Upcoming") query.set("date", filters.date);
  if (filters.available === "1") query.set("available", "1");
  if (filters.campus === "1") query.set("campus", "1");
  if (filters.page > 1) query.set("page", String(filters.page));
  return query.size ? `/?${query}` : "/";
}
export const discoveredActivitySchema = ownedActivitySchema.omit({ visibility: true, revision: true }).extend({
  startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }),
  occupied: z.number().int().min(1).max(50), capacity: z.number().int().min(2).max(50),
  hostName: z.string().min(1).max(100), isHost: z.boolean(), inProgress: z.boolean(),
  revision: z.string().regex(/^[1-9]\d{0,18}$/).nullable(),
}).strict().refine(a => a.isHost === (a.revision !== null) && (!a.canEdit || a.isHost));
export const discoveryPageSchema = z.object({ items: z.array(discoveredActivitySchema).max(20), hasNext: z.boolean() }).strict();
export type DiscoveredActivity = z.infer<typeof discoveredActivitySchema>;
