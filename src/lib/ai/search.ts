import { z } from "zod";

export type SearchableWord = { id: string; hanzi: string | null; pinyin: string; translation: string; literal: string };

const MAX_MATCHES = 80;
const MIN_SCORE = 2;

/** Words are numbered so the model answers with short indices instead of copying text. */
export function buildSearchPrompt(query: string, words: SearchableWord[]): string {
  const list = words
    .map((w, i) => `${i + 1}. ${w.hanzi ? `${w.hanzi} ` : ""}(${w.pinyin}) — ${[w.translation, w.literal].filter(Boolean).join(" ; ")}`)
    .join("\n");
  return `Voici la liste numérotée des mots chinois connus d'un apprenant.

Recherche : « ${query} »

Trouve les mots de la liste liés à cette recherche : synonymes et traductions, mais aussi ce qui appartient clairement au même thème (objets, lieux, actions, personnes, qualités typiques). La recherche peut être en français, en anglais, en chinois ou en pinyin.

Donne à chaque mot retenu une force de lien :
- 3 : le mot veut dire la recherche, ou presque
- 2 : le mot fait clairement partie du thème (ce qu'on rangerait spontanément dans une fiche de vocabulaire sur ce thème)
- 1 : lien possible mais indirect ou tiré par les cheveux
Classe du plus lié au moins lié, ${MAX_MATCHES} mots au maximum.

Réponds UNIQUEMENT avec un objet JSON : {"matches": [{"n": 12, "score": 2, "why_fr": "pièce de la maison"}]}
- n : le numéro du mot dans la liste
- score : 1, 2 ou 3
- why_fr : le lien avec la recherche, en 2 à 5 mots

Liste :
${list}`;
}

const searchSchema = z.object({
  matches: z
    .array(z.object({ n: z.coerce.number().int(), score: z.coerce.number().default(2), why_fr: z.string().default("") }))
    .default([]),
});

export type SearchMatch = { id: string; why: string };

/** Maps the model's numbered answer back to word ids (ignores bad or repeated numbers). */
export function parseSearchMatches(raw: string, words: SearchableWord[]): SearchMatch[] | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed;
  try {
    parsed = searchSchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
  } catch {
    return null;
  }
  if (!parsed.success) return null;
  const seen = new Set<string>();
  const out: SearchMatch[] = [];
  // Loose links (score 1) are dropped: a theme search should feel like a vocabulary list.
  const strong = parsed.data.matches.filter((m) => m.score >= MIN_SCORE).sort((a, b) => b.score - a.score);
  for (const { n, why_fr } of strong) {
    const word = words[n - 1];
    if (!word || seen.has(word.id)) continue;
    seen.add(word.id);
    out.push({ id: word.id, why: why_fr.trim() });
  }
  return out.slice(0, MAX_MATCHES);
}
