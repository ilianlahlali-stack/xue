// Export then restore through the real SQL schema (PGlite), the way the app
// talks to Supabase: upserts with ON CONFLICT, RLS on, triggers firing.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { backupCounts, exportBackup, parseBackup, parentsFirst, restoreBackup, type BackupDb } from "@/lib/backup";

const STUBS = `
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  grant usage on schema public, auth to authenticated;
  alter default privileges in schema public grant all on tables to authenticated;
`;
const SCHEMA = readFileSync("supabase/schema.sql", "utf8");
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";

async function database() {
  const pg = new PGlite({ extensions: { pgcrypto } });
  await pg.exec(STUBS);
  await pg.exec(`insert into auth.users values ('${A}'), ('${B}')`);
  await pg.exec(SCHEMA);
  return pg;
}

async function as<T = Record<string, unknown>>(pg: PGlite, user: string, sql: string, params: unknown[] = []) {
  await pg.exec(`set request.jwt.claim.sub = '${user}'; set role authenticated;`);
  try {
    return (await pg.query<T>(sql, params)).rows;
  } finally {
    await pg.exec("reset role; reset request.jwt.claim.sub;");
  }
}

/** Same semantics as supabase-js upsert: union of keys, ON CONFLICT DO UPDATE / DO NOTHING. */
function pgDb(pg: PGlite, user: string): BackupDb {
  return {
    selectAll: (table, columns) => as(pg, user, `select ${columns} from ${table}`),
    async upsert(table, rows, { onConflict, ignoreDuplicates }) {
      if (!rows.length) return;
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      const action = ignoreDuplicates ? "nothing" : `update set ${cols.map((c) => `${c} = excluded.${c}`).join(", ")}`;
      await as(
        pg,
        user,
        `insert into ${table} (${cols.join(", ")}) select ${cols.join(", ")} from json_populate_recordset(null::${table}, $1) on conflict (${onConflict}) do ${action}`,
        [JSON.stringify(rows)]
      );
    },
  };
}

async function seed(pg: PGlite, user: string) {
  await as(pg, user, `insert into categories (name, icon, position) values ('Maison', '🏠', 1), ('Vide', null, 2)`);
  await as(pg, user, `insert into words (hanzi, pinyin, translation) values ('家', 'jiā', 'maison'), ('门', 'mén', 'porte')`);
  await as(pg, user, `insert into words (hanzi, pinyin, translation, literal, kind) values ('马马虎虎', 'mǎmahǔhǔ', 'bof', 'cheval cheval tigre tigre', 'expression')`);
  await as(pg, user, `insert into words (pinyin, translation) values ('píngguǒ', 'pomme (caractères pas encore appris)')`);
  await as(pg, user, `insert into word_categories (word_id, category_id) select w.id, c.id from words w, categories c where w.hanzi in ('家','门') and c.name = 'Maison'`);
  await as(pg, user, `insert into characters (hanzi, pinyin, is_radical) values ('学', 'xué', false), ('阝', 'fù', true)`);
  await as(pg, user, `update review_cards set fsrs = '{"reps": 3, "state": 2}', due = '2030-01-01' where word_id = (select id from words where hanzi = '家') and mode = 'production'`);
  await as(pg, user, `insert into review_logs (card_id, rating) select id, 3 from review_cards where fsrs is not null`);
  // Child inserted before its parent exists in the export order would break a naive restore.
  await as(pg, user, `insert into grammar_sections (id, title, position) values ('10000000-0000-0000-0000-000000000001', 'Pronoms', 1)`);
  await as(pg, user, `insert into grammar_sections (id, parent_id, title, position, content) values ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Possessifs', 1, '[{"type":"paragraph","content":"我的"}]')`);
  await as(pg, user, `insert into classifiers (pinyin, hanzi, applies_to, examples) values ('zhī', '只', 'animaux', '一只羊'), ('bēi', null, 'boissons', '')`);
  await as(pg, user, `update review_cards set fsrs = '{"reps": 1}', due = '2031-05-05' where classifier_id = (select id from classifiers where pinyin = 'zhī')`);
  await as(pg, user, `insert into conversations (id, title) values ('20000000-0000-0000-0000-000000000001', 'Café')`);
  await as(pg, user, `insert into messages (conversation_id, role, content, payload) values ('20000000-0000-0000-0000-000000000001', 'user', 'ni hao', null), ('20000000-0000-0000-0000-000000000001', 'assistant', '你好！', '{"reply":{"hanzi":"你好！"}}')`);
}

