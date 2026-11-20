import { describe, expect, it } from "vitest";
import { parsePracticeReply } from "@/lib/ai/schema";
import { blocksToText, grammarRuleBlocks } from "@/lib/blocks";

const valid = {
  correction: {
    understood_fr: "Tu voulais dire : je suis étudiant",
    corrected_hanzi: "我是学生。",
    corrected_pinyin: "wǒ shì xuéshēng",
    errors: [{ wrong: "wo xuesheng", right: "我是学生", explanation_fr: "Il manque 是." }],
    tip_fr: "",
    help_fr: "",
  },
  reply: { hanzi: "你学习什么？", pinyin: "nǐ xuéxí shénme", translation_fr: "Qu'étudies-tu ?" },
  new_words: [{ hanzi: "学习", pinyin: "xuéxí", translation_fr: "étudier" }],
  new_grammar: [],
};

describe("parsePracticeReply", () => {
  it("parses a clean JSON reply", () => {
    expect(parsePracticeReply(JSON.stringify(valid))).toEqual(valid);
  });

  it("tolerates code fences and thinking blocks", () => {
    const raw = "<think>hmm</think>\n```json\n" + JSON.stringify(valid) + "\n```";
    expect(parsePracticeReply(raw)?.reply.hanzi).toBe("你学习什么？");
  });

  it("fills missing optional fields", () => {
    const parsed = parsePracticeReply(JSON.stringify({ reply: { hanzi: "你好！" } }));
    expect(parsed?.correction.errors).toEqual([]);
    expect(parsed?.new_words).toEqual([]);
  });

  it("drops errors that correct something into itself", () => {
    const raw = JSON.stringify({
      ...valid,
      correction: { ...valid.correction, errors: [{ wrong: "我", right: "我", explanation_fr: "?" }, ...valid.correction.errors] },
    });
    expect(parsePracticeReply(raw)?.correction.errors).toHaveLength(1);
  });

  it("rejects invalid replies", () => {
    expect(parsePracticeReply("pas du json")).toBeNull();
    expect(parsePracticeReply(JSON.stringify({ reply: { hanzi: "" } }))).toBeNull();
    expect(parsePracticeReply("{ broken")).toBeNull();
  });
});

describe("blocksToText", () => {
  it("flattens a BlockNote document", () => {
    const doc = [
      { type: "heading", content: [{ type: "text", text: "的 possessif" }], children: [] },
      { type: "bulletListItem", content: [{ type: "text", text: "我的书" }], children: [{ type: "paragraph", content: "mon livre", children: [] }] },
    ];
    expect(blocksToText(doc)).toBe("的 possessif\n- 我的书\n  mon livre");
  });

  it("round-trips a generated grammar rule", () => {
    const blocks = grammarRuleBlocks({ explanation_fr: "Action accomplie.", example_hanzi: "我吃了。", example_pinyin: "wǒ chī le" });
    expect(blocksToText(blocks)).toBe("Action accomplie.\nExemple\n我吃了。\nwǒ chī le");
  });
});
