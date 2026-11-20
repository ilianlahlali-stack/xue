"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const TABS = [
  { href: "/mots", label: "Mots" },
  { href: "/mots/classificateurs", label: "Classificateurs", sub: "量词" },
];

/** Switch between the two kinds of vocabulary: words and classifiers. */
export default function VocabTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-5 inline-flex rounded-xl border border-line bg-surface p-1">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cx(
            "flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition",
            pathname === tab.href ? "bg-ink text-bg" : "text-muted hover:text-ink"
          )}
        >
          {tab.label}
          {tab.sub && <span className="hz text-xs opacity-70">{tab.sub}</span>}
        </Link>
      ))}
    </nav>
  );
}
