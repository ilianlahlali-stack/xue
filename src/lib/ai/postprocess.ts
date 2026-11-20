import type { PracticeReply } from "./schema";
import { hasHanzi, normalizePinyin, sentencePinyin, stripTones, wordPinyin } from "@/lib/pinyin";

type CorrectionError = PracticeReply["correction"]["errors"][number];

/**
 * Models sometimes flag "errors" that are only a change of script or of tone
 * notation (jiao → 叫, wo3 → wǒ). Those are dropped: an error in pinyin is kept
 * only if it doesn't sound like its correction (same tones when tones were typed).
 */
export function isRealError(error: CorrectionError): boolean {
  if (hasHanzi(error.wrong)) return true;
  const rightPinyin = hasHanzi(error.right) ? wordPinyin(error.right) : error.right;
  const typedTones = /[1-4]/.test(normalizePinyin(error.wrong));
  const same = typedTones
    ? normalizePinyin(error.wrong) === normalizePinyin(rightPinyin)
    : stripTones(error.wrong) === stripTones(rightPinyin);
  return !same;
}

/** Toneless pinyin of what was written, whatever the script ("我是学生" and "wo3 shi4 xuesheng" match). */
function sound(text: string): string {
  return stripTones(hasHanzi(text) ? sentencePinyin(text) : text);
}

/**
 * Safety net: if the corrected sentence doesn't sound like what the learner
 * wrote, something was changed, so the correction can't be "no error".
 */
export function missedErrors(userText: string, correction: PracticeReply["correction"]): CorrectionError[] {
  if (!userText || correction.help_fr || !correction.corrected_hanzi || correction.errors.length) return [];
  if (sound(userText) === sound(correction.corrected_hanzi)) return [];
  return [
    {
      wrong: userText,
      right: correction.corrected_hanzi,
      explanation_fr: correction.understood_fr || "Compare ta phrase avec la correction.",
    },
  ];
}

/**
 * Cleans the model's reply before it is stored: reliable pinyin from pinyin-pro
 * (better on tones than the model), fake errors removed, already-known words and
 * rules filtered out.
 */
export function cleanReply(
  reply: PracticeReply,
  {
    userText,
    knownHanzi,
    knownTitles,
    knownSounds = new Set(),
  }: {
    userText: string;
    knownHanzi: Set<string>;
    knownTitles: Set<string>;
    /** Toneless pinyin of the words known only orally: not "new" just because of their characters. */
    knownSounds?: Set<string>;
  }
): PracticeReply {
  const seen = new Set<string>();
  const correction = { ...reply.correction, errors: reply.correction.errors.filter(isRealError) };
  return {
    correction: {
      ...correction,
      corrected_pinyin: hasHanzi(correction.corrected_hanzi)
        ? sentencePinyin(correction.corrected_hanzi)
        : correction.corrected_pinyin,
      errors: [...correction.errors, ...missedErrors(userText, correction)],
    },
    reply: { ...reply.reply, pinyin: sentencePinyin(reply.reply.hanzi) },
    new_words: reply.new_words
      .map((w) => ({ ...w, hanzi: w.hanzi.trim(), pinyin: w.pinyin || wordPinyin(w.hanzi) }))
      .filter((w) => {
        if (!hasHanzi(w.hanzi) || knownHanzi.has(w.hanzi) || seen.has(w.hanzi)) return false;
        if (knownSounds.has(stripTones(w.pinyin))) return false;
        seen.add(w.hanzi);
        return true;
      }),
    new_grammar: reply.new_grammar.filter((g) => !knownTitles.has(g.title.trim().toLowerCase())),
  };
}
