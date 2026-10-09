import { Suspense } from "react";
import { notFound } from "next/navigation";
import { demoActivities } from "@/lib/demo/activities";
import { ActivityForm } from "@/components/activities/activity-form";
import { LoadingState } from "@/components/ui/screen-states";
export function generateStaticParams() { return demoActivities.map(activity => ({ id: activity.id })); }
export default function EditActivityPage({ params }: { params: Promise<{ id: string }> }) { return <Suspense fallback={<LoadingState />}><EditActivity params={params} /></Suspense>; }
async function EditActivity({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const activity = demoActivities.find(item => item.id === id);
  if (!activity) notFound();
  return <ActivityForm activity={activity} />;
}
