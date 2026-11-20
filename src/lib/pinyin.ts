import { pinyin } from "pinyin-pro";

const HAN_RE = /\p{Script=Han}/u;

export function hasHanzi(text: string): boolean {
  return HAN_RE.test(text);
}

/** Distinct Chinese characters of a string, in order of appearance. */
export function hanziChars(text: string): string[] {
  return [...new Set([...text].filter((c) => HAN_RE.test(c)))];
}

/**
 * Pinyin of a single word, syllables joined the way dictionaries write them
 * (学生 → xuéshēng, 西安 → xī'ān).
 */
export function wordPinyin(hanzi: string): string {
  const syllables = pinyin(hanzi, { type: "array", nonZh: "removed" });
  return syllables
    .map((s, i) => (i > 0 && /^[aoeāáǎàōóǒòēéěè]/.test(s) ? `'${s}` : s))
    .join("");
}

/**
 * Pinyin of a whole sentence, syllable by syllable (我喜欢你 → wǒ xǐ huan nǐ), with
 * the tone changes of 一 and 不. Syllables are always spaced: pinyin-pro only knows
 * some compounds, and joining those alone gave lists like "xīngqīyī, xīng qī èr".
 */
export function sentencePinyin(text: string): string {
  return pinyin(text, { nonZh: "consecutive" })
    .replace(/\s+/g, " ")
    .replace(/\s+([，。！？、；：,.!?;:])/g, "$1")
    .replace(/([，。！？、；：])\s*/g, (m) => m.trim() + " ")
    .trim();
}

const MARKS: Record<string, string> = { a: "āáǎà", e: "ēéěè", i: "īíǐì", o: "ōóǒò", u: "ūúǔù", ü: "ǖǘǚǜ" };
const MARKED_TO_INLINE: Record<string, string> = Object.fromEntries(
  Object.entries(MARKS).flatMap(([base, marks]) => [...marks].map((m, i) => [m, `${base}${i + 1}`]))
);

/** Puts the tone mark on the right vowel: a/e first, then the o of "ou", else the last vowel. */
function markSyllable(letters: string, tone: number): string {
  const s = letters.replace(/u:/gi, "ü").replace(/v/g, "ü").replace(/V/g, "Ü");
  if (tone < 1 || tone > 4) return s;
  const lower = s.toLowerCase();
  let idx = lower.search(/[ae]/);
  if (idx === -1) idx = lower.indexOf("ou");
  if (idx === -1) {
    for (let i = lower.length - 1; i >= 0; i--) {
      if ("iouü".includes(lower[i])) {
        idx = i;
        break;
      }
    }
  }
  if (idx === -1) return s;
  const mark = MARKS[lower[idx]][tone - 1];
  return s.slice(0, idx) + (s[idx] === lower[idx] ? mark : mark.toUpperCase()) + s.slice(idx + 1);
}

/** "ni3 hao3" / "ni3hao3" → "nǐ hǎo" / "nǐhǎo". Text without tone numbers is returned unchanged. */
export function numbersToMarks(input: string): string {
  return input.replace(/([a-zü:]+)([0-5])/gi, (_, letters: string, digit: string) => markSyllable(letters, Number(digit)));
}

/**
 * Canonical form used to compare pinyin: lowercase, tone marks or numbers turned
 * into a digit right after the toned vowel ("nǐ hǎo" and "ni3hao3" → "ni3ha3o"),
 * ü → v, spaces and punctuation removed.
 */
export function normalizePinyin(input: string): string {
  return [...numbersToMarks(input.toLowerCase().normalize("NFC"))]
    .map((ch) => MARKED_TO_INLINE[ch] ?? ch)
    .join("")
    .replace(/ü/g, "v")
    .replace(/([jqxy])v/g, "$1u")
    .replace(/[^a-z1-4]/g, "");
}

export function stripTones(input: string): string {
  return normalizePinyin(input).replace(/[1-4]/g, "");
}

/**
 * Does a typed pinyin answer match the expected pinyin?
 * Accepts tone marks or numbers, any spacing. When the word contains 一 or 不,
 * their tone changes in context (yí gè, bú huì) so it is not held against the answer.
 */
export function pinyinMatches(
  answer: string,
  expected: string,
  { ignoreTones = false, hanzi = "" }: { ignoreTones?: boolean; hanzi?: string } = {}
): boolean {
  const a = normalizePinyin(answer);
  const e = normalizePinyin(expected);
  if (!a) return false;
  if (ignoreTones) return a.replace(/[1-4]/g, "") === e.replace(/[1-4]/g, "");
  if (a === e) return true;
  if (!/[一不]/.test(hanzi)) return false;
  const loosen = (s: string) => s.replace(/(yi|bu)[1-4]/g, "$1");
  return loosen(a) === loosen(e);
}

/**
 * An example sentence with the classifier blanked out, pinyin first:
 * ("一只羊", "只") → { pinyin: "yì ＿＿ yáng", hanzi: "一＿羊" }. null if it isn't in the example.
 */
export function blankExample(example: string, hanzi: string): { pinyin: string; hanzi: string } | null {
  if (!hanzi || !example.includes(hanzi)) return null;
  const parts = pinyin(example, { type: "all" });
  return {
    pinyin: parts
      .filter((p) => p.isZh)
      .map((p) => (p.origin === hanzi ? "＿＿" : p.pinyin))
      .join(" "),
    hanzi: example.split(hanzi).join("＿"),
  };
}

/** Case- and tone-insensitive search over a word's fields. */
export function matchesSearch(query: string, fields: string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qPinyin = stripTones(q);
  return fields.some((field) => {
    const f = field.toLowerCase();
    if (f.includes(q)) return true;
    return qPinyin.length > 0 && stripTones(f).includes(qPinyin);
  });
}
