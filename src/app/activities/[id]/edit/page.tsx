import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getActivityCategories, getOwnedActivity } from "@/lib/activities/server";
import { ActivityForm } from "@/components/activities/activity-form";
import { LoadingState } from "@/components/ui/screen-states";
export default function EditActivityPage({ params }: { params: Promise<{ id: string }> }) { return <Suspense fallback={<LoadingState />}><EditActivity params={params} /></Suspense>; }
async function EditActivity({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const activity = await getOwnedActivity(id);
  if (!activity) notFound();
  if (!activity.canEdit) {
    return <main id="main-content" className="p-4"><p>This activity can no longer be edited.</p></main>;
  }
  return <ActivityForm activity={activity} categories={await getActivityCategories()} />;
}
