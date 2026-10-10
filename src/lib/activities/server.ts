import "server-only";
import { z } from "zod";
import { requireEligibleUser } from "@/lib/auth/server";
import { categorySchema, ownedActivitySchema } from "./validation";
import { discoveredActivitySchema, discoveryPageSchema, discoveryFiltersSchema, type DiscoveryFilters } from "./discovery";

export async function discoverActivities(filters: DiscoveryFilters) {
  const input = discoveryFiltersSchema.parse(filters);
  const { client } = await requireEligibleUser("/");
  const { data, error } = await client.rpc("jomlepakz_discover_activities", {
    p_search: input.q, p_category: input.category, p_date: input.date,
    p_available: input.available === "1", p_on_campus: input.campus === "1", p_page: input.page,
  });
  const parsed = discoveryPageSchema.safeParse(data);
  if (error || !parsed.success) throw new Error("Activities are unavailable. Please try again later.");
  return parsed.data;
}
export async function getActivityDetails(id: string) {
  const { client } = await requireEligibleUser("/");
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await client.rpc("jomlepakz_activity_details", { p_id: id });
  if (error) throw new Error("Activity details are unavailable. Please try again later.");
  if (data === null) return null;
  const parsed = discoveredActivitySchema.safeParse(data);
  if (!parsed.success) throw new Error("Activity details are unavailable. Please try again later.");
  return parsed.data;
}

export async function getActivityCategories() {
  const { client } = await requireEligibleUser("/activities/create");
  const { data, error } = await client.rpc("jomlepakz_activity_categories");
  const parsed = z.array(categorySchema).safeParse(data);
  if (error || !parsed.success) throw new Error("Activity categories are unavailable. Please try again later.");
  return parsed.data;
}
export async function getOwnedActivity(id: string) {
  const { client } = await requireEligibleUser("/my-activities");
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await client.rpc("jomlepakz_my_activities", { p_id: id });
  if (error) throw new Error("Activity details are unavailable. Please try again later.");
  if (data === null) return null;
  const parsed = ownedActivitySchema.safeParse(data);
  if (!parsed.success) throw new Error("Activity details are unavailable. Please try again later.");
  return parsed.data;
}
export async function getHostedActivities() {
  const { client } = await requireEligibleUser("/my-activities");
  const { data, error } = await client.rpc("jomlepakz_my_activities", { p_id: null });
  const parsed = z.array(ownedActivitySchema).safeParse(data);
  if (error || !parsed.success) throw new Error("Your activities are unavailable. Please try again later.");
  return parsed.data;
}
