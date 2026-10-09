"use client";
import Link from "next/link";
import { useState } from "react";
import { Send } from "lucide-react";
import type { DemoActivity } from "@/lib/demo/activities";
import type { DemoConversation } from "@/lib/demo/screens";
import { DemoBanner, ScreenHeader } from "@/components/ui/screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ActivityChat({ activity, conversation }: { activity: DemoActivity; conversation: DemoConversation }) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState(false);
  return <main id="main-content" className="min-h-dvh pb-36"><ScreenHeader title={activity.title} back="/messages" /><div className="space-y-5 p-4"><p className="text-xs text-muted-foreground">{activity.participants.length} demo participants <Link href={`/activities/${activity.id}`} className="ml-2 text-primary underline">Activity details</Link></p><DemoBanner>Static conversation. No message will be sent or stored.</DemoBanner><ol className="space-y-6">{conversation.messages.map(message => <li key={message.id} className={cn("flex flex-col items-start", message.own && "items-end")}><p className="mb-1 text-xs text-muted-foreground">{message.sender}</p><p className={cn("max-w-[90%] rounded-3xl px-4 py-3 text-sm", message.own ? "rounded-br-lg bg-primary text-white" : "rounded-tl-lg bg-secondary")}>{message.text}</p><p className="mt-1 text-[11px] text-muted-foreground">{message.time}</p></li>)}</ol></div><div className="fixed inset-x-0 bottom-0 mx-auto max-w-lg border-t border-secondary bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{notice && <p role="status" className="mb-3 text-xs text-secondary-foreground">Message preview only. Nothing was sent.</p>}<form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); setNotice(true); }}><Input aria-label="Demo message" placeholder="Type a demo message..." value={draft} onChange={event => { setDraft(event.target.value); setNotice(false); }} maxLength={500} className="rounded-full border-transparent bg-secondary" /><Button type="submit" size="icon" className="size-12" disabled={!draft.trim()} aria-label="Preview message"><Send /></Button></form></div></main>;
}
