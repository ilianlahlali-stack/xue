// Compares a hand-drawn character with the model by shape only: stroke order,
// stroke direction, position and size in the square don't matter.

export type Point = { x: number; y: number };
export type Stroke = Point[];

/** hanzi-writer character data: SVG outlines + centerline ("median") of each stroke. */
export type CharData = { strokes: string[]; medians: number[][][] };

export type WritingResult = {
  /** 0–1, how closely the drawing matches. */
  score: number;
  /** Target strokes that are missing (indices into the character's strokes). */
  missing: number[];
  /** Drawn strokes that match no part of the character (indices into the drawing). */
  extra: number[];
  correct: boolean;
};

export type CompareOptions = {
  /** Distance (in character sizes) within which ink counts as being "on" a stroke. */
  tolerance?: number;
  /** Share of a stroke that must be matched for the stroke to count. */
  minMatch?: number;
  /** Each stroke must also reach both of its ends (tells 天 from 夫, 土 from 士). */
  endpoints?: boolean;
};

/**
 * Tuned on simulated beginner drawings (any order/direction, offset, skewed,
 * wobbly): "lenient" accepts sloppy but right drawings; "strict" also tells
 * apart characters that differ only by stroke lengths (土/士).
 */
export const STRICTNESS: Record<"lenient" | "strict", Required<CompareOptions>> = {
  lenient: { tolerance: 0.11, minMatch: 0.65, endpoints: false },
  strict: { tolerance: 0.09, minMatch: 0.7, endpoints: true },
};

const STEP = 0.02;
const ENDPOINT_MARGIN = 1.5;

