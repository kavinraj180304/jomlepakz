"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { currentIdentity, isEligible } from "@/lib/auth/server";
import { activityInput, cancelActivitySchema, saveActivitySchema } from "@/lib/activities/validation";

export type ActivityResult = { ok: true; id: string } | { ok: false; message: string };
function friendlyError(code?: string) {
  if (code === "40001") return "This activity changed. Reload it before saving again.";
  if (code === "42501") return "You don’t have permission to change this activity.";
  if (["22023", "22007", "22008", "22P02", "23514"].includes(code ?? "")) return "Check your activity details, date, capacity and image selection.";
  if (code === "P0001") return "This activity cannot be changed. Check its start time, status and occupied seats.";
  return "We couldn’t save this change. Check My Activities before retrying.";
}
function refreshActivity(id: string) {
  revalidatePath("/");
  revalidatePath(`/activities/${id}`);
  revalidatePath(`/activities/${id}/edit`);
  revalidatePath("/my-activities");
}
export async function saveActivity(input: unknown): Promise<ActivityResult> {
  const parsed = saveActivitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check your activity details." };
  const identity = await currentIdentity();
  if (!identity || !(await isEligible(identity.client))) return { ok: false, message: "Sign in with an eligible UM account to continue." };
  try {
    const { data, error } = await identity.client.rpc("jomlepakz_save_activity", {
      p_input: activityInput(parsed.data.draft), p_activity_id: parsed.data.activityId ?? null,
      p_revision: parsed.data.revision ?? null, p_request_id: parsed.data.requestId,
    });
    if (error || !z.uuid().safeParse(data).success) return { ok: false, message: friendlyError(error?.code) };
    refreshActivity(data);
    return { ok: true, id: data };
  } catch { return { ok: false, message: friendlyError() }; }
}
export async function cancelActivity(input: unknown): Promise<ActivityResult> {
  const parsed = cancelActivitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Reload the activity before cancelling." };
  const identity = await currentIdentity();
  if (!identity || !(await isEligible(identity.client))) return { ok: false, message: "Sign in with an eligible UM account to continue." };
  try {
    const { data, error } = await identity.client.rpc("jomlepakz_cancel_activity", {
      p_activity_id: parsed.data.activityId, p_revision: parsed.data.revision,
    });
    if (error || !z.uuid().safeParse(data).success) return { ok: false, message: friendlyError(error?.code) };
    refreshActivity(data);
    return { ok: true, id: data };
  } catch { return { ok: false, message: friendlyError() }; }
}
