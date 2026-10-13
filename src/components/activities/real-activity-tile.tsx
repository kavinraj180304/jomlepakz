import Image from "next/image";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import type { DiscoveredActivity } from "@/lib/activities/discovery";
import { activityStatusLabel } from "@/lib/activities/dashboard";
import { activitySchedule } from "@/lib/activities/validation";
import { ActivityCard } from "./activity-card";
import { BookmarkButton } from "./bookmark-button";
import { CancelActivity } from "./cancel-activity";

export function RealActivityTile({ id, activity, relationship }: {
  id: string; activity: DiscoveredActivity | null; relationship: "host" | "joined" | "saved";
}) {
  const spots = activity ? Math.max(0, activity.capacity - activity.occupied) : 0;
  return <div className="space-y-3">
    {activity ? <>
      <Link href={`/activities/${id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
        <ActivityCard title={activity.title} schedule={activitySchedule(activity)} location={activity.location}
          attendance={`${activity.occupied} going / ${activity.capacity} total spots`} dayLabel={activityStatusLabel(activity)}
          capacityLabel={activity.upcoming ? spots ? `${spots} spots left` : "Full" : undefined}
          cover={activity.coverPath ? <Image src={activity.coverPath} alt={activity.coverAlt ?? "Activity image"} fill sizes="(max-width: 512px) calc(100vw - 32px), 480px" className="object-cover" /> : undefined}
          action={relationship === "saved" ? <span className="rounded-full bg-background p-3 text-primary" aria-hidden="true"><Bookmark className="size-5 fill-primary" /></span> : undefined} />
      </Link>
      {relationship !== "saved" && <p className="helper-text">{relationship === "host" ? "Hosting" : "Joined"}</p>}
      {relationship === "host" && activity.isHost && activity.revision && <div className="flex flex-wrap items-start gap-3">
        {activity.canEdit && <Link href={`/activities/${id}/edit`} className="inline-flex min-h-11 items-center rounded-full bg-secondary px-4 text-sm font-medium">Edit activity</Link>}
        {activity.status === "scheduled" && <CancelActivity id={id} revision={activity.revision} />}
      </div>}
      {relationship === "joined" && !activity.isHost && <Link href={`/activities/${id}`} className="inline-flex min-h-11 items-center text-primary underline">View joined activity</Link>}
    </> : <div className="rounded-xl bg-muted p-5"><h2 className="section-title">Activity unavailable</h2><p className="helper-text mt-2">You can remove this activity from your saved list.</p></div>}
    {relationship === "saved" && <BookmarkButton key={`${id}:saved`} id={id} saved />}
  </div>;
}
