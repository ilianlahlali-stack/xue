"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft, CalendarCheck, Check, Lightbulb, RotateCcw, Shuffle } from "lucide-react";
import { dueCards, listCharacters, recordReview, type CardWithItem } from "@/lib/db";
import { compareWriting, loadCharData, mediansToStrokes, STRICTNESS, type CharData, type Stroke, type WritingResult } from "@/lib/handwriting";
import { gradeFromWriting, Rating, type Grade } from "@/lib/srs";
import type { Character, StoredFsrsCard } from "@/lib/types";
import { Button, Card, Chip, Page, Segmented, Spinner } from "@/components/ui";
import { GradeButtons, ProgressBar, SelfCheckButtons, SessionDone, useStoredFlag, Verdict } from "@/components/Quiz";
import WritingPad, { CharacterModel } from "@/components/WritingPad";
import SpeakButton from "@/components/SpeakButton";

type DrawMode = "guided" | "memory";
type Item = { key: string; character: Character; card?: { id: string; fsrs: StoredFsrsCard | null } };
type Session = { kind: "srs" | "free"; items: Item[] };

const MODES: { value: DrawMode; label: string }[] = [
  { value: "guided", label: "Guidé" },
  { value: "memory", label: "De mémoire" },
];

const MODE_HELP: Record<DrawMode, string> = {
  guided: "Le caractère est affiché en clair : repasse dessus, dans l'ordre que tu veux.",
  memory: "Case vide : écris le caractère de mémoire, dans l'ordre que tu veux.",
};

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function CharactersTestPage() {
  return (
    <Suspense>
      <CharactersTest />
    </Suspense>
  );
}

function CharactersTest() {
  const params = useSearchParams();
  const only = params.get("char");
  const [chars, setChars] = useState<Character[] | null>(null);
  const [due, setDue] = useState<CardWithItem[] | null>(null);
  const [mode, setMode] = useState<DrawMode>(only ? "guided" : "memory");
  const [strict, setStrict] = useStoredFlag("writing.strict", false);
  const [count, setCount] = useState(10);
  const [session, setSession] = useState<Session | null>(null);

  function load() {
    listCharacters().then((list) => {
      setChars(list);
      const target = only ? list.find((c) => c.hanzi === only) : undefined;
      if (target) setSession({ kind: "free", items: [{ key: target.id, character: target }] });
    });
    dueCards("characters").then(setDue);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  function startSrs() {
    const items = (due ?? [])
      .filter((c) => c.character)
      .map((c) => ({ key: c.id, character: c.character!, card: { id: c.id, fsrs: c.fsrs } }));
    if (items.length) setSession({ kind: "srs", items: shuffle(items) });
  }

  function startFree() {
    const pool = shuffle(chars ?? []);
    const items = (count ? pool.slice(0, count) : pool).map((c, i) => ({ key: `${c.id}-${i}`, character: c }));
    if (items.length) setSession({ kind: "free", items });
  }

  if (session) {
    return (
      <Runner
        key={session.items.map((i) => i.key).join()}
        session={session}
        mode={mode}
        strict={strict}
        onModeChange={setMode}
        onExit={() => {
          setSession(null);
          dueCards("characters").then(setDue);
        }}
        onRestart={() => (session.kind === "srs" ? (setSession(null), dueCards("characters").then(setDue)) : startFree())}
      />
    );
  }

  return (
    <Page className="max-w-2xl">
      <Link href="/caracteres" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} /> Caractères
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight md:text-3xl">S&apos;entraîner à écrire</h1>

      {chars === null || due === null ? (
        <div className="flex justify-center py-20 text-muted">
          <Spinner />
        </div>
      ) : chars.length === 0 ? (
        <Card className="p-6 text-center text-muted">Ajoute d&apos;abord des caractères pour t&apos;entraîner.</Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4 p-5">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Mode</p>
              <Segmented value={mode} onChange={setMode} options={MODES} />
              <p className="mt-2 text-sm text-muted">{MODE_HELP[mode]}</p>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Exigence</p>
              <Segmented
                value={strict ? "strict" : "lenient"}
                onChange={(v) => setStrict(v === "strict")}
                options={[
                  { value: "lenient", label: "Souple" },
                  { value: "strict", label: "Stricte" },
                ]}
              />
              <p className="mt-2 text-sm text-muted">
                {strict
                  ? "Les proportions comptent : 土 et 士 ne sont pas confondus."
                  : "Accepte un tracé approximatif tant que la forme est la bonne."}
              </p>
            </div>
          </Card>

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
                      <strong className="text-accent">{due.length}</strong> caractère{due.length > 1 ? "s" : ""} à écrire
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
                <h2 className="font-semibold">Entraînement libre</h2>
                <p className="mt-0.5 text-sm text-muted">Des caractères au hasard, sans toucher au planning.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[5, 10, 0].map((n) => (
                <Chip key={n} active={count === n} onClick={() => setCount(n)}>
                  {n ? `${n} caractères` : `Tous (${chars.length})`}
                </Chip>
              ))}
            </div>
            <Button size="lg" className="mt-4 w-full" onClick={startFree}>
              Lancer
            </Button>
          </Card>
        </div>
      )}
    </Page>
  );
}

