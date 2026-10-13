"use client";
import { RouteFailure } from "@/components/ui/route-failure";
export default function NotificationsError({ retry }: { retry: () => void }) {
  return <RouteFailure title="Notifications are unavailable" message="We could not load your notifications. Please try again in a moment." retry={retry} />;
}
