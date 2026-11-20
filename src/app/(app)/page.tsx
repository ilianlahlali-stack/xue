"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, Brush, ChevronRight, ListTree, MessagesSquare, Ruler, Settings } from "lucide-react";
import { countRows, dueCounts, listConversations, reviewsSince } from "@/lib/db";
import type { Conversation } from "@/lib/types";
import { Button, Card, cx, Page } from "@/components/ui";

type Stats = {
  words: number;
  characters: number;
  sections: number;
  due: { words: number; characters: number; classifiers: number };
  reviewedToday: number;
  lastConversation: Conversation | null;
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    Promise.all([
      countRows("words"),
      countRows("characters"),
      countRows("grammar_sections"),
      dueCounts(),
      reviewsSince(startOfToday()),
      listConversations(),
    ]).then(([words, characters, sections, due, reviewedToday, conversations]) =>
      setStats({ words, characters, sections, due, reviewedToday, lastConversation: conversations[0] ?? null })
    );
  }, []);

  const totalDue = stats ? stats.due.words + stats.due.characters + stats.due.classifiers : 0;
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <Page>
      <header className="mb-8 flex items-center gap-4">
        <span className="hz-kai hidden h-14 w-14 items-center justify-center rounded-2xl bg-accent text-3xl text-accent-ink sm:flex md:hidden">
          学
        </span>
        <div className="flex-1">
          <p className="text-sm capitalize text-muted">{today}</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            <span className="hz">你好</span> 👋
          </h1>
        </div>
        <Link
          href="/reglages"
          aria-label="Réglages et sauvegarde"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink md:hidden"
        >
          <Settings size={22} />
        </Link>
      </header>

      <Card className="mb-4 p-5 md:p-6">
        <p className="text-sm text-muted">À réviser aujourd&apos;hui</p>
        <p className="mt-1 text-5xl font-semibold tracking-tight md:text-6xl">{stats ? totalDue : "–"}</p>
        <p className="mt-1 text-sm text-muted">
          {stats && stats.reviewedToday > 0
            ? `${stats.reviewedToday} révision${stats.reviewedToday > 1 ? "s" : ""} déjà faite${stats.reviewedToday > 1 ? "s" : ""} aujourd'hui`
            : "Quelques minutes par jour suffisent."}
        </p>
        <div className={cx("mt-5 grid grid-cols-1 gap-2", stats?.due.classifiers ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          <Link href="/mots/test">
            <Button variant={stats?.due.words ? "primary" : "secondary"} size="lg" className="w-full">
              <BookOpen size={18} /> Mots{stats ? ` · ${stats.due.words}` : ""}
            </Button>
          </Link>
          <Link href="/caracteres/test">
            <Button variant={stats?.due.characters ? "primary" : "secondary"} size="lg" className="w-full">
              <Brush size={18} /> Caractères{stats ? ` · ${stats.due.characters}` : ""}
            </Button>
          </Link>
          {/* Shown only when some are due: classifiers are few and live under Mots. */}
          {stats && stats.due.classifiers > 0 && (
            <Link href="/mots/classificateurs/test">
              <Button variant="primary" size="lg" className="w-full">
                <Ruler size={18} /> Classificateurs · {stats.due.classifiers}
              </Button>
            </Link>
          )}
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-3 gap-2 md:gap-4">
        <StatTile href="/mots" label="Mots" value={stats?.words} />
        <StatTile href="/caracteres" label="Caractères" value={stats?.characters} />
        <StatTile href="/structure" label="Règles" value={stats?.sections} />
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-4">
        <ShortcutCard
          href={stats?.lastConversation ? `/practice/${stats.lastConversation.id}` : "/practice"}
          icon={<MessagesSquare size={20} />}
          title={stats?.lastConversation ? "Reprendre la conversation" : "Discuter avec l'IA"}
          subtitle={stats?.lastConversation?.title ?? "Corrige tes phrases et pratique ce que tu connais"}
        />
        <ShortcutCard
          href="/structure"
          icon={<ListTree size={20} />}
          title="Mes règles de grammaire"
          subtitle="Sections et sous-sections, comme tu veux"
        />
      </div>
    </Page>
  );
}

function StatTile({ href, label, value }: { href: string; label: string; value?: number }) {
  return (
    <Link href={href} className="rounded-2xl border border-line bg-surface p-4 transition hover:border-accent/40">
      <p className="truncate text-xs text-muted md:text-sm">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{value ?? "–"}</p>
    </Link>
  );
}

function ShortcutCard({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 transition hover:border-accent/40">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block truncate text-sm text-muted">{subtitle}</span>
      </span>
      <ChevronRight size={18} className="text-muted" />
    </Link>
  );
}
