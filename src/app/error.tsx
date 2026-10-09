"use client";
import { ErrorState } from "@/components/ui/screen-states";
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) { return <main id="main-content" className="p-4"><ErrorState onRetry={retry} /></main>; }
