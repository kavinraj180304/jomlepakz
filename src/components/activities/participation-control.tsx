"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { joinActivity, leaveActivity } from "@/app/activities/membership-actions";
import type { MembershipState } from "@/lib/activities/membership";
export function ParticipationControl({ value }: { value: MembershipState }) {
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function perform(operation: "join" | "leave") {
    setNotice("");
    startTransition(async () => {
      try {
        const result = await (operation === "join" ? joinActivity : leaveActivity)({ activityId: value.activityId });
        if (!result.ok) { setNotice(result.message); return; }
        setNotice(result.status === "joined" ? "You joined the activity." : result.status === "pending" ? "Request sent. Pending requests do not reserve a seat." : "You left the activity or cancelled your pending request.");
        router.refresh();
      } catch { setNotice("The result could not be confirmed. Refresh before retrying."); }
    });
  }
  return <section className="space-y-3 rounded-lg border border-secondary p-4" aria-busy={pending}>
    <h2 className="field-label">Participation</h2>
    <p className="helper-text">{value.availability === "host" ? "You are hosting this activity." : value.status === "joined" ? "You have joined this activity." : value.status === "pending" ? "Your request is pending. It does not reserve a seat." : value.status === "removed" || value.status === "declined" ? "You cannot rejoin this activity." : value.availability === "full" ? "This activity is full. Saving it does not reserve a seat." : value.availability === "closed" ? "Joining has closed. Past participation is preserved." : value.availability === "unavailable" ? "Participation is unavailable." : value.requiresApproval ? "Request to join; host approval is required. Approval controls are not available yet." : "Join before the activity starts. You may leave while it is scheduled and has not ended."}</p>
    {value.canJoin && <Button disabled={pending} onClick={() => perform("join")}>{pending ? "Updating..." : value.requiresApproval ? "Request to join" : "Join activity"}</Button>}
    {value.canLeave && <Button variant="outline" disabled={pending} onClick={() => perform("leave")}>{pending ? "Updating..." : value.status === "pending" ? "Cancel request" : "Leave activity"}</Button>}
    {notice && <p role="status" className="helper-text">{notice}</p>}
  </section>;
}
