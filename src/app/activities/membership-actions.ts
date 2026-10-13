"use server";
import { revalidatePath } from "next/cache";
import { currentIdentity, isEligible } from "@/lib/auth/server";
import { membershipInputSchema, membershipResultSchema } from "@/lib/activities/membership";
import { recordProductEvent } from "@/lib/analytics/server";
type Result = { ok: true; status: "joined" | "pending" | "left" | "none" } | { ok: false; message: string };
async function change(input: unknown, operation: "join" | "leave"): Promise<Result> {
  const parsed = membershipInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Reload the activity before trying again." };
  const identity = await currentIdentity();
  if (!identity || !(await isEligible(identity.client))) return { ok: false, message: "Sign in with an eligible UM account to continue." };
  try {
    const { data, error } = await identity.client.rpc(`jomlepakz_${operation}_activity`, { p_activity_id: parsed.data.activityId });
    const result = membershipResultSchema.safeParse(data);
    if (error || !result.success || result.data.activityId !== parsed.data.activityId ||
      !(operation === "join" ? ["joined", "pending"] : ["left", "none"]).includes(result.data.status)) {
      return { ok: false, message: error?.code === "42501" ? "You cannot change participation in this activity. Check your account access and activity status."
        : error?.code === "P0001" ? operation === "join" ? "This activity is full or joining has closed. Refresh to check availability." : "Leaving is closed for this activity. Refresh to check its status."
        : "The result could not be confirmed. Refresh the activity before retrying." };
    }
    for (const path of ["/", `/activities/${parsed.data.activityId}`, "/my-activities", "/saved-activities", "/notifications"]) revalidatePath(path);
    if (operation === "join" && result.data.status === "joined") await recordProductEvent("join_completed");
    return { ok: true, status: result.data.status };
  } catch { return { ok: false, message: "The result could not be confirmed. Refresh the activity before retrying." }; }
}
export async function joinActivity(input: unknown) { return change(input, "join"); }
export async function leaveActivity(input: unknown) { return change(input, "leave"); }
