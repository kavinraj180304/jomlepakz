"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelActivity } from "@/app/activities/actions";
import { Button } from "@/components/ui/button";

export function CancelActivity({ id, revision }: { id: string; revision: string }) {
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <section className="space-y-3">
    {!confirming ? <Button variant="destructive" onClick={() => setConfirming(true)}>Cancel activity</Button> : <>
      <p className="helper-text">Cancel this activity? Participants will be notified and pending requests will be closed.</p>
      <div className="flex flex-wrap gap-3"><Button variant="destructive" disabled={pending} onClick={() => startTransition(async () => {
        try {
          const result = await cancelActivity({ activityId: id, revision });
          if (!result.ok) { setNotice(result.message); return; }
          setConfirming(false); router.refresh();
        } catch { setNotice("Cancellation could not be confirmed. Reload the activity before retrying."); }
      })}>{pending ? "Cancelling…" : "Confirm cancellation"}</Button><Button variant="outline" disabled={pending} onClick={() => setConfirming(false)}>Keep activity</Button></div>
    </>}
    {notice && <p role="alert" className="helper-text">{notice}</p>}
  </section>;
}
