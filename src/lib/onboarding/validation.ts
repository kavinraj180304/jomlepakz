import { z } from "zod";

function field(max: number) {
  return z.string().refine(value => !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value), "Use single-line text without control characters.")
    .transform(value => value.trim()).pipe(z.string().min(1, "This field is required.").max(max, `Use ${max} characters or fewer.`));
}
export const onboardingSchema = z.object({ full_name: field(100), faculty: field(150), programme: field(150) }).strict();
export type OnboardingValues = z.infer<typeof onboardingSchema>;
export type OnboardingState = { message?: string; errors?: Partial<Record<keyof OnboardingValues, string>> };

export function onboardingPrefill(profile: Partial<OnboardingValues> | undefined, metadataName: unknown): OnboardingValues {
  const name = typeof metadataName === "string" ? onboardingSchema.shape.full_name.safeParse(metadataName) : null;
  return { full_name: profile?.full_name ?? (name?.success ? name.data : ""), faculty: profile?.faculty ?? "", programme: profile?.programme ?? "" };
}
