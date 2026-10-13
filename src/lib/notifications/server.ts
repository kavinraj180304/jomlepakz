import "server-only";
import { z } from "zod";
import { requireEligibleUser } from "@/lib/auth/server";
import { notificationsPageSchema } from "./validation";
export async function getNotifications(page: number) {
  z.number().int().min(1).max(500).parse(page);
  const { client } = await requireEligibleUser("/notifications");
  const { data, error } = await client.rpc("jomlepakz_notifications", { p_page: page });
  const parsed = notificationsPageSchema.safeParse(data);
  if (error || !parsed.success) throw new Error("Notifications are unavailable. Please try again later.");
  return parsed.data;
}
