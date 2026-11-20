"use client";

import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { addWord, deleteWord, updateWord } from "@/lib/db";
import { hasHanzi, numbersToMarks, wordPinyin } from "@/lib/pinyin";
import type { Category, Word } from "@/lib/types";
import { Button, Input, Label, Segmented, Textarea } from "@/components/ui";
import { CategoryPicker } from "@/components/Categories";

export default function WordForm({
  word,
  defaultKind = "word",
  defaultCategoryIds = [],
  categories,
  onCategoryCreated,
  onSaved,
  onDeleted,
}: {
  word?: Word;
  defaultKind?: Word["kind"];
  defaultCategoryIds?: string[];
  categories: Category[];
  onCategoryCreated: (category: Category) => void;
  onSaved: (word: Word) => void;
  onDeleted?: (id: string) => void;
}) {
  const [kind, setKind] = useState<Word["kind"]>(word?.kind ?? defaultKind);
  const [hanzi, setHanzi] = useState(word?.hanzi ?? "");
  const [pinyin, setPinyin] = useState(word?.pinyin ?? "");
  const [pinyinTouched, setPinyinTouched] = useState(Boolean(word));
  const [translation, setTranslation] = useState(word?.translation ?? "");
  const [literal, setLiteral] = useState(word?.literal ?? "");
  const [categoryIds, setCategoryIds] = useState<string[]>(word?.category_ids ?? defaultCategoryIds);
  const [notes, setNotes] = useState(word?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const expression = kind === "expression";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (hanzi.trim() && !hasHanzi(hanzi)) {
      setError("Le champ caractères ne contient pas de caractère chinois.");
      return;
    }
    setSaving(true);
    setError("");
    const input = {
      kind,
      // Characters are optional: a word can be known by its pinyin only.
      hanzi: hanzi.trim() || null,
      pinyin: numbersToMarks(pinyin.trim()),
      translation: translation.trim(),
      literal: expression ? literal.trim() : "",
      notes: notes.trim(),
    };
    try {
      const saved = word ? await updateWord(word.id, input, categoryIds) : await addWord(input, categoryIds);
      onSaved(saved);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message.includes("duplicate") ? "Déjà dans ta liste." : message);
      setSaving(false);
    }
  }

  async function remove() {
    if (!word || !confirm(`Supprimer « ${word.pinyin}${word.hanzi ? ` ${word.hanzi}` : ""} » et ses révisions ?`)) return;
    await deleteWord(word.id);
    onDeleted?.(word.id);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: "word", label: "Mot" },
          { value: "expression", label: "💬 Expression / chengyu" },
        ]}
      />
      <label>
        <Label hint="chiffres acceptés : xue2sheng1">Pinyin</Label>
        <Input
          className="h-14 text-2xl"
          required
          autoFocus={!word}
          value={pinyin}
          placeholder={expression ? "mǎmahǔhǔ" : "xuéshēng"}
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
        <Label hint="facultatif · remplit le pinyin s'il est vide">{expression ? "Caractères de l'expression" : "Caractères"}</Label>
        <Input
          lang="zh-Hans"
          className="hz"
          value={hanzi}
          placeholder={expression ? "马马虎虎" : "学生"}
          onChange={(e) => {
            setHanzi(e.target.value);
            if (!pinyinTouched) setPinyin(wordPinyin(e.target.value));
          }}
        />
      </label>
      <label>
        <Label>{expression ? "Sens" : "Traduction"}</Label>
        <Input
          value={translation}
          placeholder={expression ? "comme ci comme ça, bâclé" : "élève, étudiant"}
          onChange={(e) => setTranslation(e.target.value)}
        />
      </label>
      {expression && (
        <label>
          <Label hint="facultatif">Sens littéral</Label>
          <Input value={literal} placeholder="cheval cheval tigre tigre" onChange={(e) => setLiteral(e.target.value)} />
        </label>
      )}
      <div>
        <Label>Catégories</Label>
        <CategoryPicker categories={categories} selected={categoryIds} onChange={setCategoryIds} onCreated={onCategoryCreated} />
      </div>
      <label>
        <Label>{expression ? "Exemple d'usage, notes" : "Notes"}</Label>
        <Textarea
          rows={2}
          value={notes}
          placeholder={expression ? "你最近怎么样？—— 马马虎虎。" : "Exemple, astuce…"}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

      {error && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}

      <div className="flex items-center justify-between gap-2 pt-1">
        {word ? (
          <Button type="button" variant="danger" onClick={remove}>
            <Trash2 size={16} /> Supprimer
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" disabled={saving || !pinyin.trim()}>
          {word ? "Enregistrer" : "Ajouter"}
        </Button>
      </div>
    </form>
  );
}
