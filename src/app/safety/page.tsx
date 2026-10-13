import type { Metadata } from "next";
import { PolicyPage } from "@/components/policies/policy-page";
import { safety } from "@/lib/policies/content";

export const metadata: Metadata = { title: "Meetup safety | JomLepakz" };
export default function SafetyPage() { return <PolicyPage document={safety} />; }
