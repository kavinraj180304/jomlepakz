import { z } from "zod";
import { CUSTOM_LOCATION_ID, resolveActivityLocation } from "@/lib/config/um-locations";

export const activityCovers = [
  { key: "none", name: "No image", path: null, alt: null },
  { key: "sports", name: "Sports", path: "/demo/sports.jpg", alt: "Sports equipment" },
  { key: "food", name: "Food", path: "/demo/food.jpg", alt: "Food for a shared meal" },
  { key: "study", name: "Study", path: "/demo/study.jpg", alt: "Books and study materials" },
] as const;
export const durationOptions = [30, 60, 90, 120, 180, 240];
const text = (maximum: number) => z.string().max(maximum * 2).trim()
  .refine(value => Array.from(value).length >= 1 && Array.from(value).length <= maximum,
    `Use 1–${maximum} characters.`);

export const activityDraftSchema = z.object({
  title: text(100),
  description: text(1000),
  categorySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(50),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.coerce.number().int().min(30).max(240),
  capacity: z.coerce.number().int().min(2).max(50),
  locationChoice: z.string().max(50),
  customLocation: z.string().max(300),
  joinMode: z.enum(["instant", "approval"]),
  coverKey: z.enum(["none", "sports", "food", "study"]),
}).strict().superRefine((value, context) => {
  const startsAt = new Date(`${value.date}T${value.time}:00+08:00`);
  // Reject calendar normalization (e.g. February 31) and invalid clock values.
  const local = new Date(startsAt.getTime() + 8 * 60 * 60 * 1000);
  if (!Number.isFinite(startsAt.getTime()) || local.toISOString().slice(0, 16) !== `${value.date}T${value.time}`) {
    context.addIssue({ code: "custom", path: ["date"], message: "Choose a valid date and time." });
  } else if (startsAt.getTime() <= Date.now() || startsAt.getTime() > Date.now() + 365 * 86400000) {
    context.addIssue({ code: "custom", path: ["date"], message: "Choose a future time within the next year." });
  }
  try { resolveActivityLocation(value.locationChoice, value.customLocation); }
  catch { context.addIssue({ code: "custom", path: ["locationChoice"], message: "Choose a UM location or a valid custom meeting point." }); }
});
export const saveActivitySchema = z.object({
  draft: activityDraftSchema,
  activityId: z.uuid().optional(),
  revision: z.string().regex(/^[1-9]\d{0,18}$/).optional(),
  requestId: z.uuid(),
}).strict().refine(value => value.activityId ? value.revision !== undefined : value.revision === undefined,
  "Reload the activity before saving.");
export const cancelActivitySchema = z.object({ activityId: z.uuid(), revision: z.string().regex(/^[1-9]\d{0,18}$/) }).strict();

export function activityInput(draft: z.output<typeof activityDraftSchema>) {
  return {
    title: draft.title, description: draft.description, category_slug: draft.categorySlug,
    starts_at: new Date(`${draft.date}T${draft.time}:00+08:00`).toISOString(),
    duration_minutes: draft.durationMinutes, capacity: draft.capacity,
    location_choice: draft.locationChoice,
    custom_location: draft.locationChoice === CUSTOM_LOCATION_ID ? resolveActivityLocation(draft.locationChoice, draft.customLocation) : "",
    join_mode: draft.joinMode, cover_key: draft.coverKey,
  };
}

export const categorySchema = z.object({ slug: z.string(), name: z.string() }).strict();
export const ownedActivitySchema = z.object({
  id: z.uuid(), title: z.string(), description: z.string(), categorySlug: z.string(), categoryName: z.string(),
  location: z.string(), startsAt: z.string(), endsAt: z.string(), capacity: z.number().int(),
  joinMode: z.enum(["instant", "approval"]), status: z.enum(["scheduled", "cancelled", "completed"]),
  visibility: z.enum(["visible", "hidden"]), coverPath: z.enum(["/demo/sports.jpg", "/demo/food.jpg", "/demo/study.jpg"]).nullable(),
  coverAlt: z.string().nullable(), revision: z.string(), occupied: z.number().int(),
  canEdit: z.boolean(), upcoming: z.boolean(),
}).strict();
export type OwnedActivity = z.infer<typeof ownedActivitySchema>;
export type ActivityCategory = z.infer<typeof categorySchema>;
export type ActivityDraft = z.input<typeof activityDraftSchema>;

export function activityLocalDateTime(timestamp: string) {
  const local = new Date(new Date(timestamp).getTime() + 8 * 60 * 60 * 1000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}
export function activitySchedule(activity: Pick<OwnedActivity, "startsAt" | "endsAt">) {
  const format = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });
  return `${format.format(new Date(activity.startsAt))} · ${Math.round((new Date(activity.endsAt).getTime() - new Date(activity.startsAt).getTime()) / 60000)} min · MYT`;
}