const snapshot = async (pg: PGlite, user: string) => ({
  words: await as(pg, user, "select hanzi, pinyin, translation, literal, kind from words order by hanzi, pinyin"),
  links: await as(pg, user, "select w.hanzi, c.name, c.icon from word_categories l join words w on w.id = l.word_id join categories c on c.id = l.category_id order by 1, 2"),
  categories: await as(pg, user, "select name, icon, position from categories order by name"),
  characters: await as(pg, user, "select hanzi, is_radical from characters order by hanzi"),
  cards: await as(pg, user, `select coalesce(w.hanzi, w.pinyin, c.hanzi, cl.pinyin) as item, r.mode, r.fsrs, r.due from review_cards r left join words w on w.id = r.word_id left join characters c on c.id = r.character_id left join classifiers cl on cl.id = r.classifier_id order by 1, 2`),
  logs: await as(pg, user, "select count(*)::int as n from review_logs"),
  sections: await as(pg, user, "select s.title, p.title as parent, s.content from grammar_sections s left join grammar_sections p on p.id = s.parent_id order by s.title"),
  messages: await as(pg, user, "select role, content, payload from messages order by role"),
  classifiers: await as(pg, user, "select pinyin, hanzi, applies_to, examples from classifiers order by pinyin"),
});

describe("backup", () => {
  it("restores everything into a brand-new database, and can be re-run", async () => {
    const source = await database();
    await seed(source, A);
    const file = JSON.stringify(await exportBackup(pgDb(source, A)));
    const backup = parseBackup(file);
    // 学 (used on its own) also became a word when its character was added.
    expect(backupCounts(backup)).toEqual({ words: 4, expressions: 1, characters: 2, categories: 2, classifiers: 2, sections: 2, conversations: 1 });

    const target = await database(); // new project, new user id
    await restoreBackup(pgDb(target, B), backup);
    const expected = await snapshot(source, A);
    expect(await snapshot(target, B)).toEqual(expected);

    await restoreBackup(pgDb(target, B), backup);
    expect(await snapshot(target, B)).toEqual(expected);
  });

  it("merges into an account that still has data, without duplicates", async () => {
    const pg = await database();
    await seed(pg, A);
    const backup = parseBackup(JSON.stringify(await exportBackup(pgDb(pg, A))));
    const before = await snapshot(pg, A);

    await as(pg, A, "update words set translation = 'abîmé' where hanzi = '家'");
    await as(pg, A, "delete from words where hanzi = '门'");
    await as(pg, A, "insert into words (hanzi, pinyin, translation) values ('新', 'xīn', 'ajouté après la sauvegarde')");
    await restoreBackup(pgDb(pg, A), backup);

    const after = await snapshot(pg, A);
    expect(after.words.filter((w) => w.hanzi !== "新")).toEqual(before.words);
    expect(after.words.some((w) => w.hanzi === "新")).toBe(true);
    expect(after.links).toEqual(before.links);
    expect(after.logs).toEqual(before.logs);
    expect(after.sections).toEqual(before.sections);
  });

  it("refuses files that are not backups", () => {
    expect(() => parseBackup("{")).toThrow(/JSON illisible/);
    expect(() => parseBackup('{"app":"autre"}')).toThrow(/pas une sauvegarde/);
    expect(() => parseBackup(JSON.stringify({ app: "xue", version: 99, exported_at: "", data: {} }))).toThrow(/plus récente/);
  });

  it("orders grammar sections parents first", () => {
    const rows = [
      { id: "c", parent_id: "b" },
      { id: "b", parent_id: "a" },
      { id: "a", parent_id: null },
    ];
    expect(parentsFirst(rows).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});
