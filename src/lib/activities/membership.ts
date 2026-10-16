import { z } from "zod";
export const membershipInputSchema = z.object({ activityId: z.uuid() }).strict();
export const membershipResultSchema = z.object({ activityId: z.uuid(), status: z.enum(["joined", "pending", "left", "none"]) }).strict();
export const membershipStateSchema = z.object({ activityId: z.uuid(),
  status: z.enum(["none", "joined", "pending", "left", "declined", "removed"]),
  availability: z.enum(["open", "full", "closed", "unavailable", "host"]), requiresApproval: z.boolean(), canJoin: z.boolean(), canLeave: z.boolean(),
}).strict();
export type MembershipState = z.infer<typeof membershipStateSchema>;

export const pendingJoinRequestSchema = z.object({
  applicantId: z.uuid(), requestedAt: z.iso.datetime({ offset: true }), name: z.string().min(1).max(100),
}).strict();
export const pendingJoinRequestsSchema = z.array(pendingJoinRequestSchema);
export type PendingJoinRequest = z.infer<typeof pendingJoinRequestSchema>;
export const joinRequestDecisionSchema = z.object({
  activityId: z.uuid(), applicantId: z.uuid(), requestedAt: z.iso.datetime({ offset: true }),
  revision: z.string().regex(/^[1-9]\d{0,18}$/), decision: z.enum(["approve", "reject"]),
}).strict();
export const joinRequestDecisionResultSchema = z.object({
  activityId: z.uuid(), outcome: z.enum(["joined", "declined", "full", "stale", "closed", "unavailable"]),
}).strict();
