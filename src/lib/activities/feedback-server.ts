import "server-only";
import { z } from "zod";
import { requireEligibleUser } from "@/lib/auth/server";
import { feedbackStateSchema } from "./feedback";
export async function getFeedbackState(id: string) {
  z.uuid().parse(id);
  const { client } = await requireEligibleUser(`/activities/${id}`);
  const { data, error } = await client.rpc("jomlepakz_activity_feedback_state", { p_activity_id: id });
  const parsed = feedbackStateSchema.safeParse(data);
  if (error || !parsed.success) throw new Error("Feedback status is unavailable. Please try again later.");
  return parsed.data;
}
