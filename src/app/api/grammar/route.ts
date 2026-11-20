import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildGrammarPrompt, parseGrammarReply } from "@/lib/ai/grammar";

/** Placeholder titles and the Practice inbox are not real topics: never file a note there automatically. */
const NOT_A_TOPIC = new Set(["nouvelle section", "nouvelle sous-section", "sans titre", "découvertes en practice"]);

export const maxDuration = 60;

type SectionRow = { id: string; parent_id: string | null; title: string };

/**
 * Drafts a grammar note from a request like "ajoute la règle de 又…又…".
 * Nothing is saved here: the app shows a preview and creates the section.
 */
export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY manquante (voir le README)." }, { status: 500 });

  const { request: ask, parent } = (await request.json()) as { request?: string; parent?: string };
  const text = (ask ?? "").trim().slice(0, 1000);
  if (!text) return NextResponse.json({ error: "Écris ce que tu veux ajouter." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const [sectionsRes, wordsRes] = await Promise.all([
    supabase.from("grammar_sections").select("id, parent_id, title").order("position"),
    supabase.from("words").select("hanzi, pinyin, translation").order("created_at", { ascending: false }).limit(1500),
  ]);
  const sections = (sectionsRes.data ?? []) as SectionRow[];
  const byId = new Map(sections.map((s) => [s.id, s]));
  const path = (s: SectionRow): string => {
    const p = s.parent_id ? byId.get(s.parent_id) : undefined;
    return p ? `${path(p)} › ${s.title}` : s.title;
  };
  const chooseParent = parent === "auto";
  const candidates = sections.filter((s) => !NOT_A_TOPIC.has(s.title.trim().toLowerCase()));

  const client = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1", defaultHeaders: { "X-Title": "Chinese learning dashboard" } });
  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash",
      messages: [
        {
          role: "user",
          content: buildGrammarPrompt({
            request: text,
            sections: candidates.map((s) => ({ path: path(s) })),
            words: wordsRes.data ?? [],
            chooseParent,
          }),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 3000,
      ...({ reasoning: { enabled: false }, provider: { sort: "latency" } } as object),
    });
    const draft = parseGrammarReply(completion.choices[0]?.message?.content ?? "", candidates.length);
    if (!draft) return NextResponse.json({ error: "Réponse de l'IA illisible, réessaie." }, { status: 502 });

    const parentId = chooseParent
      ? draft.parentIndex === null
        ? null
        : candidates[draft.parentIndex].id
      : parent && parent !== "root" && byId.has(parent)
        ? parent
        : null;
    return NextResponse.json({ draft: { title: draft.title, icon: draft.icon, blocks: draft.blocks, parentId } });
  } catch (err) {
    return NextResponse.json({ error: `L'IA n'a pas pu rédiger la fiche : ${err instanceof Error ? err.message : err}` }, { status: 502 });
  }
}
