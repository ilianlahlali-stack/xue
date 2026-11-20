import { describe, expect, it } from "vitest";
import { cleanReply, isRealError, missedErrors } from "@/lib/ai/postprocess";
import type { PracticeReply } from "@/lib/ai/schema";

const err = (wrong: string, right: string) => ({ wrong, right, explanation_fr: "" });

describe("isRealError", () => {
  it("ignores changes of script or tone notation", () => {
    expect(isRealError(err("jiao", "叫"))).toBe(false);
    expect(isRealError(err("faguo ren", "法国人"))).toBe(false);
    expect(isRealError(err("wo3", "wǒ"))).toBe(false);
    expect(isRealError(err("ni", "nǐ"))).toBe(false);
  });

  it("keeps real mistakes", () => {
    expect(isRealError(err("wo3 xue2sheng", "我是学生"))).toBe(true);
    expect(isRealError(err("wo2", "wǒ"))).toBe(true);
    expect(isRealError(err("是很高", "很高"))).toBe(true);
    expect(isRealError(err("tom", "汤姆"))).toBe(true);
  });
});

describe("cleanReply", () => {
  const reply: PracticeReply = {
    correction: { understood_fr: "", corrected_hanzi: "我叫Tom。", corrected_pinyin: "", errors: [err("jiao", "叫")], tip_fr: "", help_fr: "" },
    reply: { hanzi: "你好！你是学生吗？", pinyin: "", translation_fr: "" },
    new_words: [
      { hanzi: "吗", pinyin: "ma", translation_fr: "?" },
      { hanzi: "你", pinyin: "nǐ", translation_fr: "tu" },
      { hanzi: "吗", pinyin: "ma", translation_fr: "?" },
    ],
    new_grammar: [{ title: "Phrase simple", explanation_fr: "", example_hanzi: "", example_pinyin: "" }],
  };

  it("doesn't offer a word already known orally (pinyin only)", () => {
    const cleaned = cleanReply(reply, { userText: "", knownHanzi: new Set(), knownTitles: new Set(), knownSounds: new Set(["ma"]) });
    expect(cleaned.new_words.map((w) => w.hanzi)).toEqual(["你"]);
  });

  it("drops fake errors, known words, duplicates and known rules", () => {
    const cleaned = cleanReply(reply, { userText: "wo jiao Tom", knownHanzi: new Set(["你"]), knownTitles: new Set(["phrase simple"]) });
    expect(cleaned.correction.errors).toEqual([]);
    expect(cleaned.new_words.map((w) => w.hanzi)).toEqual(["吗"]);
    expect(cleaned.new_grammar).toEqual([]);
    expect(cleaned.reply.pinyin).toContain("nǐ");
  });
});

describe("missedErrors", () => {
  const correction = (corrected_hanzi: string, extra: Partial<PracticeReply["correction"]> = {}) => ({
    understood_fr: "Tu voulais dire : je suis étudiant",
    corrected_hanzi,
    corrected_pinyin: "",
    errors: [],
    tip_fr: "",
    help_fr: "",
    ...extra,
  });

  it("flags a silent change of words", () => {
    expect(missedErrors("wo3 xue2sheng", correction("我是学生"))).toHaveLength(1);
    expect(missedErrors("我去学校", correction("我去了学校"))).toHaveLength(1);
  });

  it("accepts the same sentence in another script or notation", () => {
    expect(missedErrors("wo shi xuesheng", correction("我是学生。"))).toEqual([]);
    expect(missedErrors("ni hao, wo jiao Tom", correction("你好，我叫Tom。"))).toEqual([]);
    expect(missedErrors("我是学生", correction("我是学生！"))).toEqual([]);
  });

  it("stays out of help requests and already-listed errors", () => {
    expect(missedErrors("comment on dit faim ?", correction("我饿了", { help_fr: "On dit…" }))).toEqual([]);
    expect(missedErrors("wo xuesheng", correction("我是学生", { errors: [err("wo xuesheng", "我是学生")] }))).toEqual([]);
  });
});
