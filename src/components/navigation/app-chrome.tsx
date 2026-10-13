"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppHeader } from "./app-header";
import { BottomNavigation } from "./bottom-navigation";
import { cn } from "@/lib/utils";
import { PolicyLinks } from "@/components/policies/policy-links";
import { policyLinks } from "@/lib/policies/content";

export function AppChrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  const auth = ["/sign-in", "/sign-up", "/password-reset", "/update-password", "/account-status"].includes(path);
  const chat = path.startsWith("/messages/");
  const admin = path.startsWith("/admin");
  const policy = policyLinks.some(link => link.href === path);
  const showNavigation = !auth && !chat && !admin && !policy;
  return <div className={cn("mx-auto min-h-dvh w-full", admin ? "max-w-5xl" : "max-w-lg", showNavigation && "pb-28")}>{path === "/" && <AppHeader />}{children}{!auth && !chat && !admin && <PolicyLinks />}{showNavigation && <BottomNavigation />}</div>;
}
