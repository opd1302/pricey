import { describe, expect, it } from "vitest";
import {
  ITEMS_PER_DAY,
  MAX_PER_CATEGORY,
  itemsForPuzzle,
  msUntilNextPuzzle,
  puzzleNumber,
} from "./daily";
import { ITEMS } from "./items";

describe("puzzleNumber", () => {
  it("is #1 on launch day, all day long", () => {
    expect(puzzleNumber(new Date(2026, 9, 25, 0, 0))).toBe(1);
    expect(puzzleNumber(new Date(2026, 9, 25, 23, 59))).toBe(1);
  });

  it("goes up by one each day, across months and clock changes", () => {
    expect(puzzleNumber(new Date(2026, 9, 26, 0, 1))).toBe(2);
    expect(puzzleNumber(new Date(2026, 10, 25, 12, 0))).toBe(32);
    expect(puzzleNumber(new Date(2027, 9, 25, 12, 0))).toBe(366);
  });

  it("never goes below 1", () => {
    expect(puzzleNumber(new Date(2020, 0, 1))).toBe(1);
  });
});

describe("msUntilNextPuzzle", () => {
  it("counts down to midnight", () => {
    expect(msUntilNextPuzzle(new Date(2026, 9, 25, 23, 0))).toBe(
      60 * 60 * 1000,
    );
  });
});

describe("itemsForPuzzle", () => {
  it("gives the same items every time for the same puzzle", () => {
    expect(itemsForPuzzle(7)).toEqual(itemsForPuzzle(7));
  });

  it("deals five different items a day", () => {
    for (let puzzle = 1; puzzle <= 60; puzzle++) {
      expect(new Set(itemsForPuzzle(puzzle).map((i) => i.id)).size).toBe(
        ITEMS_PER_DAY,
      );
    }
  });

  it("keeps launch day exactly as it was first played", () => {
    expect(itemsForPuzzle(1).map((i) => i.id)).toEqual([
      "alaska",
      "netflix",
      "steam-deck-oled",
      "mcdonalds-1955",
      "jwst",
    ]);
  });

  it("uses every lot once before any lot repeats", () => {
    const days = Math.floor(ITEMS.length / ITEMS_PER_DAY);
    const seen = new Set<string>();
    for (let puzzle = 1; puzzle <= days; puzzle++) {
      for (const item of itemsForPuzzle(puzzle)) seen.add(item.id);
    }
    expect(seen.size).toBe(days * ITEMS_PER_DAY);
  });

  it("keeps repeats far apart, even after the first pass", () => {
    const lastDay = new Map<string, number>();
    let shortestGap = Infinity;
    for (let puzzle = 1; puzzle <= 400; puzzle++) {
      for (const item of itemsForPuzzle(puzzle)) {
        const before = lastDay.get(item.id);
        if (before) shortestGap = Math.min(shortestGap, puzzle - before);
        lastDay.set(item.id, puzzle);
      }
    }
    // Roughly the number of days the whole list lasts.
    expect(shortestGap).toBeGreaterThan(ITEMS.length / ITEMS_PER_DAY - 5);
  });

  it("never puts more than two lots of one category in a day", () => {
    for (let puzzle = 2; puzzle <= 200; puzzle++) {
      const counts = new Map<string, number>();
      for (const item of itemsForPuzzle(puzzle))
        counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(
        MAX_PER_CATEGORY,
      );
    }
  });

  it("doesn't change earlier days when lots are added later", () => {
    const pool = ITEMS.slice(0, 60);
    const before = Array.from({ length: 30 }, (_, i) =>
      itemsForPuzzle(i + 2, pool).map((x) => x.id),
    );
    const added = [
      ...pool,
      ...ITEMS.slice(60, 90).map((item) => ({ ...item, from: 32 })),
    ];
    const after = Array.from({ length: 30 }, (_, i) =>
      itemsForPuzzle(i + 2, added).map((x) => x.id),
    );
    expect(after).toEqual(before);
    expect(itemsForPuzzle(32, added).some((item) => item.from === 32)).toBe(
      true,
    );
  });
});

describe("ITEMS", () => {
  it("has plenty of lots", () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(150);
  });

  it("has unique ids and names, and positive prices", () => {
    expect(new Set(ITEMS.map((item) => item.id)).size).toBe(ITEMS.length);
    expect(new Set(ITEMS.map((item) => item.name)).size).toBe(ITEMS.length);
    expect(ITEMS.every((item) => item.price > 0)).toBe(true);
  });

  it("gives every item a short fun fact", () => {
    for (const item of ITEMS) {
      expect(item.fact.length, item.id).toBeGreaterThan(10);
      expect(item.fact.length, item.id).toBeLessThanOrEqual(160);
    }
  });
});
