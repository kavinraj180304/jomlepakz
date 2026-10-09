"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays, Compass, MessageSquare, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const destinations = [
  { href: "/", label: "Discover", Icon: Compass },
  { href: "/my-activities", label: "My Activities", Icon: CalendarDays },
  { href: "/activities/create", label: "Create", Icon: Plus },
  { href: "/notifications", label: "Notifications", Icon: Bell },
  { href: "/messages", label: "Messages", Icon: MessageSquare },
];
export function BottomNavigation() {
  const path = usePathname();
  return <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-lg grid-cols-5 items-end border-t border-border bg-background/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm">{destinations.map(({href,label,Icon}) => {
    const active = href === "/" ? path === "/" : path.startsWith(href);
    return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg py-2 text-[10px] font-semibold min-[400px]:text-xs focus-visible:outline-2 focus-visible:outline-ring", active ? "text-primary" : "text-muted-foreground", label === "Create" && "-mt-5 text-primary")}>
      {label === "Create" ? <span className="flex size-16 items-center justify-center rounded-full bg-primary text-white ring-[6px] ring-background"><Icon className="size-8" aria-hidden="true" /></span> : <Icon className="size-6" aria-hidden="true" />}<span>{label}</span>
    </Link>;
  })}</nav>;
}
