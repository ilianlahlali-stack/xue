"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { BookOpen, Brush, House, ListTree, MessagesSquare, Settings } from "lucide-react";
import { supabaseBackupDb } from "@/lib/db";
import { autoSnapshot } from "@/lib/localBackup";
import { cx } from "@/components/ui";

const NAV = [
  { href: "/", label: "Accueil", icon: House },
  { href: "/mots", label: "Mots", icon: BookOpen },
  { href: "/caracteres", label: "Caractères", icon: Brush },
  { href: "/structure", label: "Structure", icon: ListTree },
  { href: "/practice", label: "Practice", icon: MessagesSquare },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The chat has its own input bar at the bottom of the screen on phones.
  const hideBottomNav = /^\/practice\/.+/.test(pathname);

  // Daily copy of all the data on this device, a few seconds after opening the app.
  useEffect(() => {
    const timer = setTimeout(() => autoSnapshot(supabaseBackupDb()), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface md:flex md:w-[76px] lg:w-56">
        <Link href="/" className="flex items-center gap-3 px-4 py-5 lg:px-5">
          <span className="hz-kai flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-2xl text-accent-ink">
            学
          </span>
          <span className="hidden text-lg font-semibold tracking-tight lg:block">Xué</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              title={label}
              className={cx(
                "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition md:justify-center lg:justify-start",
                isActive(pathname, href) ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-ink"
              )}
            >
              <Icon size={20} className="shrink-0" />
              <span className="hidden lg:inline">{label}</span>
            </Link>
          ))}
        </nav>
        <Link
          href="/reglages"
          title="Réglages et sauvegarde"
          className={cx(
            "m-3 flex h-11 items-center gap-3 rounded-xl px-3 text-sm md:justify-center lg:justify-start",
            isActive(pathname, "/reglages") ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-ink"
          )}
        >
          <Settings size={18} className="shrink-0" />
          <span className="hidden lg:inline">Réglages</span>
        </Link>
      </aside>

      {/* overflow-x-clip: a too-wide element must never widen the page (phones would zoom out). */}
      <main className={cx("min-w-0 flex-1 overflow-x-clip", !hideBottomNav && "pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0")}>
        {children}
      </main>

      {!hideBottomNav && (
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 backdrop-blur md:hidden">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cx(
                "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                isActive(pathname, href) ? "text-accent" : "text-muted"
              )}
            >
              <Icon size={22} />
              {label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
