import { z } from "zod";
import { pinyin } from "pinyin-pro";
import { hasHanzi, normalizePinyin } from "@/lib/pinyin";

/** A character the AI found (in a photo or a pasted list), ready to be reviewed before adding. */
export type CharacterSuggestion = { hanzi: string; pinyin: string; meaning: string; is_radical: boolean };

const FIELDS = `Pour chaque caractère :
- hanzi : le caractère, en simplifié
- pinyin : sa lecture la plus courante, avec accents
- meaning_fr : son sens en français, court (1 à 5 mots, plusieurs sens séparés par des virgules)
- is_radical : true si le caractère ne s'emploie pas seul comme mot en mandarin moderne courant pour dire son sens principal, parce qu'on utilise un mot composé à la place (ex. 日 → 太阳/天, 月 → 月亮, 口 → 嘴, 木 → 木头, 田 → 田地, 力 → 力气, 心 → 心里/心脏, 女 → 女人, 男 → 男人, 北 → 北方, 京 → 北京, 中 → 中间, 文 → 中文/文字, 本 → 根本, 勺 → 勺子) ; true aussi pour les suffixes (们) et les formes qui n'existent que comme composants (扌, 氵, 亻, 阝). Un emploi comme spécificatif ne compte pas (口 dans 三口人). false si le caractère s'emploie seul couramment (水, 山, 人, 手, 鱼, 书, 大, 吃, 你, 好…).

Réponds UNIQUEMENT avec un objet JSON : {"characters": [{"hanzi": "学", "pinyin": "xué", "meaning_fr": "étudier, apprendre", "is_radical": false}]}`;

export const PHOTO_PROMPT = `Cette photo montre une page d'exercices d'écriture chinoise ou des notes d'un apprenant.

Liste chaque caractère chinois différent écrit sur la page principale (celle au centre de la photo), dans l'ordre de lecture, ligne par ligne. Un caractère recopié plusieurs fois ne compte qu'une fois. Si l'apprenant a noté le pinyin à côté, sers-t'en pour lever les doutes sur un caractère mal écrit. Ignore les pages à moitié visibles sur les bords, les écrans, le texte imprimé qui ne fait pas partie de l'exercice et les cases vides.

${FIELDS}`;

export function describePrompt(chars: string[]): string {
  return `Voici des caractères chinois : ${chars.join(" ")}

Donne pour chacun, dans le même ordre, sa lecture et son sens.

${FIELDS}`;
}

const listSchema = z.object({
  characters: z
    .array(
      z.object({
        hanzi: z.string(),
        pinyin: z.string().default(""),
        meaning_fr: z.string().default(""),
        is_radical: z.boolean().default(false),
      })
    )
    .default([]),
});

/** Readings pinyin-pro knows for a character (several for 和, 长, 了…). */
function readings(char: string): string[] {
  return pinyin(char, { multiple: true, type: "array" });
}

/**
 * Validates the model's list: one real Chinese character per entry, no repeats.
 * The model's pinyin is kept only if it is a real reading of that character;
 * otherwise the most common reading from pinyin-pro is used.
 */
export function parseCharacterList(raw: string): CharacterSuggestion[] | null {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed;
  try {
    parsed = listSchema.safeParse(JSON.parse(cleaned.slice(start, end + 1)));
  } catch {
    return null;
  }
  if (!parsed.success) return null;

  const seen = new Set<string>();
  const out: CharacterSuggestion[] = [];
  for (const item of parsed.data.characters) {
    const hanzi = [...item.hanzi.trim()].find((c) => hasHanzi(c));
    if (!hanzi || seen.has(hanzi)) continue;
    seen.add(hanzi);
    const known = readings(hanzi);
    const fromModel = known.find((r) => normalizePinyin(r) === normalizePinyin(item.pinyin));
    out.push({
      hanzi,
      pinyin: fromModel ?? known[0] ?? item.pinyin.trim(),
      meaning: item.meaning_fr.trim(),
      is_radical: item.is_radical,
    });
  }
  return out;
}
