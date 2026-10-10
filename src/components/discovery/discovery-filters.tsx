"use client";

import { useRef } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DiscoveryFilters = { availableOnly: boolean; onCampusOnly: boolean };
export function DiscoveryFilterControl({ value, onChange, onApply }: { value: DiscoveryFilters; onChange: (value: DiscoveryFilters) => void; onApply: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const active = value.availableOnly || value.onCampusOnly;
  return (
    <>
      <Button variant="outline" aria-label={active ? "Filters (active)" : "Filters"} onClick={() => dialog.current?.showModal()} className="relative size-14 shrink-0 rounded-2xl px-0"><SlidersHorizontal />{active && <span className="absolute right-2 top-2 size-2 rounded-full bg-primary" />}</Button>
      <dialog ref={dialog} aria-labelledby="filter-title" className="demo-dialog fixed inset-x-0 bottom-0 top-auto m-0 max-h-[calc(100dvh-2rem)] w-full max-w-none overflow-y-auto rounded-t-3xl bg-background p-5 text-foreground sm:inset-0 sm:m-auto sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-center justify-between"><h2 id="filter-title" className="section-title">Filters</h2><Button variant="ghost" size="icon" aria-label="Close filters" onClick={() => dialog.current?.close()}><X /></Button></div>
        <p className="helper-text mt-2">Find activities that suit you.</p>
        <div className="my-6 space-y-5">
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" className="size-5 accent-primary" checked={value.onCampusOnly} onChange={e => onChange({ ...value, onCampusOnly: e.target.checked })} />On campus</label>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" className="size-5 accent-primary" checked={value.availableOnly} onChange={e => onChange({ ...value, availableOnly: e.target.checked })} />Spots available</label>
        </div>
        <div className="grid grid-cols-2 gap-3"><Button variant="outline" onClick={() => onChange({ availableOnly: false, onCampusOnly: false })}>Reset</Button><Button onClick={() => { onApply(); dialog.current?.close(); }}>Show activities</Button></div>
      </dialog>
    </>
  );
}
