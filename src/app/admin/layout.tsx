import type { ReactNode } from "react";
import { ProtectedContent } from "@/components/auth/protected-content";

export default function Layout({ children }: { children: ReactNode }) {
  return <ProtectedContent admin>{children}</ProtectedContent>;
}
