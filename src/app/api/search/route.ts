import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildSearchPrompt, parseSearchMatches, type SearchableWord } from "@/lib/ai/search";

export const maxDuration = 60;

/** Finds the user's words related to a theme ("house" → 家, 门, 床…), labelled or not. */
export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY manquante (voir le README)." }, { status: 500 });

  const { query } = (await request.json()) as { query?: string };
  const q = (query ?? "").trim().slice(0, 200);
  if (!q) return NextResponse.json({ matches: [] });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const { data, error } = await supabase
    .from("words")
    .select("id, hanzi, pinyin, translation, literal")
    .order("created_at", { ascending: false })
    .limit(3000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const words = (data ?? []) as SearchableWord[];
  if (!words.length) return NextResponse.json({ matches: [] });

  const client = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1", defaultHeaders: { "X-Title": "Chinese learning dashboard" } });
  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash",
      messages: [{ role: "user", content: buildSearchPrompt(q, words) }],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 2500,
      ...({ reasoning: { enabled: false }, provider: { sort: "latency" } } as object),
    });
    const matches = parseSearchMatches(completion.choices[0]?.message?.content ?? "", words);
    if (!matches) return NextResponse.json({ error: "Réponse de l'IA illisible, réessaie." }, { status: 502 });
    return NextResponse.json({ matches });
  } catch (err) {
    return NextResponse.json({ error: `Recherche IA impossible : ${err instanceof Error ? err.message : err}` }, { status: 502 });
  }
}
