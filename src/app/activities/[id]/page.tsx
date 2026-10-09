import Image from "next/image";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { demoActivities } from "@/lib/demo/activities";
import { ActivityCard } from "@/components/activities/activity-card";
import { demoConversations } from "@/lib/demo/screens";
import { DemoOnlyButton } from "@/components/ui/demo-only-button";
import { Button } from "@/components/ui/button";

export function generateStaticParams() {
  return demoActivities.map(activity => ({ id: activity.id }));
}

export default function ActivityDetails({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main id="main-content" className="space-y-6 px-4 pb-8 pt-5">
      <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-secondary-foreground focus-visible:outline-2 focus-visible:outline-ring"><ArrowLeft className="size-5" />Back to Discover</Link>
      <h1 className="page-title">Activity details</h1>
      <Suspense fallback={<p className="helper-text">Loading activity…</p>}><ActivityDetailsContent params={params} /></Suspense>
    </main>
  );
}

async function ActivityDetailsContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const activity = demoActivities.find(item => item.id === id);
  if (!activity) notFound();
  const spots = activity.capacity - activity.participants.length;
  return (
    <>
      <p className="rounded-lg bg-accent p-3 text-sm text-secondary-foreground">Static demo only. This is not a real event; joining and saving are not available.</p>
      <ActivityCard title={activity.title} schedule={activity.schedule} location={activity.location} attendance={`${activity.participants.length} going · ${activity.capacity} total spots`} participantInitials={activity.participants} dayLabel={activity.dayLabel} capacityLabel={spots > 0 ? `${spots} spots left` : "Full"} description={activity.description} cover={<Image src={activity.image} alt={activity.imageAlt} fill sizes="(max-width: 512px) calc(100vw - 32px), 480px" className="object-cover" priority />} />
      <section className="rounded-lg border border-secondary p-4"><h2 className="field-label">Hosted by</h2><p className="mt-2 font-semibold">Aiman Demo</p><p className="helper-text">Fictional UM student - {activity.category}</p></section>
      <div className="grid grid-cols-2 gap-3">{spots > 0 ? <DemoOnlyButton label="Join preview" message="Demo only. No join request was made and no participation was changed." className="h-12 rounded-full bg-primary px-4 text-sm font-semibold text-white">Join preview</DemoOnlyButton> : <Button disabled>Activity full</Button>}<DemoOnlyButton label="Save preview" message="Demo only. This activity was not added to your saved activities." className="h-12 rounded-full border px-4 text-sm font-semibold">Save preview</DemoOnlyButton></div>
      <div className="flex flex-wrap gap-4 text-sm text-primary">{demoConversations.some(conversation => conversation.activityId === id) && <Link href={`/messages/${id}`} className="underline">Activity chat</Link>}<Link href={`/activities/${id}/edit`} className="underline">Preview edit form</Link></div>
    </>
  );
}
