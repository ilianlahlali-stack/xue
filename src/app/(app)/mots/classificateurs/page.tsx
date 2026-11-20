"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { GraduationCap, Plus, Ruler, Trash2 } from "lucide-react";
import { addClassifier, deleteClassifier, listClassifiers, updateClassifier } from "@/lib/db";
import { hasHanzi, numbersToMarks, sentencePinyin, wordPinyin } from "@/lib/pinyin";
import type { Classifier } from "@/lib/types";
import { Button, EmptyState, Input, Label, Page, PageHeader, Sheet, Spinner, Textarea } from "@/components/ui";
import SpeakButton from "@/components/SpeakButton";
import VocabTabs from "@/components/VocabTabs";

export default function ClassifiersPage() {
  const [classifiers, setClassifiers] = useState<Classifier[] | null>(null);
  const [editing, setEditing] = useState<Classifier | "new" | null>(null);

  useEffect(() => {
    listClassifiers().then(setClassifiers);
  }, []);

  function saved(c: Classifier) {
    setClassifiers((prev) => {
      const list = prev ?? [];
      return list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c];
    });
    setEditing(null);
  }

  return (
    <Page>
      <VocabTabs />
      <PageHeader
        title="Classificateurs"
        subtitle="Les mots qu'on place entre le nombre et le nom : 一个人, 两只羊, 一本书…"
        actions={
          <>
            {classifiers && classifiers.length > 0 && (
              <Link href="/mots/classificateurs/test">
                <Button>
                  <GraduationCap size={18} /> Tester
                </Button>
              </Link>
            )}
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus size={18} /> Ajouter
            </Button>
          </>
        }
      />

      {classifiers === null ? (
        <div className="flex justify-center py-20 text-muted">
          <Spinner />
        </div>
      ) : classifiers.length === 0 ? (
        <EmptyState icon={<Ruler size={32} />} title="Aucun classificateur pour l'instant">
          Ajoute ceux que tu connais et ce à quoi ils s&apos;appliquent, par exemple « zhī 只 : animaux ».
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {classifiers.map((c) => (
            <li key={c.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setEditing(c)}
                onKeyDown={(e) => e.key === "Enter" && setEditing(c)}
                className="flex w-full cursor-pointer flex-col gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-left transition hover:border-accent/40"
              >
                <div className="flex w-full items-baseline gap-2">
                  <span className="text-2xl font-medium text-accent">{c.pinyin}</span>
                  {c.hanzi && (
                    <span lang="zh-Hans" className="hz text-lg text-ink/70">
                      {c.hanzi}
                    </span>
                  )}
                  {c.applies_to && (
                    <span className="ml-auto rounded-full bg-surface-2 px-2.5 py-0.5 text-sm text-ink">{c.applies_to}</span>
                  )}
                </div>
                <Examples text={c.examples} />
                {c.notes && <p className="text-sm text-muted">{c.notes}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Nouveau classificateur" : "Modifier"}>
        {editing !== null && (
          <ClassifierForm
            key={editing === "new" ? "new" : editing.id}
            classifier={editing === "new" ? undefined : editing}
            onSaved={saved}
            onDeleted={(id) => {
              setClassifiers((prev) => (prev ?? []).filter((x) => x.id !== id));
              setEditing(null);
            }}
          />
        )}
      </Sheet>
    </Page>
  );
}

/** Example lines, pinyin first (computed from the characters), characters smaller. */
function Examples({ text }: { text: string }) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  return (
    <ul className="flex flex-col gap-1">
      {lines.map((line, i) => (
        <li key={i} className="flex items-center gap-2 text-sm">
          {hasHanzi(line) ? (
            <>
              <span className="text-accent">{sentencePinyin(line)}</span>
              <span lang="zh-Hans" className="hz text-ink/70">
                {line}
              </span>
              <SpeakButton text={line} size={16} className="ml-auto h-7 w-7" />
            </>
          ) : (
            <span className="text-accent">{numbersToMarks(line)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function ClassifierForm({
  classifier,
  onSaved,
  onDeleted,
}: {
  classifier?: Classifier;
  onSaved: (c: Classifier) => void;
  onDeleted: (id: string) => void;
}) {
  const [pinyin, setPinyin] = useState(classifier?.pinyin ?? "");
  const [pinyinTouched, setPinyinTouched] = useState(Boolean(classifier));
  const [hanzi, setHanzi] = useState(classifier?.hanzi ?? "");
  const [appliesTo, setAppliesTo] = useState(classifier?.applies_to ?? "");
  const [examples, setExamples] = useState(classifier?.examples ?? "");
  const [notes, setNotes] = useState(classifier?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const input = {
      pinyin: numbersToMarks(pinyin.trim()),
      hanzi: hanzi.trim() || null,
      applies_to: appliesTo.trim(),
      examples: examples.trim(),
      notes: notes.trim(),
    };
    try {
      onSaved(classifier ? await updateClassifier(classifier.id, input) : await addClassifier(input));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  async function remove() {
    if (!classifier || !confirm(`Supprimer le classificateur « ${classifier.pinyin} » ?`)) return;
    await deleteClassifier(classifier.id);
    onDeleted(classifier.id);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label>
        <Label hint="chiffres acceptés : zhi1">Pinyin</Label>
        <Input
          className="h-14 text-2xl"
          required
          autoFocus={!classifier}
          value={pinyin}
          placeholder="zhī"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => {
            setPinyin(e.target.value);
            setPinyinTouched(Boolean(e.target.value));
          }}
          onBlur={() => setPinyin(numbersToMarks(pinyin))}
        />
      </label>
      <label>
        <Label hint="facultatif · remplit le pinyin s'il est vide">Caractère</Label>
        <Input
          lang="zh-Hans"
          className="hz"
          value={hanzi}
          placeholder="只"
          onChange={(e) => {
            setHanzi(e.target.value);
            if (!pinyinTouched) setPinyin(wordPinyin(e.target.value));
          }}
        />
      </label>
      <label>
        <Label>S&apos;applique à</Label>
        <Input value={appliesTo} placeholder="animaux" onChange={(e) => setAppliesTo(e.target.value)} />
      </label>
      <label>
        <Label hint="une par ligne · le pinyin s'affiche tout seul">Exemples</Label>
        <Textarea lang="zh-Hans" rows={3} className="hz" value={examples} placeholder={"一只羊\n两只猫"} onChange={(e) => setExamples(e.target.value)} />
      </label>
      <label>
        <Label>Notes</Label>
        <Textarea rows={2} value={notes} placeholder="Exceptions, astuces…" onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        {classifier ? (
          <Button type="button" variant="danger" onClick={remove}>
            <Trash2 size={16} /> Supprimer
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" disabled={saving || !pinyin.trim()}>
          {classifier ? "Enregistrer" : "Ajouter"}
        </Button>
      </div>
    </form>
  );
}
