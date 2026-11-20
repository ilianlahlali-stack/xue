// "Ajouter avec l'IA" in Structure: the model drafts a grammar note in a small
// block format; it becomes a normal, fully editable BlockNote document.
import { z } from "zod";
import { hasHanzi, sentencePinyin } from "@/lib/pinyin";

export type DraftBlock =
  | { type: "heading" | "paragraph" | "pattern" | "bullet"; text: string }
  | { type: "example"; hanzi: string; pinyin: string; fr: string };

export type GrammarDraft = { title: string; icon: string; parentIndex: number | null; blocks: DraftBlock[] };

export type PromptSection = { path: string };
export type PromptWord = { hanzi: string | null; pinyin: string; translation: string };

const MAX_WORDS = 1500;

export function buildGrammarPrompt({
  request,
  sections,
  words,
  chooseParent,
}: {
  request: string;
  sections: PromptSection[];
  words: PromptWord[];
  chooseParent: boolean;
}): string {
  const wordList = words
    .slice(0, MAX_WORDS)
    .map((w) => `${w.hanzi ?? ""} (${w.pinyin})${w.translation ? ` — ${w.translation}` : ""}`)
    .join("\n");
  const sectionList = sections.map((s, i) => `${i + 1}. ${s.path}`).join("\n");

  return `Tu aides un apprenant francophone débutant en chinois mandarin (caractères simplifiés) à remplir son carnet de grammaire personnel.

Sa demande : « ${request} »

Rédige une fiche courte et claire sur ce point, en français, pour un débutant :
- une explication simple (2 à 4 phrases au plus), sans jargon inutile ;
- la structure à retenir, si c'en est une (ex. « Sujet + 又 + adj. 1 + 又 + adj. 2 ») ;
- 3 à 6 exemples simples, comme dans un bon manuel : chaque phrase doit être correcte, naturelle et plausible dans la vraie vie (jamais de phrase absurde comme « l'eau est noire et grande »), avec la grammaire standard (classificateurs compris : 这本书, 一只猫). Utilise les mots connus ci-dessous quand ils vont naturellement, sinon des mots très courants de niveau débutant ;
- si utile, une liste (ex. les jours de la semaine) et un piège courant à éviter.
N'invente pas de règle : si la demande est floue, traite le sens le plus probable pour un débutant.

Réponds UNIQUEMENT avec un objet JSON :
{
  "title": "titre court, ex. 又…又… : deux qualités à la fois",
  "icon": "un seul emoji",
  ${chooseParent ? `"parent": numéro de la section existante (liste ci-dessous) dont cette fiche est un sous-point, ou null si c'est un sujet à part,\n  ` : ""}"blocks": [
    {"type": "paragraph", "text": "explication"},
    {"type": "pattern", "text": "structure"},
    {"type": "heading", "text": "Exemples"},
    {"type": "example", "hanzi": "她又高又瘦。", "fr": "Elle est grande et mince."},
    {"type": "bullet", "text": "élément de liste ou remarque"}
  ]
}
Types de blocs possibles : heading (sous-titre court), paragraph, pattern (la structure), bullet, example (phrase en caractères + traduction ; le pinyin est ajouté automatiquement). Pour une liste de mots (jours, nombres…), utilise des blocs example avec le mot et sa traduction.

## Mots connus de l'apprenant
${wordList || "(aucun pour l'instant)"}
${chooseParent ? `\n## Sections existantes de son carnet\n${sectionList || "(aucune)"}` : ""}`;
}

const text = z.string().default("");
const replySchema = z.object({
  title: z.string().min(1),
  icon: text,
  parent: z.union([z.coerce.number().int(), z.null()]).optional().catch(null),
  blocks: z
    .array(z.object({ type: z.string(), text, hanzi: text, fr: text }))
    .default([]),
});

/** Validates the model's answer; pinyin of examples comes from pinyin-pro (reliable tones, 一/不 changes). */
export function parseGrammarReply(raw: string, sectionCount: number): GrammarDraft | null {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed;
  try {
    parsed = replySchema.safeParse(JSON.parse(cleaned.slice(start, end + 1)));
  } catch {
    return null;
  }
  if (!parsed.success) return null;
  const { title, icon, parent, blocks } = parsed.data;

  const draft: DraftBlock[] = [];
  for (const b of blocks.slice(0, 40)) {
    if (b.type === "example" && hasHanzi(b.hanzi)) {
      draft.push({ type: "example", hanzi: b.hanzi.trim(), pinyin: sentencePinyin(b.hanzi.trim()), fr: b.fr.trim() });
    } else if ((b.type === "heading" || b.type === "paragraph" || b.type === "pattern" || b.type === "bullet") && b.text.trim()) {
      draft.push({ type: b.type, text: b.text.trim() });
    }
  }
  if (!draft.length) return null;

  const index = typeof parent === "number" && parent >= 1 && parent <= sectionCount ? parent - 1 : null;
  return { title: title.trim(), icon: [...icon.trim()].slice(0, 2).join("") || "📘", parentIndex: index, blocks: draft };
}

type StyledText = { type: "text"; text: string; styles: Record<string, boolean> };

/** BlockNote document for a draft: plain blocks the user can rewrite freely. */
export function draftToBlocks(blocks: DraftBlock[]) {
  return blocks.map((b) => {
    switch (b.type) {
      case "heading":
        return { type: "heading", props: { level: 3 }, content: b.text };
      case "paragraph":
        return { type: "paragraph", content: b.text };
      case "pattern":
        return { type: "quote", content: [{ type: "text", text: b.text, styles: { bold: true } } satisfies StyledText] };
      case "bullet":
        return { type: "bulletListItem", content: b.text };
      case "example": {
        // Pinyin first, then the characters, then the translation.
        const content: StyledText[] = [
          { type: "text", text: b.pinyin, styles: { bold: true } },
          { type: "text", text: `  ${b.hanzi}`, styles: {} },
        ];
        if (b.fr) content.push({ type: "text", text: `  — ${b.fr}`, styles: { italic: true } });
        return { type: "bulletListItem", content };
      }
    }
  });
}
