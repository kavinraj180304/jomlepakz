"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setActivitySaved } from "@/app/saved-activities/actions";

export function BookmarkButton({ id, saved: initialSaved }: { id: string; saved: boolean }) {
  const [saved, setSaved] = useState(initialSaved);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <div className="space-y-2">
    <Button variant="outline" disabled={pending} aria-pressed={saved} onClick={() => startTransition(async () => {
      setNotice("");
      try {
        const result = await setActivitySaved({ activityId: id, saved: !saved });
        if (!result.ok) { setNotice(result.message); return; }
        setSaved(result.saved); router.refresh();
      } catch { setNotice("Your saved change could not be confirmed. Reload before retrying."); }
    })}><Bookmark aria-hidden="true" className={saved ? "fill-primary text-primary" : ""} />{pending ? "Updating..." : saved ? "Unsave activity" : "Save activity"}</Button>
    {notice && <p role="alert" className="helper-text">{notice}</p>}
  </div>;
}
