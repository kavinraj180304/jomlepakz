import type { Metadata } from "next";
import { PolicyPage } from "@/components/policies/policy-page";
import { privacy } from "@/lib/policies/content";

export const metadata: Metadata = { title: "Privacy | JomLepakz" };
export default function PrivacyPage() { return <PolicyPage document={privacy} />; }
