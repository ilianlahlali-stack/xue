// Export of everything the user owns into one JSON file, and restore from it —
// into the same account or a brand-new database. Works through a tiny `BackupDb`
// interface so the exact same code is tested against a real Postgres.
import { z } from "zod";

export const BACKUP_APP = "xue";
export const BACKUP_VERSION = 1;

/** Exported columns per table (never user_id: a restore belongs to whoever restores). */
export const BACKUP_TABLES = {
  categories: "id, name, icon, position, created_at",
  words: "id, hanzi, pinyin, translation, literal, notes, kind, source, created_at",
  word_categories: "word_id, category_id",
  characters: "id, hanzi, pinyin, meaning, notes, is_radical, created_at",
  review_cards: "id, word_id, character_id, classifier_id, mode, fsrs, due, created_at",
  review_logs: "id, card_id, rating, reviewed_at",
  grammar_sections: "id, parent_id, title, icon, content, position, include_in_practice, created_at, updated_at",
  conversations: "id, title, topic, created_at, updated_at",
  messages: "id, conversation_id, role, content, payload, created_at",
  classifiers: "id, pinyin, hanzi, applies_to, examples, notes, created_at",
} as const;

export type TableName = keyof typeof BACKUP_TABLES;
export const TABLE_NAMES = Object.keys(BACKUP_TABLES) as TableName[];
type Row = Record<string, unknown>;

export type Backup = {
  app: typeof BACKUP_APP;
  version: number;
  exported_at: string;
  data: Record<TableName, Row[]>;
};

export interface BackupDb {
  selectAll(table: TableName, columns: string): Promise<Row[]>;
  upsert(table: TableName, rows: Row[], options: { onConflict: string; ignoreDuplicates?: boolean }): Promise<void>;
}

export async function exportBackup(db: BackupDb, now = new Date()): Promise<Backup> {
  const entries = await Promise.all(TABLE_NAMES.map(async (t) => [t, await db.selectAll(t, BACKUP_TABLES[t])] as const));
  return { app: BACKUP_APP, version: BACKUP_VERSION, exported_at: now.toISOString(), data: Object.fromEntries(entries) as Backup["data"] };
}

export function backupCounts(backup: Backup) {
  const d = backup.data;
  return {
    words: d.words.filter((w) => w.kind !== "expression").length,
    expressions: d.words.filter((w) => w.kind === "expression").length,
    characters: d.characters.length,
    categories: d.categories.length,
    classifiers: d.classifiers.length,
    sections: d.grammar_sections.length,
    conversations: d.conversations.length,
  };
}

/** Older copies kept on the device were counted before classifiers existed. */
export function describeCounts(c: Omit<ReturnType<typeof backupCounts>, "classifiers"> & { classifiers?: number }) {
  return [
    `${c.words} mot${c.words > 1 ? "s" : ""}`,
    `${c.expressions} expression${c.expressions > 1 ? "s" : ""}`,
    `${c.characters} caractère${c.characters > 1 ? "s" : ""}`,
    `${c.categories} catégorie${c.categories > 1 ? "s" : ""}`,
    `${c.classifiers ?? 0} classificateur${(c.classifiers ?? 0) > 1 ? "s" : ""}`,
    `${c.sections} section${c.sections > 1 ? "s" : ""} de grammaire`,
    `${c.conversations} conversation${c.conversations > 1 ? "s" : ""}`,
  ].join(" · ");
}

const backupSchema = z.object({
  app: z.literal(BACKUP_APP),
  version: z.number().int().min(1),
  exported_at: z.string(),
  data: z.object(Object.fromEntries(TABLE_NAMES.map((t) => [t, z.array(z.record(z.string(), z.unknown())).default([])])) as Record<
    TableName,
    z.ZodDefault<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>>
  >),
});

/** Reads a backup file's text; throws a French message if it isn't one. */
export function parseBackup(text: string): Backup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde Xué (JSON illisible).");
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) throw new Error("Ce fichier n'est pas une sauvegarde Xué valide.");
  if (parsed.data.version > BACKUP_VERSION) throw new Error("Sauvegarde faite avec une version plus récente de l'app.");
  return parsed.data as Backup;
}

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const CHUNK = 500;

