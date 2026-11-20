"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, CircleCheck, CircleX, RotateCcw, Target } from "lucide-react";
import { answerMatches, BLANK, type Exercise, type Question, type Shown } from "@/lib/ai/exercise";
import { Button, Card, cx, Input, Page, Spinner } from "@/components/ui";
import { ProgressBar, useStoredFlag, Verdict } from "@/components/Quiz";
import SpeakButton from "@/components/SpeakButton";

export default function ExercisePage() {
  return (
    <Suspense>
      <ExerciseRunner />
    </Suspense>
  );
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; exercise: Exercise; rules: string[] };

function ExerciseRunner() {
  const ids = (useSearchParams().get("s") ?? "").split(",").filter(Boolean);
  const idsKey = ids.join(",");
  const [state, setState] = useState<State>({ status: "loading" });
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [ignoreTones, setIgnoreTones] = useStoredFlag("quiz.ignoreTones", false);
  // Only the latest request may fill the page (an older, slower answer is ignored).
  const latest = useRef(0);

  const generate = useCallback(async () => {
    const request = ++latest.current;
    setState({ status: "loading" });
    setIndex(0);
    setResults([]);
    try {
      const res = await fetch("/api/exercise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionIds: idsKey.split(",").filter(Boolean) }),
      });
      const data = await res.json();
      if (request !== latest.current) return;
      if (!res.ok) throw new Error(data.error ?? "Erreur inconnue");
      setState({ status: "ready", exercise: data.exercise, rules: data.rules });
    } catch (err) {
      if (request !== latest.current) return;
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [idsKey]);

  useEffect(() => {
    // The request runs once per set of rules; setState happens after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    generate();
    // Leaving (or React's double run in development) invalidates the pending request.
    const counter = latest;
    return () => {
      counter.current++;
    };
  }, [generate]);

  const back = (
    <Link href={ids.length === 1 ? `/structure?s=${ids[0]}` : "/structure"} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
      <ArrowLeft size={16} /> Structure
    </Link>
  );

  if (!ids.length) {
    return (
      <Page className="max-w-xl">
        {back}
        <p className="mt-6 text-muted">Aucune règle choisie.</p>
      </Page>
    );
  }

  if (state.status === "loading") {
    return (
      <Page className="max-w-xl">
        {back}
        <div className="flex flex-col items-center gap-3 py-24 text-center text-muted">
          <Spinner className="h-6 w-6" />
          L&apos;IA prépare un exercice tout neuf…
        </div>
      </Page>
    );
  }

  if (state.status === "error") {
    return (
      <Page className="max-w-xl">
        {back}
        <p className="mt-6 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">{state.message}</p>
        <Button className="mt-4" onClick={generate}>
          <RotateCcw size={16} /> Réessayer
        </Button>
      </Page>
    );
  }

  const { exercise, rules } = state;
  const question = exercise.questions[index];
  const done = index >= exercise.questions.length;

  return (
    <Page className="max-w-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        {back}
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={ignoreTones} onChange={(e) => setIgnoreTones(e.target.checked)} />
          Ignorer les tons
        </label>
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {rules.map((r) => (
          <span key={r} className="hz rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">
            {r}
          </span>
        ))}
      </div>
      <div className="mb-5">
        <ProgressBar done={Math.min(index, exercise.questions.length)} total={exercise.questions.length} />
      </div>

      {done ? (
        <Summary questions={exercise.questions} results={results} onAgain={generate} back={back} />
      ) : (
        <QuestionCard
          key={index}
          question={question}
          ignoreTones={ignoreTones}
          onNext={(ok) => {
            setResults((r) => [...r, ok]);
            setIndex((i) => i + 1);
          }}
        />
      )}
    </Page>
  );
}

/** Pinyin first, characters below and smaller (the order used everywhere in the app). */
function Sentence({ shown, size = "lg" }: { shown: Shown; size?: "lg" | "md" }) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-center">
      <span className={cx("font-medium text-accent", size === "lg" ? "text-2xl" : "text-lg")}>{shown.pinyin}</span>
      <span lang="zh-Hans" className={cx("hz text-ink/70", size === "lg" ? "text-xl" : "text-base")}>
        {shown.hanzi}
      </span>
    </div>
  );
}

function Feedback({ ok, children, explanation, onNext }: { ok: boolean; children?: ReactNode; explanation?: string; onNext: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Verdict correct={ok} />
      {children}
      {explanation && <p className="hz rounded-xl bg-surface-2 px-3 py-2 text-sm">{explanation}</p>}
      <Button variant="primary" size="lg" autoFocus onClick={onNext}>
        Suivant
      </Button>
    </div>
  );
}

