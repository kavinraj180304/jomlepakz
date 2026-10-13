"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Route boundaries deliberately do not accept/render/log the thrown error.
export function RouteFailure({ title, message, retry, href = "/", label = "Back to Discover" }: {
  title: string; message: string; retry: () => void; href?: string; label?: string;
}) {
  return <main id="main-content" tabIndex={-1} className="space-y-4 p-6">
    <h1 className="page-title">{title}</h1>
    <p role="alert" className="helper-text">{message}</p>
    <Button onClick={retry}>Try again</Button>
    <Link href={href} className="inline-flex min-h-11 items-center text-primary underline">{label}</Link>
  </main>;
}
