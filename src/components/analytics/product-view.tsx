"use client";
import { useEffect, useRef } from "react";
import { recordProductView } from "@/app/analytics/actions";
import { analyticsConfig } from "@/lib/analytics/config";

export function ProductView({ event }: { event: "discover_viewed" | "activity_viewed" }) {
  const sent = useRef(false);
  useEffect(() => {
    if (!analyticsConfig() || sent.current) return;
    sent.current = true;
    void recordProductView(event).catch(() => {});
  }, [event]);
  return null;
}
