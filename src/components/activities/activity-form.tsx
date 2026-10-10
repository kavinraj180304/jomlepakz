"use client";
import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { saveActivity } from "@/app/activities/actions";
import { activityCovers, activityDraftSchema, activityLocalDateTime, durationOptions, type ActivityCategory, type OwnedActivity } from "@/lib/activities/validation";
import { ActivityCard } from "./activity-card";
import { Button } from "@/components/ui/button";
import { Field, fieldClass, ScreenHeader } from "@/components/ui/screen";
import { cn } from "@/lib/utils";
import { CUSTOM_LOCATION_ID, CUSTOM_LOCATION_LABEL, LOCATION_MAX_LENGTH, resolveActivityLocation, umLocations } from "@/lib/config/um-locations";

export function ActivityForm({ activity, categories }: { activity?: OwnedActivity; categories: ActivityCategory[] }) {
  const editing = !!activity;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [notice, setNotice] = useState("");
  const requestId = useRef<string | null>(null);
  const preset = umLocations.find(location => location.label === activity?.location);
  const local = activity ? activityLocalDateTime(activity.startsAt) : { date: "", time: "" };
  const [draft, setDraft] = useState({
    title: activity?.title ?? "", categorySlug: activity?.categorySlug ?? categories[0]?.slug ?? "",
    date: local.date, time: local.time,
    durationMinutes: activity ? Math.round((new Date(activity.endsAt).getTime() - new Date(activity.startsAt).getTime()) / 60000) : 60,
    locationChoice: preset?.id ?? (activity ? CUSTOM_LOCATION_ID : ""),
    customLocation: preset ? "" : activity?.location ?? "", capacity: activity?.capacity ?? 8,
    description: activity?.description ?? "", joinMode: activity?.joinMode ?? "instant",
    coverKey: activityCovers.find(cover => cover.path === activity?.coverPath)?.key ?? "none",
  });
  function update(values: Partial<typeof draft>) { setNotice(""); setDraft(previous => ({ ...previous, ...values })); }
  const cover = activityCovers.find(item => item.key === draft.coverKey)!;
  const occupancy = activity?.occupied ?? 1;
  let location = draft.customLocation;
  try { location = resolveActivityLocation(draft.locationChoice, draft.customLocation); } catch { /* Form validation supplies the message. */ }
  return <main id="main-content">
    <ScreenHeader title={step === 2 ? "Preview Activity" : editing ? "Edit Activity" : step === 1 ? "Activity Details" : "Create Activity"} back={activity ? "/activities/" + activity.id : "/my-activities"} />
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-3 text-sm font-semibold text-primary"><span>{step + 1} of 3</span><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Activity form steps" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={3}><div className="h-full rounded-full bg-primary transition-all" style={{ width: (step + 1) / 3 * 100 + "%" }} /></div></div>
      <p className="helper-text">{editing ? "Changes are saved when you finish the preview." : "You will be the host. Review the details before publishing."} Times are in Malaysia time (MYT).</p>
      <form className="space-y-6" onSubmit={event => {
        event.preventDefault();
        if (pending) return;
        if (step === 1) {
          try { resolveActivityLocation(draft.locationChoice, draft.customLocation); }
          catch { setNotice("Choose a UM location or enter a valid custom meeting point."); return; }
        }
        if (step < 2) { setStep(step + 1); setNotice(""); return; }
        const parsed = activityDraftSchema.safeParse(draft);
        if (!parsed.success) { setNotice(parsed.error.issues[0]?.message ?? "Check your details."); return; }
        const key = requestId.current ?? crypto.randomUUID();
        requestId.current = key;
        startTransition(async () => {
          try {
            const result = await saveActivity({ draft, requestId: key, ...(activity ? { activityId: activity.id, revision: activity.revision } : {}) });
            if (!result.ok) { setNotice(result.message); return; }
            router.push("/activities/" + result.id); router.refresh();
          } catch { setNotice("We couldn’t save this change. Check My Activities before retrying."); }
        });
      }}>
        <fieldset disabled={pending} className="space-y-6">
          {step === 0 && <>
            <Field label="Activity title" htmlFor="activity-title"><input id="activity-title" name="title" required maxLength={100} value={draft.title} onChange={event => update({ title: event.target.value })} className={fieldClass + " h-14"} placeholder="e.g. Badminton Tonight" /></Field>
            <fieldset><legend className="field-label mb-3">Category</legend><div className="flex flex-wrap gap-2">{categories.map(category => <button key={category.slug} type="button" aria-pressed={draft.categorySlug === category.slug} onClick={() => update({ categorySlug: category.slug })} className={cn("rounded-2xl border px-4 py-3 text-sm font-medium", draft.categorySlug === category.slug ? "border-primary bg-primary text-white" : "bg-muted text-secondary-foreground")}>{category.name}</button>)}</div></fieldset>
            <div className="grid grid-cols-2 gap-3"><Field label="Date" htmlFor="date"><input id="date" name="date" type="date" required value={draft.date} onChange={event => update({ date: event.target.value })} className={fieldClass + " h-14 min-w-0 px-3"} /></Field><Field label="Start time" htmlFor="time"><input id="time" name="time" type="time" required value={draft.time} onChange={event => update({ time: event.target.value })} className={fieldClass + " h-14 min-w-0 px-3"} /></Field></div>
            <fieldset><legend className="field-label mb-3">Duration</legend><div className="flex flex-wrap gap-2">{Array.from(new Set([...durationOptions, draft.durationMinutes])).map(minutes => <button type="button" key={minutes} aria-pressed={draft.durationMinutes === minutes} onClick={() => update({ durationMinutes: minutes })} className={cn("rounded-2xl border px-3 py-3 text-sm", draft.durationMinutes === minutes ? "border-primary/30 bg-accent text-primary" : "bg-muted")}>{minutes % 60 === 0 ? minutes / 60 + " hr" : minutes + " min"}</button>)}</div><p className="helper-text mt-2">The end time is calculated from this duration.</p></fieldset>
          </>}
          {step === 1 && <>
            <Field label="Location" htmlFor="location-choice" hint="Choose a UM location or enter a custom meeting point."><select id="location-choice" name="location-choice" required value={draft.locationChoice} onChange={event => update({ locationChoice: event.target.value })} className={fieldClass + " h-14"}><option value="" disabled>Choose a location</option>{umLocations.filter(item => item.isActive).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}<option value={CUSTOM_LOCATION_ID}>{CUSTOM_LOCATION_LABEL}</option></select></Field>
            {draft.locationChoice === CUSTOM_LOCATION_ID && <Field label="Custom location" htmlFor="custom-location" hint={"Use a public meeting point, up to " + LOCATION_MAX_LENGTH + " characters."}><input id="custom-location" name="location" required value={draft.customLocation} onChange={event => update({ customLocation: event.target.value })} maxLength={LOCATION_MAX_LENGTH} className={fieldClass + " h-14"} /></Field>}
            <Field label="Max participants" htmlFor="capacity" hint="2 to 50 people, including you as the host."><input id="capacity" name="capacity" type="number" min={Math.max(2, occupancy)} max={50} required value={draft.capacity} onChange={event => update({ capacity: Number(event.target.value) })} className={fieldClass + " h-14"} /></Field>
            <Field label="Description" htmlFor="description"><textarea id="description" name="description" required maxLength={1000} rows={5} className={fieldClass} value={draft.description} onChange={event => update({ description: event.target.value })} /></Field>
            <Field label="Approval required" htmlFor="approval" hint={editing ? "Approval mode is fixed after creation." : "Choose whether joining requires your approval."}><select id="approval" disabled={editing} value={draft.joinMode} onChange={event => update({ joinMode: event.target.value as "instant" | "approval" })} className={fieldClass + " h-14"}><option value="instant">No</option><option value="approval">Yes</option></select></Field>
            <Field label="Activity image (optional)" htmlFor="cover" hint="Choose an approved image or leave it blank."><select id="cover" value={draft.coverKey} onChange={event => update({ coverKey: event.target.value as typeof draft.coverKey })} className={fieldClass + " h-14"}>{activityCovers.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</select></Field>
          </>}
          {step === 2 && <><ActivityCard title={draft.title} schedule={draft.date + " · " + draft.time + " MYT · " + draft.durationMinutes + " min"} location={location} attendance={occupancy + " going, including the host"} dayLabel="Preview" capacityLabel={Math.max(0, draft.capacity - occupancy) + " spots left"} description={draft.description} cover={cover.path ? <Image src={cover.path} alt={cover.alt} fill sizes="(max-width: 512px) calc(100vw - 32px), 480px" className="object-cover" /> : undefined} /><p className="helper-text">{draft.joinMode === "approval" ? "Host approval required" : "Instant joining"} · Status: {activity?.status ?? "scheduled"}</p></>}
        </fieldset>
        {notice && <p role="alert" className="rounded-lg bg-accent p-3 text-sm text-secondary-foreground">{notice}</p>}
        <div className="sticky bottom-28 flex gap-3 border-t border-secondary bg-background py-4">{step > 0 && <Button type="button" disabled={pending} variant="outline" className="flex-1" onClick={() => { setStep(step - 1); setNotice(""); }}>Back</Button>}<Button type="submit" disabled={pending || categories.length === 0} size="lg" className="flex-1">{pending ? "Saving…" : step < 2 ? "Continue" : editing ? "Save changes" : "Publish activity"}</Button></div>
        {categories.length === 0 && <p role="alert" className="helper-text">No active categories are available. Please try again later.</p>}
      </form>
    </div>
  </main>;
}
