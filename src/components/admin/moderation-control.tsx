"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { moderate } from "@/app/admin/actions";
import type { AdminItem, AdminAction } from "@/lib/admin/validation";
export function ModerationControl({ item }: { item: AdminItem }) {
  const options = item.type === "report" ? [["in_review", "In review"], ["resolved", "Resolved"], ["dismissed", "Dismissed"]].filter(([value]) => value !== item.status)
    : item.type === "activity" ? [...(item.visibility === "visible" ? [["hide_activity", "Hide activity"]] : []), ...(item.status === "scheduled" ? [["cancel_activity", "Cancel activity"], ["complete_activity", "Complete activity (after end)"]] : [])]
    : item.type === "user" ? [...(item.status !== "suspended" ? [["suspend_user", "Suspend user"]] : []), ["ban_user", "Ban user"]]
    : [[item.active ? "disable_category" : "enable_category", item.active ? "Disable category" : "Enable category"]];
  const [choice, setChoice] = useState(options[0]?.[0] ?? "");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (!options.length || (item.type === "user" && ["banned", "deleted"].includes(item.status))) return null;
  return <form className="mt-4 space-y-3" onSubmit={event => {
    event.preventDefault(); startTransition(async () => {
      setNotice("");
      try {
        const result = await moderate({ action: item.type === "report" ? "set_report_status" : choice as AdminAction["action"],
          targetId: item.id, revision: item.revision, reason, ...(item.type === "report" ? { status: choice as AdminAction["status"] } : {}) });
        if (!result.ok) { setNotice(result.message); return; }
        setReason(""); setNotice("Action recorded."); router.refresh();
      } catch { setNotice("The action could not be confirmed. Reload before retrying."); }
    });
  }}>
    <label className="block text-sm font-medium">Moderation action<select disabled={pending} value={choice} onChange={event => setChoice(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3">{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="block text-sm font-medium">Reason<input required maxLength={500} disabled={pending} value={reason} onChange={event => setReason(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3" placeholder="Short reason for the audit record" /></label>
    <p className="helper-text">Submitting applies this action and records your moderator identity.</p>
    <Button type="submit" disabled={pending || !reason.trim()}>{pending ? "Applying..." : "Apply action"}</Button>
    {notice && <p role="status" className="helper-text">{notice}</p>}
  </form>;
}
