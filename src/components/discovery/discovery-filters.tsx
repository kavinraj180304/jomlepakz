"use client";

import { useRef, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dateFilters, type DiscoveryFilters } from "@/lib/activities/discovery";
import type { ActivityCategory } from "@/lib/activities/validation";
import { keepDialogFocus } from "@/lib/ui/dialog-focus";

type SheetFilters = Pick<DiscoveryFilters, "category" | "date" | "available" | "campus">;
export function DiscoveryFilterControl({ value, categories, disabled, onApply }: {
  value: DiscoveryFilters; categories: ActivityCategory[]; disabled: boolean;
  onApply: (value: SheetFilters) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<SheetFilters>(value);
  const active = !!(value.category || value.date !== "Upcoming" || value.available === "1" || value.campus === "1");
  return <>
    <Button variant="outline" disabled={disabled} aria-label={active ? "Filters (active)" : "Filters"} aria-haspopup="dialog" onClick={() => {
      // Every opening starts from the applied URL; Escape/Close discards edits.
      setDraft({ category: value.category, date: value.date, available: value.available, campus: value.campus });
      dialog.current?.showModal();
    }} className="relative size-14 shrink-0 rounded-2xl px-0"><SlidersHorizontal />{active && <span className="absolute right-2 top-2 size-2 rounded-full bg-primary" />}</Button>
    <dialog ref={dialog} onKeyDown={keepDialogFocus} aria-labelledby="filter-title" className="demo-dialog fixed inset-x-0 bottom-0 top-auto m-0 max-h-[calc(100dvh-2rem)] w-full max-w-none overflow-y-auto rounded-t-3xl bg-background p-5 text-foreground sm:inset-0 sm:m-auto sm:max-w-lg sm:rounded-3xl">
      <form onSubmit={event => { event.preventDefault(); onApply(draft); dialog.current?.close(); }}>
        <div className="flex items-center justify-between"><h2 id="filter-title" className="section-title">Filters</h2><Button type="button" variant="ghost" size="icon" aria-label="Close filters" onClick={() => dialog.current?.close()}><X /></Button></div>
        <p className="helper-text mt-2">Choose filters, then show activities. Dates use Malaysia time.</p>
        <div className="my-6 space-y-5">
          <label className="block text-sm font-medium">Category
            <select autoFocus value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3">
              <option value="">All categories</option>
              {categories.map(category => <option key={category.slug} value={category.slug}>{category.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">Date
            <select value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value as SheetFilters["date"] })} className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3">
              {dateFilters.map(date => <option key={date} value={date}>{date}</option>)}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" className="size-5 accent-primary" checked={draft.campus === "1"} onChange={event => setDraft({ ...draft, campus: event.target.checked ? "1" : "0" })} />On campus</label>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" className="size-5 accent-primary" checked={draft.available === "1"} onChange={event => setDraft({ ...draft, available: event.target.checked ? "1" : "0" })} />Spots available</label>
        </div>
        <div className="grid grid-cols-2 gap-3"><Button type="button" variant="outline" onClick={() => setDraft({ category: "", date: "Upcoming", available: "0", campus: "0" })}>Reset filters</Button><Button type="submit" disabled={disabled}>Show activities</Button></div>
      </form>
    </dialog>
  </>;
}
