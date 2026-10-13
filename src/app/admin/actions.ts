"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { currentIdentity, isEligible } from "@/lib/auth/server";
import { adminActionSchema } from "@/lib/admin/validation";
import { completionResultSchema } from "@/lib/activities/feedback";
export async function moderate(input: unknown): Promise<{ ok: true; auditId: string } | { ok: false; message: string }> {
  const parsed = adminActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the moderation action and provide a short reason." };
  const identity = await currentIdentity();
  if (!identity || !(await isEligible(identity.client))) return { ok: false, message: "Admin access is unavailable." };
  try {
    const authority = await identity.client.rpc("jomlepakz_current_user_is_admin");
    if (authority.error || authority.data !== true) return { ok: false, message: "Admin access is unavailable." };
    const response = parsed.data.action === "complete_activity" ? await identity.client.rpc("jomlepakz_complete_activity", {
      p_activity_id: parsed.data.targetId, p_revision: parsed.data.revision, p_reason: parsed.data.reason,
    }) : await identity.client.rpc("jomlepakz_admin_action", {
      p_action: parsed.data.action, p_target: parsed.data.targetId, p_revision: parsed.data.revision,
      p_reason: parsed.data.reason, p_status: parsed.data.status ?? null,
    });
    const completion = parsed.data.action === "complete_activity" ? completionResultSchema.safeParse(response.data) : null;
    const data = completion ? completion.success && completion.data.activityId === parsed.data.targetId ? completion.data.auditId : null : response.data;
    const error = response.error;
    if (error || !z.uuid().safeParse(data).success) return { ok: false, message: error?.code === "40001"
      ? "This record changed. Reload before moderating." : parsed.data.action === "complete_activity" && error?.code === "22023"
        ? "Completion is available only after the activity end time." : "The action could not be confirmed. Reload before retrying." };
    for (const path of ["/admin", "/", "/my-activities", "/saved-activities", "/notifications"]) revalidatePath(path);
    if (["hide_activity", "cancel_activity", "complete_activity"].includes(parsed.data.action)) revalidatePath(`/activities/${parsed.data.targetId}`);
    return { ok: true, auditId: data };
  } catch { return { ok: false, message: "The action could not be confirmed. Reload before retrying." }; }
}
