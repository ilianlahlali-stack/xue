"use client";

import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from "lucide-react";
import { addCategory, deleteCategory, updateCategory } from "@/lib/db";
import type { Category } from "@/lib/types";
import { Button, cx, Input } from "@/components/ui";

export const CATEGORY_ICONS = [
  "🏠", "🍜", "🍎", "☕", "👪", "🧑‍🤝‍🧑", "🏫", "📚", "💼", "💰", "🛒", "🚗", "✈️", "🗺️", "🏥", "⚽",
  "🎵", "🎬", "🐼", "🌳", "☀️", "🌧️", "⏰", "📅", "🔢", "🎨", "👕", "❤️", "😊", "💬", "🗣️", "⭐",
];

export function nextCategoryPosition(categories: Category[]) {
  return Math.max(0, ...categories.map((c) => c.position)) + 1;
}

function IconPicker({ value, onPick }: { value: string | null; onPick: (icon: string | null) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1 rounded-xl border border-line bg-surface p-2">
      {CATEGORY_ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          onClick={() => onPick(icon)}
          className={cx("flex aspect-square items-center justify-center rounded-lg text-xl hover:bg-surface-2", value === icon && "bg-accent-soft")}
        >
          {icon}
        </button>
      ))}
      <button type="button" onClick={() => onPick(null)} className="col-span-8 h-8 rounded-lg text-xs text-muted hover:bg-surface-2">
        Sans icône
      </button>
    </div>
  );
}

/** Multi-select of categories for a word, with inline creation. */
export function CategoryPicker({
  categories,
  selected,
  onChange,
  onCreated,
}: {
  categories: Category[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onCreated: (category: Category) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      if (!selected.includes(existing.id)) onChange([...selected, existing.id]);
    } else {
      try {
        const category = await addCategory({ name: trimmed, position: nextCategoryPosition(categories) });
        onCreated(category);
        onChange([...selected, category.id]);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
    }
    setName("");
    setCreating(false);
    setError("");
  }

  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((c) => {
        const on = selected.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition",
              on ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:text-ink"
            )}
          >
            {on && <Check size={14} />}
            {c.icon && <span>{c.icon}</span>}
            {c.name}
          </button>
        );
      })}
      {creating ? (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                create();
              }
              if (e.key === "Escape") setCreating(false);
            }}
            placeholder="Nom de la catégorie"
            className="h-8 w-44 rounded-full border border-accent bg-surface px-3 text-sm outline-none"
          />
          <Button type="button" size="sm" variant="primary" onClick={create} disabled={!name.trim()}>
            OK
          </Button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-line px-3 text-sm text-muted hover:text-ink"
        >
          <Plus size={14} /> Nouvelle catégorie
        </button>
      )}
      {error && <p className="w-full text-sm text-accent">{error}</p>}
    </div>
  );
}

/** Create, rename, reorder, re-icon and delete categories. */
export function CategoryManager({
  categories,
  counts,
  onChange,
}: {
  categories: Category[];
  counts: Map<string, number>;
  onChange: (categories: Category[]) => void;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const sorted = [...categories].sort((a, b) => a.position - b.position);

  function patch(id: string, change: Partial<Category>) {
    onChange(categories.map((c) => (c.id === id ? { ...c, ...change } : c)));
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setError("Cette catégorie existe déjà.");
      return;
    }
    const category = await addCategory({ name: trimmed, icon, position: nextCategoryPosition(categories) });
    onChange([...categories, category]);
    setName("");
    setIcon(null);
    setError("");
  }

  async function move(index: number, direction: -1 | 1) {
    const a = sorted[index];
    const b = sorted[index + direction];
    if (!a || !b) return;
    onChange(categories.map((c) => (c.id === a.id ? { ...c, position: b.position } : c.id === b.id ? { ...c, position: a.position } : c)));
    await Promise.all([updateCategory(a.id, { position: b.position }), updateCategory(b.id, { position: a.position })]);
  }

  async function remove(category: Category) {
    const n = counts.get(category.id) ?? 0;
    const words = n ? ` Ses ${n} mot${n > 1 ? "s" : ""} restent dans ta liste.` : "";
    if (!confirm(`Supprimer la catégorie « ${category.name} » ?${words}`)) return;
    await deleteCategory(category.id);
    onChange(categories.filter((c) => c.id !== category.id));
  }

  return (
    <div className="flex flex-col gap-4">
      {sorted.length === 0 && <p className="text-sm text-muted">Aucune catégorie pour l&apos;instant.</p>}
      <ul className="flex flex-col gap-2">
        {sorted.map((c, i) => (
          <li key={c.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPicking(picking === c.id ? null : c.id)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-xl"
                aria-label="Changer l'icône"
              >
                {c.icon ?? <span className="text-sm text-muted">＋</span>}
              </button>
              <Input
                defaultValue={c.name}
                className="h-10"
                onBlur={async (e) => {
                  const value = e.target.value.trim();
                  if (!value || value === c.name) return;
                  patch(c.id, { name: value });
                  await updateCategory(c.id, { name: value });
                }}
              />
              <span className="w-8 shrink-0 text-center text-xs text-muted">{counts.get(c.id) ?? 0}</span>
              <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter">
                <ArrowUp size={16} />
              </Button>
              <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" disabled={i === sorted.length - 1} onClick={() => move(i, 1)} aria-label="Descendre">
                <ArrowDown size={16} />
              </Button>
              <Button size="icon" variant="danger" className="h-9 w-9 shrink-0" onClick={() => remove(c)} aria-label="Supprimer">
                <Trash2 size={16} />
              </Button>
            </div>
            {picking === c.id && (
              <IconPicker
                value={c.icon}
                onPick={async (value) => {
                  patch(c.id, { icon: value });
                  setPicking(null);
                  await updateCategory(c.id, { icon: value });
                }}
              />
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="flex flex-col gap-2 border-t border-line pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Nouvelle catégorie</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPicking(picking === "new" ? null : "new")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-xl"
            aria-label="Choisir une icône"
          >
            {icon ?? <span className="text-sm text-muted">＋</span>}
          </button>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Maison, nourriture, transports…" />
          <Button type="submit" variant="primary" className="h-11 shrink-0" disabled={!name.trim()}>
            Ajouter
          </Button>
        </div>
        {picking === "new" && (
          <IconPicker
            value={icon}
            onPick={(value) => {
              setIcon(value);
              setPicking(null);
            }}
          />
        )}
        {error && <p className="text-sm text-accent">{error}</p>}
      </form>
    </div>
  );
}
