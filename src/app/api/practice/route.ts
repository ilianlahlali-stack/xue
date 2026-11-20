import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assistantHistoryContent, buildSystemPrompt, openingInstruction, type PromptGrammar } from "@/lib/ai/prompt";
import { parsePracticeReply, type PracticeReply } from "@/lib/ai/schema";
import { blocksToText } from "@/lib/blocks";
import { cleanReply } from "@/lib/ai/postprocess";
import { stripTones } from "@/lib/pinyin";
import type { Message } from "@/lib/types";

export const maxDuration = 60;

const HISTORY_LENGTH = 20;

type SectionRow = { id: string; parent_id: string | null; title: string; content: unknown; include_in_practice: boolean };

function grammarForPrompt(sections: SectionRow[]): PromptGrammar[] {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const path = (s: SectionRow): string => {
    const parent = s.parent_id ? byId.get(s.parent_id) : undefined;
    return parent ? `${path(parent)} › ${s.title}` : s.title;
  };
  return sections
    .filter((s) => s.include_in_practice)
    .map((s) => ({ path: path(s), text: blocksToText(s.content) }));
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY manquante (voir le README)." }, { status: 500 });
  }

  const { conversationId, text } = (await request.json()) as { conversationId?: string; text?: string };
  const userText = (text ?? "").trim();
  if (!conversationId) return NextResponse.json({ error: "conversationId manquant" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const [conversationRes, historyRes, wordsRes, sectionsRes, classifiersRes] = await Promise.all([
    supabase.from("conversations").select("id, title, topic").eq("id", conversationId).single(),
    supabase
      .from("messages")
      .select("role, content, payload")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LENGTH),
    supabase.from("words").select("hanzi, pinyin, translation").order("created_at", { ascending: false }).limit(3000),
    supabase.from("grammar_sections").select("id, parent_id, title, content, include_in_practice"),
    supabase.from("classifiers").select("pinyin, hanzi, applies_to").order("created_at"),
  ]);

  if (conversationRes.error || !conversationRes.data) {
    return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
  }
  const conversation = conversationRes.data;
  const words = wordsRes.data ?? [];
  const sections = (sectionsRes.data ?? []) as SectionRow[];
  const history = ((historyRes.data ?? []) as Pick<Message, "role" | "content" | "payload">[]).reverse();

  let userMessage: Message | null = null;
  if (userText) {
    const { data, error } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, role: "user", content: userText })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    userMessage = data as Message;
  }

  const chat: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        words,
        grammar: grammarForPrompt(sections),
        classifiers: classifiersRes.data ?? [],
        topic: conversation.topic,
      }),
    },
    ...history.map(
      (m): OpenAI.Chat.ChatCompletionMessageParam =>
        m.role === "assistant"
          ? { role: "assistant", content: assistantHistoryContent(m.payload, m.content) }
          : { role: "user", content: m.content }
    ),
    { role: "user", content: userText || openingInstruction(conversation.topic) },
  ];

  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: { "X-Title": "Chinese learning dashboard" },
  });
  const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash";

  let reply: PracticeReply | null = null;
  let lastError = "";
  for (let attempt = 0; attempt < 2 && !reply; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model,
        messages:
          attempt === 0
            ? chat
            : [...chat, { role: "user", content: "Ta réponse précédente n'était pas un JSON valide. Réponds uniquement avec l'objet JSON demandé." }],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 1200,
        // OpenRouter extensions: skip "thinking" (faster, cheaper) and route to the
        // fastest provider — default routing measured 7–20 s vs ~2 s for this one.
        ...({ reasoning: { enabled: false }, provider: { sort: "latency" } } as object),
      });
      reply = parsePracticeReply(completion.choices[0]?.message?.content ?? "");
      if (!reply) lastError = "Réponse de l'IA illisible.";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      break;
    }
  }

  if (!reply) {
    // Drop the user's message so it can simply be sent again without a duplicate.
    if (userMessage) await supabase.from("messages").delete().eq("id", userMessage.id);
    return NextResponse.json({ error: `L'IA n'a pas pu répondre : ${lastError}` }, { status: 502 });
  }

  const knownHanzi = new Set(words.flatMap((w) => (w.hanzi ? [w.hanzi as string] : [])));
  const knownSounds = new Set(words.filter((w) => !w.hanzi).map((w) => stripTones(w.pinyin as string)));
  const knownTitles = new Set(sections.map((s) => s.title.trim().toLowerCase()));
  const payload = cleanReply(reply, { userText, knownHanzi, knownTitles, knownSounds });

  const { data: assistantMessage, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role: "assistant", content: payload.reply.hanzi, payload })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message, userMessage }, { status: 500 });

  // Bump updated_at so the conversation list stays sorted by activity.
  await supabase.from("conversations").update({ title: conversation.title }).eq("id", conversationId);

  return NextResponse.json({ userMessage, assistantMessage });
}
