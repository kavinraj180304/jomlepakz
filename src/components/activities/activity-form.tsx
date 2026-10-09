"use client";
import { useState } from "react";
import { categories, type DemoActivity } from "@/lib/demo/activities";
import { ActivityCard } from "./activity-card";
import { Button } from "@/components/ui/button";
import { DemoBanner, Field, fieldClass, ScreenHeader } from "@/components/ui/screen";
import { cn } from "@/lib/utils";

type ActivityDraft = { title: string; category: string; date: string; time: string; duration: string; location: string; capacity: string; description: string };
export function ActivityForm({ activity }: { activity?: DemoActivity }) {
  const editing = !!activity;
  const [step, setStep] = useState(0);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<ActivityDraft>({ title: activity?.title ?? "", category: activity?.category ?? "Sports", date: editing ? "2026-10-10" : "", time: editing ? "20:00" : "", duration: "1 hr", location: activity?.location ?? "", capacity: String(activity?.capacity ?? 8), description: activity?.description ?? "" });
  const update = (key: keyof ActivityDraft, value: string) => { setNotice(""); setDraft(previous => ({ ...previous, [key]: value })); };
  return <main id="main-content">
    <ScreenHeader title={step === 2 ? "Preview Activity" : editing ? "Edit Activity" : step === 1 ? "Activity Details" : "Create Activity"} back={activity ? `/activities/${activity.id}` : "/"} />
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-3 text-sm font-semibold text-primary"><span>{step + 1} of 3</span><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Activity form steps" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={3}><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(step + 1) / 3 * 100}%` }} /></div></div>
      <DemoBanner>Demo form. {editing ? "Prefilled with fictional activity data." : "Use illustrative details."} Nothing is published or saved.</DemoBanner>
      <form onSubmit={event => { event.preventDefault(); const fields = new FormData(event.currentTarget); if (step === 0) setDraft(previous => ({ ...previous, title: String(fields.get("title") ?? ""), date: String(fields.get("date") ?? ""), time: String(fields.get("time") ?? "") })); if (step === 1) setDraft(previous => ({ ...previous, location: String(fields.get("location") ?? ""), capacity: String(fields.get("capacity") ?? "8"), description: String(fields.get("description") ?? "") })); if (step < 2) setStep(step + 1); else setNotice(editing ? "Edit preview only. No activity was updated." : "Publish preview only. No activity was published."); }} className="space-y-6">
        {step === 0 && <>
          <Field label="Activity title" htmlFor="activity-title"><input id="activity-title" name="title" required maxLength={100} defaultValue={draft.title} className={`${fieldClass} h-14`} placeholder="e.g. Badminton Tonight" /></Field>
          <fieldset><legend className="field-label mb-3">Category</legend><div className="flex flex-wrap gap-2">{categories.filter(category => category !== "All").map(category => <button key={category} type="button" aria-pressed={draft.category === category} onClick={() => update("category", category)} className={cn("rounded-2xl border px-4 py-3 text-sm font-medium", draft.category === category ? "border-primary bg-primary text-white" : "bg-muted text-secondary-foreground")}>{category}</button>)}</div></fieldset>
          <div className="grid grid-cols-2 gap-3"><Field label="Date" htmlFor="date"><input id="date" name="date" type="date" required defaultValue={draft.date} className={`${fieldClass} h-14 min-w-0 px-3`} /></Field><Field label="Start time" htmlFor="time"><input id="time" name="time" type="time" required defaultValue={draft.time} className={`${fieldClass} h-14 min-w-0 px-3`} /></Field></div>
          <fieldset><legend className="field-label mb-3">Duration</legend><div className="flex flex-wrap gap-2">{["30 min", "1 hr", "1.5 hr", "2 hr", "3 hr", "4 hr"].map(duration => <button type="button" key={duration} aria-pressed={draft.duration === duration} onClick={() => update("duration", duration)} className={cn("rounded-2xl border px-3 py-3 text-sm", draft.duration === duration ? "border-primary/30 bg-accent text-primary" : "bg-muted")}>{duration}</button>)}</div></fieldset>
        </>}
        {step === 1 && <>
          <Field label="Location" htmlFor="location" hint="Pick a common UM spot or type your own."><div className="mb-3 flex flex-wrap gap-2">{["KK1", "KK2", "KK8", "KK12", "Main Library", "UM Varsity Lake", "Sports Centre"].map(location => <button type="button" key={location} onClick={() => update("location", location)} aria-pressed={draft.location === location} className={cn("min-h-11 rounded-full border px-4 py-2 text-sm", draft.location === location ? "bg-primary text-white" : "bg-muted")}>{location}</button>)}</div><input id="location" name="location" required value={draft.location} onChange={e => update("location", e.target.value)} maxLength={150} className={`${fieldClass} h-14`} /></Field>
          <Field label="Max participants" htmlFor="capacity" hint="Demo limit: 2 to 50 people, including the host."><input id="capacity" name="capacity" type="number" min={Math.max(2, activity?.participants.length ?? 2)} max={50} required defaultValue={draft.capacity} className={`${fieldClass} h-14`} /></Field>
          <Field label="Description" htmlFor="description"><textarea id="description" name="description" required maxLength={1000} rows={5} className={fieldClass} defaultValue={draft.description} /></Field>
        </>}
        {step === 2 && <ActivityCard title={draft.title} schedule={`${draft.date} - ${draft.time} - ${draft.duration}`} location={draft.location} attendance={editing ? `${activity.participants.length} going` : "0 going"} dayLabel="Demo preview" capacityLabel={`${Math.max(0, Number(draft.capacity) - (activity?.participants.length ?? 0))} spots left`} description={draft.description} />}
        {notice && <p role="status" className="rounded-lg bg-accent p-3 text-sm text-secondary-foreground">{notice}</p>}
        <div className="sticky bottom-28 flex gap-3 border-t border-secondary bg-background py-4">{step > 0 && <Button type="button" variant="outline" className="flex-1" onClick={() => { setStep(step - 1); setNotice(""); }}>Back</Button>}<Button type="submit" size="lg" className="flex-1">{step < 2 ? "Continue" : editing ? "Preview changes" : "Preview publish"}</Button></div>
      </form>
    </div>
  </main>;
}
