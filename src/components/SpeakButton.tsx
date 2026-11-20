"use client";

import { Volume2 } from "lucide-react";
import { cx } from "@/components/ui";

function chineseVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === "zh-CN" && /premium|enhanced|natural/i.test(v.name)) ??
    voices.find((v) => v.lang === "zh-CN") ??
    voices.find((v) => v.lang.startsWith("zh"))
  );
}

export function speak(text: string, rate = 0.85) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = rate;
  const voice = chineseVoice();
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

export default function SpeakButton({ text, className, size = 18 }: { text: string; className?: string; size?: number }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        speak(text);
      }}
      aria-label={`Écouter ${text}`}
      className={cx(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-accent",
        className
      )}
    >
      <Volume2 size={size} />
    </button>
  );
}
