import { describe, expect, it } from "vitest";
import { describePrompt, parseCharacterList } from "@/lib/ai/characters";

describe("character list from the AI", () => {
  it("keeps one real character per entry, without repeats", () => {
    const raw = JSON.stringify({
      characters: [
        { hanzi: "学", pinyin: "xué", meaning_fr: "étudier", is_radical: false },
        { hanzi: "学", pinyin: "xué", meaning_fr: "doublon" },
        { hanzi: "x", pinyin: "", meaning_fr: "pas un caractère" },
        { hanzi: " 扌", pinyin: "shǒu", meaning_fr: "clé de la main", is_radical: true },
      ],
    });
    expect(parseCharacterList(raw)).toEqual([
      { hanzi: "学", pinyin: "xué", meaning: "étudier", is_radical: false },
      { hanzi: "扌", pinyin: "shǒu", meaning: "clé de la main", is_radical: true },
    ]);
  });

  it("keeps a real alternative reading but fixes a wrong one", () => {
    const raw = JSON.stringify({
      characters: [
        { hanzi: "和", pinyin: "huo2", meaning_fr: "mélanger" },
        { hanzi: "好", pinyin: "hāo", meaning_fr: "bien" },
        { hanzi: "们", meaning_fr: "pluriel" },
      ],
    });
    expect(parseCharacterList(raw)?.map((c) => c.pinyin)).toEqual(["huó", "hǎo", "men"]);
  });

  it("rejects garbage", () => {
    expect(parseCharacterList("je ne vois rien")).toBeNull();
    expect(parseCharacterList('{"characters": []}')).toEqual([]);
  });

  it("lists the characters to describe", () => {
    expect(describePrompt(["一", "二"])).toContain("一 二");
  });
});
