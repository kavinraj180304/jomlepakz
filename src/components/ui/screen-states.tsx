"use client";
import Link from "next/link";
import { CircleAlert, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({ title = "Nothing here yet", message = "Try Discover to find an activity you like.", href = "/", action = "Explore activities" }: { title?: string; message?: string; href?: string; action?: string }) {
  return <div className="rounded-xl bg-muted p-8 text-center"><Inbox className="mx-auto size-10 text-muted-foreground" aria-hidden="true" /><h2 className="section-title mt-4">{title}</h2><p className="helper-text mt-2">{message}</p><Link href={href} className="mt-5 inline-block rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white">{action}</Link></div>;
}
export function LoadingState() {
  return <div role="status" className="space-y-4 p-4"><span className="sr-only">Loading activities</span><div className="h-6 w-40 animate-pulse rounded bg-secondary motion-reduce:animate-none" /><div aria-hidden="true" className="space-y-4"><div className="aspect-[8/5] animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" /><div className="h-5 w-3/4 rounded bg-secondary" /><div className="h-4 w-1/2 rounded bg-secondary" /></div></div>;
}
export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return <div role="alert" className="rounded-xl border border-border p-8 text-center"><CircleAlert className="mx-auto size-10 text-muted-foreground" aria-hidden="true" /><h2 className="section-title mt-4">Something went wrong</h2><p className="helper-text mt-2">We could not show this screen. Try again, or head back to Discover.</p>{onRetry && <Button className="mt-5" onClick={onRetry}>Try again</Button>}<Link href="/" className="mt-4 block text-sm text-primary underline">Back to Discover</Link></div>;
}
