"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Pencil, Check, X, CalendarX } from "lucide-react";
import { ScreenHeader } from "@/components/ui/screen";
import { EmptyState } from "@/components/ui/screen-states";
import { cn } from "@/lib/utils";
import { markAllNotificationsRead } from "@/app/notifications/actions";
import { notificationHref, notificationsUrl, type Notification } from "@/lib/notifications/validation";

const icons = { join_requested: UserPlus, participant_joined: UserPlus, join_approved: Check, join_declined: X, activity_updated: Pencil, activity_cancelled: CalendarX };
const timeFormat = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });
export function NotificationsScreen({ items, unreadCount, hasNext, page, invalid }: {
  items: Notification[]; unreadCount: number; hasNext: boolean; page: number; invalid: boolean;
}) {
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <main id="main-content" tabIndex={-1}><ScreenHeader title="Notifications" action={<button type="button" className="min-h-11 px-2 text-xs font-semibold text-primary disabled:text-muted-foreground" disabled={pending || unreadCount === 0} onClick={() => startTransition(async () => {
    setNotice("");
    try {
      const result = await markAllNotificationsRead();
      if (!result.ok) { setNotice(result.message); return; }
      setNotice("Notifications marked as read."); router.refresh();
    } catch { setNotice("Read state could not be confirmed. Reload before retrying."); }
  })}>{pending ? "Updating..." : "Mark All Read"}</button>} />
    <div className="space-y-2 p-4"><p role="status" className="helper-text">{unreadCount} unread</p>
      {invalid && <p className="helper-text">That page was invalid. Showing page one.</p>}
      {notice && <p role="status" className="helper-text">{notice}</p>}
    </div>
    <ol>{items.map(notification => {
      const Icon = icons[notification.kind], unread = notification.readAt === null, href = notificationHref(notification);
      const content = <><span className="rounded-full bg-secondary p-3 text-muted-foreground"><Icon className="size-5" aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="break-words text-sm">{notification.summary}</p><time dateTime={notification.createdAt} className="mt-2 block text-xs text-muted-foreground">{timeFormat.format(new Date(notification.createdAt))} MYT</time>{!href && <p className="helper-text mt-1">Activity details unavailable</p>}</div>{unread && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary"><span className="sr-only">Unread</span></span>}</>;
      const className = cn("flex items-start gap-4 border-b border-secondary p-5", unread && "bg-accent/40");
      return <li key={notification.id}>{href ? <Link href={href} className={className}>{content}</Link> : <div className={className}>{content}</div>}</li>;
    })}</ol>
    {!items.length && <div className="p-4"><EmptyState title={page > 1 ? "No notifications on this page" : "No notifications yet"} message="Important updates to your activities will appear here." /></div>}
    <nav aria-label="Notification pages" className="flex min-h-11 items-center justify-between gap-4 p-4">
      {page > 1 ? <Link className="inline-flex min-h-11 items-center text-primary underline" href={notificationsUrl(page - 1)}>Previous</Link> : <span />}
      <span className="text-sm text-muted-foreground">Page {page}</span>
      {hasNext && page < 500 ? <Link className="inline-flex min-h-11 items-center text-primary underline" href={notificationsUrl(page + 1)}>Next</Link> : <span />}
    </nav>
  </main>;
}
