"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppHeader } from "./app-header";
import { BottomNavigation } from "./bottom-navigation";
import { cn } from "@/lib/utils";

export function AppChrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  const auth = ["/sign-in", "/sign-up", "/password-reset", "/update-password", "/account-status"].includes(path);
  const chat = path.startsWith("/messages/");
  const admin = path.startsWith("/admin");
  return <div className={cn("mx-auto min-h-dvh w-full", admin ? "max-w-5xl" : "max-w-lg", !auth && !chat && !admin && "pb-28")}>{path === "/" && <AppHeader />}{children}{!auth && !chat && !admin && <BottomNavigation />}</div>;
}
