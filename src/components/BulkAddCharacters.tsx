"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, ListPlus } from "lucide-react";
import { addCharactersIfMissing } from "@/lib/db";
import { photoToDataUrl } from "@/lib/image";
import type { CharacterSuggestion } from "@/lib/ai/characters";
import { Button, cx, Segmented, Spinner, Textarea } from "@/components/ui";

type Row = CharacterSuggestion & { include: boolean; exists: boolean };

async function ask(body: { image?: string; text?: string }): Promise<CharacterSuggestion[]> {
  const res = await fetch("/api/characters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Erreur inconnue");
  return data.characters;
}

/**
 * Adds many characters at once: from photos of a notebook (the AI reads them)
 * or from a pasted list. Everything is shown for review before being added.
 */
export default function BulkAddCharacters({ existing, onAdded }: { existing: Set<string>; onAdded: (count: number) => void }) {
  const [mode, setMode] = useState<"photo" | "list">("photo");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  function merge(found: CharacterSuggestion[]) {
    setRows((prev) => {
      const have = new Set(prev.map((r) => r.hanzi));
      const fresh = found
        .filter((c) => !have.has(c.hanzi))
        .map((c) => ({ ...c, exists: existing.has(c.hanzi), include: !existing.has(c.hanzi) }));
      return [...prev, ...fresh];
    });
  }

  async function readPhotos(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const list = [...files];
    for (const [i, file] of list.entries()) {
      setBusy(list.length > 1 ? `Lecture de la photo ${i + 1}/${list.length}…` : "Lecture de la photo…");
      try {
        merge(await ask({ image: await photoToDataUrl(file) }));
      } catch (err) {
        setError(`Photo ${i + 1} : ${err instanceof Error ? err.message : err}`);
      }
    }
    setBusy(null);
  }

  async function readList() {
    setError("");
    setBusy("Recherche du pinyin et du sens…");
    try {
      merge(await ask({ text }));
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(null);
  }

  function patch(hanzi: string, change: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.hanzi === hanzi ? { ...r, ...change } : r)));
  }

  async function add() {
    const chosen = rows.filter((r) => r.include && !r.exists);
    setBusy("Ajout…");
    try {
      // Lists show newest first: stagger the times so the batch keeps the notebook's order.
      const now = Date.now();
      await addCharactersIfMissing(
        chosen.map((r, i) => ({
          hanzi: r.hanzi,
          pinyin: r.pinyin,
          meaning: r.meaning,
          is_radical: r.is_radical,
          created_at: new Date(now - i).toISOString(),
        }))
      );
      onAdded(chosen.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  const toAdd = rows.filter((r) => r.include && !r.exists).length;
  const already = rows.filter((r) => r.exists).length;

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "photo", label: "📷 Depuis une photo" },
          { value: "list", label: "Coller une liste" },
        ]}
      />

      {mode === "photo" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">
            Prends ton cahier en photo : l&apos;IA repère les caractères écrits (même recopiés plusieurs fois). Tu peux choisir
            plusieurs photos d&apos;un coup.
          </p>
          <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { readPhotos(e.target.files); e.target.value = ""; }} />
          <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { readPhotos(e.target.files); e.target.value = ""; }} />
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => camera.current?.click()} disabled={Boolean(busy)}>
              <Camera size={18} /> Prendre
            </Button>
            <Button onClick={() => gallery.current?.click()} disabled={Boolean(busy)}>
              <ImagePlus size={18} /> Galerie
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Textarea
            lang="zh-Hans"
            rows={3}
            className="hz text-xl"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="一二三 我你他 山水…"
          />
          <Button onClick={readList} disabled={Boolean(busy) || !text.trim()}>
            <ListPlus size={18} /> Préparer la liste
          </Button>
        </div>
      )}

      {busy && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> {busy}
        </p>
      )}
      {error && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}

      {rows.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-sm text-muted">
            {rows.length} caractère{rows.length > 1 ? "s" : ""} trouvé{rows.length > 1 ? "s" : ""}
            {already > 0 && ` · ${already} déjà dans ta liste`}. Vérifie, corrige au besoin, décoche ce qui ne va pas.
          </p>
          <ul className="flex flex-col gap-1.5">
            {rows.map((r) => (
              <li
                key={r.hanzi}
                className={cx("flex items-center gap-2 rounded-xl bg-surface px-2 py-1.5", (r.exists || !r.include) && "opacity-50")}
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                  checked={r.include && !r.exists}
                  disabled={r.exists}
                  onChange={(e) => patch(r.hanzi, { include: e.target.checked })}
                  aria-label={`Ajouter ${r.hanzi}`}
                />
                <span lang="zh-Hans" className="hz-kai w-9 shrink-0 text-center text-3xl leading-none">
                  {r.hanzi}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <input
                    value={r.pinyin}
                    onChange={(e) => patch(r.hanzi, { pinyin: e.target.value })}
                    className="w-full bg-transparent text-sm text-accent outline-none"
                    aria-label="Pinyin"
                  />
                  <input
                    value={r.meaning}
                    onChange={(e) => patch(r.hanzi, { meaning: e.target.value })}
                    placeholder={r.exists ? "déjà dans ta liste" : "sens"}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
                    aria-label="Sens"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => patch(r.hanzi, { is_radical: !r.is_radical })}
                  disabled={r.exists}
                  title="* Ne s'emploie pas seul comme mot"
                  className={cx(
                    "h-8 w-8 shrink-0 rounded-lg text-lg font-bold",
                    r.is_radical ? "bg-accent-soft text-accent" : "text-muted/40 hover:text-muted"
                  )}
                >
                  *
                </button>
              </li>
            ))}
          </ul>
          <Button variant="primary" size="lg" onClick={add} disabled={Boolean(busy) || toAdd === 0}>
            Ajouter {toAdd} caractère{toAdd > 1 ? "s" : ""}
          </Button>
        </div>
      )}
    </div>
  );
}
