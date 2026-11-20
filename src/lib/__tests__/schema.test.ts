// Runs the Supabase SQL on a real Postgres (PGlite, in memory) before it goes
// anywhere near the live database.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const SUPABASE_STUBS = `
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  grant usage on schema public, auth to authenticated;
  alter default privileges in schema public grant all on tables to authenticated;
`;

const read = (path: string) => readFileSync(path, "utf8");
const V1 = read("src/lib/__tests__/fixtures/schema-v1.sql");
const SCHEMA = read("supabase/schema.sql");
const MIGRATION = read("supabase/migrations/002_categories_expressions_radicals.sql");
const MIGRATION_3 = read("supabase/migrations/003_words_pinyin_first.sql");
const MIGRATION_4 = read("supabase/migrations/004_classifiers.sql");
const MIGRATION_5 = read("supabase/migrations/005_classifier_reviews.sql");

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";

async function database() {
  const pg = new PGlite({ extensions: { pgcrypto } });
  await pg.exec(SUPABASE_STUBS);
  await pg.exec(`insert into auth.users values ('${A}'), ('${B}')`);
  return pg;
}

/** Runs queries as a signed-in user, with RLS applied. */
async function as<T>(pg: PGlite, user: string, sql: string) {
  await pg.exec(`set request.jwt.claim.sub = '${user}'; set role authenticated;`);
  try {
    return (await pg.query<T>(sql)).rows;
  } finally {
    await pg.exec(`reset role; reset request.jwt.claim.sub;`);
  }
}

describe("supabase SQL", () => {
  it("installs from scratch and can be re-run", async () => {
    const pg = await database();
    await pg.exec(SCHEMA);
    await pg.exec(SCHEMA);
    const tables = await pg.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1"
    );
    expect(tables.rows.map((r) => r.table_name)).toEqual([
      "categories", "characters", "classifiers", "conversations", "grammar_sections", "messages",
      "review_cards", "review_logs", "word_categories", "words",
    ]);
  });

  it("migrates an existing database: tags become categories, per user", async () => {
    const pg = await database();
    await pg.exec(V1);
    await pg.exec(`
      insert into words (user_id, hanzi, tags) values
        ('${A}', '家', '{maison, " famille "}'),
        ('${A}', '门', '{maison}'),
        ('${A}', '你', '{}'),
        ('${B}', '家', '{maison}');
    `);
    await pg.exec(MIGRATION);
    await pg.exec(MIGRATION); // safe to re-run
    await pg.exec(SCHEMA); // and the full schema still applies on top

    const categories = await pg.query<{ user_id: string; name: string }>(
      "select user_id, name from categories order by user_id, name"
    );
    expect(categories.rows).toEqual([
      { user_id: A, name: "famille" },
      { user_id: A, name: "maison" },
      { user_id: B, name: "maison" },
    ]);
    const links = await pg.query<{ hanzi: string; name: string; same_user: boolean }>(`
      select w.hanzi, c.name, w.user_id = c.user_id and wc.user_id = w.user_id as same_user
      from word_categories wc join words w on w.id = wc.word_id join categories c on c.id = wc.category_id
      order by w.user_id, w.hanzi, c.name`);
    expect(links.rows).toEqual([
      { hanzi: "家", name: "famille", same_user: true },
      { hanzi: "家", name: "maison", same_user: true },
      { hanzi: "门", name: "maison", same_user: true },
      { hanzi: "家", name: "maison", same_user: true },
    ]);
    const words = await pg.query<{ kind: string; literal: string }>("select distinct kind, literal from words");
    expect(words.rows).toEqual([{ kind: "word", literal: "" }]);
  });

  it("keeps every user's categories private", async () => {
    const pg = await database();
    await pg.exec(SCHEMA);
    await as(pg, A, "insert into categories (name) values ('maison')");
    await as(pg, B, "insert into categories (name) values ('cuisine')");
    expect(await as(pg, A, "select name from categories")).toEqual([{ name: "maison" }]);
    expect(await as(pg, B, "select name from categories")).toEqual([{ name: "cuisine" }]);
    await expect(as(pg, A, `insert into categories (user_id, name) values ('${B}', 'piège')`)).rejects.toThrow(
      /row-level security/
    );
  });

  it("creates review cards for words and expressions, with the new fields", async () => {
    const pg = await database();
    await pg.exec(SCHEMA);
    await as(pg, A, "insert into words (hanzi, pinyin, kind, literal) values ('马马虎虎', 'mǎmahǔhǔ', 'expression', 'cheval cheval tigre tigre')");
    await as(pg, A, "insert into characters (hanzi, is_radical) values ('阝', true)");
    const cards = await as<{ mode: string }>(pg, A, "select mode from review_cards order by mode");
    expect(cards.map((c) => c.mode)).toEqual(["production", "recognition", "writing"]);
    await expect(as(pg, A, "insert into words (hanzi, pinyin, kind) values ('x', 'x', 'autre')")).rejects.toThrow(/words_kind_check/);
  });

  it("adds a character used on its own to the words too — never the other way", async () => {
    const pg = await database();
    await pg.exec(SCHEMA);
    await as(pg, A, "insert into words (hanzi, pinyin, translation) values ('山', 'shān', 'mont (déjà là)')");
    await as(pg, A, `insert into characters (hanzi, pinyin, meaning, is_radical) values
      ('山', 'shān', 'montagne', false), ('水', 'shuǐ', 'eau', false), ('日', 'rì', 'soleil', true), ('们', 'men', 'pluriel', true)`);
    await as(pg, A, "insert into words (hanzi, pinyin, translation) values ('学生', 'xuéshēng', 'élève')");
    expect(await as(pg, A, "select hanzi, translation from words order by hanzi")).toEqual([
      { hanzi: "学生", translation: "élève" },
      { hanzi: "山", translation: "mont (déjà là)" }, // an existing word is left as it is
      { hanzi: "水", translation: "eau" },
    ]);
    expect(await as(pg, A, "select hanzi from characters order by hanzi")).toEqual([
      { hanzi: "们" }, { hanzi: "山" }, { hanzi: "日" }, { hanzi: "水" },
    ]);
    // Removing the asterisk later makes it a word.
    await as(pg, A, "update characters set is_radical = false where hanzi = '日'");
    expect(await as(pg, A, "select count(*)::int as n from words where hanzi = '日'")).toEqual([{ n: 1 }]);
    // Each word added this way has its review cards.
    expect(await as(pg, A, "select count(*)::int as n from review_cards where word_id is not null")).toEqual([{ n: 8 }]);
  });

  it("accepts words known only by their pinyin, but not words without pinyin", async () => {
    const pg = await database();
    await pg.exec(SCHEMA);
    await as(pg, A, "insert into words (pinyin, translation) values ('píngguǒ', 'pomme'), ('xiāngjiāo', 'banane')");
    expect(await as(pg, A, "select count(*)::int as n from words where hanzi is null")).toEqual([{ n: 2 }]);
    await expect(as(pg, A, "insert into words (hanzi) values ('苹果')")).rejects.toThrow(/words_pinyin_required/);
  });

  it("migration 003 turns the existing characters into words, once", async () => {
    const pg = await database();
    await pg.exec(V1);
    await pg.exec(MIGRATION);
    await pg.exec(`
      insert into words (user_id, hanzi, pinyin, translation) values ('${A}', '叫', 'jiào', 's''appeler');
      insert into characters (user_id, hanzi, pinyin, meaning, is_radical) values
        ('${A}', '叫', 'jiào', 'appeler', false), ('${A}', '山', 'shān', 'montagne', false),
        ('${A}', '口', 'kǒu', 'bouche', true), ('${B}', '水', 'shuǐ', 'eau', false);
    `);
    await pg.exec(MIGRATION_3);
    await pg.exec(MIGRATION_3);
    await pg.exec(SCHEMA);
    const words = await pg.query<{ user_id: string; hanzi: string; translation: string }>(
      "select user_id, hanzi, translation from words order by user_id, hanzi"
    );
    expect(words.rows).toEqual([
      { user_id: A, hanzi: "叫", translation: "s'appeler" },
      { user_id: A, hanzi: "山", translation: "montagne" },
      { user_id: B, hanzi: "水", translation: "eau" },
    ]);
  });

  it("stores private classifiers, pinyin required, on top of the earlier migrations", async () => {
    const pg = await database();
    await pg.exec(V1);
    await pg.exec(MIGRATION);
    await pg.exec(MIGRATION_3);
    await pg.exec(MIGRATION_4);
    await pg.exec(MIGRATION_4);
    await pg.exec(SCHEMA);
    await as(pg, A, "insert into classifiers (pinyin, hanzi, applies_to, examples) values ('zhī', '只', 'animaux', '一只羊')");
    await as(pg, B, "insert into classifiers (pinyin, applies_to) values ('bēi', 'boissons')");
    expect(await as(pg, A, "select pinyin, hanzi, applies_to from classifiers")).toEqual([
      { pinyin: "zhī", hanzi: "只", applies_to: "animaux" },
    ]);
    await expect(as(pg, A, "insert into classifiers (hanzi) values ('个')")).rejects.toThrow(/null value|violates/);
    await expect(as(pg, A, "insert into classifiers (pinyin) values ('  ')")).rejects.toThrow(/check constraint/);
  });

  it("gives every classifier a review card, existing ones included", async () => {
    const pg = await database();
    await pg.exec(V1);
    await pg.exec(MIGRATION);
    await pg.exec(MIGRATION_3);
    await pg.exec(MIGRATION_4);
    await as(pg, A, "insert into classifiers (pinyin, hanzi, applies_to) values ('gè', '个', 'universel')");
    await pg.exec(MIGRATION_5);
    await pg.exec(MIGRATION_5);
    await pg.exec(SCHEMA);
    await as(pg, A, "insert into classifiers (pinyin, hanzi, applies_to) values ('zhī', '只', 'animaux')");
    await as(pg, A, "insert into words (hanzi, pinyin) values ('羊', 'yáng')");
    const cards = await as<{ pinyin: string | null; mode: string }>(
      pg,
      A,
      "select c.pinyin, r.mode from review_cards r left join classifiers c on c.id = r.classifier_id where r.classifier_id is not null order by 1"
    );
    expect(cards).toEqual([
      { pinyin: "gè", mode: "production" },
      { pinyin: "zhī", mode: "production" },
    ]);
    // A card belongs to exactly one thing.
    await expect(
      as(pg, A, "insert into review_cards (word_id, classifier_id, mode) select w.id, c.id, 'recognition' from words w, classifiers c limit 1")
    ).rejects.toThrow(/review_cards_one_item/);
    await as(pg, A, "delete from classifiers where pinyin = 'gè'");
    expect(await as(pg, A, "select count(*)::int as n from review_cards where classifier_id is not null")).toEqual([{ n: 1 }]);
  });
});
