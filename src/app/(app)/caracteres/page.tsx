"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Brush, Camera, GraduationCap, Pencil, Play, Plus, Search, Trash2 } from "lucide-react";
import { addCharacter, deleteCharacter, listCharacters, listWords, updateCharacter } from "@/lib/db";
import { hasHanzi, matchesSearch, numbersToMarks, wordPinyin } from "@/lib/pinyin";
import type { Character, Word } from "@/lib/types";
import { Button, Chip, EmptyState, Input, Label, Page, PageHeader, Sheet, Spinner, Textarea } from "@/components/ui";
import HanziWriterBoard, { type BoardHandle } from "@/components/HanziWriterBoard";
import SpeakButton from "@/components/SpeakButton";
import BulkAddCharacters from "@/components/BulkAddCharacters";

export default function CharactersPage() {
  const [chars, setChars] = useState<Character[] | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState<Character | null>(null);
  const [onlyRadicals, setOnlyRadicals] = useState(false);

  useEffect(() => {
    listCharacters().then(setChars);
    listWords().then(setWords);
  }, []);

  const visible = useMemo(
    () =>
      (chars ?? []).filter((c) => (!onlyRadicals || c.is_radical) && matchesSearch(query, [c.hanzi, c.pinyin, c.meaning])),
    [chars, query, onlyRadicals]
  );

  function saved(c: Character) {
    // A character used on its own also becomes a word (database trigger): refresh them.
    listWords().then(setWords);
    setChars((prev) => {
      const list = prev ?? [];
      return list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [c, ...list];
    });
  }

  return (
    <Page>
      <PageHeader
        title="Caractères connus"
        subtitle={chars ? <CharacterCount chars={chars} /> : undefined}
        actions={
          <>
            <Link href="/caracteres/test">
              <Button>
                <GraduationCap size={18} /> S&apos;entraîner
              </Button>
            </Link>
            <Button onClick={() => setBulk(true)}>
              <Camera size={18} /> Photo / liste
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus size={18} /> Ajouter
            </Button>
          </>
        }
      />
      {notice && <p className="mb-4 rounded-xl bg-good-soft px-3 py-2 text-sm text-good">{notice}</p>}

      {chars === null ? (
        <div className="flex justify-center py-20 text-muted">
          <Spinner />
        </div>
      ) : chars.length === 0 ? (
        <EmptyState icon={<Brush size={32} />} title="Aucun caractère pour l'instant">
          Ajoute les caractères que tu sais (ou veux savoir) écrire, puis entraîne-toi à les tracer au doigt ou à la souris.
          <div className="mt-4">
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setBulk(true)}>
                <Camera size={18} /> Depuis une photo
              </Button>
              <Button variant="primary" onClick={() => setAdding(true)}>
                <Plus size={18} /> Ajouter un caractère
              </Button>
            </div>
          </div>
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input className="pl-10" placeholder="Chercher" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {chars.some((c) => c.is_radical) && (
              <Chip active={onlyRadicals} onClick={() => setOnlyRadicals(!onlyRadicals)}>
                * Pas seuls
              </Chip>
            )}
          </div>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
            {visible.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setOpen(c)}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface transition hover:border-accent/40"
                >
                  <span lang="zh-Hans" className="hz-kai relative text-5xl leading-none">
                    {c.hanzi}
                    {c.is_radical && <RadicalMark />}
                  </span>
                  <span className="text-xs text-accent">{c.pinyin}</span>
                  <span className="w-full truncate px-2 text-[11px] text-muted">{c.meaning}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet open={bulk} onClose={() => setBulk(false)} title="Ajouter plusieurs caractères" wide>
        {bulk && (
          <BulkAddCharacters
            existing={new Set((chars ?? []).map((c) => c.hanzi))}
            onAdded={(count) => {
              setBulk(false);
              setNotice(
                `${count} caractère${count > 1 ? "s" : ""} ajouté${count > 1 ? "s" : ""}, déjà dans tes révisions d'écriture. Ceux qui s'emploient seuls (sans *) sont aussi dans tes Mots.`
              );
              listCharacters().then(setChars);
              listWords().then(setWords);
            }}
          />
        )}
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Nouveau caractère">
        {adding && (
          <CharacterForm
            onSaved={(c) => {
              saved(c);
              setAdding(false);
            }}
          />
        )}
      </Sheet>

      <Sheet open={open !== null} onClose={() => setOpen(null)} title="Caractère">
        {open && (
          <CharacterDetail
            key={open.id}
            character={open}
            words={words.filter((w) => w.hanzi?.includes(open.hanzi))}
            onSaved={(c) => {
              saved(c);
              setOpen(c);
            }}
            onDeleted={(id) => {
              setChars((prev) => (prev ?? []).filter((x) => x.id !== id));
              setOpen(null);
            }}
          />
        )}
      </Sheet>
    </Page>
  );
}

function CharacterDetail({
  character,
  words,
  onSaved,
  onDeleted,
}: {
  character: Character;
  words: Word[];
  onSaved: (c: Character) => void;
  onDeleted: (id: string) => void;
}) {
  const board = useRef<BoardHandle>(null);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <CharacterForm
        character={character}
        onSaved={(c) => {
          onSaved(c);
          setEditing(false);
        }}
        onDeleted={onDeleted}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="mx-auto w-full max-w-[260px]">
        <HanziWriterBoard ref={board} char={character.hanzi} maxSize={260} />
      </div>
      <div className="flex justify-center gap-2">
        <Button size="sm" onClick={() => board.current?.animate()}>
          <Play size={16} /> Rejouer l&apos;animation
        </Button>
        <Link href={`/caracteres/test?char=${encodeURIComponent(character.hanzi)}`}>
          <Button size="sm">
            <Brush size={16} /> M&apos;entraîner
          </Button>
        </Link>
      </div>
      <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
        <span lang="zh-Hans" className="hz relative text-3xl">
          {character.hanzi}
          {character.is_radical && <RadicalMark />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-accent">
            {character.pinyin}
            {character.is_radical && <span className="ml-2 text-xs text-muted">* ne s&apos;emploie pas seul</span>}
          </p>
          <p className="text-sm">{character.meaning || <span className="text-muted">Pas encore de sens</span>}</p>
        </div>
        <SpeakButton text={character.hanzi} />
      </div>
      {character.notes && <p className="whitespace-pre-line text-sm text-muted">{character.notes}</p>}
      {words.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Dans mes mots</p>
          <ul className="flex flex-wrap gap-2">
            {words.map((w) => (
              <li key={w.id} className="rounded-xl border border-line bg-surface px-3 py-1.5 text-sm">
                <span lang="zh-Hans" className="hz">
                  {w.hanzi}
                </span>{" "}
                <span className="text-muted">{w.translation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Button onClick={() => setEditing(true)}>
        <Pencil size={16} /> Modifier
      </Button>
    </div>
  );
}

function CharacterForm({
  character,
  onSaved,
  onDeleted,
}: {
  character?: Character;
  onSaved: (c: Character) => void;
  onDeleted?: (id: string) => void;
}) {
  const [hanzi, setHanzi] = useState(character?.hanzi ?? "");
  const [pinyin, setPinyin] = useState(character?.pinyin ?? "");
  const [pinyinTouched, setPinyinTouched] = useState(Boolean(character));
  const [meaning, setMeaning] = useState(character?.meaning ?? "");
  const [notes, setNotes] = useState(character?.notes ?? "");
  const [isRadical, setIsRadical] = useState(character?.is_radical ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const char = [...hanzi.trim()][0] ?? "";
    if (!hasHanzi(char)) {
      setError("Entre un seul caractère chinois.");
      return;
    }
    setSaving(true);
    setError("");
    const input = {
      hanzi: char,
      pinyin: numbersToMarks(pinyin.trim()),
      meaning: meaning.trim(),
      notes: notes.trim(),
      is_radical: isRadical,
    };
    try {
      onSaved(character ? await updateCharacter(character.id, input) : await addCharacter(input));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message.includes("duplicate") ? "Ce caractère est déjà dans ta liste." : message);
      setSaving(false);
    }
  }

  async function remove() {
    if (!character || !confirm(`Supprimer « ${character.hanzi} » et ses révisions ?`)) return;
    await deleteCharacter(character.id);
    onDeleted?.(character.id);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label>
        <Label>Caractère</Label>
        <Input
          lang="zh-Hans"
          className="hz-kai h-16 text-4xl"
          required
          autoFocus={!character}
          value={hanzi}
          placeholder="学"
          onChange={(e) => {
            setHanzi(e.target.value);
            if (!pinyinTouched) setPinyin(wordPinyin([...e.target.value.trim()][0] ?? ""));
          }}
        />
      </label>
      <label>
        <Label hint="auto · chiffres acceptés : xue2">Pinyin</Label>
        <Input
          value={pinyin}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => {
            setPinyin(e.target.value);
            setPinyinTouched(true);
          }}
          onBlur={() => setPinyin(numbersToMarks(pinyin))}
        />
      </label>
      <label>
        <Label>Sens</Label>
        <Input value={meaning} placeholder="étudier, apprendre" onChange={(e) => setMeaning(e.target.value)} />
      </label>
      <label>
        <Label>Notes</Label>
        <Textarea rows={2} value={notes} placeholder="Clé, moyen mnémotechnique…" onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
        <input
          type="checkbox"
          className="h-5 w-5 accent-[var(--accent)]"
          checked={isRadical}
          onChange={(e) => setIsRadical(e.target.checked)}
        />
        <span>
          <strong>*</strong> Ne s&apos;emploie pas seul comme mot : radical ou caractère qui a besoin d&apos;un composé (ex.{" "}
          <span className="hz">日 → 太阳, 们, 扌</span>)
        </span>
      </label>
      {error && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        {character ? (
          <Button type="button" variant="danger" onClick={remove}>
            <Trash2 size={16} /> Supprimer
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" disabled={saving || !hanzi.trim()}>
          {character ? "Enregistrer" : "Ajouter"}
        </Button>
      </div>
    </form>
  );
}

function RadicalMark() {
  return (
    <span className="absolute -right-3 -top-1 font-sans text-base font-bold text-accent" title="Ne s'emploie pas seul comme mot" aria-label="ne s'emploie pas seul">
      *
    </span>
  );
}

function CharacterCount({ chars }: { chars: Character[] }) {
  const radicals = chars.filter((c) => c.is_radical).length;
  const plural = (n: number) => (n > 1 ? "s" : "");
  return (
    <>
      {chars.length} caractère{plural(chars.length)}
      {radicals > 0 && ` · dont ${radicals} * pas seul${radicals > 1 ? "s" : ""}`}
    </>
  );
}