function Runner({
  session,
  mode,
  strict,
  onModeChange,
  onExit,
  onRestart,
}: {
  session: Session;
  mode: DrawMode;
  strict: boolean;
  onModeChange: (m: DrawMode) => void;
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
    setQueue((q) => (ok ? q.slice(1) : [...q.slice(1), item]));
  }

  const current = queue[0];

  return (
    <Page className="max-w-xl">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onExit} aria-label="Quitter">
          <ArrowLeft size={20} />
        </Button>
        <div className="flex-1">
          <ProgressBar done={doneCount} total={total} />
        </div>
      </div>
      {current ? (
        <>
          <div className="mb-4 flex justify-center">
            <Segmented value={mode} onChange={onModeChange} options={MODES} />
          </div>
          <WritingCard
            key={`${current.key}-${queue.length}-${mode}`}
            item={current}
            mode={mode}
            strict={strict}
            srs={session.kind === "srs"}
            onRetry={() => setFailed((s) => new Set(s).add(current.key))}
            onNext={next}
          />
        </>
      ) : (
        <SessionDone correct={firstTry.size} total={total} onExit={onExit} onRestart={onRestart} />
      )}
    </Page>
  );
}

function verdictText(result: WritingResult) {
  if (result.correct) return "C'est le bon caractère !";
  const parts = [];
  if (result.missing.length) parts.push(`${result.missing.length} trait${result.missing.length > 1 ? "s" : ""} manquant${result.missing.length > 1 ? "s" : ""} (en rouge)`);
  if (result.extra.length) parts.push(`${result.extra.length} trait${result.extra.length > 1 ? "s" : ""} en trop`);
  return parts.join(", ");
}

function WritingCard({
  item,
  mode,
  strict,
  srs,
  onRetry,
  onNext,
}: {
  item: Item;
  mode: DrawMode;
  strict: boolean;
  srs: boolean;
  onRetry: () => void;
  onNext: (item: Item, ok: boolean, grade?: Grade) => void;
}) {
  const { character } = item;
  const [data, setData] = useState<CharData | "error" | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [result, setResult] = useState<WritingResult | "gave-up" | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadCharData(character.hanzi)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData("error"));
    return () => {
      cancelled = true;
    };
  }, [character.hanzi]);

  function check() {
    if (!data || data === "error") return;
    setResult(compareWriting(mediansToStrokes(data.medians), strokes, strict ? STRICTNESS.strict : STRICTNESS.lenient));
  }

  function retry() {
    onRetry();
    setResult(null);
    setStrokes([]);
    setAttempt((a) => a + 1);
  }

  const problems = result === null ? undefined : result === "gave-up" ? null : result.missing.length + result.extra.length;
  const suggestedGrade = problems === undefined ? undefined : gradeFromWriting(problems);
  const suggestedOk = suggestedGrade === undefined ? undefined : suggestedGrade !== Rating.Again;
  const checked = result && result !== "gave-up" ? result : null;

  return (
    <Card className="flex flex-col gap-5 p-5 md:p-7">
      <div className="flex items-center justify-center gap-2 text-center">
        <div>
          <p className="text-3xl font-medium text-accent">{character.pinyin}</p>
          <p className="text-muted">
            {character.meaning || "—"}
            {character.is_radical && <span className="ml-1.5 text-xs text-accent">* pas seul</span>}
          </p>
        </div>
        <SpeakButton text={character.hanzi} />
      </div>

      <div className="mx-auto w-full max-w-[340px]">
        {data === null ? (
          <div className="flex aspect-square items-center justify-center text-muted">
            <Spinner />
          </div>
        ) : data === "error" ? (
          <p className="py-10 text-center text-sm text-muted">
            Données de tracé indisponibles pour <span className="hz">{character.hanzi}</span> (pas de connexion ?).
          </p>
        ) : (
          <WritingPad
            key={attempt}
            maxSize={340}
            locked={result !== null}
            onChange={setStrokes}
            under={mode === "guided" && !result ? (size) => <CharacterModel data={data} size={size} color="var(--line)" /> : undefined}
            over={
              checked
                ? (size) => (
                    <CharacterModel
                      data={data}
                      size={size}
                      opacity={0.45}
                      colors={data.strokes.map((_, i) => (checked.missing.includes(i) ? "var(--accent)" : "var(--good)"))}
                    />
                  )
                : result === "gave-up"
                  ? (size) => <CharacterModel data={data} size={size} color="var(--accent)" opacity={0.5} />
                  : undefined
            }
            strokeColors={checked ? strokes.map((_, i) => (checked.extra.includes(i) ? "--accent" : undefined)) : undefined}
          />
        )}
      </div>

      {result === null ? (
        <div className="flex justify-center gap-2">
          <Button variant="ghost" onClick={() => setResult("gave-up")} disabled={!data || data === "error"}>
            <Lightbulb size={16} /> Je ne sais pas
          </Button>
          <Button variant="primary" onClick={check} disabled={!strokes.length || !data || data === "error"}>
            <Check size={16} /> Vérifier
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {checked && <Verdict correct={checked.correct}>{verdictText(checked)}</Verdict>}
          {result === "gave-up" && (
            <p className="text-center text-sm text-muted">Observe bien sa forme, il reviendra bientôt.</p>
          )}
          {checked && !checked.correct && (
            <Button variant="ghost" onClick={retry} className="self-center">
              <RotateCcw size={16} /> Réessayer
            </Button>
          )}
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
