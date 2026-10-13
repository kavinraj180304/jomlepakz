"use server";
import { revalidatePath } from "next/cache";
import { currentIdentity, isEligible } from "@/lib/auth/server";
import { completeInputSchema, completionResultSchema, feedbackInputSchema } from "@/lib/activities/feedback";
type Result = { ok: true } | { ok: false; message: string };
function refresh(id: string) { for (const path of [`/activities/${id}`, "/my-activities", "/saved-activities", "/admin"]) revalidatePath(path); }
export async function completeActivity(input: unknown): Promise<Result> {
  const parsed = completeInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Reload the activity before completing it." };
  const identity = await currentIdentity();
  if (!identity || !(await isEligible(identity.client))) return { ok: false, message: "Sign in with an eligible account to continue." };
  try {
    const { data, error } = await identity.client.rpc("jomlepakz_complete_activity", { p_activity_id: parsed.data.activityId, p_revision: parsed.data.revision, p_reason: parsed.data.reason ?? null });
    const result = completionResultSchema.safeParse(data);
    if (error || !result.success || result.data.activityId !== parsed.data.activityId) return { ok: false, message: error?.code === "22023" ? "Completion opens after the activity end time. Administrators must provide a reason." : "Completion could not be confirmed. Reload before retrying." };
    refresh(parsed.data.activityId); return { ok: true };
  } catch { return { ok: false, message: "Completion could not be confirmed. Reload before retrying." }; }
}
export async function submitActivityFeedback(input: unknown): Promise<Result> {
  const parsed = feedbackInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Write 1–1000 characters of plain-text feedback." };
  const identity = await currentIdentity();
  if (!identity || !(await isEligible(identity.client))) return { ok: false, message: "Sign in with an eligible account to continue." };
  try {
    const { data, error } = await identity.client.rpc("jomlepakz_submit_activity_feedback", { p_activity_id: parsed.data.activityId, p_body: parsed.data.body });
    if (error || data !== true) return { ok: false, message: error?.code === "23505" ? "You have already submitted feedback for this activity." : "Feedback is available to accepted participants after completion. Reload to check your access." };
    refresh(parsed.data.activityId); return { ok: true };
  } catch { return { ok: false, message: "Feedback could not be confirmed. Your draft is preserved; reload before retrying." }; }
}
