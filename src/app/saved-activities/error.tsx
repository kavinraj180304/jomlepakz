"use client";
import { RouteFailure } from "@/components/ui/route-failure";
export default function SavedActivitiesError({ retry }: { retry: () => void }) {
  return <RouteFailure title="Saved activities are unavailable" message="We could not load your saved list. Please try again in a moment." retry={retry} href="/profile" label="Back to Profile" />;
}
