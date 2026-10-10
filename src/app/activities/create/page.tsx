import { ActivityForm } from "@/components/activities/activity-form";
import { Suspense } from "react";
import { getActivityCategories } from "@/lib/activities/server";
import { LoadingState } from "@/components/ui/screen-states";
export default function CreateActivityPage() { return <Suspense fallback={<LoadingState />}><CreateActivity /></Suspense>; }
async function CreateActivity() { return <ActivityForm categories={await getActivityCategories()} />; }