function QuestionCard({ question, ignoreTones, onNext }: { question: Question; ignoreTones: boolean; onNext: (ok: boolean) => void }) {
  return (
    <Card className="flex flex-col gap-5 p-5 md:p-7">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{question.prompt}</p>
      {question.type === "choice" && <ChoiceQuestion q={question} onNext={onNext} />}
      {question.type === "fill" && <FillQuestion q={question} ignoreTones={ignoreTones} onNext={onNext} />}
      {question.type === "reorder" && <ReorderQuestion q={question} onNext={onNext} />}
      {question.type === "translate" && <TranslateQuestion q={question} ignoreTones={ignoreTones} onNext={onNext} />}
    </Card>
  );
}

function ChoiceQuestion({ q, onNext }: { q: Extract<Question, { type: "choice" }>; onNext: (ok: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <>
      {q.sentence && <Sentence shown={q.sentence} />}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {q.options.map((o, i) => {
          const state = picked === null ? "idle" : i === q.answer ? "right" : i === picked ? "wrong" : "idle";
          return (
            <button
              key={i}
              disabled={picked !== null}
              onClick={() => setPicked(i)}
              className={cx(
                "flex flex-col items-start rounded-xl border px-3 py-2 text-left transition",
                state === "right" && "border-good/40 bg-good-soft",
                state === "wrong" && "border-accent/40 bg-accent-soft",
                state === "idle" && "border-line bg-surface hover:border-accent/40"
              )}
            >
              <span className="font-medium text-accent">{o.pinyin}</span>
              <span lang="zh-Hans" className="hz text-ink/80">
                {o.hanzi}
              </span>
            </button>
          );
        })}
      </div>
      {picked !== null && <Feedback ok={picked === q.answer} explanation={q.explanation} onNext={() => onNext(picked === q.answer)} />}
    </>
  );
}

function FillQuestion({ q, ignoreTones, onNext }: { q: Extract<Question, { type: "fill" }>; ignoreTones: boolean; onNext: (ok: boolean) => void }) {
  const [inputs, setInputs] = useState<string[]>(() => q.blanks.map(() => ""));
  const [checked, setChecked] = useState<boolean[] | null>(null);
  const filled = q.sentence.hanzi.split(BLANK).reduce((acc, part, i) => acc + (q.blanks[i - 1]?.[0] ?? "") + part);

  function check(e: FormEvent) {
    e.preventDefault();
    setChecked(inputs.map((v, i) => answerMatches(v, q.blanks[i], { ignoreTones })));
  }

  return (
    <>
      <Sentence shown={q.sentence} />
      {q.translation && <p className="text-center text-sm italic text-muted">{q.translation}</p>}
      {!checked ? (
        <form onSubmit={check} className="flex flex-col gap-2">
          {inputs.map((v, i) => (
            <label key={i} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-muted">Trou {i + 1}</span>
              <Input
                autoFocus={i === 0}
                value={v}
                onChange={(e) => setInputs((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="pinyin ou caractère"
              />
            </label>
          ))}
          <Button type="submit" variant="primary" size="lg" disabled={inputs.some((v) => !v.trim())}>
            Vérifier
          </Button>
        </form>
      ) : (
        <Feedback ok={checked.every(Boolean)} explanation={q.explanation} onNext={() => onNext(checked.every(Boolean))}>
          <ul className="flex flex-col gap-1 text-sm">
            {checked.map((ok, i) => (
              <li key={i} className="flex items-center gap-2">
                {ok ? <CircleCheck size={16} className="text-good" /> : <CircleX size={16} className="text-accent" />}
                Trou {i + 1} : <span className="hz font-medium">{q.blanks[i].join(" / ")}</span>
                {!ok && inputs[i] && <span className="text-muted">(toi : {inputs[i]})</span>}
              </li>
            ))}
          </ul>
          <SolutionLine hanzi={filled} />
        </Feedback>
      )}
    </>
  );
}

function SolutionLine({ hanzi }: { hanzi: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
      <span lang="zh-Hans" className="hz flex-1">
        {hanzi}
      </span>
      <SpeakButton text={hanzi} size={16} className="h-8 w-8" />
    </div>
  );
}

function shuffled<T>(list: T[]): T[] {
  const a = list.map((item, i) => ({ item, i }));
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
  // Never start already in the right order.
  if (a.every((x, k) => x.i === k) && a.length > 1) [a[0], a[1]] = [a[1], a[0]];
  return a.map((x) => x.item);
}

function ReorderQuestion({ q, onNext }: { q: Extract<Question, { type: "reorder" }>; onNext: (ok: boolean) => void }) {
  // Pieces are tracked by position, so a piece that appears twice (又…又) works.
  const [pool] = useState(() => shuffled(q.tokens.map((t, i) => ({ ...t, key: i }))));
  const [placed, setPlaced] = useState<number[]>([]);
  const [result, setResult] = useState<boolean | null>(null);
  const byKey = new Map(pool.map((p) => [p.key, p]));
  const answer = placed.map((k) => byKey.get(k)!.hanzi).join("");
  const solution = q.tokens.map((t) => t.hanzi).join("");

  return (
    <>
      {q.translation && <p className="text-center text-lg font-medium">{q.translation}</p>}
      <div className="flex min-h-14 flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-line px-2 py-2">
        {placed.length === 0 && <span className="px-1 text-sm text-muted">Touche les morceaux dans l&apos;ordre…</span>}
        {placed.map((k) => (
          <Piece key={k} piece={byKey.get(k)!} disabled={result !== null} onClick={() => setPlaced((p) => p.filter((x) => x !== k))} />
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {pool
          .filter((p) => !placed.includes(p.key))
          .map((p) => (
            <Piece key={p.key} piece={p} disabled={result !== null} onClick={() => setPlaced((pl) => [...pl, p.key])} />
          ))}
      </div>
      {result === null ? (
        <Button variant="primary" size="lg" disabled={placed.length !== pool.length} onClick={() => setResult(answer === solution)}>
          Vérifier
        </Button>
      ) : (
        <Feedback ok={result} explanation={q.explanation} onNext={() => onNext(result)}>
          {!result && <SolutionLine hanzi={solution} />}
        </Feedback>
      )}
    </>
  );
}

function Piece({ piece, disabled, onClick }: { piece: Shown; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col items-center rounded-lg border border-line bg-surface px-2.5 py-1 transition hover:border-accent/50 disabled:opacity-80"
    >
      <span className="text-sm font-medium text-accent">{piece.pinyin}</span>
      <span lang="zh-Hans" className="hz text-base">
        {piece.hanzi}
      </span>
    </button>
  );
}

function TranslateQuestion({ q, ignoreTones, onNext }: { q: Extract<Question, { type: "translate" }>; ignoreTones: boolean; onNext: (ok: boolean) => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; feedback?: string; corrected?: Shown } | null>(null);

  async function check(e: FormEvent) {
    e.preventDefault();
    const answers = q.answers.map((a) => a.hanzi);
    if (answerMatches(typed, answers, { ignoreTones })) {
      setResult({ ok: true });
      return;
    }
    // Not word for word the reference: let the AI judge (other phrasings can be right too).
    setBusy(true);
    try {
      const res = await fetch("/api/exercise/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ french: q.french, answers, typed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult({ ok: data.ok, feedback: data.feedback, corrected: data.ok ? undefined : data.corrected });
    } catch {
      setResult({ ok: false, feedback: "Correction automatique indisponible : compare avec la réponse attendue." });
    }
    setBusy(false);
  }

  return (
    <>
      <p className="text-center text-2xl font-medium">{q.french}</p>
      {!result ? (
        <form onSubmit={check} className="flex flex-col gap-3">
          <Input
            autoFocus
            lang="zh-Hans"
            className="hz"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="En pinyin ou en caractères"
          />
          <Button type="submit" variant="primary" size="lg" disabled={busy || !typed.trim()}>
            {busy ? <Spinner /> : null} Vérifier
          </Button>
        </form>
      ) : (
        <Feedback ok={result.ok} explanation={q.explanation} onNext={() => onNext(result.ok)}>
          {result.feedback && <p className="text-sm">{result.feedback}</p>}
          {result.corrected && (
            <div className="rounded-xl border border-line px-3 py-2">
              <p className="mb-1 text-xs text-muted">Ta phrase corrigée</p>
              <Sentence shown={result.corrected} size="md" />
            </div>
          )}
          <div className="rounded-xl border border-line px-3 py-2">
            <p className="mb-1 text-xs text-muted">{q.answers.length > 1 ? "Réponses attendues" : "Réponse attendue"}</p>
            <div className="flex flex-col gap-2">
              {q.answers.map((a) => (
                <Sentence key={a.hanzi} shown={a} size="md" />
              ))}
            </div>
          </div>
        </Feedback>
      )}
    </>
  );
}

const TYPE_LABEL: Record<Question["type"], string> = {
  choice: "QCM",
  fill: "Phrase à trous",
  reorder: "Remettre dans l'ordre",
  translate: "Traduction",
};

function Summary({ questions, results, onAgain, back }: { questions: Question[]; results: boolean[]; onAgain: () => void; back: ReactNode }) {
  const score = results.filter(Boolean).length;
  return (
    <Card className="flex flex-col items-center gap-4 p-6 text-center">
      <Target size={32} className="text-accent" />
      <p className="text-3xl font-semibold">
        {score} / {questions.length}
      </p>
      <p className="text-muted">
        {score === questions.length ? "Parfait, cette règle est acquise !" : score >= questions.length / 2 ? "Bien joué, encore un peu d'entraînement." : "Relis la fiche et retente un nouvel exercice."}
      </p>
      <ul className="flex w-full flex-col gap-1 text-left text-sm">
        {questions.map((q, i) => (
          <li key={i} className="flex items-center gap-2">
            {results[i] ? <CircleCheck size={16} className="shrink-0 text-good" /> : <CircleX size={16} className="shrink-0 text-accent" />}
            <span className="text-muted">{TYPE_LABEL[q.type]}</span>
            <span className="hz truncate">· {q.rule}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={onAgain}>
          <RotateCcw size={16} /> Nouvel exercice
        </Button>
        {back}
      </div>
    </Card>
  );
}
