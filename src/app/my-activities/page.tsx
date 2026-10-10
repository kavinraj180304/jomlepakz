import { Suspense } from "react";
import { HostedActivities } from "@/components/activities/hosted-activities";
import { getHostedActivities } from "@/lib/activities/server";
import { LoadingState } from "@/components/ui/screen-states";
export default function MyActivitiesPage() { return <Suspense fallback={<LoadingState />}><MyActivities /></Suspense>; }
async function MyActivities() { return <HostedActivities activities={await getHostedActivities()} />; }
