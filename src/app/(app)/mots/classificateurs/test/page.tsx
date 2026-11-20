"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, CalendarCheck, Shuffle } from "lucide-react";
import { dueCards, listClassifiers, recordReview, type CardWithItem } from "@/lib/db";
import { blankExample, pinyinMatches, sentencePinyin } from "@/lib/pinyin";
import { Rating, type Grade } from "@/lib/srs";
import type { Classifier, StoredFsrsCard } from "@/lib/types";
import { Button, Card, Input, Page, Spinner } from "@/components/ui";
import { GradeButtons, ProgressBar, SelfCheckButtons, SessionDone, useStoredFlag, Verdict } from "@/components/Quiz";
import SpeakButton, { speak } from "@/components/SpeakButton";

type Question =
  | { type: "usage"; appliesTo: string }
  | { type: "blank"; pinyin: string; hanzi: string; example: string }
  | { type: "reading" };
type Item = { key: string; classifier: Classifier; question: Question; card?: { id: string; fsrs: StoredFsrsCard | null } };
type Session = { kind: "srs" | "free"; items: Item[] };

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const exampleLines = (c: Classifier) =>
  c.examples
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** "animaux → ?" or "yì ＿＿ yáng", picked at random among what the classifier has. */
function pickQuestion(c: Classifier): Question {
  const blanks = c.hanzi
    ? exampleLines(c).flatMap((line) => {
        const blank = blankExample(line, c.hanzi!);
        return blank ? [{ type: "blank" as const, ...blank, example: line }] : [];
      })
    : [];
  const options: Question[] = [...(c.applies_to ? [{ type: "usage" as const, appliesTo: c.applies_to }] : []), ...shuffle(blanks).slice(0, 1)];
  return options.length ? options[Math.floor(Math.random() * options.length)] : { type: "reading" };
}

export default function ClassifiersTestPage() {
  const [classifiers, setClassifiers] = useState<Classifier[] | null>(null);
  const [due, setDue] = useState<CardWithItem[] | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [ignoreTones, setIgnoreTones] = useStoredFlag("quiz.ignoreTones", false);

  function load() {
    listClassifiers().then(setClassifiers);
    dueCards("classifiers").then(setDue);
  }
  useEffect(load, []);

  function startSrs() {
    const items = (due ?? [])
      .filter((c) => c.classifier)
      .map((c) => ({ key: c.id, classifier: c.classifier!, question: pickQuestion(c.classifier!), card: { id: c.id, fsrs: c.fsrs } }));
    if (items.length) setSession({ kind: "srs", items: shuffle(items) });
  }

  function startFree() {
    const items = shuffle(classifiers ?? []).map((c, i) => ({ key: `${c.id}-${i}`, classifier: c, question: pickQuestion(c) }));
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
        onRestart={() => (session.kind === "srs" ? (setSession(null), load()) : startFree())}
      />
    );
  }

  return (
    <Page className="max-w-2xl">
      <Link href="/mots/classificateurs" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} /> Classificateurs
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight md:text-3xl">Tester mes classificateurs</h1>

      {classifiers === null || due === null ? (
        <div className="flex justify-center py-20 text-muted">
          <Spinner />
        </div>
      ) : classifiers.length === 0 ? (
        <Card className="p-6 text-center text-muted">Ajoute d&apos;abord des classificateurs pour pouvoir te tester.</Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <CalendarCheck size={22} />
              </span>
              <div>
                <h2 className="font-semibold">Révision du jour</h2>
                <p className="mt-1 text-sm">
                  {due.length ? (
                    <>
                      <strong className="text-accent">{due.length}</strong> classificateur{due.length > 1 ? "s" : ""} à revoir
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
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                <Shuffle size={22} />
              </span>
              <div>
                <h2 className="font-semibold">Quiz libre</h2>
                <p className="mt-0.5 text-sm text-muted">
                  Tous tes classificateurs ({classifiers.length}), sans toucher au planning de révision.
                </p>
              </div>
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
    // Missed ones come back at the end, with a fresh question.
    setQueue((q) => (ok ? q.slice(1) : [...q.slice(1), { ...item, question: pickQuestion(item.classifier) }]));
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
  const { classifier: c, question } = item;
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);

  const typed = answer.trim();
  const correct = typed
    ? (c.hanzi !== null && typed === c.hanzi) || pinyinMatches(typed, c.pinyin, { ignoreTones, hanzi: c.hanzi ?? "" })
    : false;

  function check(e: FormEvent) {
    e.preventDefault();
    setRevealed(true);
    if (question.type === "blank") speak(question.example);
    else if (c.hanzi) speak(c.hanzi);
  }

  return (
    <Card className="flex flex-col gap-5 p-5 md:p-7">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {question.type === "usage"
          ? "Quel classificateur pour…"
          : question.type === "blank"
            ? "Quel classificateur manque ?"
            : "Comment se lit ce classificateur ?"}
      </p>

      {question.type === "usage" && <p className="py-4 text-center text-3xl font-medium">{question.appliesTo}</p>}
      {question.type === "blank" && (
        <div className="flex flex-col items-center gap-1 py-4 text-center">
          <span className="text-4xl font-medium text-accent">{question.pinyin}</span>
          <span lang="zh-Hans" className="hz text-2xl text-ink/70">
            {question.hanzi}
          </span>
        </div>
      )}
      {question.type === "reading" && (
        <p lang="zh-Hans" className="hz py-4 text-center text-6xl">
          {c.hanzi}
        </p>
      )}

      {!revealed ? (
        <form onSubmit={check} className="flex flex-col gap-3">
          <Input
            autoFocus
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Pinyin : zhi1 ou zhī (ou le caractère)"
          />
          <Button type="submit" variant="primary" size="lg">
            {typed ? "Vérifier" : "Je ne sais pas"}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <Verdict correct={correct}>{correct ? "Correct !" : typed ? `Ta réponse : ${typed}` : "À revoir"}</Verdict>
          <div className="rounded-xl bg-surface-2 px-4 py-3">
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-medium text-accent">{c.pinyin}</span>
              {c.hanzi && (
                <span lang="zh-Hans" className="hz text-lg text-ink/70">
                  {c.hanzi}
                </span>
              )}
              {c.applies_to && <span className="ml-auto rounded-full bg-surface px-2.5 py-0.5 text-sm">{c.applies_to}</span>}
            </div>
            <ul className="mt-2 flex flex-col gap-1">
              {exampleLines(c).map((line, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-accent">{sentencePinyin(line)}</span>
                  <span lang="zh-Hans" className="hz text-ink/70">
                    {line}
                  </span>
                  <SpeakButton text={line} size={16} className="ml-auto h-7 w-7" />
                </li>
              ))}
            </ul>
            {c.notes && <p className="mt-2 text-sm text-muted">{c.notes}</p>}
          </div>
          {srs && item.card ? (
            <GradeButtons
              fsrs={item.card.fsrs}
              suggested={correct ? Rating.Good : Rating.Again}
              onGrade={(g) => onNext(item, g !== Rating.Again, g)}
            />
          ) : (
            <SelfCheckButtons suggested={correct} onAnswer={(ok) => onNext(item, ok)} />
          )}
        </div>
      )}
    </Card>
  );
}
