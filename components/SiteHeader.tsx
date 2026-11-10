"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path
        d="M10 22.5V14a6 6 0 0 1 12 0v1.2a3.3 3.3 0 0 1-3.3 3.3h-1.4a2.6 2.6 0 0 0-2.6 2.6v1.4"
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="21.5" cy="22.5" r="2.2" fill="var(--accent-ink)" />
    </svg>
  );
}

const NAV = [
  { href: "/assess", label: "Assessment" },
  { href: "/evidence", label: "Evidence" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <div className="hidden leading-tight min-[430px]:block">
            <div className="text-[15px] font-semibold tracking-tight text-ink">AppendixAi</div>
            <div className="hidden text-[11px] text-muted sm:block">Pediatric appendicitis decision support</div>
          </div>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={clsx(
                "rounded-lg px-2.5 py-2 text-[13px] font-medium transition sm:px-3 sm:text-sm",
                path.startsWith(n.href) ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2",
              )}
            >
              {n.label}
            </Link>
          ))}
          <span className="ml-2 hidden rounded-full border border-warn-line bg-warn-soft px-2.5 py-1 text-[11px] font-medium text-warn md:inline">
            Research prototype
          </span>
        </nav>
      </div>
    </header>
  );
}
