"use client";
import { useState } from "react";
import { DemoBanner, ScreenHeader } from "@/components/ui/screen";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/screen-states";
import { Button } from "@/components/ui/button";

export function StatePreview() {
  const [state, setState] = useState("Empty");
  return <main id="main-content"><ScreenHeader title="Screen state previews" back="/settings" /><div className="space-y-6 p-4"><DemoBanner>Visual examples. Loading is an intentional skeleton preview, not a live request.</DemoBanner><div className="flex flex-wrap gap-2">{["Empty","Loading","Error"].map(value => <Button key={value} size="sm" variant={state === value ? "default" : "secondary"} onClick={() => setState(value)}>{value}</Button>)}</div>{state === "Empty" ? <EmptyState title="No activities yet" message="Your next meetup could start with a simple idea." href="/activities/create" action="Create an activity preview" /> : state === "Loading" ? <LoadingState /> : <ErrorState onRetry={() => setState("Empty")} />}</div></main>;
}
