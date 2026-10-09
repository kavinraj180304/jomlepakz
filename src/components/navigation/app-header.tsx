import Link from "next/link";
import { UserRound } from "lucide-react";

export function AppHeader() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-secondary px-4">
      <Link href="/" className="inline-flex min-h-11 items-center text-xl font-extrabold tracking-tight focus-visible:outline-2 focus-visible:outline-ring">JomLepakz</Link>
      <Link href="/profile" aria-label="Profile" className="flex size-11 items-center justify-center rounded-full border border-border bg-secondary text-secondary-foreground focus-visible:outline-2 focus-visible:outline-ring"><UserRound className="size-5" aria-hidden="true" /></Link>
    </header>
  );
}
