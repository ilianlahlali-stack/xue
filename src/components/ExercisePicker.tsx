"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import type { GrammarSection } from "@/lib/types";
import { Button, cx } from "@/components/ui";

/** Tick the rules to mix in one exercise. A section brings its sub-sections along. */
export default function ExercisePicker({ sections, initial = [] }: { sections: GrammarSection[]; initial?: string[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set(initial));

  const { rows, parentOf } = useMemo(() => {
    const children = new Map<string | null, GrammarSection[]>();
    for (const s of [...sections].sort((a, b) => a.position - b.position)) {
      children.set(s.parent_id, [...(children.get(s.parent_id) ?? []), s]);
    }
    const out: { section: GrammarSection; depth: number }[] = [];
    const walk = (id: string | null, depth: number) => {
      for (const s of children.get(id) ?? []) {
        out.push({ section: s, depth });
        walk(s.id, depth + 1);
      }
    };
    walk(null, 0);
    return { rows: out, parentOf: new Map(sections.map((s) => [s.id, s.parent_id])) };
  }, [sections]);

  /** Ticked through a ticked parent: shown as included, not clickable. */
  const coveredBy = (id: string) => {
    for (let p = parentOf.get(id) ?? null; p; p = parentOf.get(p) ?? null) if (picked.has(p)) return true;
    return false;
  };
  const count = [...picked].filter((id) => !coveredBy(id)).length;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!rows.length) return <p className="text-sm text-muted">Crée d&apos;abord des fiches de grammaire pour t&apos;entraîner.</p>;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Coche une ou plusieurs règles : l&apos;exercice les mélange. Une section inclut ses sous-sections.
      </p>
      <ul className="flex flex-col">
        {rows.map(({ section, depth }) => {
          const covered = coveredBy(section.id);
          return (
            <li key={section.id}>
              <label
                className={cx("flex h-10 items-center gap-3 rounded-lg pr-2 text-sm hover:bg-surface-2", covered && "opacity-60")}
                style={{ paddingLeft: 8 + depth * 18 }}
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                  checked={covered || picked.has(section.id)}
                  disabled={covered}
                  onChange={() => toggle(section.id)}
                />
                <span className="w-5 shrink-0 text-center">{section.icon ?? "·"}</span>
                <span className="hz truncate">{section.title}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <Button
        variant="primary"
        size="lg"
        disabled={!count}
        onClick={() => router.push(`/structure/exercice?s=${[...picked].filter((id) => !coveredBy(id)).join(",")}`)}
      >
        <Target size={18} /> Lancer l&apos;exercice{count ? ` (${count} règle${count > 1 ? "s" : ""})` : ""}
      </Button>
    </div>
  );
}
