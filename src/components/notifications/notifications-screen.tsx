"use client";
import Link from "next/link";
import { useState } from "react";
import { UserPlus, Clock, Pencil, MessageSquare, Users } from "lucide-react";
import { demoNotifications } from "@/lib/demo/screens";
import { DemoBanner, ScreenHeader } from "@/components/ui/screen";
import { cn } from "@/lib/utils";

const icons = { join: UserPlus, reminder: Clock, update: Pencil, message: MessageSquare, full: Users };
export function NotificationsScreen() {
  const [allRead, setAllRead] = useState(false);
  return <main id="main-content"><ScreenHeader title="Notifications" action={<button type="button" className="min-h-11 px-2 text-xs font-semibold text-primary disabled:text-muted-foreground" disabled={allRead} onClick={() => setAllRead(true)}>Mark All Read</button>} /><div className="p-4"><DemoBanner>Newest first. Read indicators change in this demo tab only and reset on reload.</DemoBanner></div>{allRead && <p role="status" className="px-4 pb-3 text-xs text-muted-foreground">Read-state preview only; no notification changes were saved.</p>}<ol>{[...demoNotifications].sort((a,b) => a.minutesAgo - b.minutesAgo).map(notification => { const Icon = icons[notification.kind]; const unread = notification.unread && !allRead; return <li key={notification.id}><Link href={notification.kind === "message" ? `/messages/${notification.activityId}` : `/activities/${notification.activityId}`} className={cn("flex items-start gap-4 border-b border-secondary p-5", unread && "bg-accent/40")}><span className="rounded-full bg-secondary p-3 text-muted-foreground"><Icon className="size-5" aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="text-sm">{notification.text}</p><p className="mt-2 text-xs text-muted-foreground">{notification.time}</p></div>{unread && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary"><span className="sr-only">Unread</span></span>}</Link></li>; })}</ol></main>;
}
