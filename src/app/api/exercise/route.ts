import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildExercisePrompt, parseExercise, rulesFrom, variety, type ExerciseSection } from "@/lib/ai/exercise";

export const maxDuration = 60;

/** A new exercise on the chosen grammar sections (nothing is stored). */
export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY manquante (voir le README)." }, { status: 500 });

  const { sectionIds } = (await request.json()) as { sectionIds?: string[] };
  if (!sectionIds?.length) return NextResponse.json({ error: "Choisis au moins une règle." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const [sectionsRes, wordsRes] = await Promise.all([
    supabase.from("grammar_sections").select("id, parent_id, title, content").order("position"),
    supabase.from("words").select("hanzi, pinyin, translation").order("created_at", { ascending: false }).limit(1500),
  ]);
  const rules = rulesFrom((sectionsRes.data ?? []) as ExerciseSection[], sectionIds);
  if (!rules.length) return NextResponse.json({ error: "Ces règles n'existent plus." }, { status: 404 });

  const client = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1", defaultHeaders: { "X-Title": "Chinese learning dashboard" } });
  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash",
      messages: [{ role: "user", content: buildExercisePrompt({ rules, words: wordsRes.data ?? [], ...variety() }) }],
      response_format: { type: "json_object" },
      temperature: 0.9, // a different exercise every time
      max_tokens: 4000,
      ...({ reasoning: { enabled: false }, provider: { sort: "latency" } } as object),
    });
    const exercise = parseExercise(completion.choices[0]?.message?.content ?? "", rules);
    if (!exercise) return NextResponse.json({ error: "L'exercice généré était inutilisable, réessaie." }, { status: 502 });
    return NextResponse.json({ exercise, rules: rules.map((r) => r.title) });
  } catch (err) {
    return NextResponse.json({ error: `Impossible de créer l'exercice : ${err instanceof Error ? err.message : err}` }, { status: 502 });
  }
}
