import "server-only";
import { z } from "zod";
import { requireEligibleUser } from "@/lib/auth/server";
import { savedActivitiesSchema } from "./bookmarks";

export async function getActivitySaved(id: string) {
  const activityId = z.uuid().parse(id);
  const { client } = await requireEligibleUser(`/activities/${activityId}`);
  const { data, error } = await client.rpc("jomlepakz_activity_saved", { p_activity_id: activityId });
  if (error || typeof data !== "boolean") throw new Error("Saved status is unavailable. Please try again later.");
  return data;
}
export async function getSavedActivities(page: number) {
  z.number().int().min(1).max(500).parse(page);
  const { client } = await requireEligibleUser("/saved-activities");
  const { data, error } = await client.rpc("jomlepakz_saved_activities", { p_page: page });
  const parsed = savedActivitiesSchema.safeParse(data);
  if (error || !parsed.success) throw new Error("Saved activities are unavailable. Please try again later.");
  return parsed.data;
}
