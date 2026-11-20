"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  FolderInput,
  ListTree,
  MessagesSquare,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import {
  addSection,
  deleteSection,
  getSectionContent,
  listSections,
  updateSection,
} from "@/lib/db";
import type { GrammarSection } from "@/lib/types";
import { Button, cx, EmptyState, Sheet, Spinner } from "@/components/ui";
import AiGrammar from "@/components/AiGrammar";
import ExercisePicker from "@/components/ExercisePicker";

const GrammarEditor = dynamic(() => import("@/components/GrammarEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center py-16 text-muted">
      <Spinner />
    </div>
  ),
});

const ICONS = ["📘", "📗", "📙", "📕", "🧩", "🔑", "⭐", "✨", "💬", "🗣️", "👤", "👥", "❓", "🔁", "⏳", "📍", "🔢", "🎯", "🧠", "📝", "⚖️", "🔗", "🚫", "✅"];

type Tree = Map<string | null, GrammarSection[]>;

function buildTree(sections: GrammarSection[]): Tree {
  const tree: Tree = new Map();
  for (const s of [...sections].sort((a, b) => a.position - b.position)) {
    const list = tree.get(s.parent_id) ?? [];
    list.push(s);
    tree.set(s.parent_id, list);
  }
  return tree;
}

function descendants(tree: Tree, id: string): string[] {
  return (tree.get(id) ?? []).flatMap((child) => [child.id, ...descendants(tree, child.id)]);
}

function ancestorsOf(sections: GrammarSection[], id: string): string[] {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const out: string[] = [];
  for (let p = byId.get(id)?.parent_id ?? null; p; p = byId.get(p)?.parent_id ?? null) out.push(p);
  return out;
}

function nextPosition(tree: Tree, parentId: string | null) {
  return Math.max(0, ...(tree.get(parentId) ?? []).map((s) => s.position)) + 1;
}

