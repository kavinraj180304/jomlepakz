import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function ScreenHeader({ title, back, action }: { title: string; back?: string; action?: ReactNode }) {
  return <header className="flex min-h-16 items-center gap-3 border-b border-secondary px-4 py-3">{back && <Link href={back} aria-label="Back" className="flex size-11 shrink-0 items-center justify-center rounded-full text-secondary-foreground focus-visible:outline-2 focus-visible:outline-ring"><ArrowLeft className="size-5" /></Link>}<h1 className="min-w-0 flex-1 text-xl font-bold leading-tight">{title}</h1>{action}</header>;
}
export function DemoBanner({ children }: { children?: ReactNode }) {
  return <p className="rounded-lg bg-accent px-3 py-2 text-xs leading-relaxed text-secondary-foreground">{children ?? "Static demo only. Changes are previews in this tab and are not saved."}</p>;
}
export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: string }) {
  return <div className="space-y-2"><label htmlFor={htmlFor} className="field-label">{label}</label>{children}{hint && <p className="helper-text">{hint}</p>}</div>;
}
export const fieldClass = "w-full rounded-lg border border-input bg-muted px-4 py-3 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50";
