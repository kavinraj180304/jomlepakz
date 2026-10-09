import Image from "next/image";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import type { DemoActivity } from "@/lib/demo/activities";
import { ActivityCard } from "./activity-card";
export function DemoActivityTile({ activity, saved = false, hosting = false }: { activity: DemoActivity; saved?: boolean; hosting?: boolean }) {
  const spots = activity.capacity - activity.participants.length;
  return <div className="space-y-3"><Link href={`/activities/${activity.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring"><ActivityCard title={activity.title} schedule={activity.schedule} location={activity.location} attendance={`${activity.participants.length} going`} participantInitials={activity.participants} dayLabel={hosting ? "Hosting" : activity.dayLabel} capacityLabel={spots ? `${spots} spots left` : "Full"} cover={<Image src={activity.image} alt={activity.imageAlt} fill sizes="(max-width: 512px) calc(100vw - 32px), 480px" className="object-cover" />} action={saved ? <span className="rounded-full bg-background p-3 text-primary" aria-hidden="true"><Bookmark className="size-5 fill-primary" /></span> : undefined} /></Link>{hosting && <Link href={`/activities/${activity.id}/edit`} className="inline-block rounded-full bg-secondary px-4 py-2 text-sm font-medium">Edit demo activity</Link>}</div>;
}