/** Debounced writer that can be flushed (on section switch, tab hide, unmount). */
function useDebouncedSave(delay: number, onStatus: (saving: boolean) => void) {
  const pending = useRef<Map<string, () => Promise<void>>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const jobs = [...pending.current.values()];
    pending.current.clear();
    if (!jobs.length) return;
    await Promise.all(jobs.map((job) => job()));
    if (!pending.current.size) onStatus(false);
  }, [onStatus]);

  const schedule = useCallback(
    (key: string, job: () => Promise<void>) => {
      pending.current.set(key, job);
      onStatus(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [delay, flush, onStatus]
  );

  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  return { schedule, flush };
}

export default function StructurePage() {
  return (
    <Suspense>
      <Structure />
    </Suspense>
  );
}

function Structure() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("s");

  const [sections, setSections] = useState<GrammarSection[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [content, setContent] = useState<{ id: string; doc: unknown } | null>(null);
  const [saving, setSaving] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [moving, setMoving] = useState(false);
  const [picking, setPicking] = useState(false);
  /** Where the "Ajouter avec l'IA" sheet files the note by default (null = closed). */
  const [aiParent, setAiParent] = useState<"auto" | string | null>(null);
  const [pickingExercise, setPickingExercise] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const { schedule, flush } = useDebouncedSave(800, setSaving);

  useEffect(() => {
    listSections().then((list) => {
      setSections(list);
      if (selectedId) setExpanded(new Set(ancestorsOf(list, selectedId)));
    });
    // Only on first load: later navigation expands ancestors in select().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tree = useMemo(() => buildTree(sections ?? []), [sections]);
  const selected = sections?.find((s) => s.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    getSectionContent(selectedId).then((doc) => !cancelled && setContent({ id: selectedId, doc }));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function select(id: string | null) {
    await flush();
    setDrawer(false);
    if (id && sections) setExpanded((prev) => new Set([...prev, ...ancestorsOf(sections, id)]));
    router.push(id ? `/structure?s=${id}` : "/structure");
  }

  function patchLocal(id: string, patch: Partial<GrammarSection>) {
    setSections((prev) => (prev ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function create(parentId: string | null) {
    const section = await addSection({
      parent_id: parentId,
      title: parentId ? "Nouvelle sous-section" : "Nouvelle section",
      position: nextPosition(tree, parentId),
    });
    setSections((prev) => [...(prev ?? []), section]);
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
    await select(section.id);
    setTimeout(() => titleRef.current?.select(), 300);
  }

  async function move(direction: -1 | 1) {
    if (!selected) return;
    const siblings = tree.get(selected.parent_id) ?? [];
    const index = siblings.findIndex((s) => s.id === selected.id);
    const other = siblings[index + direction];
    if (!other) return;
    patchLocal(selected.id, { position: other.position });
    patchLocal(other.id, { position: selected.position });
    await Promise.all([
      updateSection(selected.id, { position: other.position }),
      updateSection(other.id, { position: selected.position }),
    ]);
  }

  async function reparent(parentId: string | null) {
    if (!selected) return;
    const position = nextPosition(tree, parentId);
    patchLocal(selected.id, { parent_id: parentId, position });
    setMoving(false);
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
    await updateSection(selected.id, { parent_id: parentId, position });
  }

  async function remove() {
    if (!selected) return;
    const children = descendants(tree, selected.id).length;
    const message = children
      ? `Supprimer « ${selected.title} » et ses ${children} sous-section${children > 1 ? "s" : ""} ?`
      : `Supprimer « ${selected.title} » ?`;
    if (!confirm(message)) return;
    const gone = new Set([selected.id, ...descendants(tree, selected.id)]);
    await deleteSection(selected.id);
    setSections((prev) => (prev ?? []).filter((s) => !gone.has(s.id)));
    await select(selected.parent_id);
  }

  const treePanel = sections && (
    <SectionTree
      tree={tree}
      selectedId={selectedId}
      expanded={expanded}
      onToggle={(id) =>
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })
      }
      onSelect={select}
      onCreateRoot={() => create(null)}
      onCreateAi={() => setAiParent("auto")}
      onCreateExercise={() => setPickingExercise(true)}
    />
  );

  if (sections === null) {
    return (
      <div className="flex justify-center py-24 text-muted">
        <Spinner />
      </div>
    );
  }

  const siblings = selected ? (tree.get(selected.parent_id) ?? []) : [];
  const siblingIndex = selected ? siblings.findIndex((s) => s.id === selected.id) : -1;
  const children = selected ? (tree.get(selected.id) ?? []) : [];

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 overflow-y-auto border-r border-line bg-surface/60 px-3 py-6 lg:block">
        {treePanel}
      </aside>

      <div className="min-w-0 flex-1">
        {!selected ? (
          <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-10 md:px-8 md:pt-10">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Structure</h1>
            <p className="mt-1 mb-6 text-sm text-muted">
              Tes règles de grammaire, découpées comme tu veux : sections, sous-sections, sous-sous-sections…
            </p>
            {sections.length === 0 ? (
              <EmptyState icon={<ListTree size={32} />} title="Aucune section pour l'instant">
                Crée une première section, par exemple « Pronoms », « 的 » ou « 会 / 不会 », puis colle ou écris tes notes.
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button onClick={() => create(null)}>
                    <Plus size={18} /> Nouvelle section
                  </Button>
                  <Button variant="primary" onClick={() => setAiParent("auto")}>
                    <Sparkles size={18} /> Ajouter avec l&apos;IA
                  </Button>
                </div>
              </EmptyState>
            ) : (
              <div className="lg:hidden">{treePanel}</div>
            )}
            {sections.length > 0 && (
              <p className="hidden text-sm text-muted lg:block">Choisis une section à gauche, ou crées-en une nouvelle.</p>
            )}
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-24 md:px-8 md:pt-8">
            <div className="mb-4 flex items-center justify-between gap-2 lg:hidden">
              <Button variant="ghost" size="sm" onClick={() => select(null)}>
                <ArrowLeft size={16} /> Sections
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDrawer(true)}>
                <ListTree size={16} /> Arborescence
              </Button>
            </div>

            <Breadcrumb sections={sections} section={selected} onSelect={select} />

            <div className="mt-2 flex items-start gap-2">
              <button
                onClick={() => setPicking(true)}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-3xl hover:bg-surface-2"
                aria-label="Choisir une icône"
              >
                {selected.icon || <span className="text-xl text-muted">＋</span>}
              </button>
              <input
                ref={titleRef}
                value={selected.title}
                onChange={(e) => {
                  const title = e.target.value;
                  patchLocal(selected.id, { title });
                  schedule(`title-${selected.id}`, () => updateSection(selected.id, { title: title.trim() || "Sans titre" }));
                }}
                className="hz min-w-0 flex-1 bg-transparent py-1 text-3xl font-semibold tracking-tight outline-none placeholder:text-muted md:text-4xl"
                placeholder="Sans titre"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Button size="sm" onClick={() => create(selected.id)}>
                <Plus size={15} /> Sous-section
              </Button>
              <Button size="sm" onClick={() => setAiParent(selected.id)}>
                <Sparkles size={15} /> Sous-section IA
              </Button>
              <Link href={`/structure/exercice?s=${selected.id}`}>
                <Button size="sm" variant="primary">
                  <Target size={15} /> S&apos;entraîner
                </Button>
              </Link>
              <Button size="sm" variant="ghost" disabled={siblingIndex <= 0} onClick={() => move(-1)} aria-label="Monter">
                <ArrowUp size={15} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={siblingIndex === siblings.length - 1}
                onClick={() => move(1)}
                aria-label="Descendre"
              >
                <ArrowDown size={15} />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMoving(true)}>
                <FolderInput size={15} /> Déplacer
              </Button>
              <button
                onClick={() => {
                  const include = !selected.include_in_practice;
                  patchLocal(selected.id, { include_in_practice: include });
                  updateSection(selected.id, { include_in_practice: include });
                }}
                className={cx(
                  "inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition",
                  selected.include_in_practice ? "bg-good-soft text-good" : "text-muted hover:bg-surface-2"
                )}
                title="Si activé, l'IA de Practice connaît cette règle et l'utilise"
              >
                <MessagesSquare size={15} />
                {selected.include_in_practice ? "Utilisée en Practice" : "Ignorée en Practice"}
              </button>
              <Button size="sm" variant="danger" onClick={remove}>
                <Trash2 size={15} /> Supprimer
              </Button>
              <span className="ml-auto text-xs text-muted">{saving ? "Enregistrement…" : "Enregistré"}</span>
            </div>

            {children.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {children.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => select(c.id)}
                    className="hz inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm hover:border-accent/40"
                  >
                    {c.icon && <span>{c.icon}</span>}
                    {c.title}
                    <ChevronRight size={14} className="text-muted" />
                  </button>
                ))}
              </div>
            )}

            <div className="-mx-4 mt-6 md:-mx-[54px]">
              {content?.id === selected.id ? (
                <GrammarEditor
                  key={selected.id}
                  initialContent={content.doc}
                  onChange={(doc) => schedule(`content-${selected.id}`, () => updateSection(selected.id, { content: doc }))}
                />
              ) : (
                <div className="flex justify-center py-16 text-muted">
                  <Spinner />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Sheet open={drawer} onClose={() => setDrawer(false)} title="Sections">
        {treePanel}
      </Sheet>

      <Sheet open={moving} onClose={() => setMoving(false)} title="Déplacer dans…">
        {selected && (
          <MoveTargets
            tree={tree}
            section={selected}
            onPick={reparent}
          />
        )}
      </Sheet>

      <Sheet open={aiParent !== null} onClose={() => setAiParent(null)} title="Ajouter avec l'IA" wide>
        {aiParent !== null && (
          <AiGrammar
            sections={sections}
            defaultParent={aiParent}
            onCreated={(section) => {
              setSections((prev) => [...(prev ?? []), section]);
              if (section.parent_id) setExpanded((prev) => new Set([...prev, section.parent_id!, ...ancestorsOf(sections, section.parent_id!)]));
              setAiParent(null);
              router.push(`/structure?s=${section.id}`);
            }}
          />
        )}
      </Sheet>

      <Sheet open={pickingExercise} onClose={() => setPickingExercise(false)} title="Créer un exercice">
        {pickingExercise && <ExercisePicker sections={sections} initial={selected ? [selected.id] : []} />}
      </Sheet>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Icône">
        {selected && (
          <div className="grid grid-cols-6 gap-2">
            {ICONS.map((icon) => (
              <button
                key={icon}
                className="flex aspect-square items-center justify-center rounded-xl text-2xl hover:bg-surface-2"
                onClick={() => {
                  patchLocal(selected.id, { icon });
                  updateSection(selected.id, { icon });
                  setPicking(false);
                }}
              >
                {icon}
              </button>
            ))}
            <button
              className="col-span-6 mt-2 h-10 rounded-xl text-sm text-muted hover:bg-surface-2"
              onClick={() => {
                patchLocal(selected.id, { icon: null });
                updateSection(selected.id, { icon: null });
                setPicking(false);
              }}
            >
              Pas d&apos;icône
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function SectionTree({
  tree,
  selectedId,
  expanded,
  onToggle,
  onSelect,
  onCreateRoot,
  onCreateAi,
  onCreateExercise,
}: {
  tree: Tree;
  selectedId: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onCreateRoot: () => void;
  onCreateAi: () => void;
  onCreateExercise: () => void;
}) {
  function renderLevel(parentId: string | null, depth: number) {
    return (tree.get(parentId) ?? []).map((s) => {
      const hasChildren = (tree.get(s.id) ?? []).length > 0;
      const open = expanded.has(s.id);
      return (
        <li key={s.id}>
          <div
            className={cx(
              "group flex items-center rounded-lg pr-2 text-sm transition",
              s.id === selectedId ? "bg-accent-soft text-accent" : "hover:bg-surface-2"
            )}
            style={{ paddingLeft: depth * 14 }}
          >
            <button
              onClick={() => hasChildren && onToggle(s.id)}
              className={cx("flex h-9 w-7 shrink-0 items-center justify-center text-muted", !hasChildren && "invisible")}
              aria-label={open ? "Replier" : "Déplier"}
            >
              <ChevronRight size={14} className={cx("transition", open && "rotate-90")} />
            </button>
            <button onClick={() => onSelect(s.id)} className="hz flex h-9 min-w-0 flex-1 items-center gap-2 text-left">
              <span className="w-5 shrink-0 text-center">{s.icon ?? "·"}</span>
              <span className="truncate">{s.title}</span>
            </button>
          </div>
          {hasChildren && open && <ul>{renderLevel(s.id, depth + 1)}</ul>}
        </li>
      );
    });
  }

  return (
    <div>
      {tree.size > 0 && (
        <Button variant="primary" className="mb-3 w-full" onClick={onCreateExercise}>
          <Target size={16} /> Créer un exercice
        </Button>
      )}
      <div className="mb-2 flex items-center justify-between px-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Sections</span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onCreateAi}>
            <Sparkles size={15} /> IA
          </Button>
          <Button size="sm" variant="ghost" onClick={onCreateRoot}>
            <Plus size={15} /> Nouvelle
          </Button>
        </div>
      </div>
      <ul>{renderLevel(null, 0)}</ul>
    </div>
  );
}

function Breadcrumb({
  sections,
  section,
  onSelect,
}: {
  sections: GrammarSection[];
  section: GrammarSection;
  onSelect: (id: string) => void;
}) {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const chain: GrammarSection[] = [];
  for (let p = section.parent_id; p; p = byId.get(p)?.parent_id ?? null) {
    const parent = byId.get(p);
    if (parent) chain.unshift(parent);
  }
  if (!chain.length) return null;
  return (
    <nav className="hz flex flex-wrap items-center gap-1 text-sm text-muted">
      {chain.map((s) => (
        <span key={s.id} className="flex items-center gap-1">
          <button onClick={() => onSelect(s.id)} className="hover:text-ink">
            {s.icon ? `${s.icon} ` : ""}
            {s.title}
          </button>
          <ChevronRight size={14} />
        </span>
      ))}
    </nav>
  );
}

function MoveTargets({
  tree,
  section,
  onPick,
}: {
  tree: Tree;
  section: GrammarSection;
  onPick: (parentId: string | null) => void;
}) {
  const excluded = new Set([section.id, ...descendants(tree, section.id)]);

  function renderLevel(parentId: string | null, depth: number): ReactNode[] {
    return (tree.get(parentId) ?? [])
      .filter((s) => !excluded.has(s.id))
      .flatMap((s) => [
        <button
          key={s.id}
          disabled={s.id === section.parent_id}
          onClick={() => onPick(s.id)}
          className="hz flex h-10 w-full items-center gap-2 rounded-lg text-left text-sm hover:bg-surface-2 disabled:opacity-40"
          style={{ paddingLeft: 12 + depth * 16 }}
        >
          <span className="w-5 text-center">{s.icon ?? "·"}</span>
          {s.title}
        </button>,
        ...renderLevel(s.id, depth + 1),
      ]);
  }

  return (
    <div className="flex flex-col">
      <button
        disabled={section.parent_id === null}
        onClick={() => onPick(null)}
        className="flex h-10 items-center gap-2 rounded-lg px-3 text-left text-sm font-medium hover:bg-surface-2 disabled:opacity-40"
      >
        ⤒ À la racine
      </button>
      {renderLevel(null, 0)}
    </div>
  );
}
