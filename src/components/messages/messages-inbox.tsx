import Link from "next/link";
import Image from "next/image";
import { demoConversations } from "@/lib/demo/screens";
import { demoActivities } from "@/lib/demo/activities";
import { DemoBanner, ScreenHeader } from "@/components/ui/screen";

export function MessagesInbox() {
  return <main id="main-content"><ScreenHeader title="Messages" /><div className="p-4"><DemoBanner>Fictional activity conversations. No direct messages or random compose.</DemoBanner></div><ul>{demoConversations.map(conversation => { const activity = demoActivities.find(item => item.id === conversation.activityId)!; return <li key={activity.id}><Link href={`/messages/${activity.id}`} className="flex items-center gap-3 border-b border-secondary px-4 py-5"><Image src={activity.image} alt="" width={56} height={56} className="size-14 shrink-0 rounded-full object-cover" /><div className="min-w-0 flex-1"><h2 className="truncate text-base font-bold">{activity.title}</h2><p className="mt-1 truncate text-sm text-muted-foreground">{conversation.preview}</p></div><div className="space-y-2 text-right"><p className="text-[10px] text-muted-foreground">{conversation.time}</p>{conversation.unread > 0 && <span aria-label={`${conversation.unread} unread demo messages`} className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">{conversation.unread}</span>}</div></Link></li>; })}</ul></main>;
}
