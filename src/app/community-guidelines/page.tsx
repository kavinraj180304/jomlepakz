import type { Metadata } from "next";
import { PolicyPage } from "@/components/policies/policy-page";
import { communityGuidelines } from "@/lib/policies/content";

export const metadata: Metadata = { title: "Community guidelines | JomLepakz" };
export default function CommunityGuidelinesPage() { return <PolicyPage document={communityGuidelines} />; }
