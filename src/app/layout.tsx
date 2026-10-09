import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppHeader } from "@/components/navigation/app-header";
import { BottomNavigation } from "@/components/navigation/bottom-navigation";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JomLepakz",
  description: "Find someone at UM to do something with.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:p-3 focus:text-primary">Skip to content</a>
        <div className="mx-auto min-h-dvh w-full max-w-lg pb-28">
          <AppHeader />
          <Suspense fallback={<main id="main-content" className="p-4 text-muted-foreground">Loading activity…</main>}>{children}</Suspense>
          <Suspense fallback={null}><BottomNavigation /></Suspense>
        </div>
      </body>
    </html>
  );
}
