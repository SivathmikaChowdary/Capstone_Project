import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AppendixAi — Pediatric appendicitis decision support", template: "%s · AppendixAi" },
  description:
    "Explainable, uncertainty-aware AI decision support for pediatric appendicitis severity, combining clinical data and ultrasound.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%230f766e'/%3E%3Cpath d='M10 22.5V14a6 6 0 0 1 12 0v1.2a3.3 3.3 0 0 1-3.3 3.3h-1.4a2.6 2.6 0 0 0-2.6 2.6v1.4' fill='none' stroke='white' stroke-width='2.4' stroke-linecap='round'/%3E%3Ccircle cx='21.5' cy='22.5' r='2.2' fill='white'/%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111821" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen font-sans">
        <SiteHeader />
        <main>{children}</main>
        <footer className="mt-16 border-t border-line">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>
              AppendixAi is a research prototype and <strong className="text-ink-2">not a medical device</strong>.
              It supports, and never replaces, clinical judgement.
            </p>
            <p>Capstone project · School of Computer Science and Engineering, VIT-AP University</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
