import { Suspense } from "react";
import { notFound } from "next/navigation";
import { demoActivities } from "@/lib/demo/activities";
import { demoConversations } from "@/lib/demo/screens";
import { ActivityChat } from "@/components/messages/activity-chat";
import { LoadingState } from "@/components/ui/screen-states";
export function generateStaticParams() { return demoConversations.map(conversation => ({ id: conversation.activityId })); }
export default function ChatPage({ params }: { params: Promise<{ id: string }> }) { return <Suspense fallback={<LoadingState />}><ChatContent params={params} /></Suspense>; }
async function ChatContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const activity = demoActivities.find(item => item.id === id);
  const conversation = demoConversations.find(item => item.activityId === id);
  if (!activity || !conversation) notFound();
  return <ActivityChat activity={activity} conversation={conversation} />;
}
