"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function DiscoveryError({ reset }: { reset: () => void }) {
  return <main id="main-content" className="space-y-4 p-6"><h1 className="page-title">Activities are unavailable</h1><p className="helper-text">We couldn&apos;t load activities. Please try again in a moment.</p><Button onClick={reset}>Try again</Button><Link href="/" className="block text-primary underline">Reset search and filters</Link></main>;
}
