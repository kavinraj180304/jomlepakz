"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function ActivityError({ reset }: { reset: () => void }) {
  return <main id="main-content" className="space-y-4 p-6"><h1 className="page-title">Activities are unavailable</h1><p className="helper-text">We couldn’t load these details. Try again in a moment.</p><Button onClick={reset}>Try again</Button><Link href="/my-activities" className="block text-primary underline">My Activities</Link></main>;
}