/** hanzi-writer medians use a 1024 box with the y axis pointing up (baseline at 900). */
export function mediansToStrokes(medians: number[][][]): Stroke[] {
  return medians.map((median) => median.map(([x, y]) => ({ x, y: 900 - y })));
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Evenly spaced points along a polyline, so long and short segments weigh the same. */
function resample(stroke: Stroke, step: number): Point[] {
  if (stroke.length < 2) return stroke.length ? [stroke[0], stroke[0]] : [];
  const out: Point[] = [stroke[0]];
  let since = 0;
  for (let i = 1; i < stroke.length; i++) {
    let a = stroke[i - 1];
    const b = stroke[i];
    let segment = distance(a, b);
    while (since + segment >= step && segment > 0) {
      const t = (step - since) / segment;
      a = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      out.push(a);
      segment = distance(a, b);
      since = 0;
    }
    since += segment;
  }
  out.push(stroke[stroke.length - 1]);
  return out;
}

/** Centers the drawing and scales its larger side to 1 (keeps proportions). */
function normalize(strokes: Stroke[]): Stroke[] {
  const points = strokes.flat();
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return strokes.map((s) => s.map((p) => ({ x: (p.x - cx) / size, y: (p.y - cy) / size })));
}

function nearestDistance(p: Point, points: Point[]): { q: Point; d: number } {
  let best = Infinity;
  let q = points[0];
  for (const candidate of points) {
    const dd = (p.x - candidate.x) ** 2 + (p.y - candidate.y) ** 2;
    if (dd < best) {
      best = dd;
      q = candidate;
    }
  }
  return { q, d: Math.sqrt(best) };
}

/**
 * Fine-tunes the drawing's position and per-axis size so it lies on the model
 * (a few rounds of "move each point toward its nearest model point"). The
 * bounding-box start is thrown off when a stroke that gives the character its
 * width or height is missing; this pulls the strokes that are there back onto
 * their own model strokes, so the right stroke gets reported as missing.
 */
function align(drawn: Stroke[], model: Stroke[]): Stroke[] {
  const modelPoints = model.flat();
  let current = drawn;
  let [totalX, totalY] = [1, 1];
  for (let round = 0; round < 8; round++) {
    const pairs = current.flat().map((p) => ({ p, ...nearestDistance(p, modelPoints) }));
    // Ignore the farthest points: extra strokes and slips shouldn't drag the fit.
    const sorted = pairs.map((pair) => pair.d).sort((a, b) => a - b);
    const cutoff = Math.max(0.05, sorted[Math.floor(sorted.length * 0.8)] ?? 0);
    const kept = pairs.filter((pair) => pair.d <= cutoff);
    if (kept.length < 3) break;
    const fit = (axis: "x" | "y", total: number) => {
      const mp = mean(kept.map((k) => k.p[axis]));
      const mq = mean(kept.map((k) => k.q[axis]));
      const spread = kept.reduce((acc, k) => acc + (k.p[axis] - mp) ** 2, 0);
      const together = kept.reduce((acc, k) => acc + (k.p[axis] - mp) * (k.q[axis] - mq), 0);
      // Keep the overall resize within reason so the fit can't squash a wrong drawing onto the model.
      const scale = spread > 1e-9 ? Math.min(1.4 / total, Math.max(0.7 / total, together / spread)) : 1;
      return { scale, offset: mq - scale * mp };
    };
    const fx = fit("x", totalX);
    const fy = fit("y", totalY);
    totalX *= fx.scale;
    totalY *= fy.scale;
    current = current.map((s) => s.map((p) => ({ x: fx.scale * p.x + fx.offset, y: fy.scale * p.y + fy.offset })));
  }
  return current;
}

function mean(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function evaluate(
  t: Point[][],
  d: Point[][],
  { tolerance, minMatch, endpoints }: Required<CompareOptions>
): WritingResult {
  const limit = tolerance * tolerance;

  // Each drawn point belongs to its nearest model stroke, so ink drawn for one
  // stroke can't make a missing neighbour look present (dense characters like 量).
  const drawnPoints = d.flatMap((stroke, si) =>
    stroke.map((p) => {
      let best = Infinity;
      let owner = -1;
      t.forEach((ts, ti) => {
        for (const q of ts) {
          const dd = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
          if (dd < best) {
            best = dd;
            owner = ti;
          }
        }
      });
      return { p, si, owner, onModel: best <= limit };
    })
  );

  const coverage = t.map((stroke, ti) => {
    const mine = drawnPoints.filter((dp) => dp.owner === ti && dp.onModel).map((dp) => dp.p);
    const near = (q: Point, max = limit) => mine.some((p) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2 <= max);
    // Ends get a wider margin: strokes drawn a bit short or long are normal.
    const endLimit = limit * ENDPOINT_MARGIN ** 2;
    if (endpoints && !(near(stroke[0], endLimit) && near(stroke[stroke.length - 1], endLimit))) return 0;
    return stroke.filter((q) => near(q)).length / stroke.length;
  });
  const validity = d.map((_, si) => {
    const points = drawnPoints.filter((dp) => dp.si === si);
    return points.filter((dp) => dp.onModel).length / points.length;
  });
  const missing = coverage.flatMap((c, i) => (c < minMatch ? [i] : []));
  const extra = validity.flatMap((v, i) => (v < minMatch ? [i] : []));

  return {
    score: (mean(coverage) + mean(validity)) / 2,
    missing,
    extra,
    correct: missing.length === 0 && extra.length === 0,
  };
}

export function compareWriting(
  target: Stroke[],
  drawn: Stroke[],
  options: Required<CompareOptions> = STRICTNESS.lenient
): WritingResult {
  const usable = drawn.filter((s) => s.length > 0);
  if (!usable.length || !target.length) {
    return { score: 0, missing: target.map((_, i) => i), extra: [], correct: false };
  }
  const t = normalize(target).map((s) => resample(s, STEP));
  const modelPoints = t.flat();
  const boxed = normalize(usable);
  // Several ways to lay the drawing on the model. Fitting the two boxes is right
  // most of the time, but a missing stroke shrinks the drawing's box: then lining
  // up the edge that is intact (top, bottom, left or right) puts the strokes that
  // are there onto their own model strokes. The layout where the ink lies closest
  // to the model wins — judging by closeness, not by the verdict, so a layout
  // can't be picked just because it happens to hide a missing stroke.
  const candidates = [boxed, align(boxed, t), ...edgeFits(boxed, t)].map((c) => c.map((s) => resample(s, STEP)));
  const residual = (c: Point[][]) => mean(c.flat().map((p) => nearestDistance(p, modelPoints).d));
  const best = candidates.reduce((a, b) => (residual(b) < residual(a) ? b : a));
  return evaluate(t, best, options);
}

type Box = { minX: number; maxX: number; minY: number; maxY: number };

function box(strokes: Stroke[]): Box {
  const points = strokes.flat();
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** Drawing scaled from its width or its height, then pinned by each edge or the center. */
function edgeFits(drawn: Stroke[], model: Stroke[]): Stroke[][] {
  const d = box(drawn);
  const m = box(model);
  const [dw, dh, mw, mh] = [d.maxX - d.minX, d.maxY - d.minY, m.maxX - m.minX, m.maxY - m.minY];
  const scales = [dw > 0.05 ? mw / dw : 1, dh > 0.05 ? mh / dh : 1].filter((k) => k > 0.7 && k < 1.6);
  const pin = (dMin: number, dMax: number, mMin: number, mMax: number, k: number) => [
    mMin - k * dMin,
    mMax - k * dMax,
    (mMin + mMax) / 2 - (k * (dMin + dMax)) / 2,
  ];
  const fits: Stroke[][] = [];
  for (const k of scales) {
    for (const ox of pin(d.minX, d.maxX, m.minX, m.maxX, k)) {
      for (const oy of pin(d.minY, d.maxY, m.minY, m.maxY, k)) {
        fits.push(drawn.map((s) => s.map((p) => ({ x: k * p.x + ox, y: k * p.y + oy }))));
      }
    }
  }
  return fits;
}

const cache = new Map<string, Promise<CharData>>();

/** Stroke data from the hanzi-writer-data CDN (cached per character). */
export function loadCharData(char: string): Promise<CharData> {
  let pending = cache.get(char);
  if (!pending) {
    pending = fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${encodeURIComponent(char)}.json`).then((res) => {
      if (!res.ok) throw new Error(`Pas de données de tracé pour ${char}`);
      return res.json() as Promise<CharData>;
    });
    pending.catch(() => cache.delete(char));
    cache.set(char, pending);
  }
  return pending;
}
