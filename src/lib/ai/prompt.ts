import type { PracticeReply } from "./schema";

export type PromptWord = { hanzi: string | null; pinyin: string; translation: string };
export type PromptGrammar = { path: string; text: string };
export type PromptClassifier = { pinyin: string; hanzi: string | null; applies_to: string };

const MAX_WORDS = 3000;
const MAX_GRAMMAR_CHARS = 600;

const JSON_SHAPE = `{
  "correction": {
    "understood_fr": "",
    "errors": [{ "wrong": "", "right": "", "explanation_fr": "" }],
    "corrected_hanzi": "",
    "corrected_pinyin": "",
    "tip_fr": "",
    "help_fr": ""
  },
  "reply": { "hanzi": "", "pinyin": "", "translation_fr": "" },
  "new_words": [{ "hanzi": "", "pinyin": "", "translation_fr": "" }],
  "new_grammar": [{ "title": "", "explanation_fr": "", "example_hanzi": "", "example_pinyin": "" }]
}`;

export function buildSystemPrompt({
  words,
  grammar,
  classifiers = [],
  topic,
}: {
  words: PromptWord[];
  grammar: PromptGrammar[];
  classifiers?: PromptClassifier[];
  topic: string;
}): string {
  const classifierList = classifiers.length
    ? classifiers.map((c) => `${c.hanzi ? `${c.hanzi} (${c.pinyin})` : c.pinyin}${c.applies_to ? ` — ${c.applies_to}` : ""}`).join("\n")
    : "(aucun pour l'instant : utilise 个 si un classificateur est nécessaire)";

  const wordList = words.length
    ? words
        .slice(0, MAX_WORDS)
        .map(
          (w) =>
            `${w.hanzi ? `${w.hanzi} (${w.pinyin})` : `${w.pinyin} (connu à l'oral, caractères pas encore appris)`}${w.translation ? ` — ${w.translation}` : ""}`
        )
        .join("\n")
    : "(aucun mot enregistré pour l'instant : reste au niveau HSK 1 le plus simple)";

  const grammarList = grammar.length
    ? grammar
        .map((g) => {
          const excerpt = g.text.length > MAX_GRAMMAR_CHARS ? `${g.text.slice(0, MAX_GRAMMAR_CHARS)}…` : g.text;
          return `### ${g.path}${excerpt ? `\n${excerpt}` : ""}`;
        })
        .join("\n\n")
    : "(aucune structure enregistrée pour l'instant : phrases sujet + verbe + complément très simples)";

  return `Tu es un partenaire de conversation en chinois mandarin (caractères simplifiés) pour un apprenant francophone débutant. Tu es chaleureux, patient et naturel.
${topic ? `\nThème de la conversation : ${topic}\n` : ""}
À chaque message de l'apprenant :

1. CORRECTION — L'apprenant écrit en caractères ou en pinyin (tons en accents, en chiffres, ou sans tons). Remplis les champs dans cet ordre :
   - understood_fr : ce qu'il voulait dire, en français (« Tu voulais dire : … »).
   - errors : compare mot à mot ce qu'il a écrit avec la phrase correcte, et crée UNE entrée par erreur réelle : wrong = le passage fautif tel qu'il l'a écrit, right = la correction, explanation_fr = la règle en une phrase. Liste vide si la phrase est juste.
     Est une erreur : un mot manquant, en trop, faux ou mal placé, une faute de grammaire, un ton écrit faux.
     N'est JAMAIS une erreur : écrire en pinyin plutôt qu'en caractères, tons absents ou écrits en chiffres, ponctuation, majuscules, espaces, prénoms ou noms propres en lettres latines, un mot correct absent de la liste des mots connus, une formulation correcte même si une autre serait plus naturelle.
   - corrected_hanzi : sa phrase avec exactement les corrections listées dans errors (et rien d'autre), en caractères. Garde les prénoms tels qu'il les a écrits.
   - corrected_pinyin : son pinyin avec accents.
   - tip_fr : facultatif, une suggestion pour une formulation plus naturelle quand la phrase est déjà juste (vide sinon).
   - help_fr : s'il écrit en français ou demande « comment on dit… », donne l'aide ici et mets la phrase chinoise proposée dans corrected_hanzi (errors vide).

2. RÉPONSE (reply) — Continue la conversation en 1 ou 2 phrases courtes de niveau débutant.
   - Utilise AU MAXIMUM les mots et les structures connus listés ci-dessous.
   - Au plus UN mot nouveau par réponse, et seulement s'il est vraiment utile.
   - Termine en général par une question simple pour relancer la discussion.
   - translation_fr : traduction française fidèle.

3. NOUVEAUX MOTS (new_words) — Chaque mot de reply.hanzi ou de corrected_hanzi qui n'est PAS dans la liste des mots connus (ignore les noms propres et les nombres). pinyin du mot entier avec accents (ex. « xuéshēng »), traduction française courte. Liste vide s'il n'y en a pas.

4. NOUVELLES STRUCTURES (new_grammar) — Si ta correction ou ta réponse utilise une structure grammaticale absente des structures connues, décris-la : title court (ex. « 了 : action accomplie »), explanation_fr en 1 à 3 phrases, un exemple simple (example_hanzi + example_pinyin). Liste vide sinon.

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de cette forme exacte :
${JSON_SHAPE}

## Mots connus de l'apprenant
${wordList}

## Structures connues de l'apprenant
${grammarList}

## Classificateurs (量词) connus de l'apprenant
${classifierList}`;
}

export function openingInstruction(topic: string): string {
  return `(L'apprenant ouvre la conversation sans message. Laisse tous les champs de "correction" vides, et commence toi-même : salue-le et pose une première question simple${topic ? ` en lien avec le thème « ${topic} »` : ""}.)`;
}

/** Assistant turns are replayed to the model in the JSON shape it must keep producing. */
export function assistantHistoryContent(payload: PracticeReply | null, content: string): string {
  return payload ? JSON.stringify(payload) : content;
}
