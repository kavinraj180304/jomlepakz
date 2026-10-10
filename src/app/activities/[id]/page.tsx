import Image from "next/image";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { ActivityCard } from "@/components/activities/activity-card";
import { getActivityDetails } from "@/lib/activities/server";
import { activitySchedule } from "@/lib/activities/validation";
import { CancelActivity } from "@/components/activities/cancel-activity";

export default function ActivityDetails({ params }: { params: Promise<{ id: string }> }) {
  return <main id="main-content" className="space-y-6 px-4 pb-8 pt-5">
    <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-secondary-foreground focus-visible:outline-2 focus-visible:outline-ring"><ArrowLeft className="size-5" />Back to Discover</Link>
    <h1 className="page-title">Activity details</h1>
    <Suspense fallback={<p role="status" className="helper-text">Loading activity...</p>}><ActivityDetailsContent params={params} /></Suspense>
  </main>;
}
async function ActivityDetailsContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const activity = await getActivityDetails(id);
  if (!activity) notFound();
  const status = activity.status === "scheduled" ? activity.inProgress ? "Scheduled · In progress" : activity.upcoming ? "Scheduled" : "Scheduled · Ended" : activity.status === "cancelled" ? "Cancelled" : "Completed";
  const spots = Math.max(0, activity.capacity - activity.occupied);
  return <>
    <p role="status" className="rounded-lg bg-accent p-3 text-sm font-semibold">{status}{activity.status === "cancelled" ? " — This activity will not take place." : activity.status === "completed" ? " — This activity has ended." : ""}</p>
    <ActivityCard title={activity.title} schedule={activitySchedule(activity)} location={activity.location}
      attendance={`${activity.occupied} going · ${activity.capacity} total spots`}
      dayLabel={status} capacityLabel={activity.upcoming ? spots ? `${spots} spots left` : "Full" : undefined}
      description={activity.description} cover={activity.coverPath ? <Image src={activity.coverPath} alt={activity.coverAlt ?? "Activity image"} fill sizes="(max-width: 512px) calc(100vw - 32px), 480px" className="object-cover" /> : undefined} />
    <section className="rounded-lg border border-secondary p-4"><h2 className="field-label">Hosted by{activity.isHost ? " you" : ""}</h2><p className="mt-2 break-words font-semibold">{activity.hostName}</p><p className="helper-text">{activity.categoryName} · {activity.joinMode === "approval" ? "Host approval required" : "Instant joining"}</p></section>
    <p className="helper-text">Joining and bookmarking will be available in a later update.</p>
    {activity.isHost && activity.status === "scheduled" && activity.revision && <>
      {activity.canEdit && <Link href={`/activities/${id}/edit`} className="inline-flex min-h-11 items-center text-primary underline">Edit activity</Link>}
      <CancelActivity id={id} revision={activity.revision} />
    </>}
  </>;
}
