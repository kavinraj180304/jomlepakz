"use client";
import { RouteFailure } from "@/components/ui/route-failure";
export default function ActivityError({ retry }: { retry: () => void }) {
  return <RouteFailure title="Activity details are unavailable" message="We could not load this activity. Please try again in a moment." retry={retry} href="/my-activities" label="My Activities" />;
}
