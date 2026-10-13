import type { Metadata } from "next";
import { PolicyPage } from "@/components/policies/policy-page";
import { terms } from "@/lib/policies/content";

export const metadata: Metadata = { title: "Terms | JomLepakz" };
export default function TermsPage() { return <PolicyPage document={terms} />; }
