import { z } from "zod";

const text = z.string().default("");

export const practiceReplySchema = z.object({
  correction: z
    .object({
      understood_fr: text,
      corrected_hanzi: text,
      corrected_pinyin: text,
      errors: z
        .array(z.object({ wrong: text, right: text, explanation_fr: text }))
        .default([])
        // Models sometimes "correct" something into itself: not an error.
        .transform((errors) => errors.filter((e) => e.wrong.trim() !== e.right.trim())),
      tip_fr: text,
      help_fr: text,
    })
    .default({ understood_fr: "", corrected_hanzi: "", corrected_pinyin: "", errors: [], tip_fr: "", help_fr: "" }),
  reply: z.object({
    hanzi: z.string().min(1),
    pinyin: text,
    translation_fr: text,
  }),
  new_words: z
    .array(z.object({ hanzi: z.string().min(1), pinyin: text, translation_fr: text }))
    .default([]),
  new_grammar: z
    .array(
      z.object({
        title: z.string().min(1),
        explanation_fr: text,
        example_hanzi: text,
        example_pinyin: text,
      })
    )
    .default([]),
});

export type PracticeReply = z.infer<typeof practiceReplySchema>;
export type NewWord = PracticeReply["new_words"][number];
export type NewGrammar = PracticeReply["new_grammar"][number];

/**
 * Extracts and validates the model's JSON. Tolerates the usual wrappers
 * (```json fences, <think> blocks, text before/after the object).
 */
export function parsePracticeReply(raw: string): PracticeReply | null {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const result = practiceReplySchema.safeParse(JSON.parse(cleaned.slice(start, end + 1)));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
