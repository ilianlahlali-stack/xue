"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowLeft, Check, CircleCheck, CircleX, Lightbulb, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { addGrammarFromPractice, addWord, deleteConversation, getConversation, listMessages, listWords } from "@/lib/db";
import { numbersToMarks } from "@/lib/pinyin";
import type { NewGrammar, NewWord, PracticeReply } from "@/lib/ai/schema";
import type { Conversation, Message } from "@/lib/types";
import { Button, cx, Spinner } from "@/components/ui";
import { useStoredFlag } from "@/components/Quiz";
import SpeakButton from "@/components/SpeakButton";

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showPinyin, setShowPinyin] = useStoredFlag("practice.showPinyin", true);
  const [showTranslation, setShowTranslation] = useStoredFlag("practice.showTranslation", false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getConversation(id).then(setConversation).catch(() => router.replace("/practice"));
    listMessages(id).then(setMessages);
    listWords().then((words) => setKnown(new Set(words.flatMap((w) => (w.hanzi ? [w.hanzi] : [])))));
  }, [id, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages?.length, sending]);

  async function send(content: string) {
    setSending(true);
    setError("");
    const temp: Message | null = content
      ? { id: "pending", conversation_id: id, role: "user", content, payload: null, created_at: new Date().toISOString() }
      : null;
    if (temp) setMessages((prev) => [...(prev ?? []), temp]);
    setText("");

    try {
      const res = await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, text: content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur inconnue");
      setMessages((prev) => [
        ...(prev ?? []).filter((m) => m.id !== "pending"),
        ...(data.userMessage ? [data.userMessage] : []),
        data.assistantMessage,
      ]);
    } catch (err) {
      setMessages((prev) => (prev ?? []).filter((m) => m.id !== "pending"));
      setText(content);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const content = text.trim();
    if (content && !sending) send(content);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  async function remove() {
    if (!confirm("Supprimer cette conversation ?")) return;
    await deleteConversation(id);
    router.replace("/practice");
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="pt-safe flex items-center gap-2 border-b border-line bg-surface/90 px-2 backdrop-blur md:px-4">
        <Link href="/practice" aria-label="Retour" className="flex h-12 w-10 items-center justify-center text-muted hover:text-ink">
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1 py-2">
          <p className="truncate font-semibold">{conversation?.title ?? "…"}</p>
          {conversation?.topic && <p className="truncate text-xs text-muted">Thème : {conversation.topic}</p>}
        </div>
        <Toggle on={showPinyin} onClick={() => setShowPinyin(!showPinyin)} label="Pinyin" />
        <Toggle on={showTranslation} onClick={() => setShowTranslation(!showTranslation)} label="FR" />
        <Button variant="ghost" size="icon" onClick={remove} aria-label="Supprimer la conversation">
          <Trash2 size={18} />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-5 md:px-6">
          {messages === null ? (
            <div className="flex justify-center py-20 text-muted">
              <Spinner />
            </div>
          ) : messages.length === 0 && !sending ? (
            <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
              <span className="hz-kai text-6xl text-accent">你好</span>
              <p className="max-w-sm text-muted">
                Écris une phrase en caractères ou en pinyin (avec ou sans tons, ex. <em>wo3 xi3huan1 cha2</em>), ou laisse
                l&apos;IA lancer la conversation.
              </p>
              <Button variant="primary" onClick={() => send("")}>
                <Sparkles size={16} /> Laisser l&apos;IA commencer
              </Button>
            </div>
          ) : (
            messages.map((m, i) =>
              m.role === "user" ? (
                <UserBubble key={m.id} message={m} />
              ) : (
                <AssistantTurn
                  key={m.id}
                  payload={m.payload}
                  content={m.content}
                  showCorrection={messages[i - 1]?.role === "user"}
                  showPinyin={showPinyin}
                  showTranslation={showTranslation}
                  known={known}
                  onWordAdded={(hanzi) => setKnown((prev) => new Set(prev).add(hanzi))}
                />
              )
            )
          )}
          {sending && (
            <div className="flex items-center gap-2 px-1 text-sm text-muted">
              <Spinner /> L&apos;IA réfléchit…
            </div>
          )}
          {error && (
            <div className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">
              {error}
              <p className="mt-1 text-xs opacity-80">Ton message a été remis dans la zone de saisie, tu peux le renvoyer.</p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <form onSubmit={submit} className="border-t border-line bg-surface/90 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={inputRef}
            lang="zh-Hans"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="你好！ / ni3 hao3 / nǐ hǎo"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="hz max-h-36 min-h-11 flex-1 resize-none rounded-2xl border border-line bg-bg px-4 py-2.5 text-[16px] outline-none [field-sizing:content] focus:border-accent"
          />
          <Button type="submit" variant="primary" size="icon" className="h-11 w-11 rounded-full" disabled={!text.trim() || sending} aria-label="Envoyer">
            <Send size={18} />
          </Button>
        </div>
      </form>
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "h-8 rounded-lg px-2.5 text-xs font-semibold transition",
        on ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2"
      )}
      aria-pressed={on}
    >
      {label}
    </button>
  );
}

function UserBubble({ message }: { message: Message }) {
  return (
    <div className="flex justify-end">
      <div
        lang="zh-Hans"
        className={cx(
          "hz max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[17px] text-bg",
          message.id === "pending" && "opacity-60"
        )}
      >
        {numbersToMarks(message.content)}
      </div>
    </div>
  );
}

function AssistantTurn({
  payload,
  content,
  showCorrection,
  showPinyin,
  showTranslation,
  known,
  onWordAdded,
}: {
  payload: PracticeReply | null;
  content: string;
  showCorrection: boolean;
  showPinyin: boolean;
  showTranslation: boolean;
  known: Set<string>;
  onWordAdded: (hanzi: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  if (!payload) {
    return <p className="hz text-lg">{content}</p>;
  }
  const { correction, reply, new_words, new_grammar } = payload;
  const ok = correction.errors.length === 0;
  const hasCorrection = showCorrection && Boolean(correction.corrected_hanzi || correction.help_fr);

  return (
    <div className="flex flex-col gap-2">
      {hasCorrection && (
        <div
          className={cx(
            "ml-auto max-w-[85%] rounded-2xl border px-4 py-2.5 text-sm",
            correction.help_fr ? "border-line bg-surface-2" : ok ? "border-good/25 bg-good-soft" : "border-accent/25 bg-accent-soft"
          )}
        >
          {!correction.help_fr && (
            <div className={cx("flex items-center gap-1.5 font-semibold", ok ? "text-good" : "text-accent")}>
              {ok ? <CircleCheck size={16} /> : <CircleX size={16} />}
              {ok ? "Correct" : `${correction.errors.length} erreur${correction.errors.length > 1 ? "s" : ""}`}
            </div>
          )}
          {!ok && correction.understood_fr && <p className="mt-0.5 text-muted">{correction.understood_fr}</p>}
          {correction.help_fr && <p className="text-ink">{correction.help_fr}</p>}
          {correction.corrected_hanzi && (
            <div className="mt-1 flex items-center gap-1">
              <p lang="zh-Hans" className="hz text-base text-ink">
                {correction.corrected_hanzi}
              </p>
              <SpeakButton text={correction.corrected_hanzi} size={16} className="h-7 w-7" />
            </div>
          )}
          {correction.corrected_pinyin && <p className="text-muted">{correction.corrected_pinyin}</p>}
          {correction.errors.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5 border-t border-accent/15 pt-2">
              {correction.errors.map((e, i) => (
                <li key={i} className="text-ink">
                  <span lang="zh-Hans" className="hz text-accent line-through decoration-accent/60">
                    {e.wrong}
                  </span>{" "}
                  →{" "}
                  <span lang="zh-Hans" className="hz font-medium text-good">
                    {e.right}
                  </span>
                  {e.explanation_fr && <span className="block text-muted">{e.explanation_fr}</span>}
                </li>
              ))}
            </ul>
          )}
          {correction.tip_fr && <p className="mt-1.5 text-muted">💡 {correction.tip_fr}</p>}
        </div>
      )}

      <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3">
        <div className="flex items-start gap-2">
          <p lang="zh-Hans" className="hz flex-1 text-xl leading-relaxed">
            {reply.hanzi}
          </p>
          <SpeakButton text={reply.hanzi} className="-mr-2 -mt-1" />
        </div>
        {showPinyin && reply.pinyin && <p className="mt-0.5 text-accent">{reply.pinyin}</p>}
        {reply.translation_fr &&
          (showTranslation || revealed ? (
            <p className="mt-1.5 text-sm text-muted">{reply.translation_fr}</p>
          ) : (
            <button onClick={() => setRevealed(true)} className="mt-1.5 text-sm text-muted underline decoration-dotted underline-offset-4">
              Voir la traduction
            </button>
          ))}
      </div>

      {(new_words.length > 0 || new_grammar.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {new_words.map((w) => (
            <NewWordChip key={w.hanzi} word={w} added={known.has(w.hanzi)} onAdded={onWordAdded} />
          ))}
          {new_grammar.map((g) => (
            <NewGrammarChip key={g.title} rule={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewWordChip({ word, added, onAdded }: { word: NewWord; added: boolean; onAdded: (hanzi: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    try {
      await addWord({ hanzi: word.hanzi, pinyin: word.pinyin, translation: word.translation_fr, source: "practice" });
    } catch (err) {
      // Already known (unique constraint): treat as added.
      if (!(err instanceof Error && err.message.includes("duplicate"))) {
        setBusy(false);
        alert(err instanceof Error ? err.message : String(err));
        return;
      }
    }
    onAdded(word.hanzi);
    setBusy(false);
  }
  return (
    <button
      onClick={add}
      disabled={added || busy}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition",
        added ? "border-good/30 bg-good-soft text-good" : "border-line bg-surface hover:border-accent/50"
      )}
    >
      {added ? <Check size={14} /> : busy ? <Spinner className="h-3.5 w-3.5" /> : <Plus size={14} className="text-accent" />}
      <span lang="zh-Hans" className="hz font-medium">
        {word.hanzi}
      </span>
      <span className="text-accent">{word.pinyin}</span>
      <span className="text-muted">· {word.translation_fr}</span>
    </button>
  );
}

function NewGrammarChip({ rule }: { rule: NewGrammar }) {
  const [state, setState] = useState<"idle" | "busy" | string>("idle");
  async function add() {
    setState("busy");
    const section = await addGrammarFromPractice(rule);
    setState(section.id);
  }
  if (state !== "idle" && state !== "busy") {
    return (
      <Link
        href={`/structure?s=${state}`}
        className="inline-flex items-center gap-1.5 rounded-xl border border-good/30 bg-good-soft px-3 py-1.5 text-sm text-good"
      >
        <Check size={14} /> Règle ajoutée : <span className="hz">{rule.title}</span>
      </Link>
    );
  }
  return (
    <button
      onClick={add}
      disabled={state === "busy"}
      title={rule.explanation_fr}
      className="inline-flex items-center gap-1.5 rounded-xl border border-warn/30 bg-warn-soft px-3 py-1.5 text-left text-sm text-warn transition hover:brightness-95"
    >
      {state === "busy" ? <Spinner className="h-3.5 w-3.5" /> : <Lightbulb size={14} />}
      Nouvelle règle : <span className="hz font-medium">{rule.title}</span>
    </button>
  );
}
