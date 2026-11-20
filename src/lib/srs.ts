import { createEmptyCard, fsrs, Rating, TypeConvert, type Card, type Grade } from "ts-fsrs";
import type { StoredFsrsCard } from "@/lib/types";

export { Rating };
export type { Grade };

const scheduler = fsrs({ enable_fuzz: true });
// Fuzz spreads real reviews over a few days; the button labels show the deterministic interval.
const previewScheduler = fsrs({ enable_fuzz: false });

export const GRADES: { grade: Grade; label: string; tone: string }[] = [
  { grade: Rating.Again, label: "Encore", tone: "bad" },
  { grade: Rating.Hard, label: "Difficile", tone: "warn" },
  { grade: Rating.Good, label: "Bien", tone: "good" },
  { grade: Rating.Easy, label: "Facile", tone: "easy" },
];

function toCard(stored: StoredFsrsCard | null, now: Date): Card {
  return stored ? TypeConvert.card(stored as unknown as Card) : createEmptyCard(now);
}

/** Schedules the next review after answering with `grade`. */
export function review(stored: StoredFsrsCard | null, grade: Grade, now = new Date()) {
  const next = scheduler.next(toCard(stored, now), now, grade).card;
  return {
    fsrs: JSON.parse(JSON.stringify(next)) as StoredFsrsCard,
    due: next.due.toISOString(),
  };
}

/** How long until the card comes back for each possible grade ("10 min", "3 j"…). */
export function previewIntervals(stored: StoredFsrsCard | null, now = new Date()): Record<Grade, string> {
  const preview = previewScheduler.repeat(toCard(stored, now), now);
  const out = {} as Record<Grade, string>;
  for (const { grade } of GRADES) {
    out[grade] = formatInterval(preview[grade].card.due.getTime() - now.getTime());
  }
  return out;
}

export function formatInterval(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} j`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} mois`;
  return `${(days / 365).toFixed(1).replace(".0", "")} an${days >= 730 ? "s" : ""}`;
}

/** Writing test: missing + extra strokes (null = gave up) → suggested grade. */
export function gradeFromWriting(problems: number | null): Grade {
  if (problems === null) return Rating.Again;
  if (problems === 0) return Rating.Good;
  if (problems === 1) return Rating.Hard;
  return Rating.Again;
}
