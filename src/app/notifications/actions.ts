"use server";
import { revalidatePath } from "next/cache";
import { currentIdentity, isEligible } from "@/lib/auth/server";
export async function markAllNotificationsRead(): Promise<{ ok: true; changed: number } | { ok: false; message: string }> {
  const identity = await currentIdentity();
  if (!identity || !(await isEligible(identity.client))) return { ok: false, message: "Sign in with an eligible UM account to continue." };
  try {
    const { data, error } = await identity.client.rpc("jomlepakz_mark_all_notifications_read");
    if (error || !Number.isSafeInteger(data) || data < 0) return { ok: false, message: "Read state could not be confirmed. Reload before retrying." };
    revalidatePath("/notifications");
    return { ok: true, changed: data };
  } catch { return { ok: false, message: "Read state could not be confirmed. Reload before retrying." }; }
}
