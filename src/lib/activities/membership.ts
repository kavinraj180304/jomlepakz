import { z } from "zod";
export const membershipInputSchema = z.object({ activityId: z.uuid() }).strict();
export const membershipResultSchema = z.object({ activityId: z.uuid(), status: z.enum(["joined", "pending", "left", "none"]) }).strict();
export const membershipStateSchema = z.object({ activityId: z.uuid(),
  status: z.enum(["none", "joined", "pending", "left", "declined", "removed"]),
  availability: z.enum(["open", "full", "closed", "unavailable", "host"]), requiresApproval: z.boolean(), canJoin: z.boolean(), canLeave: z.boolean(),
}).strict();
export type MembershipState = z.infer<typeof membershipStateSchema>;
