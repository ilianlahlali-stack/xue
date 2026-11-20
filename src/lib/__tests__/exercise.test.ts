import { describe, expect, it } from "vitest";
import { answerMatches, buildExercisePrompt, parseExercise, rulesFrom, variety } from "@/lib/ai/exercise";

const rules = [{ title: "又…又…" }, { title: "很 + adjectif" }];
const questions = [
  { type: "choice", rule: 1, prompt: "Choisis", sentence: "她＿高又瘦。", options: ["又", "和", "很", "也"], answer: 0, explanation: "又…又…" },
  { type: "fill", rule: 1, prompt: "Complète", sentence: "这本书＿大＿厚。", blanks: [["又"], "又"], translation: "Ce livre est grand et épais.", explanation: "" },
  { type: "reorder", rule: 2, prompt: "Remets", tokens: ["我", "很", "高兴。"], translation: "Je suis content.", explanation: "" },
  { type: "translate", rule: 2, prompt: "Traduis", french: "Je suis content.", answers: ["我很高兴。", "我很开心。"], explanation: "" },
  { type: "choice", rule: 1, prompt: "bad", options: ["又", "又"], answer: 0 }, // duplicate options
  { type: "fill", rule: 1, prompt: "bad", sentence: "她＿高。", blanks: [["又"], ["又"]] }, // blank count mismatch
  { type: "choice", rule: 1, prompt: "bad", options: ["a", "b"], answer: 5 }, // answer out of range
  { type: "fill", rule: 1, prompt: "bad", sentence: "这家店的服＿＿便宜。", blanks: [["务"], ["又好"]] }, // word cut in two
  { type: "fill", rule: 1, prompt: "bad", sentence: "这个水又白＿又好。", blanks: [["又"]] }, // hole in the wrong place
  { type: "unknown" },
];

describe("exercise from the AI", () => {
  it("keeps well-formed questions and computes pinyin", () => {
    const ex = parseExercise("```json\n" + JSON.stringify({ questions }) + "\n```", rules);
    expect(ex?.questions.map((q) => q.type)).toEqual(["choice", "fill", "reorder", "translate"]);
    const [choice, fill, reorder, translate] = ex!.questions;
    expect(choice.rule).toBe("又…又…");
    expect(choice.type === "choice" && choice.sentence?.pinyin).toBe("tā ＿ gāo yòu shòu。");
    expect(fill.type === "fill" && fill.blanks).toEqual([["又"], ["又"]]);
    expect(reorder.type === "reorder" && reorder.tokens.map((t) => t.hanzi)).toEqual(["我", "很", "高兴"]);
    expect(translate.rule).toBe("很 + adjectif");
  });

  it("strips pinyin slipped into Chinese fields and repeated answers", () => {
    const ex = parseExercise(
      JSON.stringify({
        questions: [
          { type: "choice", sentence: "这只羊 ＿ 大 ＿ 白。Zhè zhī yáng _ dà _ bái.", options: ["又…又", "很…很"], answer: 0 },
          { type: "translate", french: "Je suis content.", answers: ["我很高兴", "我很高兴"] },
          { type: "reorder", tokens: ["我", "很", "高兴"] },
        ],
      }),
      rules
    );
    const [choice, translate] = ex!.questions;
    expect(choice.type === "choice" && choice.sentence?.hanzi).toBe("这只羊＿大＿白。");
    expect(translate.type === "translate" && translate.answers).toHaveLength(1);
  });

  it("accepts a piece that comes twice in a word-order question", () => {
    const ex = parseExercise(
      JSON.stringify({
        questions: [
          { type: "reorder", tokens: ["她", "又", "高", "又", "瘦"] },
          { type: "reorder", tokens: ["我", "很", "高兴"] },
          { type: "reorder", tokens: ["又", "又"] },
          { type: "fill", sentence: "她＿高＿瘦。", blanks: [["又"], ["又"]] },
          { type: "fill", sentence: "哥哥＿＿高 ＿__ 瘦。", blanks: [["又"], ["又"]] }, // one hole drawn as several marks
        ],
      }),
      rules
    );
    expect(ex?.questions.map((q) => q.type)).toEqual(["reorder", "reorder", "fill", "fill"]);
    expect(ex?.questions[3].type === "fill" && ex.questions[3].sentence.hanzi).toBe("哥哥＿高＿瘦。");
  });

  it("never shows a choice question's sentence when it is the answer itself", () => {
    const ex = parseExercise(
      JSON.stringify({
        questions: [
          { type: "choice", sentence: "这匹马不大。", options: ["这匹马不大。", "这匹马大不。"], answer: 0 },
          { type: "choice", sentence: "这匹马＿大。", options: ["不", "没"], answer: 0 },
          { type: "reorder", tokens: ["我", "很", "高兴"] },
        ],
      }),
      rules
    );
    const [full, holed] = ex!.questions;
    expect(full.type === "choice" && full.sentence).toBeNull();
    expect(holed.type === "choice" && holed.sentence?.hanzi).toBe("这匹马＿大。");
  });

  it("needs at least three usable questions", () => {
    expect(parseExercise(JSON.stringify({ questions: questions.slice(4) }), rules)).toBeNull();
    expect(parseExercise("pas de JSON", rules)).toBeNull();
  });

  it("checks answers typed in characters or pinyin", () => {
    expect(answerMatches("我很高兴", ["我很高兴。"])).toBe(true);
    expect(answerMatches("wo3 hen3 gao1xing4", ["我很高兴。"])).toBe(true);
    expect(answerMatches("wǒ hěn gāoxìng", ["我很高兴。"])).toBe(true);
    expect(answerMatches("wo hen gaoxing", ["我很高兴。"])).toBe(false);
    expect(answerMatches("wo hen gaoxing", ["我很高兴。"], { ignoreTones: true })).toBe(true);
    expect(answerMatches("yòu", ["又"])).toBe(true);
    expect(answerMatches("我高兴", ["我很高兴。"])).toBe(false);
    expect(answerMatches("", ["又"])).toBe(false);
  });

  it("varies the theme and seed between exercises", () => {
    const a = variety(() => 0);
    const b = variety(() => 0.99);
    expect(a.theme).not.toBe(b.theme);
    const prompt = buildExercisePrompt({ rules: [{ title: "又…又…", text: "Sujet + 又 + adj." }], words: [], theme: a.theme, seed: a.seed });
    expect(prompt).toContain("Règle 1 : 又…又…");
    expect(prompt).toContain(a.theme);
  });

  it("turns chosen sections into rules, sub-sections included, without counting them twice", () => {
    const doc = (text: string) => [{ type: "paragraph", content: text }];
    const sections = [
      { id: "p", parent_id: null, title: "Pronoms", content: doc("我 你 他") },
      { id: "c", parent_id: "p", title: "Possessifs", content: doc("我的书") },
      { id: "x", parent_id: null, title: "又…又…", content: doc("Sujet + 又 + adj. + 又 + adj.") },
    ];
    const rules = rulesFrom(sections, ["p", "c", "x", "inconnu"]);
    expect(rules.map((r) => r.title)).toEqual(["Pronoms", "又…又…"]);
    expect(rules[0].text).toContain("Possessifs");
    expect(rules[0].text).toContain("我的书");
    expect(rulesFrom(sections, ["c"])[0]).toEqual({ title: "Possessifs", text: "我的书" });
  });
});
