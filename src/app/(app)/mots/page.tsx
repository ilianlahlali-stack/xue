"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BookOpen, FolderPlus, GraduationCap, Plus, Search, Settings2, Sparkles, X } from "lucide-react";
import { addCategory, addWordsToCategory, listCategories, listWords } from "@/lib/db";
import { matchesSearch } from "@/lib/pinyin";
import type { SearchMatch } from "@/lib/ai/search";
import type { Category, Word } from "@/lib/types";
import { Button, Chip, cx, EmptyState, Input, Page, PageHeader, Segmented, Sheet, Spinner } from "@/components/ui";
import { CategoryManager, nextCategoryPosition } from "@/components/Categories";
import { useStoredFlag } from "@/components/Quiz";
import SpeakButton from "@/components/SpeakButton";
import WordForm from "@/components/WordForm";
import VocabTabs from "@/components/VocabTabs";

type Filter = { type: "all" } | { type: "expressions" } | { type: "uncategorized" } | { type: "category"; id: string };
type ThemeSearch = { query: string; matches: SearchMatch[] | null; error?: string };
type Group = { key: string; title: string; icon?: string | null; words: Word[] };

export default function WordsPage() {
  const [words, setWords] = useState<Word[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>({ type: "all" });
  const [grouped, setGrouped] = useStoredFlag("words.grouped", false);
  const [editing, setEditing] = useState<Word | "new" | null>(null);
  const [managing, setManaging] = useState(false);
  const [theme, setTheme] = useState<ThemeSearch | null>(null);

  function reload() {
    listWords().then(setWords);
    listCategories().then(setCategories);
  }

  useEffect(reload, []);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.position - b.position), [categories]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of words ?? []) for (const id of w.category_ids) map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  }, [words]);
  const expressionCount = (words ?? []).filter((w) => w.kind === "expression").length;
  const uncategorizedCount = (words ?? []).filter((w) => w.category_ids.length === 0).length;

  const visible = useMemo(
    () =>
      (words ?? []).filter((w) => {
        if (filter.type === "expressions" && w.kind !== "expression") return false;
        if (filter.type === "uncategorized" && w.category_ids.length) return false;
        if (filter.type === "category" && !w.category_ids.includes(filter.id)) return false;
        return matchesSearch(query, [w.hanzi ?? "", w.pinyin, w.translation, w.literal, w.notes]);
      }),
    [words, query, filter]
  );

  const groups: Group[] = useMemo(() => {
    if (!grouped || filter.type !== "all" || query) return [{ key: "all", title: "", words: visible }];
    const out: Group[] = [];
    const expressions = visible.filter((w) => w.kind === "expression");
    if (expressions.length) out.push({ key: "expressions", title: "Expressions & chengyu", icon: "💬", words: expressions });
    for (const c of sortedCategories) {
      const inCategory = visible.filter((w) => w.kind === "word" && w.category_ids.includes(c.id));
      if (inCategory.length) out.push({ key: c.id, title: c.name, icon: c.icon, words: inCategory });
    }
    const loose = visible.filter((w) => w.kind === "word" && w.category_ids.length === 0);
    if (loose.length) out.push({ key: "none", title: "Sans catégorie", words: loose });
    return out;
  }, [grouped, filter, query, visible, sortedCategories]);

  function saved(word: Word) {
    setWords((prev) => {
      const list = prev ?? [];
      return list.some((w) => w.id === word.id) ? list.map((w) => (w.id === word.id ? word : w)) : [word, ...list];
    });
    setEditing(null);
  }

  async function searchTheme(e?: FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setTheme({ query: q, matches: null });
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur inconnue");
      setTheme({ query: q, matches: data.matches });
    } catch (err) {
      setTheme({ query: q, matches: [], error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function saveThemeAsCategory() {
    if (!theme?.matches?.length) return;
    const name = theme.query.charAt(0).toUpperCase() + theme.query.slice(1);
    const existing = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
    const category = existing ?? (await addCategory({ name, icon: "✨", position: nextCategoryPosition(categories) }));
    await addWordsToCategory(
      theme.matches.map((m) => m.id),
      category.id
    );
    setTheme(null);
    setQuery("");
    setFilter({ type: "category", id: category.id });
    reload();
  }

  const defaultKind = filter.type === "expressions" ? "expression" : "word";
  const defaultCategoryIds = filter.type === "category" ? [filter.id] : [];

  return (
    <Page>
      <VocabTabs />
      <PageHeader
        title="Mots connus"
        subtitle={
          words
            ? `${words.length - expressionCount} mot${words.length - expressionCount > 1 ? "s" : ""} · ${expressionCount} expression${expressionCount > 1 ? "s" : ""}`
            : undefined
        }
        actions={
          <>
            <Link href="/mots/test">
              <Button>
                <GraduationCap size={18} /> Tester
              </Button>
            </Link>
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus size={18} /> Ajouter
            </Button>
          </>
        }
      />

      {words === null ? (
        <div className="flex justify-center py-20 text-muted">
          <Spinner />
        </div>
      ) : words.length === 0 ? (
        <EmptyState icon={<BookOpen size={32} />} title="Aucun mot pour l'instant">
          Ajoute ton premier mot : tape les caractères, le pinyin se remplit tout seul.
          <div className="mt-4">
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus size={18} /> Ajouter un mot
            </Button>
          </div>
        </EmptyState>
      ) : (
        <>
          <form onSubmit={searchTheme} className="relative mb-2">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              className="pl-10 pr-10"
              placeholder="Chercher (caractères, pinyin, français) ou un thème"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (theme) setTheme(null);
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setTheme(null);
                }}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-ink"
                aria-label="Effacer la recherche"
              >
                <X size={16} />
              </button>
            )}
          </form>
          {query.trim() && !theme && (
            <button
              onClick={() => searchTheme()}
              className="mb-4 inline-flex items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn transition hover:brightness-95"
            >
              <Sparkles size={16} /> Tous mes mots liés à « {query.trim()} » (IA)
            </button>
          )}

          {theme ? (
            <ThemeResults
              theme={theme}
              words={words}
              categoryById={categoryById}
              onOpen={setEditing}
              onClose={() => setTheme(null)}
              onSaveAsCategory={saveThemeAsCategory}
            />
          ) : (
            <>
              <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
                <Chip active={filter.type === "all"} onClick={() => setFilter({ type: "all" })}>
                  Tout · {words.length}
                </Chip>
                <Chip active={filter.type === "expressions"} onClick={() => setFilter({ type: "expressions" })}>
                  💬 Expressions · {expressionCount}
                </Chip>
                {sortedCategories.map((c) => (
                  <Chip
                    key={c.id}
                    active={filter.type === "category" && filter.id === c.id}
                    onClick={() => setFilter({ type: "category", id: c.id })}
                  >
                    {c.icon ? `${c.icon} ` : ""}
                    {c.name} · {counts.get(c.id) ?? 0}
                  </Chip>
                ))}
                {uncategorizedCount > 0 && categories.length > 0 && (
                  <Chip active={filter.type === "uncategorized"} onClick={() => setFilter({ type: "uncategorized" })}>
                    Sans catégorie · {uncategorizedCount}
                  </Chip>
                )}
                <button
                  onClick={() => setManaging(true)}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-dashed border-line px-3 text-sm text-muted hover:text-ink"
                >
                  <Settings2 size={14} /> Catégories
                </button>
              </div>

              {filter.type === "all" && !query && (
                <div className="mb-4">
                  <Segmented
                    value={grouped ? "grouped" : "recent"}
                    onChange={(v) => setGrouped(v === "grouped")}
                    options={[
                      { value: "recent", label: "Récents" },
                      { value: "grouped", label: "Par catégorie" },
                    ]}
                  />
                </div>
              )}

              <div className="flex flex-col gap-6">
                {groups.map((group) => (
                  <section key={group.key}>
                    {group.title && (
                      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
                        {group.icon && <span className="text-base">{group.icon}</span>}
                        {group.title}
                        <span className="font-normal">· {group.words.length}</span>
                      </h2>
                    )}
                    <WordGrid words={group.words} categoryById={categoryById} onOpen={setEditing} />
                  </section>
                ))}
              </div>
              {visible.length === 0 && (
                <p className="py-10 text-center text-sm text-muted">
                  {query ? "Aucun mot ne correspond. Essaie la recherche par thème ✨ ci-dessus." : "Aucun mot ici pour l'instant."}
                </p>
              )}
            </>
          )}
        </>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Ajouter au vocabulaire" : "Modifier"}
      >
        {editing !== null && (
          <WordForm
            key={editing === "new" ? "new" : editing.id}
            word={editing === "new" ? undefined : editing}
            defaultKind={defaultKind}
            defaultCategoryIds={defaultCategoryIds}
            categories={sortedCategories}
            onCategoryCreated={(c) => setCategories((prev) => [...prev, c])}
            onSaved={saved}
            onDeleted={(id) => {
              setWords((prev) => (prev ?? []).filter((w) => w.id !== id));
              setEditing(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={managing} onClose={() => setManaging(false)} title="Catégories">
        {managing && (
          <CategoryManager
            categories={categories}
            counts={counts}
            onChange={(next) => {
              setCategories(next);
              // A deleted category disappears from the words too.
              const ids = new Set(next.map((c) => c.id));
              setWords((prev) => (prev ?? []).map((w) => ({ ...w, category_ids: w.category_ids.filter((id) => ids.has(id)) })));
              if (filter.type === "category" && !ids.has(filter.id)) setFilter({ type: "all" });
            }}
          />
        )}
      </Sheet>
    </Page>
  );
}

function WordGrid({
  words,
  categoryById,
  onOpen,
  reasons,
}: {
  words: Word[];
  categoryById: Map<string, Category>;
  onOpen: (word: Word) => void;
  reasons?: Map<string, string>;
}) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {words.map((w) => {
        const icons = w.category_ids.map((id) => categoryById.get(id)?.icon).filter(Boolean);
        const expression = w.kind === "expression";
        return (
          <li key={w.id} className={cx(expression && "sm:col-span-2 xl:col-span-3")}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onOpen(w)}
              onKeyDown={(e) => e.key === "Enter" && onOpen(w)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left transition hover:border-accent/40"
            >
              <div className="min-w-0 flex-1">
                {/* Pinyin first: it's what this section is about; characters come second, smaller. */}
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-xl font-medium text-accent">{w.pinyin}</span>
                  {w.hanzi && (
                    <span lang="zh-Hans" className="hz text-base text-ink/70">
                      {w.hanzi}
                    </span>
                  )}
                </div>
                <p className="truncate text-sm text-muted">
                  {expression && "💬 "}
                  {w.translation || "—"}
                  {w.literal && <span className="italic"> · litt. « {w.literal} »</span>}
                </p>
                {reasons?.get(w.id) && <p className="mt-0.5 truncate text-xs text-warn">✨ {reasons.get(w.id)}</p>}
              </div>
              {icons.length > 0 && <span className="shrink-0 text-sm">{icons.slice(0, 3).join("")}</span>}
              {w.source === "practice" && <Sparkles size={14} className="shrink-0 text-warn" aria-label="Ajouté depuis Practice" />}
              {w.hanzi && <SpeakButton text={w.hanzi} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ThemeResults({
  theme,
  words,
  categoryById,
  onOpen,
  onClose,
  onSaveAsCategory,
}: {
  theme: ThemeSearch;
  words: Word[];
  categoryById: Map<string, Category>;
  onOpen: (word: Word) => void;
  onClose: () => void;
  onSaveAsCategory: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const byId = new Map(words.map((w) => [w.id, w]));
  const found = (theme.matches ?? []).map((m) => byId.get(m.id)).filter((w): w is Word => Boolean(w));
  const reasons = new Map((theme.matches ?? []).map((m) => [m.id, m.why]));

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex flex-1 items-center gap-2 font-semibold">
          <Sparkles size={18} className="text-warn" />
          Liés à « {theme.query} »
          {theme.matches && <span className="font-normal text-muted">· {found.length}</span>}
        </h2>
        {found.length > 0 && (
          <Button
            size="sm"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onSaveAsCategory();
            }}
          >
            <FolderPlus size={15} /> En faire une catégorie
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X size={15} /> Fermer
        </Button>
      </div>
      {theme.matches === null ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted">
          <Spinner /> L&apos;IA parcourt tes mots…
        </div>
      ) : theme.error ? (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">{theme.error}</p>
      ) : found.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Aucun de tes mots n&apos;est lié à ce thème pour l&apos;instant.</p>
      ) : (
        <WordGrid words={found} categoryById={categoryById} onOpen={onOpen} reasons={reasons} />
      )}
    </section>
  );
}
