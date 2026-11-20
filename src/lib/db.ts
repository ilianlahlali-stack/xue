// Browser-side data access. Every query is scoped to the signed-in user by RLS.
import { createClient } from "@/lib/supabase/client";
import { review, type Grade } from "@/lib/srs";
import { grammarRuleBlocks } from "@/lib/blocks";
import type { NewGrammar } from "@/lib/ai/schema";
import type { BackupDb } from "@/lib/backup";
import type { Category, Character, Classifier, Conversation, GrammarSection, Message, ReviewCard, Word } from "@/lib/types";

const db = () => createClient();

function check<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------------------------------------------------------------- words

type WordRow = Omit<Word, "category_ids"> & { word_categories?: { category_id: string }[] };

const WORD_SELECT = "id, hanzi, pinyin, translation, literal, notes, kind, source, created_at, word_categories(category_id)";

function toWord({ word_categories, ...row }: WordRow): Word {
  return { ...row, category_ids: (word_categories ?? []).map((l) => l.category_id) };
}

export async function listWords(): Promise<Word[]> {
  const rows = check<WordRow[]>(await db().from("words").select(WORD_SELECT).order("created_at", { ascending: false }));
  return rows.map(toWord);
}

export type WordInput = Pick<Word, "hanzi" | "pinyin" | "translation"> &
  Partial<Pick<Word, "notes" | "source" | "kind" | "literal">>;

async function getWord(id: string): Promise<Word> {
  return toWord(check<WordRow>(await db().from("words").select(WORD_SELECT).eq("id", id).single()));
}

/** Adds a word and files it in the given categories. */
export async function addWord(input: WordInput, categoryIds: string[] = []): Promise<Word> {
  const { id } = check<{ id: string }>(await db().from("words").insert(input).select("id").single());
  await setWordCategories(id, categoryIds);
  return getWord(id);
}

export async function updateWord(id: string, patch: Partial<WordInput>, categoryIds?: string[]): Promise<Word> {
  if (Object.keys(patch).length) check(await db().from("words").update(patch).eq("id", id));
  if (categoryIds) await setWordCategories(id, categoryIds);
  return getWord(id);
}

export async function deleteWord(id: string) {
  check(await db().from("words").delete().eq("id", id));
}

export async function setWordCategories(wordId: string, categoryIds: string[]) {
  const client = db();
  const keep = [...new Set(categoryIds)];
  let removal = client.from("word_categories").delete().eq("word_id", wordId);
  if (keep.length) removal = removal.not("category_id", "in", `(${keep.join(",")})`);
  check(await removal);
  if (keep.length) {
    check(
      await client
        .from("word_categories")
        .upsert(keep.map((category_id) => ({ word_id: wordId, category_id })), { onConflict: "word_id,category_id", ignoreDuplicates: true })
    );
  }
}

/** Adds several words to one category (e.g. the result of a theme search). */
export async function addWordsToCategory(wordIds: string[], categoryId: string) {
  if (!wordIds.length) return;
  check(
    await db()
      .from("word_categories")
      .upsert(wordIds.map((word_id) => ({ word_id, category_id: categoryId })), { onConflict: "word_id,category_id", ignoreDuplicates: true })
  );
}

// ---------------------------------------------------------------- classifiers

export async function listClassifiers(): Promise<Classifier[]> {
  return check(await db().from("classifiers").select("*").order("created_at"));
}

export type ClassifierInput = Pick<Classifier, "pinyin" | "hanzi" | "applies_to" | "examples" | "notes">;

export async function addClassifier(input: ClassifierInput): Promise<Classifier> {
  return check(await db().from("classifiers").insert(input).select().single());
}

export async function updateClassifier(id: string, patch: Partial<ClassifierInput>): Promise<Classifier> {
  return check(await db().from("classifiers").update(patch).eq("id", id).select().single());
}

export async function deleteClassifier(id: string) {
  check(await db().from("classifiers").delete().eq("id", id));
}

// ---------------------------------------------------------------- categories

