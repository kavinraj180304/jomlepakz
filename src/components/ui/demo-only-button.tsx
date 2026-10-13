"use client";

import { useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { keepDialogFocus } from "@/lib/ui/dialog-focus";

export function DemoOnlyButton({ label, children, className, message }: { label: string; children: ReactNode; className?: string; message?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" aria-label={label} aria-haspopup="dialog" className={className} onClick={() => dialog.current?.showModal()}>{children}</button>
      <dialog ref={dialog} onKeyDown={keepDialogFocus} aria-label={`${label}: demo only`} className="demo-dialog m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-xl bg-background p-6 text-foreground shadow-xl">
        <h2 className="section-title">{label}</h2>
        <p className="mt-3 text-sm text-muted-foreground">{message ?? "This destination is not built yet. You are viewing a static demo; no account or activity changes are saved."}</p>
        <form method="dialog" className="mt-5"><Button type="submit" className="w-full">Close</Button></form>
      </dialog>
    </>
  );
}
