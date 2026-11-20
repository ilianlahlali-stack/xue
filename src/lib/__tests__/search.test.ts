import { describe, expect, it } from "vitest";
import { buildSearchPrompt, parseSearchMatches } from "@/lib/ai/search";

const words = [
  { id: "a", hanzi: "家", pinyin: "jiā", translation: "maison, famille", literal: "" },
  { id: "b", hanzi: "门", pinyin: "mén", translation: "porte", literal: "" },
  { id: "c", hanzi: "吃", pinyin: "chī", translation: "manger", literal: "" },
  { id: "d", hanzi: null, pinyin: "píngguǒ", translation: "pomme", literal: "" },
];

describe("theme search", () => {
  it("numbers the words in the prompt", () => {
    const prompt = buildSearchPrompt("house", words);
    expect(prompt).toContain("« house »");
    expect(prompt).toContain("2. 门 (mén) — porte");
    expect(prompt).toContain("4. (píngguǒ) — pomme");
  });

  it("maps numbers back to words, skipping bad and repeated ones", () => {
    const raw = '```json\n{"matches":[{"n":1,"why_fr":"le mot lui-même"},{"n":"2","why_fr":"pièce"},{"n":2},{"n":9}]}\n```';
    expect(parseSearchMatches(raw, words)).toEqual([
      { id: "a", why: "le mot lui-même" },
      { id: "b", why: "pièce" },
    ]);
  });

  it("drops loose links and puts the closest first", () => {
    const raw = '{"matches":[{"n":3,"score":2,"why_fr":"a"},{"n":2,"score":1,"why_fr":"b"},{"n":1,"score":3,"why_fr":"c"}]}';
    expect(parseSearchMatches(raw, words)?.map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("accepts an empty answer and rejects garbage", () => {
    expect(parseSearchMatches('{"matches": []}', words)).toEqual([]);
    expect(parseSearchMatches("rien trouvé", words)).toBeNull();
  });
});