export async function listCategories(): Promise<Category[]> {
  return check(await db().from("categories").select("id, name, icon, position").order("position").order("name"));
}

export async function addCategory(input: { name: string; icon?: string | null; position: number }): Promise<Category> {
  return check(await db().from("categories").insert(input).select("id, name, icon, position").single());
}

export async function updateCategory(id: string, patch: Partial<Pick<Category, "name" | "icon" | "position">>) {
  check(await db().from("categories").update(patch).eq("id", id));
}

/** Removes the category only; its words stay. */
export async function deleteCategory(id: string) {
  check(await db().from("categories").delete().eq("id", id));
}

// ---------------------------------------------------------------- characters

export async function listCharacters(): Promise<Character[]> {
  return check(await db().from("characters").select("*").order("created_at", { ascending: false }));
}

export type CharacterInput = Pick<Character, "hanzi" | "pinyin" | "meaning"> &
  Partial<Pick<Character, "notes" | "is_radical" | "created_at">>;

export async function addCharacter(input: CharacterInput): Promise<Character> {
  return check(await db().from("characters").insert(input).select().single());
}

/** Adds the characters that are not known yet; existing ones are left untouched. */
export async function addCharactersIfMissing(inputs: CharacterInput[]) {
  if (!inputs.length) return;
  check(await db().from("characters").upsert(inputs, { onConflict: "user_id,hanzi", ignoreDuplicates: true }));
}

export async function updateCharacter(id: string, patch: Partial<CharacterInput>): Promise<Character> {
  return check(await db().from("characters").update(patch).eq("id", id).select().single());
}

export async function deleteCharacter(id: string) {
  check(await db().from("characters").delete().eq("id", id));
}

// ---------------------------------------------------------------- reviews

export type CardWithItem = ReviewCard & { word: Word | null; character: Character | null; classifier: Classifier | null };

const CARD_COLUMN = { words: "word_id", characters: "character_id", classifiers: "classifier_id" } as const;

/**
 * Cards due now: every card already in rotation, plus up to `newLimit` never-seen
 * cards (oldest first) so a big batch of new words doesn't flood one session.
 */
export async function dueCards(kind: keyof typeof CARD_COLUMN, newLimit = 15): Promise<CardWithItem[]> {
  const now = new Date().toISOString();
  const column = CARD_COLUMN[kind];
  const select = `*, word:words(${WORD_SELECT}), character:characters(*), classifier:classifiers(*)`;
  const [seen, fresh] = await Promise.all([
    db().from("review_cards").select(select).not(column, "is", null).not("fsrs", "is", null).lte("due", now).order("due"),
    db().from("review_cards").select(select).not(column, "is", null).is("fsrs", null).order("created_at").limit(newLimit),
  ]);
  return ([...check(seen), ...check(fresh)] as (CardWithItem & { word: WordRow | null })[]).map((card) => ({
    ...card,
    word: card.word ? toWord(card.word) : null,
  }));
}

export async function recordReview(card: Pick<ReviewCard, "id" | "fsrs">, grade: Grade) {
  const next = review(card.fsrs, grade);
  const client = db();
  check(await client.from("review_cards").update(next).eq("id", card.id));
  check(await client.from("review_logs").insert({ card_id: card.id, rating: grade }));
  return next;
}

export async function dueCounts(): Promise<{ words: number; characters: number; classifiers: number }> {
  const now = new Date().toISOString();
  const count = async (column: (typeof CARD_COLUMN)[keyof typeof CARD_COLUMN]) => {
    const { count } = await db()
      .from("review_cards")
      .select("id", { count: "exact", head: true })
      .not(column, "is", null)
      .lte("due", now);
    return count ?? 0;
  };
  const [words, characters, classifiers] = await Promise.all([count("word_id"), count("character_id"), count("classifier_id")]);
  return { words, characters, classifiers };
}

export async function reviewsSince(since: Date): Promise<number> {
  const { count } = await db()
    .from("review_logs")
    .select("id", { count: "exact", head: true })
    .gte("reviewed_at", since.toISOString());
  return count ?? 0;
}

