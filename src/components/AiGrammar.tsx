"use client";

import { useMemo, useState, type FormEvent } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import { addSection } from "@/lib/db";
import { draftToBlocks, type DraftBlock } from "@/lib/ai/grammar";
import type { GrammarSection } from "@/lib/types";
import { Button, Label, Spinner, Textarea } from "@/components/ui";

type Draft = { title: string; icon: string; blocks: DraftBlock[]; parentId: string | null };

const IDEAS = [
  "La règle 又…又… pour relier deux adjectifs",
  "Les jours de la semaine : 星期一, 星期二…",
  "La phrase adjective simple : 我很高兴",
];

/**
 * "Ajouter avec l'IA": the user describes a grammar point, the AI drafts a note,
 * the user checks the preview, and it becomes a normal editable section.
 */
export default function AiGrammar({
  sections,
  defaultParent,
  onCreated,
}: {
  sections: GrammarSection[];
  /** "auto" lets the AI pick where the note goes. */
  defaultParent: "auto" | "root" | string;
  onCreated: (section: GrammarSection) => void;
}) {
  const [request, setRequest] = useState("");
  const [parent, setParent] = useState(defaultParent);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Sections listed as a tree (parents before children, indented) for the "where" menu.
  const options = useMemo(() => {
    const children = new Map<string | null, GrammarSection[]>();
    for (const s of [...sections].sort((a, b) => a.position - b.position)) {
      children.set(s.parent_id, [...(children.get(s.parent_id) ?? []), s]);
    }
    const out: { id: string; label: string }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const s of children.get(parentId) ?? []) {
        out.push({ id: s.id, label: `${"   ".repeat(depth)}${s.icon ? `${s.icon} ` : ""}${s.title}` });
        walk(s.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [sections]);

  const where = (id: string | null) => {
    if (!id) return "Nouvelle section principale";
    const s = sections.find((x) => x.id === id);
    return s ? `${s.icon ? `${s.icon} ` : ""}${s.title}` : "Nouvelle section principale";
  };

  async function generate(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    setBusy("L'IA rédige la fiche…");
    try {
      const res = await fetch("/api/grammar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, parent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur inconnue");
      setDraft(data.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(null);
  }

  async function create() {
    if (!draft) return;
    setBusy("Création…");
    try {
      const siblings = sections.filter((s) => s.parent_id === draft.parentId);
      const section = await addSection({
        parent_id: draft.parentId,
        title: draft.title,
        icon: draft.icon,
        position: Math.max(0, ...siblings.map((s) => s.position)) + 1,
        content: draftToBlocks(draft.blocks),
      });
      onCreated(section);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  if (draft) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-2xl font-semibold">
            {draft.icon} <span className="hz">{draft.title}</span>
          </p>
          <p className="mt-1 text-sm text-muted">Rangée dans : {where(draft.parentId)}</p>
        </div>
        <DraftPreview blocks={draft.blocks} />
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
          C&apos;est un brouillon : une fois créée, la fiche est une section comme les autres, tu peux réécrire le titre, le
          texte et les exemples à ta façon.
        </p>
        {error && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={() => setDraft(null)} disabled={Boolean(busy)}>
            <RotateCcw size={16} /> Modifier la demande
          </Button>
          <Button variant="primary" onClick={create} disabled={Boolean(busy)}>
            {busy ? <Spinner /> : null} Créer la section
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={generate} className="flex flex-col gap-4">
      <label>
        <Label>Que veux-tu ajouter ?</Label>
        <Textarea
          autoFocus
          rows={3}
          className="hz"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="Ex. ajoute la règle de 又…又… pour combiner des adjectifs"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {IDEAS.map((idea) => (
          <button
            key={idea}
            type="button"
            onClick={() => setRequest(idea)}
            className="hz rounded-full border border-dashed border-line px-3 py-1 text-left text-sm text-muted hover:text-ink"
          >
            {idea}
          </button>
        ))}
      </div>
      <label>
        <Label>Où la ranger ?</Label>
        <select
          value={parent}
          onChange={(e) => setParent(e.target.value)}
          className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-accent"
        >
          <option value="auto">✨ Laisser l&apos;IA choisir</option>
          <option value="root">Nouvelle section principale</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              Dans : {o.label}
            </option>
          ))}
        </select>
      </label>
      {busy && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> {busy}
        </p>
      )}
      {error && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}
      <Button type="submit" variant="primary" size="lg" disabled={Boolean(busy) || !request.trim()}>
        <Sparkles size={18} /> Rédiger la fiche
      </Button>
    </form>
  );
}

function DraftPreview({ blocks }: { blocks: DraftBlock[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return (
              <p key={i} className="mt-1 font-semibold">
                {b.text}
              </p>
            );
          case "paragraph":
            return (
              <p key={i} className="hz text-sm">
                {b.text}
              </p>
            );
          case "pattern":
            return (
              <p key={i} className="hz border-l-4 border-accent/50 pl-3 font-semibold">
                {b.text}
              </p>
            );
          case "bullet":
            return (
              <p key={i} className="hz text-sm">
                • {b.text}
              </p>
            );
          case "example":
            return (
              <p key={i} className="text-sm">
                • <strong className="text-accent">{b.pinyin}</strong>{" "}
                <span lang="zh-Hans" className="hz text-ink/70">
                  {b.hanzi}
                </span>
                {b.fr && <em className="text-muted"> — {b.fr}</em>}
              </p>
            );
        }
      })}
    </div>
  );
}
