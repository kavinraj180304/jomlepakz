import { z } from "zod";
const revision = z.string().regex(/^[1-9]\d{0,18}$/).refine(value => value.length < 19 || value <= "9223372036854775807");
export const completeInputSchema = z.object({ activityId: z.uuid(), revision, reason: z.string().trim().max(500).optional() }).strict();
export const completionResultSchema = z.object({ activityId: z.uuid(), revision, auditId: z.uuid().nullable() }).strict();
export const feedbackInputSchema = z.object({ activityId: z.uuid(), body: z.string().max(2000)
  .transform(value => value.replace(/\r\n?/g, "\n").trim())
  .refine(value => Array.from(value).length >= 1 && Array.from(value).length <= 1000)
  .refine(value => !/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(value)) }).strict();
export const feedbackStateSchema = z.object({ state: z.enum(["unavailable", "host", "not_participant", "awaiting_completion", "ready", "submitted"]),
  body: z.string().max(2000).nullable(), canComplete: z.boolean(), revision: revision.nullable(), requiresReason: z.boolean(),
}).strict().refine(value => (value.state === "submitted") === (value.body !== null) && (!value.canComplete || value.revision !== null));
export type FeedbackState = z.infer<typeof feedbackStateSchema>;