export async function countRows(table: "words" | "characters" | "grammar_sections"): Promise<number> {
  const { count } = await db().from(table).select("id", { count: "exact", head: true });
  return count ?? 0;
}

// ---------------------------------------------------------------- grammar

export async function listSections(): Promise<GrammarSection[]> {
  return check(
    await db()
      .from("grammar_sections")
      .select("id, parent_id, title, icon, position, include_in_practice, updated_at")
      .order("position")
  );
}

export async function getSectionContent(id: string): Promise<unknown> {
  const { data, error } = await db().from("grammar_sections").select("content").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data?.content ?? null;
}

export async function addSection(input: {
  parent_id: string | null;
  title?: string;
  icon?: string | null;
  position: number;
  content?: unknown;
}): Promise<GrammarSection> {
  return check(
    await db()
      .from("grammar_sections")
      .insert(input)
      .select("id, parent_id, title, icon, position, include_in_practice, updated_at")
      .single()
  );
}

export async function updateSection(
  id: string,
  patch: Partial<Pick<GrammarSection, "title" | "icon" | "parent_id" | "position" | "include_in_practice">> & { content?: unknown }
) {
  check(await db().from("grammar_sections").update(patch).eq("id", id));
}

export async function deleteSection(id: string) {
  check(await db().from("grammar_sections").delete().eq("id", id));
}

export const PRACTICE_INBOX_TITLE = "Découvertes en Practice";

/** Files a rule discovered in Practice under the "Découvertes en Practice" section. */
export async function addGrammarFromPractice(rule: NewGrammar): Promise<GrammarSection> {
  const sections = await listSections();
  let inbox = sections.find((s) => s.parent_id === null && s.title === PRACTICE_INBOX_TITLE);
  if (!inbox) {
    const maxRoot = Math.max(0, ...sections.filter((s) => s.parent_id === null).map((s) => s.position));
    inbox = await addSection({ parent_id: null, title: PRACTICE_INBOX_TITLE, position: maxRoot + 1 });
    await updateSection(inbox.id, { icon: "✨" });
  }
  const inboxId = inbox.id;
  const maxChild = Math.max(0, ...sections.filter((s) => s.parent_id === inboxId).map((s) => s.position));
  return addSection({
    parent_id: inboxId,
    title: rule.title,
    position: maxChild + 1,
    content: grammarRuleBlocks(rule),
  });
}

// ---------------------------------------------------------------- practice

export async function listConversations(): Promise<Conversation[]> {
  return check(await db().from("conversations").select("*").order("updated_at", { ascending: false }));
}

export async function addConversation(input: { title: string; topic: string }): Promise<Conversation> {
  return check(await db().from("conversations").insert(input).select().single());
}

export async function updateConversation(id: string, patch: Partial<Pick<Conversation, "title" | "topic">>) {
  check(await db().from("conversations").update(patch).eq("id", id));
}

export async function deleteConversation(id: string) {
  check(await db().from("conversations").delete().eq("id", id));
}

export async function getConversation(id: string): Promise<Conversation> {
  return check(await db().from("conversations").select("*").eq("id", id).single());
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  return check(
    await db().from("messages").select("*").eq("conversation_id", conversationId).order("created_at")
  );
}

// ---------------------------------------------------------------- backup

/** Backup access through Supabase (paged reads: the API returns at most 1000 rows at a time). */
export function supabaseBackupDb(): BackupDb {
  const client = db();
  const PAGE = 1000;
  return {
    async selectAll(table, columns) {
      const rows: Record<string, unknown>[] = [];
      for (let from = 0; ; from += PAGE) {
        let query = client.from(table).select(columns);
        query = table === "word_categories" ? query.order("word_id").order("category_id") : query.order("id");
        // Column lists are dynamic here, so the typed result is widened to plain rows.
        const { data, error } = await query.range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        const page = (data ?? []) as unknown as Record<string, unknown>[];
        rows.push(...page);
        if (page.length < PAGE) return rows;
      }
    },
    async upsert(table, rows, options) {
      check(await client.from(table).upsert(rows, options));
    },
  };
}
