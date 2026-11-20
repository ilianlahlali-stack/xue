// Grammar exercises generated from the user's Structure sections: a new set of
// questions every time, checked locally when possible (choices, blanks, word
// order) and by the AI for free translations.
import { z } from "zod";
import { hasHanzi, pinyinMatches, sentencePinyin } from "@/lib/pinyin";
import { blocksToText } from "@/lib/blocks";

export type ExerciseRule = { title: string; text: string };
export type ExerciseWord = { hanzi: string | null; pinyin: string; translation: string };

/** A sentence shown pinyin first, characters second. */
export type Shown = { hanzi: string; pinyin: string };

export type Question =
  | { type: "choice"; rule: string; prompt: string; sentence: Shown | null; options: Shown[]; answer: number; explanation: string }
  | { type: "fill"; rule: string; prompt: string; sentence: Shown; blanks: string[][]; translation: string; explanation: string }
  | { type: "reorder"; rule: string; prompt: string; tokens: Shown[]; translation: string; explanation: string }
  | { type: "translate"; rule: string; prompt: string; french: string; answers: Shown[]; explanation: string };

export type Exercise = { questions: Question[] };

export type ExerciseSection = { id: string; parent_id: string | null; title: string; content: unknown };

const MAX_RULE_CHARS = 2500;

/**
 * Turns the chosen sections into rules: a section brings its sub-sections along,
 * and a sub-section already covered by a chosen parent isn't counted twice.
 */
export function rulesFrom(sections: ExerciseSection[], chosen: string[]): ExerciseRule[] {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const children = new Map<string, ExerciseSection[]>();
  for (const s of sections) if (s.parent_id) children.set(s.parent_id, [...(children.get(s.parent_id) ?? []), s]);
  const picked = new Set(chosen.filter((id) => byId.has(id)));
  const coveredByParent = (s: ExerciseSection): boolean => {
    for (let p = s.parent_id ? byId.get(s.parent_id) : undefined; p; p = p.parent_id ? byId.get(p.parent_id) : undefined) {
      if (picked.has(p.id)) return true;
    }
    return false;
  };
  const textOf = (s: ExerciseSection, depth = 0): string =>
    [depth ? `${"#".repeat(Math.min(depth + 3, 6))} ${s.title}` : "", blocksToText(s.content), ...(children.get(s.id) ?? []).map((c) => textOf(c, depth + 1))]
      .filter(Boolean)
      .join("\n");
  return [...picked]
    .map((id) => byId.get(id)!)
    .filter((s) => !coveredByParent(s))
    .map((s) => ({ title: s.title, text: textOf(s).slice(0, MAX_RULE_CHARS) }));
}

export const QUESTION_COUNT = 6;
export const BLANK = "＿";

const THEMES = [
  "la famille", "la nourriture", "l'école", "les animaux", "le week-end", "les amis", "la maison", "les achats",
  "le temps qu'il fait", "les transports", "le travail", "les loisirs", "la ville", "les vacances", "le café",
];

/** A random theme and seed so two exercises on the same rule never look alike. */
export function variety(random = Math.random) {
  return { theme: THEMES[Math.floor(random() * THEMES.length)], seed: Math.floor(random() * 100000) };
}

