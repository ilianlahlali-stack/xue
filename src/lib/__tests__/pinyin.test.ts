import { describe, expect, it } from "vitest";
import { blankExample, hanziChars, matchesSearch, normalizePinyin, numbersToMarks, pinyinMatches, sentencePinyin, wordPinyin } from "@/lib/pinyin";

describe("pinyin", () => {
  it("joins word syllables with apostrophes where needed", () => {
    expect(wordPinyin("学生")).toBe("xuéshēng");
    expect(wordPinyin("西安")).toBe("xī'ān");
  });

  it("spaces sentence pinyin syllable by syllable, consistently", () => {
    expect(sentencePinyin("我喜欢学习中文。")).toBe("wǒ xǐ huan xué xí zhōng wén。");
    expect(sentencePinyin("星期一，星期二")).toBe("xīng qī yī， xīng qī èr");
    expect(sentencePinyin("你好，我叫Tom。")).toBe("nǐ hǎo， wǒ jiào Tom。");
    expect(sentencePinyin("一个人")).toBe("yí gè rén");
  });

  it("converts tone numbers to marks", () => {
    expect(numbersToMarks("ni3 hao3")).toBe("nǐ hǎo");
    expect(numbersToMarks("lv4 se4")).toBe("lǜ sè");
    expect(numbersToMarks("ma5")).toBe("ma");
    expect(numbersToMarks("xue2sheng1")).toBe("xuéshēng");
    expect(numbersToMarks("gui4 liu2 zhou1 huo3")).toBe("guì liú zhōu huǒ");
    expect(numbersToMarks("Xi1'an1")).toBe("Xī'ān");
    expect(numbersToMarks("bonjour")).toBe("bonjour");
  });

  it("normalizes any notation to the same form", () => {
    expect(normalizePinyin("Nǐ hǎo!")).toBe("ni3ha3o");
    expect(normalizePinyin("ni3 hao3")).toBe("ni3ha3o");
    expect(normalizePinyin("nǐhǎo")).toBe("ni3ha3o");
    expect(normalizePinyin("lǜ")).toBe("lv4");
    expect(normalizePinyin("lv4")).toBe("lv4");
    expect(normalizePinyin("qv4")).toBe(normalizePinyin("qù"));
    expect(normalizePinyin("ma5")).toBe("ma");
  });

  it("matches answers whatever the notation", () => {
    expect(pinyinMatches("ni3hao3", "nǐ hǎo")).toBe(true);
    expect(pinyinMatches("nǐhǎo", "nǐ hǎo")).toBe(true);
    expect(pinyinMatches("ni2 hao3", "nǐ hǎo")).toBe(false);
    expect(pinyinMatches("nihao", "nǐ hǎo")).toBe(false);
    expect(pinyinMatches("nihao", "nǐ hǎo", { ignoreTones: true })).toBe(true);
    expect(pinyinMatches("", "nǐ hǎo", { ignoreTones: true })).toBe(false);
  });

  it("does not penalize tone sandhi on 一 and 不", () => {
    expect(pinyinMatches("bu4 hui4", "bú huì", { hanzi: "不会" })).toBe(true);
    expect(pinyinMatches("yi1 ge4", "yí gè", { hanzi: "一个" })).toBe(true);
    expect(pinyinMatches("bu4 hui3", "bú huì", { hanzi: "不会" })).toBe(false);
    expect(pinyinMatches("yin2", "yǐn", { hanzi: "饮" })).toBe(false);
  });

  it("searches without tones", () => {
    expect(matchesSearch("hao", ["好", "hǎo", "bien"])).toBe(true);
    expect(matchesSearch("bien", ["好", "hǎo", "bien"])).toBe(true);
    expect(matchesSearch("xue", ["好", "hǎo", "bien"])).toBe(false);
  });

  it("blanks the classifier out of an example, with 一's tone change", () => {
    expect(blankExample("一只羊", "只")).toEqual({ pinyin: "yì ＿＿ yáng", hanzi: "一＿羊" });
    expect(blankExample("一个人。", "个")).toEqual({ pinyin: "yí ＿＿ rén", hanzi: "一＿人。" });
    expect(blankExample("一杯水", "本")).toBeNull();
    expect(blankExample("一杯水", "")).toBeNull();
  });

  it("extracts distinct characters", () => {
    expect(hanziChars("你好，你们")).toEqual(["你", "好", "们"]);
  });
});
