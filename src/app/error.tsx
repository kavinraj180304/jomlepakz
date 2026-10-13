"use client";
import { RouteFailure } from "@/components/ui/route-failure";
export default function ScreenError({ retry }: { retry: () => void }) {
  return <RouteFailure title="This screen is unavailable" message="We could not load this screen. Please try again in a moment." retry={retry} />;
}
