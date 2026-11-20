"use client";

import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { CircleCheck, CircleX, RotateCcw } from "lucide-react";
import { GRADES, previewIntervals, type Grade } from "@/lib/srs";
import type { StoredFsrsCard } from "@/lib/types";
import { Button, cx } from "@/components/ui";

const TONE_CLASSES: Record<string, string> = {
  bad: "border-accent/30 bg-accent-soft text-accent",
  warn: "border-warn/30 bg-warn-soft text-warn",
  good: "border-good/30 bg-good-soft text-good",
  easy: "border-easy/30 bg-easy-soft text-easy",
};

/** The four FSRS answers, each showing when the card would come back. */
export function GradeButtons({
  fsrs,
  suggested,
  onGrade,
}: {
  fsrs: StoredFsrsCard | null;
  suggested?: Grade;
  onGrade: (grade: Grade) => void;
}) {
  const intervals = useMemo(() => previewIntervals(fsrs), [fsrs]);
  return (
    <div className="grid grid-cols-4 gap-2">
      {GRADES.map(({ grade, label, tone }) => (
        <button
          key={grade}
          type="button"
          onClick={() => onGrade(grade)}
          className={cx(
            "flex h-16 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition active:scale-[0.97]",
            TONE_CLASSES[tone],
            suggested === grade && "ring-2 ring-current ring-offset-2 ring-offset-bg"
          )}
        >
          {label}
          <span className="text-xs font-normal opacity-80">{intervals[grade]}</span>
        </button>
      ))}
    </div>
  );
}

/** Free-quiz equivalent of the grade buttons: no schedule, just a score. */
export function SelfCheckButtons({ suggested, onAnswer }: { suggested?: boolean; onAnswer: (correct: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => onAnswer(false)}
        className={cx(
          "flex h-14 items-center justify-center gap-2 rounded-xl border font-semibold",
          TONE_CLASSES.bad,
          suggested === false && "ring-2 ring-current ring-offset-2 ring-offset-bg"
        )}
      >
        <CircleX size={18} /> À revoir
      </button>
      <button
        type="button"
        onClick={() => onAnswer(true)}
        className={cx(
          "flex h-14 items-center justify-center gap-2 rounded-xl border font-semibold",
          TONE_CLASSES.good,
          suggested === true && "ring-2 ring-current ring-offset-2 ring-offset-bg"
        )}
      >
        <CircleCheck size={18} /> Je savais
      </button>
    </div>
  );
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      {done}/{total}
    </div>
  );
}

export function Verdict({ correct, children }: { correct: boolean; children?: ReactNode }) {
  return (
    <div
      className={cx(
        "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium",
        correct ? "bg-good-soft text-good" : "bg-accent-soft text-accent"
      )}
    >
      {correct ? <CircleCheck size={18} /> : <CircleX size={18} />}
      {children ?? (correct ? "Correct !" : "Pas tout à fait")}
    </div>
  );
}

export function SessionDone({
  correct,
  total,
  onRestart,
  onExit,
}: {
  correct: number;
  total: number;
  onRestart: () => void;
  onExit: () => void;
}) {
  const pct = total ? Math.round((correct / total) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <span className="hz-kai text-7xl text-accent">{pct >= 80 ? "好" : pct >= 50 ? "加油" : "慢慢来"}</span>
      <p className="text-xl font-semibold">Session terminée</p>
      <p className="text-muted">
        {correct} réussi{correct > 1 ? "s" : ""} du premier coup sur {total}
      </p>
      <div className="flex gap-2">
        <Button onClick={onExit}>Retour</Button>
        <Button variant="primary" onClick={onRestart}>
          <RotateCcw size={16} /> Recommencer
        </Button>
      </div>
    </div>
  );
}

const FLAG_EVENT = "stored-flag-change";

function subscribeFlags(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(FLAG_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(FLAG_EVENT, callback);
  };
}

function readFlag(key: string, initial: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? initial : stored === "1";
  } catch {
    return initial;
  }
}

/** Small per-device preference, kept in localStorage (hydration-safe). */
export function useStoredFlag(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(
    subscribeFlags,
    () => readFlag(key, initial),
    () => initial
  );
  const set = useCallback(
    (v: boolean) => {
      try {
        window.localStorage.setItem(key, v ? "1" : "0");
      } catch {
        // storage unavailable (private mode): the toggle simply won't persist
      }
      window.dispatchEvent(new Event(FLAG_EVENT));
    },
    [key]
  );
  return [value, set];
}
