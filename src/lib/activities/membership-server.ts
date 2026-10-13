import "server-only";
import { requireEligibleUser } from "@/lib/auth/server";
import { membershipInputSchema, membershipStateSchema } from "./membership";
export async function getActivityMembership(id: string) {
  const { activityId } = membershipInputSchema.parse({ activityId: id });
  const { client } = await requireEligibleUser(`/activities/${activityId}`);
  const { data, error } = await client.rpc("jomlepakz_activity_membership", { p_activity_id: activityId });
  const parsed = membershipStateSchema.safeParse(data);
  if (error || !parsed.success || parsed.data.activityId !== activityId) throw new Error("Participation status is unavailable. Please try again later.");
  return parsed.data;
}
