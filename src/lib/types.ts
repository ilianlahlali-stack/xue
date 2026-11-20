import type { PracticeReply } from "@/lib/ai/schema";

export type Word = {
  id: string;
  /** null when the word is only known by its pinyin (characters not learnt yet). */
  hanzi: string | null;
  pinyin: string;
  translation: string;
  /** Literal word-by-word meaning, for expressions and chengyu. */
  literal: string;
  notes: string;
  kind: "word" | "expression";
  source: "manual" | "practice";
  created_at: string;
  category_ids: string[];
};

export type Classifier = {
  id: string;
  pinyin: string;
  /** Optional, like for words. */
  hanzi: string | null;
  /** What it counts: "animaux", "livres"… */
  applies_to: string;
  /** One example per line, e.g. 一只羊. */
  examples: string;
  notes: string;
  created_at: string;
};

export type Category = {
  id: string;
  name: string;
  icon: string | null;
  position: number;
};

export type Character = {
  id: string;
  hanzi: string;
  pinyin: string;
  meaning: string;
  notes: string;
  /** Only a radical/component, not a word on its own (shown with an asterisk). */
  is_radical: boolean;
  created_at: string;
};

export type CardMode = "recognition" | "production" | "writing";

export type ReviewCard = {
  id: string;
  word_id: string | null;
  classifier_id?: string | null;
  character_id: string | null;
  mode: CardMode;
  fsrs: StoredFsrsCard | null;
  due: string;
};

/** ts-fsrs Card once it has been through JSON (dates become strings). */
export type StoredFsrsCard = Record<string, unknown>;

export type GrammarSection = {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
  position: number;
  include_in_practice: boolean;
  updated_at: string;
};

export type Conversation = {
  id: string;
  title: string;
  topic: string;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  payload: PracticeReply | null;
  created_at: string;
};
