"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays, Compass, MessageSquare, Plus } from "lucide-react";
import { DemoOnlyButton } from "@/components/ui/demo-only-button";
import { cn } from "@/lib/utils";

export function BottomNavigation() {
  const pathname = usePathname();
  const itemClass = "flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg py-2 text-[10px] font-semibold min-[400px]:text-xs focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-lg grid-cols-5 items-end border-t border-border bg-background/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
      <Link href="/" aria-current={pathname === "/" ? "page" : undefined} className={cn(itemClass, pathname === "/" ? "text-primary" : "text-muted-foreground")}><Compass className="size-6" aria-hidden="true" /><span>Discover</span></Link>
      <DemoOnlyButton label="My Activities" className={cn(itemClass, "text-muted-foreground")}><CalendarDays className="size-6" aria-hidden="true" /><span>My Activities</span></DemoOnlyButton>
      <DemoOnlyButton label="Create" className={cn(itemClass, "-mt-5 text-primary")}><span className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground ring-[6px] ring-background"><Plus className="size-8" aria-hidden="true" /></span><span>Create</span></DemoOnlyButton>
      <DemoOnlyButton label="Notifications" className={cn(itemClass, "text-muted-foreground")}><Bell className="size-6" aria-hidden="true" /><span>Notifications</span></DemoOnlyButton>
      <DemoOnlyButton label="Messages" className={cn(itemClass, "text-muted-foreground")}><MessageSquare className="size-6" aria-hidden="true" /><span>Messages</span></DemoOnlyButton>
    </nav>
  );
}