export function buildExercisePrompt({
  rules,
  words,
  theme,
  seed,
}: {
  rules: ExerciseRule[];
  words: ExerciseWord[];
  theme: string;
  seed: number;
}): string {
  const ruleText = rules.map((r, i) => `### Règle ${i + 1} : ${r.title}\n${r.text || "(pas de détail : utilise le titre)"}`).join("\n\n");
  const wordList = words
    .slice(0, 1500)
    .map((w) => `${w.hanzi ?? ""} (${w.pinyin})${w.translation ? ` — ${w.translation}` : ""}`)
    .join("\n");

  return `Tu crées un exercice de grammaire chinoise (mandarin, caractères simplifiés) pour un apprenant francophone débutant, à partir de ses propres fiches.

Crée exactement ${QUESTION_COUNT} questions qui entraînent UNIQUEMENT les règles ci-dessous${rules.length > 1 ? ", réparties entre elles" : ""} : 2 « choice », 2 « fill », 1 « reorder » et 1 « translate ». Thème des phrases pour cette fois : ${theme} (variante n° ${seed} : invente des phrases nouvelles, pas les exemples des fiches).

Chaque phrase doit être correcte, naturelle et simple, comme dans un bon manuel, avec les mots connus de l'apprenant autant que possible (sinon des mots très courants). Consignes et explications en français, courtes. Tout ce qui est en chinois (sentence, options, blanks, tokens, answers) s'écrit en caractères uniquement, sans pinyin : il est ajouté automatiquement.

Règles par type :
- choice : UNE SEULE option est juste. Les autres sont fautives sur le point de grammaire (structure absente ou mal construite, mauvais mot de liaison, mauvais ordre), jamais simplement un autre mot qui marcherait aussi.
- fill : chaque ${BLANK} remplace un mot entier, de préférence le mot-clé de la règle (ex. 又, 很) ; jamais une partie de mot, jamais deux ${BLANK} côte à côte. La traduction française doit rendre la réponse évidente.
- reorder : 4 à 6 morceaux, le mot-clé de la règle dans son propre morceau (ex. « 又 » et « 大 » séparés).
- translate : une phrase courte qui utilise la règle ; donne toutes les traductions justes courantes.

Formats (champ "rule" = numéro de la règle travaillée) :
- {"type": "choice", "rule": 1, "prompt": "consigne", "sentence": "phrase avec ${BLANK} à la place du mot à choisir, ou vide", "options": ["4 réponses en caractères"], "answer": index de la bonne (0 à 3), "explanation": "pourquoi"}
- {"type": "fill", "rule": 1, "prompt": "consigne", "sentence": "phrase avec un ${BLANK} par trou (1 à 3 trous)", "blanks": [["réponse acceptée", "autre réponse acceptée"]], "translation": "traduction française de la phrase complète", "explanation": "pourquoi"}  (un tableau de réponses par ${BLANK}, dans l'ordre)
- {"type": "reorder", "rule": 1, "prompt": "consigne", "tokens": ["morceaux", "de la phrase", "dans le bon ordre"], "translation": "traduction française", "explanation": "pourquoi cet ordre"}  (sans ponctuation)
- {"type": "translate", "rule": 1, "prompt": "Traduis en chinois", "french": "phrase française", "answers": ["traduction en caractères", "autre traduction juste"], "explanation": "le point de grammaire utilisé"}

Réponds UNIQUEMENT avec un objet JSON : {"questions": [...]}

## Fiches de l'apprenant
${ruleText}

## Mots connus de l'apprenant
${wordList || "(aucun)"}`;
}

const text = z.string().default("");
const strings = z.array(z.string()).default([]);
const rawQuestion = z.object({
  type: z.string(),
  rule: z.coerce.number().int().catch(1),
  prompt: text,
  sentence: text,
  options: strings,
  answer: z.coerce.number().int().catch(-1),
  blanks: z.array(z.union([z.array(z.string()), z.string()])).default([]),
  tokens: strings,
  translation: text,
  french: text,
  answers: strings,
  explanation: text,
});

