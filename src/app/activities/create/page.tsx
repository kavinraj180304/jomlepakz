import { ActivityForm } from "@/components/activities/activity-form";
import { Suspense } from "react";
import { getActivityCategories } from "@/lib/activities/server";
import { RouteLoading } from "@/components/ui/route-loading";
export default function CreateActivityPage() { return <Suspense fallback={<RouteLoading title="Create Activity" />}><CreateActivity /></Suspense>; }
async function CreateActivity() { return <ActivityForm categories={await getActivityCategories()} />; }
