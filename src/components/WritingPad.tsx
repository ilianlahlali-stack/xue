"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Eraser, Undo2 } from "lucide-react";
import { TianZiGe, useSquareSize } from "@/components/HanziWriterBoard";
import { Button } from "@/components/ui";
import type { CharData, Stroke } from "@/lib/handwriting";

/** Same box as hanzi-writer: the 1024-unit character with a small margin, y axis flipped. */
const VIEWBOX = "-60 -60 1144 1144";

/** A character drawn from its stroke outlines, each stroke in its own color. */
export function CharacterModel({
  data,
  size,
  color,
  colors,
  opacity = 1,
}: {
  data: CharData;
  size: number;
  color?: string;
  colors?: string[];
  opacity?: number;
}) {
  return (
    <svg width={size} height={size} viewBox={VIEWBOX} className="pointer-events-none absolute inset-0" style={{ opacity }} aria-hidden>
      <g transform="translate(0, 900) scale(1, -1)">
        {data.strokes.map((d, i) => (
          <path key={i} d={d} style={{ fill: colors?.[i] ?? color ?? "var(--ink)" }} />
        ))}
      </g>
    </svg>
  );
}

/**
 * A blank exercise-book square to write a character with a finger or the mouse,
 * in any stroke order. Strokes are reported in 0–1 units of the square.
 */
export default function WritingPad({
  maxSize = 340,
  under,
  over,
  strokeColors,
  locked = false,
  onChange,
}: {
  maxSize?: number;
  /** Drawn below the ink (e.g. a light model to trace over). */
  under?: (size: number) => ReactNode;
  /** Drawn above the ink (e.g. the correction). */
  over?: (size: number) => ReactNode;
  /** Per-stroke color overrides (e.g. strokes that match nothing). */
  strokeColors?: (string | undefined)[];
  locked?: boolean;
  onChange?: (strokes: Stroke[]) => void;
}) {
  const { ref, size } = useSquareSize(maxSize);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [count, setCount] = useState(0);

  function redraw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !size) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const style = getComputedStyle(document.documentElement);
    ctx.lineWidth = Math.max(6, size / 24);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const all = [...strokes.current, ...(current.current ? [current.current] : [])];
    all.forEach((stroke, index) => {
      if (!stroke.length) return;
      const color = strokeColors?.[index];
      ctx.strokeStyle = color?.startsWith("--") ? style.getPropertyValue(color).trim() : (color ?? style.getPropertyValue("--ink").trim());
      const pts = stroke.map((p) => ({ x: p.x * size, y: p.y * size }));
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      // Quadratic curves through midpoints give smooth, brush-like lines.
      for (let i = 1; i < pts.length - 1; i++) {
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, strokeColors]);

  function point(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  }

  function commit() {
    setCount(strokes.current.length);
    onChange?.(strokes.current.map((s) => [...s]));
    redraw();
  }

  function onDown(e: PointerEvent<HTMLCanvasElement>) {
    if (locked) return;
    e.preventDefault();
    try {
      // Keeps receiving moves if the finger slides outside the square.
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Some browsers refuse capture for synthetic or already-released pointers.
    }
    current.current = [point(e)];
    redraw();
  }

  function onMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!current.current) return;
    current.current.push(point(e));
    redraw();
  }

  function onUp() {
    if (!current.current) return;
    strokes.current.push(current.current);
    current.current = null;
    commit();
  }

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div ref={ref} className="w-full">
        <div
          className="draw-surface relative mx-auto"
          style={{ width: size || undefined, height: size || undefined, aspectRatio: size ? undefined : "1" }}
        >
          {size > 0 && <TianZiGe size={size} />}
          {size > 0 && under?.(size)}
          <canvas
            ref={canvasRef}
            className={locked ? "absolute inset-0 h-full w-full" : "absolute inset-0 h-full w-full cursor-crosshair"}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          {size > 0 && over?.(size)}
        </div>
      </div>
      {!locked && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={!count}
            onClick={() => {
              strokes.current.pop();
              commit();
            }}
          >
            <Undo2 size={16} /> Annuler le trait
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!count}
            onClick={() => {
              strokes.current = [];
              commit();
            }}
          >
            <Eraser size={16} /> Effacer
          </Button>
        </div>
      )}
    </div>
  );
}
