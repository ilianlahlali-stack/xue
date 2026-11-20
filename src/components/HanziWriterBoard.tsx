"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type HanziWriter from "hanzi-writer";

export type BoardHandle = { animate: () => void };

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** 田字格: the practice grid printed in Chinese exercise books. */
export function TianZiGe({ size }: { size: number }) {
  return (
    <svg width={size} height={size} className="pointer-events-none absolute inset-0" aria-hidden>
      <g stroke="var(--grid)" strokeWidth={1} fill="none">
        <rect x={0.5} y={0.5} width={size - 1} height={size - 1} strokeWidth={1.5} />
        <line x1={size / 2} y1={0} x2={size / 2} y2={size} strokeDasharray="6 6" />
        <line x1={0} y1={size / 2} x2={size} y2={size / 2} strokeDasharray="6 6" />
        <line x1={0} y1={0} x2={size} y2={size} strokeDasharray="4 8" opacity={0.6} />
        <line x1={size} y1={0} x2={0} y2={size} strokeDasharray="4 8" opacity={0.6} />
      </g>
    </svg>
  );
}

/** Square size that fits the parent's width, capped at `maxSize`. */
export function useSquareSize(maxSize: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize(Math.floor(Math.min(maxSize, el.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [maxSize]);
  return { ref, size };
}

/** Shows a character and animates how it is drawn (hanzi-writer). */
export default function HanziWriterBoard({
  char,
  maxSize = 320,
  ref,
}: {
  char: string;
  maxSize?: number;
  ref?: Ref<BoardHandle>;
}) {
  const { ref: wrapRef, size } = useSquareSize(maxSize);
  const targetRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<HanziWriter | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const target = targetRef.current;
    if (!size || !target) return;
    let cancelled = false;

    import("hanzi-writer").then(({ default: HanziWriterLib }) => {
      if (cancelled) return;
      target.innerHTML = "";
      const writer = HanziWriterLib.create(target, char, {
        width: size,
        height: size,
        padding: Math.round(size * 0.06),
        showOutline: true,
        showCharacter: false,
        strokeColor: cssVar("--ink"),
        radicalColor: null,
        outlineColor: cssVar("--line"),
        strokeAnimationSpeed: 1.2,
        delayBetweenStrokes: 200,
        onLoadCharDataSuccess: () => !cancelled && setFailed(null),
        onLoadCharDataError: () => !cancelled && setFailed(char),
      });
      writerRef.current = writer;
      writer.animateCharacter();
    });

    return () => {
      cancelled = true;
      writerRef.current = null;
    };
  }, [char, size]);

  useImperativeHandle(ref, () => ({ animate: () => writerRef.current?.animateCharacter() }), []);

  return (
    <div ref={wrapRef} className="w-full">
      <div
        className="relative mx-auto"
        style={{ width: size || undefined, height: size || undefined, aspectRatio: size ? undefined : "1" }}
      >
        {size > 0 && <TianZiGe size={size} />}
        <div ref={targetRef} className="absolute inset-0" />
        {failed === char && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-sm text-muted">
            <span className="hz-kai text-6xl text-ink">{char}</span>
            Animation indisponible pour ce caractère (ou pas de connexion).
          </div>
        )}
      </div>
    </div>
  );
}
