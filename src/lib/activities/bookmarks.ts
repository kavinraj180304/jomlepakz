import { z } from "zod";
import { discoveredActivitySchema } from "./discovery";

export const bookmarkInputSchema = z.object({ activityId: z.uuid(), saved: z.boolean() }).strict();
export const savedActivitiesSchema = z.object({
  items: z.array(z.object({ id: z.uuid(), activity: discoveredActivitySchema.nullable() }).strict()
    .refine(item => item.activity === null || item.activity.id === item.id)).max(20),
  hasNext: z.boolean(),
}).strict();
export function savedActivitiesUrl(page: number) {
  return page > 1 ? `/saved-activities?page=${page}` : "/saved-activities";
}
