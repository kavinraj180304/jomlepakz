"use server";
import { revalidatePath } from "next/cache";
import { currentIdentity, isEligible } from "@/lib/auth/server";
import { bookmarkInputSchema } from "@/lib/activities/bookmarks";

export async function setActivitySaved(input: unknown): Promise<{ ok: true; saved: boolean } | { ok: false; message: string }> {
  const parsed = bookmarkInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Reload the activity before changing its saved state." };
  const identity = await currentIdentity();
  if (!identity || !(await isEligible(identity.client))) return { ok: false, message: "Sign in with an eligible UM account to continue." };
  try {
    const { data, error } = await identity.client.rpc("jomlepakz_set_activity_saved", {
      p_activity_id: parsed.data.activityId, p_saved: parsed.data.saved,
    });
    if (error || data !== parsed.data.saved) return { ok: false, message: error?.code === "P0001"
      ? "This activity is unavailable and cannot be saved."
      : "Your saved change could not be confirmed. Reload before retrying." };
    revalidatePath("/saved-activities");
    revalidatePath("/my-activities");
    revalidatePath(`/activities/${parsed.data.activityId}`);
    return { ok: true, saved: data };
  } catch { return { ok: false, message: "Your saved change could not be confirmed. Reload before retrying." }; }
}
