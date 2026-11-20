import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkSchema, checkTranslationPrompt } from "@/lib/ai/exercise";
import { hasHanzi, sentencePinyin } from "@/lib/pinyin";

export const maxDuration = 30;

/** Grades a free translation that didn't match the reference answers word for word. */
export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY manquante (voir le README)." }, { status: 500 });

  const { french, answers, typed } = (await request.json()) as { french?: string; answers?: string[]; typed?: string };
  if (!french || !answers?.length || !typed?.trim()) return NextResponse.json({ error: "Question incomplète." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const client = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1", defaultHeaders: { "X-Title": "Chinese learning dashboard" } });
  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash",
      messages: [{ role: "user", content: checkTranslationPrompt({ french, answers, typed: typed.trim().slice(0, 300) }) }],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 600,
      ...({ reasoning: { enabled: false }, provider: { sort: "latency" } } as object),
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = checkSchema.safeParse(JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)));
    if (!parsed.success) return NextResponse.json({ error: "Correction illisible, réessaie." }, { status: 502 });
    const corrected = hasHanzi(parsed.data.corrected) ? parsed.data.corrected.trim() : answers[0];
    return NextResponse.json({
      ok: parsed.data.ok,
      feedback: parsed.data.feedback_fr.trim(),
      corrected: { hanzi: corrected, pinyin: sentencePinyin(corrected) },
    });
  } catch (err) {
    return NextResponse.json({ error: `Correction impossible : ${err instanceof Error ? err.message : err}` }, { status: 502 });
  }
}