async function upsertAll(db: BackupDb, table: TableName, rows: Row[], options: { onConflict: string; ignoreDuplicates?: boolean }) {
  for (let i = 0; i < rows.length; i += CHUNK) await db.upsert(table, rows.slice(i, i + CHUNK), options);
}

/** Parents before children, so every parent_id already exists when its child arrives. */
export function parentsFirst(sections: Row[]): Row[] {
  const byId = new Map(sections.map((s) => [s.id as string, s]));
  const done = new Set<string>();
  const out: Row[] = [];
  const visit = (s: Row, depth = 0) => {
    const id = s.id as string;
    if (done.has(id) || depth > sections.length) return;
    const parent = s.parent_id ? byId.get(s.parent_id as string) : undefined;
    if (parent) visit(parent, depth + 1);
    done.add(id);
    out.push(s);
  };
  sections.forEach((s) => visit(s));
  return out;
}

export type RestoreProgress = (step: string) => void;

/**
 * Merges a backup into the signed-in account. Words, characters and categories
 * are matched by their text (so nothing is duplicated if it already exists);
 * review progress, grammar sections and conversations come back as they were.
 * Safe to run twice.
 */
export async function restoreBackup(db: BackupDb, backup: Backup, progress: RestoreProgress = () => {}) {
  const d = backup.data;

  progress("Catégories");
  await upsertAll(
    db,
    "categories",
    d.categories.map((c) => ({ name: str(c.name), icon: c.icon ?? null, position: Number(c.position ?? 0) })),
    { onConflict: "user_id,name" }
  );
  const categoryByName = new Map((await db.selectAll("categories", "id, name")).map((c) => [c.name as string, c.id as string]));
  const categoryId = new Map(d.categories.map((c) => [c.id as string, categoryByName.get(str(c.name))]));

  progress("Mots");
  const wordRow = (w: Row) => ({
    pinyin: str(w.pinyin),
    translation: str(w.translation),
    literal: str(w.literal),
    notes: str(w.notes),
    kind: w.kind === "expression" ? "expression" : "word",
    source: w.source === "practice" ? "practice" : "manual",
    created_at: str(w.created_at, new Date().toISOString()),
  });
  // Words with characters are matched by their characters; words known only by
  // their pinyin have nothing to match on, so they keep their id.
  const pinyinOnly = d.words.filter((w) => !str(w.hanzi));
  await upsertAll(
    db,
    "words",
    pinyinOnly.map((w) => ({ id: w.id, hanzi: null, ...wordRow(w) })),
    { onConflict: "id" }
  );
  await upsertAll(
    db,
    "words",
    d.words.filter((w) => str(w.hanzi)).map((w) => ({ hanzi: str(w.hanzi), ...wordRow(w) })),
    { onConflict: "user_id,hanzi" }
  );
  const wordByHanzi = new Map((await db.selectAll("words", "id, hanzi")).map((w) => [w.hanzi as string, w.id as string]));
  const wordId = new Map(
    d.words.map((w) => [w.id as string, str(w.hanzi) ? wordByHanzi.get(str(w.hanzi)) : (w.id as string)])
  );

  await upsertAll(
    db,
    "word_categories",
    d.word_categories
      .map((l) => ({ word_id: wordId.get(l.word_id as string), category_id: categoryId.get(l.category_id as string) }))
      .filter((l): l is { word_id: string; category_id: string } => Boolean(l.word_id && l.category_id)),
    { onConflict: "word_id,category_id", ignoreDuplicates: true }
  );

  progress("Caractères");
  await upsertAll(
    db,
    "characters",
    d.characters.map((c) => ({
      hanzi: str(c.hanzi),
      pinyin: str(c.pinyin),
      meaning: str(c.meaning),
      notes: str(c.notes),
      is_radical: c.is_radical === true,
      created_at: str(c.created_at, new Date().toISOString()),
    })),
    { onConflict: "user_id,hanzi" }
  );
  const charByHanzi = new Map((await db.selectAll("characters", "id, hanzi")).map((c) => [c.hanzi as string, c.id as string]));
  const characterId = new Map(d.characters.map((c) => [c.id as string, charByHanzi.get(str(c.hanzi))]));

  progress("Classificateurs");
  await upsertAll(
    db,
    "classifiers",
    d.classifiers.map((c) => ({
      id: c.id,
      pinyin: str(c.pinyin),
      hanzi: str(c.hanzi) || null,
      applies_to: str(c.applies_to),
      examples: str(c.examples),
      notes: str(c.notes),
      created_at: str(c.created_at, new Date().toISOString()),
    })),
    { onConflict: "id" }
  );

  progress("Révisions");
  // Adding a word or character already created its cards: update those in place.
  const cardRows = d.review_cards.map((c) => ({
    word_id: c.word_id ? wordId.get(c.word_id as string) : undefined,
    character_id: c.character_id ? characterId.get(c.character_id as string) : undefined,
    // Classifiers keep their id, so their cards point at the same one.
    classifier_id: c.classifier_id ? (c.classifier_id as string) : undefined,
    mode: str(c.mode),
    fsrs: c.fsrs ?? null,
    due: str(c.due, new Date().toISOString()),
  }));
  await upsertAll(
    db,
    "review_cards",
    cardRows.filter((c) => c.word_id).map(({ word_id, mode, fsrs, due }) => ({ word_id, mode, fsrs, due })),
    { onConflict: "word_id,mode" }
  );
  await upsertAll(
    db,
    "review_cards",
    cardRows.filter((c) => c.character_id).map(({ character_id, mode, fsrs, due }) => ({ character_id, mode, fsrs, due })),
    { onConflict: "character_id,mode" }
  );
  await upsertAll(
    db,
    "review_cards",
    cardRows.filter((c) => c.classifier_id).map(({ classifier_id, mode, fsrs, due }) => ({ classifier_id, mode, fsrs, due })),
    { onConflict: "classifier_id,mode" }
  );
  const cardKey = (c: Row) => `${c.word_id ?? ""}|${c.character_id ?? ""}|${c.classifier_id ?? ""}|${c.mode}`;
  const cardByKey = new Map(
    (await db.selectAll("review_cards", "id, word_id, character_id, classifier_id, mode")).map((c) => [cardKey(c), c.id as string])
  );
  const cardId = new Map(d.review_cards.map((c, i) => [c.id as string, cardByKey.get(cardKey(cardRows[i]))]));
  await upsertAll(
    db,
    "review_logs",
    d.review_logs
      .map((l) => ({ id: l.id, card_id: cardId.get(l.card_id as string), rating: l.rating, reviewed_at: l.reviewed_at }))
      .filter((l) => l.card_id),
    { onConflict: "id", ignoreDuplicates: true }
  );

  progress("Grammaire");
  await upsertAll(
    db,
    "grammar_sections",
    parentsFirst(d.grammar_sections).map((s) => ({
      id: s.id,
      parent_id: s.parent_id ?? null,
      title: str(s.title, "Sans titre"),
      icon: s.icon ?? null,
      content: s.content ?? null,
      position: Number(s.position ?? 0),
      include_in_practice: s.include_in_practice !== false,
      created_at: str(s.created_at, new Date().toISOString()),
    })),
    { onConflict: "id" }
  );

  progress("Conversations");
  await upsertAll(
    db,
    "conversations",
    d.conversations.map((c) => ({
      id: c.id,
      title: str(c.title, "Conversation"),
      topic: str(c.topic),
      created_at: str(c.created_at, new Date().toISOString()),
    })),
    { onConflict: "id" }
  );
  await upsertAll(
    db,
    "messages",
    d.messages.map((m) => ({
      id: m.id,
      conversation_id: m.conversation_id,
      role: m.role === "assistant" ? "assistant" : "user",
      content: str(m.content),
      payload: m.payload ?? null,
      created_at: str(m.created_at, new Date().toISOString()),
    })),
    { onConflict: "id" }
  );

  return backupCounts(backup);
}
