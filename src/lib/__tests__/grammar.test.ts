import { describe, expect, it } from "vitest";
import { buildGrammarPrompt, draftToBlocks, parseGrammarReply } from "@/lib/ai/grammar";
import { blocksToText } from "@/lib/blocks";

const reply = {
  title: "又…又… : deux qualités à la fois",
  icon: "🔁",
  parent: 2,
  blocks: [
    { type: "paragraph", text: "On relie deux adjectifs." },
    { type: "pattern", text: "Sujet + 又 + adj. + 又 + adj." },
    { type: "heading", text: "Exemples" },
    { type: "example", hanzi: "她又高又瘦。", fr: "Elle est grande et mince." },
    { type: "example", hanzi: "pas de caractères", fr: "ignoré" },
    { type: "table", text: "type inconnu ignoré" },
  ],
};

describe("AI grammar draft", () => {
  it("keeps known blocks, computes the pinyin and resolves the parent", () => {
    const draft = parseGrammarReply("```json\n" + JSON.stringify(reply) + "\n```", 3);
    expect(draft?.title).toBe("又…又… : deux qualités à la fois");
    expect(draft?.parentIndex).toBe(1);
    expect(draft?.blocks).toHaveLength(4);
    expect(draft?.blocks[3]).toEqual({ type: "example", hanzi: "她又高又瘦。", pinyin: "tā yòu gāo yòu shòu。", fr: "Elle est grande et mince." });
  });

  it("ignores a parent number that doesn't exist", () => {
    expect(parseGrammarReply(JSON.stringify({ ...reply, parent: 9 }), 3)?.parentIndex).toBeNull();
    expect(parseGrammarReply(JSON.stringify({ ...reply, parent: "aucun" }), 3)?.parentIndex).toBeNull();
  });

  it("rejects empty or broken answers", () => {
    expect(parseGrammarReply("non", 0)).toBeNull();
    expect(parseGrammarReply(JSON.stringify({ title: "x", blocks: [] }), 0)).toBeNull();
  });

  it("becomes an editable document that Practice can read, pinyin first", () => {
    const draft = parseGrammarReply(JSON.stringify(reply), 3)!;
    const text = blocksToText(draftToBlocks(draft.blocks));
    expect(text).toContain("Sujet + 又 + adj. + 又 + adj.");
    expect(text).toContain("- tā yòu gāo yòu shòu。  她又高又瘦。  — Elle est grande et mince.");
  });

  it("only asks for a parent when the user lets the AI choose", () => {
    const args = { request: "又又", sections: [{ path: "Adjectifs" }], words: [] };
    expect(buildGrammarPrompt({ ...args, chooseParent: true })).toContain("1. Adjectifs");
    expect(buildGrammarPrompt({ ...args, chooseParent: false })).not.toContain('"parent"');
  });
});
