"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { authenticatedAccess, accessDestination } from "@/lib/auth/access";
import { onboardingSchema, type OnboardingState, type OnboardingValues } from "@/lib/onboarding/validation";

export async function completeOnboarding(_previous: OnboardingState, form: FormData): Promise<OnboardingState> {
  // React adds $ACTION_ transport fields; all other unexpected fields are denied.
  if ([...form.keys()].some(key => !["full_name", "faculty", "programme"].includes(key) && !key.startsWith("$ACTION_")) ||
    ["full_name", "faculty", "programme"].some(key => form.getAll(key).length !== 1)) {
    return { message: "Please submit only your name, faculty and programme." };
  }
  const parsed = onboardingSchema.safeParse({ full_name: form.get("full_name"), faculty: form.get("faculty"), programme: form.get("programme") });
  if (!parsed.success) {
    const errors: OnboardingState["errors"] = {};
    for (const issue of parsed.error.issues) errors[issue.path[0] as keyof OnboardingValues] ??= issue.message;
    return { errors, message: "Please check the highlighted fields." };
  }
  let destination: string;
  try {
    const client = await createClient();
    const { access } = await authenticatedAccess(client);
    if (access.state === "unavailable") return { message: "Account access is temporarily unavailable. Please try again." };
    if (access.state !== "needs_onboarding") destination = accessDestination(access);
    else {
      const { data, error } = await client.rpc("jomlepakz_complete_onboarding", {
        p_full_name: parsed.data.full_name, p_faculty: parsed.data.faculty, p_programme: parsed.data.programme,
      });
      if (error || data !== true) return { message: "We could not complete onboarding. Please try again or check your account access." };
      const { access: updated } = await authenticatedAccess(client);
      if (updated.state === "unavailable" || updated.state === "needs_onboarding") return { message: "We could not verify completion. Please try again; submitting again is safe." };
      destination = accessDestination(updated);
    }
  } catch { return { message: "Onboarding is temporarily unavailable. Please try again." }; }
  revalidatePath("/", "layout");
  redirect(destination);
}
