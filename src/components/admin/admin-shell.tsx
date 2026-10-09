"use client";
import { useState } from "react";
import Link from "next/link";
import { demoReports, demoProfile } from "@/lib/demo/screens";
import { demoActivities } from "@/lib/demo/activities";
import { DemoBanner, ScreenHeader } from "@/components/ui/screen";
import { cn } from "@/lib/utils";

export function AdminShell() {
  const [tab, setTab] = useState("Overview");
  return <main id="main-content"><ScreenHeader title="Admin preview" back="/settings" /><div className="space-y-6 p-5"><DemoBanner>Read-only demo shell. No admin authentication, moderation, or real user data. This page is publicly accessible because it contains fictional fixtures only.</DemoBanner><div className="flex gap-2">{["Overview", "Reports"].map(value => <button key={value} type="button" onClick={() => setTab(value)} aria-pressed={tab === value} className={cn("min-h-11 rounded-full px-5 py-2 text-sm font-semibold", value === tab ? "bg-primary text-white" : "bg-secondary")}>{value}</button>)}</div>{tab === "Overview" ? <><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[[demoActivities.length,"Demo activities"],[1,"Demo profile"],[demoReports.length,"Demo reports"]].map(([count,label]) => <div key={label} className="rounded-xl border p-5"><p className="text-2xl font-bold">{count}</p><p className="helper-text">{label}</p></div>)}</div><section className="rounded-xl border p-5"><h2 className="section-title">Example account</h2><p className="mt-3 text-sm">{demoProfile.fullName} - UM student (demo)</p><p className="helper-text mt-2">Account actions will be defined when moderation is implemented.</p></section></> : <section className="space-y-3"><h2 className="section-title">Demo reports</h2>{demoReports.map(report => <article key={report.id} className="rounded-xl border p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{report.id}: {report.subject}</h3><span className="rounded-full bg-secondary px-3 py-1 text-xs">{report.status}</span></div><p className="helper-text mt-3">{report.reason}</p><p className="mt-3 text-xs text-muted-foreground">Static example; no moderation actions available.</p></article>)}</section>}<Link href="/demo/states" className="inline-block text-sm text-primary underline">Preview screen states</Link></div></main>;
}
