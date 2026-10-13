import { z } from "zod";
export const notificationKinds = ["join_requested", "participant_joined", "join_approved", "join_declined", "activity_updated", "activity_cancelled"] as const;
export const notificationSchema = z.object({
  id: z.uuid(), kind: z.enum(notificationKinds), summary: z.string().min(1).max(300),
  createdAt: z.iso.datetime({ offset: true }), readAt: z.iso.datetime({ offset: true }).nullable(),
  activityId: z.uuid().nullable(),
}).strict();
export const notificationsPageSchema = z.object({
  items: z.array(notificationSchema).max(20), hasNext: z.boolean(), unreadCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict();
export type Notification = z.infer<typeof notificationSchema>;
export function notificationHref(notification: Pick<Notification, "activityId">) {
  return notification.activityId && z.uuid().safeParse(notification.activityId).success ? `/activities/${notification.activityId}` : null;
}
export function notificationsUrl(page: number) {
  return page > 1 ? `/notifications?page=${page}` : "/notifications";
}
