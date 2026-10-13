"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { completeActivity, submitActivityFeedback } from "@/app/activities/feedback-actions";
import type { FeedbackState } from "@/lib/activities/feedback";
export function PrivateFeedback({ id, value }: { id: string; value: FeedbackState }) {
  const [body, setBody] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const promptId = useId();
  const helpId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const previousConfirming = useRef(confirming);
  useEffect(() => {
    if (previousConfirming.current !== confirming) {
      if (confirming) keepRef.current?.focus();
      else triggerRef.current?.focus();
    }
    previousConfirming.current = confirming;
  }, [confirming]);
  const router = useRouter();
  async function perform(operation: () => Promise<{ ok: boolean; message?: string }>) {
    setNotice("");
    try { const result = await operation(); if (!result.ok) { setNotice(result.message ?? "Please reload before retrying."); return; }
      setBody(""); setConfirming(false); setNotice("Saved successfully."); router.refresh();
    } catch { setNotice("The result could not be confirmed. Your draft is preserved; reload before retrying."); }
  }
  return <section className="space-y-3 rounded-lg border border-secondary p-4">
    <h2 className="field-label">Completion and private feedback</h2>
    {value.canComplete && value.revision && <div className="space-y-3">
      {!confirming ? <Button ref={triggerRef} variant="outline" onClick={() => setConfirming(true)}>Complete activity</Button> : <div role="group" aria-label="Confirm activity completion" aria-describedby={promptId} className="space-y-3" onKeyDown={event => { if (event.key === "Escape" && !pending) { event.preventDefault(); setConfirming(false); } }}>
        <p id={promptId} className="helper-text">Mark this activity completed? Accepted participants can then submit private feedback.</p>
        {value.requiresReason && <label className="block text-sm">Moderator reason<input maxLength={500} value={reason} onChange={event => setReason(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border px-3" /></label>}
        <div className="flex flex-wrap gap-3"><Button disabled={pending || (value.requiresReason && !reason.trim())} onClick={() => startTransition(() => perform(() => completeActivity({ activityId: id, revision: value.revision!, ...(value.requiresReason ? { reason } : {}) })))}>Confirm completion</Button><Button ref={keepRef} aria-describedby={promptId} variant="outline" disabled={pending} onClick={() => setConfirming(false)}>Keep scheduled</Button></div>
      </div>}
    </div>}
    {value.state === "ready" ? <form className="space-y-3" onSubmit={event => { event.preventDefault(); startTransition(() => perform(() => submitActivityFeedback({ activityId: id, body }))); }}>
      <label className="block text-sm font-medium">Private feedback<textarea aria-describedby={helpId} aria-invalid={Array.from(body.trim()).length > 1000} rows={4} maxLength={2000} disabled={pending} value={body} onChange={event => setBody(event.target.value)} className="mt-2 w-full rounded-lg border bg-background p-3" /></label>
      <p id={helpId} className="helper-text">{Array.from(body.trim()).length}/1000 characters. Your host and other participants cannot read this. Safety concerns should also be reported separately.</p>
      <Button type="submit" disabled={pending || !body.trim() || Array.from(body.trim()).length > 1000}>{pending ? "Submitting..." : "Submit private feedback"}</Button>
    </form> : <p className="helper-text">{{ submitted: "Thank you. Your private feedback has been submitted and cannot be edited.", awaiting_completion: "Feedback opens after the activity has ended and is marked completed.", host: "Hosts cannot submit participant feedback about their own activity.", not_participant: "Private feedback is available only to accepted participants after completion.", unavailable: "Feedback is unavailable for this activity." }[value.state]}</p>}
    {value.state === "submitted" && <p className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">{value.body}</p>}
    {notice && <p role="status" className="helper-text">{notice}</p>}
  </section>;
}
