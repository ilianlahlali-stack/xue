import { describe, expect, it } from "vitest";
import medians from "./fixtures/medians.json";
import { compareWriting, mediansToStrokes, STRICTNESS, type Stroke } from "@/lib/handwriting";

const M = medians as Record<string, number[][][]>;
const model = (c: string) => mediansToStrokes(M[c]);

function rng(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

/** A plausible beginner drawing: any stroke order and direction, smaller, offset, skewed, wobbly. */
function sloppy(strokes: Stroke[], seed: number): Stroke[] {
  const r = rng(seed);
  const scale = 0.25 + r() * 0.15;
  const aspect = 0.9 + r() * 0.2;
  const shear = (r() - 0.5) * 0.16;
  const [ox, oy] = [r() * 100, r() * 100];
  return strokes
    .map((s) => {
      const [dx, dy] = [(r() - 0.5) * 60, (r() - 0.5) * 60];
      const pts = s.map((p) => ({ x: p.x + dx + (r() - 0.5) * 20, y: p.y + dy + (r() - 0.5) * 20 }));
      const oriented = r() < 0.5 ? pts.reverse() : pts;
      return oriented.map((p) => ({ x: ox + (p.x + shear * p.y) * scale * aspect, y: oy + p.y * scale }));
    })
    .sort(() => r() - 0.5);
}

const N = 20;
const LENIENT = STRICTNESS.lenient;
const STRICT = STRICTNESS.strict;
const accepted = (target: string, drawn: Stroke[][], options = LENIENT) =>
  drawn.filter((d) => compareWriting(model(target), d, options).correct).length;
const drawings = (c: string, transform: (s: Stroke[], i: number) => Stroke[] = (s) => s) =>
  Array.from({ length: N }, (_, i) => sloppy(transform(model(c), i), i + 1));

describe("compareWriting", () => {
  it("accepts the right character drawn in any order and direction", () => {
    for (const c of Object.keys(M)) {
      expect(accepted(c, drawings(c)), `souple ${c}`).toBeGreaterThanOrEqual(N - 1);
      expect(accepted(c, drawings(c), STRICT), `strict ${c}`).toBeGreaterThanOrEqual(N - 4);
    }
  });

  it("matches a perfect drawing with a full score", () => {
    const result = compareWriting(model("学"), model("学").map((s) => [...s].reverse()).reverse());
    expect(result).toMatchObject({ correct: true, missing: [], extra: [] });
    expect(result.score).toBeGreaterThan(0.99);
  });

  it("rejects clearly different characters, even in lenient mode", () => {
    for (const [target, drawn] of [["太", "大"], ["目", "日"], ["口", "日"], ["日", "口"], ["大", "人"], ["我", "学"]]) {
      expect(accepted(target, drawings(drawn)), `${target} ← ${drawn}`).toBeLessThanOrEqual(1);
    }
  });

  it("tells close look-alikes apart in strict mode", () => {
    for (const [target, drawn] of [["大", "太"], ["夫", "天"], ["天", "夫"], ["土", "士"], ["士", "土"], ["日", "目"]]) {
      expect(accepted(target, drawings(drawn), STRICT), `${target} ← ${drawn}`).toBeLessThanOrEqual(4);
    }
  });

  it("points at the stroke that was forgotten, whichever it is", () => {
    for (const c of ["学", "我", "天", "日", "大"]) {
      model(c).forEach((_, k) => {
        const drawn = model(c).filter((_, j) => j !== k);
        expect(compareWriting(model(c), drawn).missing, `${c} sans le trait ${k}`).toEqual([k]);
      });
    }
  });

  it("spots a forgotten stroke in a sloppy drawing", () => {
    const withoutOne = (s: Stroke[], i: number) => s.filter((_, k) => k !== i % s.length);
    expect(accepted("学", drawings("学", withoutOne))).toBeLessThanOrEqual(1);
    expect(accepted("量", drawings("量", withoutOne))).toBeLessThanOrEqual(6);
  });

  it("reports extra strokes", () => {
    expect(compareWriting(model("大"), model("太")).extra).toHaveLength(1);
  });

  it("handles an empty drawing", () => {
    expect(compareWriting(model("人"), [])).toMatchObject({ correct: false, missing: [0, 1], score: 0 });
  });
});
