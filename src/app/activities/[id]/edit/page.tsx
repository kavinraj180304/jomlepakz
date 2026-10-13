import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getActivityCategories, getOwnedActivity } from "@/lib/activities/server";
import { ActivityForm } from "@/components/activities/activity-form";
import { RouteLoading } from "@/components/ui/route-loading";
import { ScreenHeader } from "@/components/ui/screen";
export default function EditActivityPage({ params }: { params: Promise<{ id: string }> }) { return <Suspense fallback={<RouteLoading title="Edit Activity" />}><EditActivity params={params} /></Suspense>; }
async function EditActivity({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const activity = await getOwnedActivity(id);
  if (!activity) notFound();
  if (!activity.canEdit) {
    return <main id="main-content" tabIndex={-1}><ScreenHeader title="Activity editing unavailable" back="/my-activities" /><p className="helper-text p-4">This activity can no longer be edited.</p></main>;
  }
  return <ActivityForm activity={activity} categories={await getActivityCategories()} />;
}
