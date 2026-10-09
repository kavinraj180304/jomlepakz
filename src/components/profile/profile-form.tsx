"use client";
import { useState } from "react";
import { demoProfile } from "@/lib/demo/screens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DemoBanner, Field, fieldClass, ScreenHeader } from "@/components/ui/screen";

export function ProfileForm() {
  const [notice, setNotice] = useState(false);
  return <main id="main-content"><ScreenHeader title="Edit Profile" back="/profile" /><form className="space-y-5 p-4" onSubmit={event => { event.preventDefault(); setNotice(true); }} onChange={() => setNotice(false)}><DemoBanner>Edit fictional values only. No profile changes are saved.</DemoBanner><Field label="Full Name" htmlFor="full-name"><Input id="full-name" defaultValue={demoProfile.fullName} required maxLength={100} autoComplete="off" /></Field><Field label="Faculty" htmlFor="faculty"><Input id="faculty" defaultValue={demoProfile.faculty} required maxLength={150} /></Field><Field label="Course/Programme" htmlFor="programme"><Input id="programme" defaultValue={demoProfile.programme} required maxLength={150} /></Field><Field label="Year" htmlFor="year"><select id="year" className={fieldClass} defaultValue={demoProfile.year}>{[1,2,3,4,5,6].map(year => <option key={year} value={year}>Year {year}</option>)}</select></Field><Field label="Bio" htmlFor="bio"><textarea id="bio" className={fieldClass} rows={4} defaultValue={demoProfile.bio} maxLength={500} /></Field><fieldset className="space-y-3"><legend className="field-label">Interests</legend><div className="flex flex-wrap gap-3">{["Sports","Study","Food","Networking","Hobbies","Events"].map(interest => <label key={interest} className="flex min-h-11 items-center gap-2 rounded-full border bg-muted px-3 py-2 text-sm"><input type="checkbox" className="accent-primary" defaultChecked={demoProfile.interests.includes(interest)} />{interest}</label>)}</div></fieldset>{notice && <p role="status" className="rounded-lg bg-accent p-3 text-sm">Profile form preview checked. Nothing was saved.</p>}<Button type="submit" size="lg" className="w-full">Preview profile changes</Button></form></main>;
}
