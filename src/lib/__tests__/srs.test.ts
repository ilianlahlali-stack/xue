import { describe, expect, it } from "vitest";
import { formatInterval, gradeFromWriting, previewIntervals, Rating, review } from "@/lib/srs";

describe("srs", () => {
  const now = new Date("2026-10-05T10:00:00Z");

  it("schedules a new card and survives a JSON round-trip", () => {
    const first = review(null, Rating.Good, now);
    expect(new Date(first.due).getTime()).toBeGreaterThan(now.getTime());
    const stored = JSON.parse(JSON.stringify(first.fsrs));
    const second = review(stored, Rating.Good, new Date(first.due));
    expect(new Date(second.due).getTime()).toBeGreaterThan(new Date(first.due).getTime());
  });

  it("pushes easy answers further than hard ones", () => {
    const p = previewIntervals(null, now);
    expect(Object.keys(p)).toHaveLength(4);
    const easy = review(null, Rating.Easy, now).due;
    const again = review(null, Rating.Again, now).due;
    expect(new Date(easy).getTime()).toBeGreaterThan(new Date(again).getTime());
  });

  it("formats intervals in French", () => {
    expect(formatInterval(5 * 60000)).toBe("5 min");
    expect(formatInterval(3 * 86400000)).toBe("3 j");
    expect(formatInterval(400 * 86400000)).toBe("1.1 an");
  });

  it("grades writing tests from stroke problems", () => {
    expect(gradeFromWriting(0)).toBe(Rating.Good);
    expect(gradeFromWriting(1)).toBe(Rating.Hard);
    expect(gradeFromWriting(3)).toBe(Rating.Again);
    expect(gradeFromWriting(null)).toBe(Rating.Again);
  });
});
