"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, CalendarCheck, Shuffle } from "lucide-react";
import { dueCards, listCategories, listWords, recordReview, type CardWithItem } from "@/lib/db";
import { pinyinMatches } from "@/lib/pinyin";
import { Rating, type Grade } from "@/lib/srs";
import type { Category, StoredFsrsCard, Word } from "@/lib/types";
import { Button, Card, Chip, Input, Page, Segmented, Spinner } from "@/components/ui";
import { GradeButtons, ProgressBar, SelfCheckButtons, SessionDone, useStoredFlag, Verdict } from "@/components/Quiz";
import SpeakButton, { speak } from "@/components/SpeakButton";

type Direction = "recognition" | "production";
type Item = { key: string; word: Word; mode: Direction; card?: { id: string; fsrs: StoredFsrsCard | null } };
type Session = { kind: "srs" | "free"; items: Item[] };

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function WordsTestPage() {
  const router = useRouter();
  const [words, setWords] = useState<Word[] | null>(null);
  const [due, setDue] = useState<CardWithItem[] | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [ignoreTones, setIgnoreTones] = useStoredFlag("quiz.ignoreTones", false);

  const [direction, setDirection] = useState<Direction | "mixed">("mixed");
  const [count, setCount] = useState<number>(10);
  /** null = everything, "expressions", or a category id */
  const [scope, setScope] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  function load() {
    listWords().then(setWords);
    dueCards("words").then(setDue);
  }
  useEffect(() => {
    load();
    listCategories().then(setCategories);
  }, []);

  const usedCategories = useMemo(
    () => categories.filter((c) => (words ?? []).some((w) => w.category_ids.includes(c.id))).sort((a, b) => a.position - b.position),
    [categories, words]
  );
  const hasExpressions = (words ?? []).some((w) => w.kind === "expression");
  const inScope = (w: Word) => !scope || (scope === "expressions" ? w.kind === "expression" : w.category_ids.includes(scope));

  function startSrs() {
    if (!due?.length) return;
    const items = due
      .filter((c) => c.word)
      .map((c) => ({ key: c.id, word: c.word!, mode: c.mode as Direction, card: { id: c.id, fsrs: c.fsrs } }));
    setSession({ kind: "srs", items: shuffle(items) });
  }

  function startFree() {
    const pool = shuffle((words ?? []).filter(inScope));
    const picked = count > 0 ? pool.slice(0, count) : pool;
    const items = picked.map((word, i) => ({
      key: `${word.id}-${i}`,
      word,
      mode: direction === "mixed" ? (Math.random() < 0.5 ? "recognition" : "production") : direction,
    })) as Item[];
    if (items.length) setSession({ kind: "free", items });
  }

  if (session) {
    return (
      <Runner
        key={session.items.map((i) => i.key).join()}
        session={session}
        ignoreTones={ignoreTones}
        onExit={() => {
          setSession(null);
          load();
        }}
        onRestart={() => {
          if (session.kind === "srs") {
            setSession(null);
            load();
          } else startFree();
        }}
      />
    );
  }

  return (
    <Page className="max-w-2xl">
      <Link href="/mots" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} /> Mots
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight md:text-3xl">Tester mes mots</h1>

      {words === null || due === null ? (
        <div className="flex justify-center py-20 text-muted">
          <Spinner />
        </div>
      ) : words.length === 0 ? (
        <Card className="p-6 text-center text-muted">
          Ajoute d&apos;abord quelques mots pour pouvoir te tester.
          <div className="mt-4">
            <Button variant="primary" onClick={() => router.push("/mots")}>
              Ajouter des mots
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <CalendarCheck size={22} />
              </span>
              <div className="flex-1">
                <h2 className="font-semibold">Révision du jour</h2>
                <p className="mt-0.5 text-sm text-muted">
                  Répétition espacée : chaque mot revient juste avant que tu l&apos;oublies.
                </p>
                <p className="mt-3 text-sm">
                  {due.length ? (
                    <>
                      <strong className="text-accent">{due.length}</strong> carte{due.length > 1 ? "s" : ""} à revoir
                    </>
                  ) : (
                    "Rien à réviser pour l'instant 🎉"
                  )}
                </p>
              </div>
            </div>
            <Button variant="primary" size="lg" className="mt-4 w-full" disabled={!due.length} onClick={startSrs}>
              Commencer la révision
            </Button>
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink">
                <Shuffle size={22} />
              </span>
              <div>
                <h2 className="font-semibold">Quiz libre</h2>
                <p className="mt-0.5 text-sm text-muted">Des mots au hasard, sans toucher au planning de révision.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <Segmented
                value={direction}
                onChange={setDirection}
                options={[
                  { value: "recognition", label: "Pinyin → sens" },
                  { value: "production", label: "Sens → pinyin" },
                  { value: "mixed", label: "Mélangé" },
                ]}
              />
              <div className="flex flex-wrap gap-2">
                {[10, 20, 0].map((n) => (
                  <Chip key={n} active={count === n} onClick={() => setCount(n)}>
                    {n ? `${n} mots` : `Tous (${words.length})`}
                  </Chip>
                ))}
              </div>
              {(usedCategories.length > 0 || hasExpressions) && (
                <div className="flex flex-wrap gap-2">
                  <Chip active={!scope} onClick={() => setScope(null)}>
                    Tous les mots
                  </Chip>
                  {hasExpressions && (
                    <Chip active={scope === "expressions"} onClick={() => setScope(scope === "expressions" ? null : "expressions")}>
                      💬 Expressions
                    </Chip>
                  )}
                  {usedCategories.map((c) => (
                    <Chip key={c.id} active={scope === c.id} onClick={() => setScope(scope === c.id ? null : c.id)}>
                      {c.icon ? `${c.icon} ` : ""}
                      {c.name}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
            <Button size="lg" className="mt-4 w-full" onClick={startFree}>
              Lancer le quiz
            </Button>
          </Card>

          <label className="flex items-center gap-3 px-1 text-sm text-muted">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--accent)]"
              checked={ignoreTones}
              onChange={(e) => setIgnoreTones(e.target.checked)}
            />
            Ignorer les tons quand je tape le pinyin
          </label>
        </div>
      )}
    </Page>
  );
}

function Runner({
  session,
  ignoreTones,
  onExit,
  onRestart,
}: {
  session: Session;
  ignoreTones: boolean;
  onExit: () => void;
  onRestart: () => void;
}) {
  const [queue, setQueue] = useState<Item[]>(session.items);
  const [firstTry, setFirstTry] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const total = session.items.length;
  const doneCount = total - new Set(queue.map((i) => i.key)).size;

  async function next(item: Item, ok: boolean, grade?: Grade) {
    if (session.kind === "srs" && item.card && grade) {
      const updated = await recordReview(item.card, grade);
      item = { ...item, card: { id: item.card.id, fsrs: updated.fsrs } };
    }
    if (ok && !failed.has(item.key)) setFirstTry((s) => new Set(s).add(item.key));
    if (!ok) setFailed((s) => new Set(s).add(item.key));
    // Missed items come back at the end of the session.
    setQueue((q) => (ok ? q.slice(1) : [...q.slice(1), item]));
  }

  const current = queue[0];

  return (
    <Page className="max-w-xl">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onExit} aria-label="Quitter">
          <ArrowLeft size={20} />
        </Button>
        <div className="flex-1">
          <ProgressBar done={doneCount} total={total} />
        </div>
      </div>
      {current ? (
        <QuizCard key={`${current.key}-${queue.length}`} item={current} srs={session.kind === "srs"} ignoreTones={ignoreTones} onNext={next} />
      ) : (
        <SessionDone correct={firstTry.size} total={total} onExit={onExit} onRestart={onRestart} />
      )}
    </Page>
  );
}

function QuizCard({
  item,
  srs,
  ignoreTones,
  onNext,
}: {
  item: Item;
  srs: boolean;
  ignoreTones: boolean;
  onNext: (item: Item, ok: boolean, grade?: Grade) => void;
}) {
  const { word, mode } = item;
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);

  const typed = answer.trim();
  const correct =
    mode === "production" && typed
      ? (word.hanzi !== null && typed === word.hanzi) || pinyinMatches(typed, word.pinyin, { ignoreTones, hanzi: word.hanzi ?? "" })
      : null;
  // Recognition (pinyin → meaning) is self-assessed; production (meaning → pinyin) is checked.
  const suggestedOk = correct ?? undefined;
  const suggestedGrade = correct === null ? undefined : correct ? Rating.Good : Rating.Again;

  function reveal(e?: FormEvent) {
    e?.preventDefault();
    setRevealed(true);
    if (word.hanzi) speak(word.hanzi);
  }

  return (
    <Card className="flex flex-col gap-5 p-5 md:p-7">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {mode === "recognition"
          ? word.kind === "expression"
            ? "Que veut dire cette expression ?"
            : "Que veut dire ce mot ?"
          : "Comment dit-on en chinois ?"}
      </p>

      {mode === "recognition" ? (
        <div className="flex flex-col items-center gap-1 py-4">
          <div className="flex items-center gap-2">
            <span className="text-5xl font-medium text-accent md:text-6xl">{word.pinyin}</span>
            {word.hanzi && <SpeakButton text={word.hanzi} />}
          </div>
          {word.hanzi && (
            <span lang="zh-Hans" className="hz text-2xl text-ink/70">
              {word.hanzi}
            </span>
          )}
        </div>
      ) : (
        <p className="py-4 text-center text-2xl font-medium md:text-3xl">{word.translation || "(pas de traduction)"}</p>
      )}

      {!revealed ? (
        <form onSubmit={reveal} className="flex flex-col gap-3">
          {mode === "production" && (
            <Input
              autoFocus
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Pinyin : ni3hao3 ou nǐhǎo (ou caractères)"
            />
          )}
          <Button type="submit" variant="primary" size="lg" autoFocus={mode === "recognition"}>
            {mode === "recognition" ? "Révéler le sens" : "Vérifier"}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          {correct !== null && <Verdict correct={correct}>{correct ? "Correct !" : `Ta réponse : ${typed}`}</Verdict>}
          <div className="rounded-xl bg-surface-2 px-4 py-3">
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-medium text-accent">{word.pinyin}</span>
              {word.hanzi && (
                <span lang="zh-Hans" className="hz text-lg text-ink/70">
                  {word.hanzi}
                </span>
              )}
              {word.hanzi && <SpeakButton text={word.hanzi} className="ml-auto self-center" />}
            </div>
            <p className="mt-1">{word.translation}</p>
            {word.literal && <p className="text-sm italic text-muted">litt. « {word.literal} »</p>}
            {word.notes && <p className="mt-2 whitespace-pre-line text-sm text-muted">{word.notes}</p>}
          </div>
          {srs && item.card ? (
            <GradeButtons fsrs={item.card.fsrs} suggested={suggestedGrade} onGrade={(g) => onNext(item, g !== Rating.Again, g)} />
          ) : (
            <SelfCheckButtons suggested={suggestedOk} onAnswer={(ok) => onNext(item, ok)} />
          )}
        </div>
      )}
    </Card>
  );
}
