"use client";
import { RouteFailure } from "@/components/ui/route-failure";
export default function AdminError({ retry }: { retry: () => void }) {
  return <RouteFailure title="Administration is unavailable" message="We could not load administration data. Please try again in a moment." retry={retry} href="/settings" label="Back to Settings" />;
}
