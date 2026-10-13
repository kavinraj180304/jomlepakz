"use client";
import { RouteFailure } from "@/components/ui/route-failure";
export default function MyActivitiesError({ retry }: { retry: () => void }) {
  return <RouteFailure title="Your activities are unavailable" message="We could not load your activity list. Please try again in a moment." retry={retry} />;
}
