import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { describePrompt, parseCharacterList, PHOTO_PROMPT } from "@/lib/ai/characters";
import { hanziChars } from "@/lib/pinyin";

export const maxDuration = 60;

const MAX_IMAGE_CHARS = 6_000_000; // ~4.5 MB of base64
const MAX_CHARS = 200;

/**
 * Reads the characters on a photo of the learner's notebook — or describes a
 * pasted list — and returns them with pinyin and a French meaning, for review.
 */
export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY manquante (voir le README)." }, { status: 500 });

  const { image, text } = (await request.json()) as { image?: string; text?: string };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  let content: OpenAI.Chat.ChatCompletionUserMessageParam["content"];
  let model: string;
  if (image) {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > MAX_IMAGE_CHARS) {
      return NextResponse.json({ error: "Image illisible ou trop lourde." }, { status: 400 });
    }
    content = [
      { type: "text", text: PHOTO_PROMPT },
      { type: "image_url", image_url: { url: image } },
    ];
    // Read all 59 characters of six handwritten notebook pages without a miss in tests.
    model = process.env.OPENROUTER_VISION_MODEL || "deepseek/deepseek-v4.1-flash";
  } else {
    const chars = hanziChars(text ?? "").slice(0, MAX_CHARS);
    if (!chars.length) return NextResponse.json({ characters: [] });
    content = describePrompt(chars);
    model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash";
  }

  const client = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1", defaultHeaders: { "X-Title": "Chinese learning dashboard" } });
  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 6000,
      ...({ reasoning: { enabled: false }, provider: { sort: "latency" } } as object),
    });
    const characters = parseCharacterList(completion.choices[0]?.message?.content ?? "");
    if (!characters) return NextResponse.json({ error: "Réponse de l'IA illisible, réessaie." }, { status: 502 });
    return NextResponse.json({ characters });
  } catch (err) {
    return NextResponse.json({ error: `Lecture impossible : ${err instanceof Error ? err.message : err}` }, { status: 502 });
  }
}