/** Chinese only: drops any romanization the model slipped in, and spaces. */
const chineseOnly = (value: string) =>
  value
    .replace(/[A-Za-zÀ-ÿĀ-žǍ-ǜ_]+/g, "")
    .replace(/[.,!?;:'"]/g, "") // Chinese text uses full-width punctuation
    .replace(/\s+/g, "")
    .replace(/＿+/g, BLANK) // the model often draws one hole as "＿＿"
    .trim();
const show = (hanzi: string): Shown => {
  const clean = chineseOnly(hanzi);
  return { hanzi: clean, pinyin: sentencePinyin(clean) };
};

/** Keeps only well-formed questions; pinyin is computed here (reliable tones), not by the model. */
export function parseExercise(raw: string, rules: { title: string }[]): Exercise | null {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  const list = z.object({ questions: z.array(z.unknown()).default([]) }).safeParse(data);
  if (!list.success) return null;

  const questions: Question[] = [];
  for (const item of list.data.questions) {
    const parsed = rawQuestion.safeParse(item);
    if (!parsed.success) continue;
    const q = parsed.data;
    const rule = rules[q.rule - 1]?.title ?? rules[0]?.title ?? "";
    const prompt = q.prompt.trim();

    if (q.type === "choice") {
      const options = q.options.map(chineseOnly).filter(Boolean);
      if (options.length < 2 || options.length > 6 || q.answer < 0 || q.answer >= options.length) continue;
      if (new Set(options).size !== options.length) continue;
      // The sentence is only shown when it has a hole; a full sentence would give the answer away.
      const sentence = hasHanzi(q.sentence) && chineseOnly(q.sentence).includes(BLANK) ? show(q.sentence) : null;
      questions.push({ type: "choice", rule, prompt: prompt || "Choisis la bonne réponse", sentence, options: options.map(show), answer: q.answer, explanation: q.explanation.trim() });
    } else if (q.type === "fill") {
      const sentence = chineseOnly(q.sentence);
      const holes = sentence.split(BLANK).length - 1;
      const blanks = q.blanks.map((b) => [...new Set((Array.isArray(b) ? b : [b]).map(chineseOnly).filter(Boolean))]);
      if (holes < 1 || holes !== blanks.length || blanks.some((b) => !b.length)) continue;
      // A hole in the wrong place shows once filled in: "又白＿又好" + 又 → "又白又又好".
      const filled = sentence.split(BLANK).reduce((acc, part, i) => acc + (blanks[i - 1]?.[0] ?? "") + part);
      if (blanks.some((b) => filled.includes(b[0] + b[0]))) continue;
      questions.push({ type: "fill", rule, prompt: prompt || "Complète la phrase", sentence: show(sentence), blanks, translation: q.translation.trim(), explanation: q.explanation.trim() });
    } else if (q.type === "reorder") {
      const tokens = q.tokens.map((t) => chineseOnly(t).replace(/[，。！？、；：,.!?]/g, "")).filter(Boolean);
      // The same piece can come twice (又 … 又): pieces are told apart by position, not by text.
      if (tokens.length < 2 || tokens.length > 8 || new Set(tokens).size === 1) continue;
      questions.push({ type: "reorder", rule, prompt: prompt || "Remets dans l'ordre", tokens: tokens.map(show), translation: q.translation.trim(), explanation: q.explanation.trim() });
    } else if (q.type === "translate") {
      const answers = [...new Set(q.answers.map(chineseOnly).filter((a) => hasHanzi(a)))];
      if (!q.french.trim() || !answers.length) continue;
      questions.push({ type: "translate", rule, prompt: prompt || "Traduis en chinois", french: q.french.trim(), answers: answers.map(show), explanation: q.explanation.trim() });
    }
  }
  return questions.length >= 3 ? { questions: questions.slice(0, QUESTION_COUNT) } : null;
}

const PUNCTUATION = /[\s，。！？、；：,.!?;:"“”'‘’（）()…]/g;

/**
 * Does a typed answer (characters or pinyin, any tone notation) match one of the
 * accepted answers? Punctuation and spaces never matter.
 */
export function answerMatches(typed: string, accepted: string[], { ignoreTones = false } = {}): boolean {
  const input = typed.trim();
  if (!input) return false;
  if (hasHanzi(input)) {
    const mine = input.replace(PUNCTUATION, "");
    return accepted.some((a) => a.replace(PUNCTUATION, "") === mine);
  }
  return accepted.some((a) => pinyinMatches(input, sentencePinyin(a), { ignoreTones, hanzi: a }));
}

/** Prompt for grading a free translation that didn't match the reference answers. */
export function checkTranslationPrompt({ french, answers, typed }: { french: string; answers: string[]; typed: string }) {
  return `Un apprenant francophone débutant devait traduire en chinois : « ${french} »
Traductions de référence : ${answers.join(" / ")}
Sa réponse (en caractères ou en pinyin, avec ou sans tons) : « ${typed} »

Sa réponse est-elle une traduction correcte et naturelle ? D'autres formulations justes que les références sont acceptées. Des tons absents ou la ponctuation ne comptent pas comme des fautes ; un ton écrit faux, un mot manquant, faux ou mal placé, si.

Réponds UNIQUEMENT avec un objet JSON : {"ok": true, "feedback_fr": "une ou deux phrases : ce qui va, ou l'erreur et la règle", "corrected": "sa phrase corrigée en caractères (ou la référence la plus proche)"}`;
}

export const checkSchema = z.object({ ok: z.boolean().default(false), feedback_fr: text, corrected: text });
