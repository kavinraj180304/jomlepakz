import Link from "next/link";
import { UserRound } from "lucide-react";
import { DemoOnlyButton } from "@/components/ui/demo-only-button";

export function AppHeader() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-secondary px-4">
      <Link href="/" className="text-xl font-extrabold tracking-tight focus-visible:outline-2 focus-visible:outline-ring">JomLepakz</Link>
      <DemoOnlyButton label="Profile" className="flex size-10 items-center justify-center rounded-full border border-border bg-secondary text-secondary-foreground focus-visible:outline-2 focus-visible:outline-ring"><UserRound className="size-5" aria-hidden="true" /></DemoOnlyButton>
    </header>
  );
}
