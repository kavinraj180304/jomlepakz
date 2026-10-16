"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { decideJoinRequest } from "@/app/activities/membership-actions";
import type { PendingJoinRequest } from "@/lib/activities/membership";

export function HostJoinRequests({ id, revision, requests, canDecide }: {
  id: string; revision: string; requests: PendingJoinRequest[]; canDecide: boolean;
}) {
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function decide(request: PendingJoinRequest, decision: "approve" | "reject") {
    setNotice("");
    startTransition(async () => {
      try {
        const result = await decideJoinRequest({ activityId: id, revision, applicantId: request.applicantId, requestedAt: request.requestedAt, decision });
        setNotice(result.message);
        router.refresh();
      } catch { setNotice("The decision could not be confirmed. Refresh before retrying."); }
    });
  }
  if (requests.length === 0 && !notice) return null;
  return <section className="space-y-3 rounded-lg border border-secondary p-4" aria-busy={pending}>
    <h2 className="field-label">Join requests</h2>
    {requests.length > 0 && <ul className="space-y-4">{requests.map((request, index) => <li key={`${request.applicantId}:${request.requestedAt}`} className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 break-words font-semibold">{request.name === "UM applicant" ? `UM applicant ${index + 1}` : request.name}</p>
      <div className="flex gap-2">
        <Button disabled={pending || !canDecide} aria-label={`Approve request ${index + 1} from ${request.name}`} onClick={() => decide(request, "approve")}>Approve</Button>
        <Button variant="outline" disabled={pending || !canDecide} aria-label={`Reject request ${index + 1} from ${request.name}`} onClick={() => decide(request, "reject")}>Reject</Button>
      </div>
    </li>)}</ul>}
    {!canDecide && requests.length > 0 && <p className="helper-text">Joining has closed. These requests cannot be decided.</p>}
    {notice && <p role="status" className="helper-text">{notice}</p>}
  </section>;
}
