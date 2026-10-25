import { describe, expect, it } from "vitest";
import {
  ITEMS_PER_DAY,
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

  it("deals five items a day", () => {
    expect(itemsForPuzzle(1)).toHaveLength(ITEMS_PER_DAY);
  });

  it("doesn't repeat an item until the whole list is used", () => {
    const days = Math.floor(ITEMS.length / ITEMS_PER_DAY);
    const seen = new Set<string>();
    for (let puzzle = 1; puzzle <= days; puzzle++) {
      for (const item of itemsForPuzzle(puzzle)) seen.add(item.id);
    }
    expect(seen.size).toBe(days * ITEMS_PER_DAY);
  });

  it("keeps working after the list has been used up", () => {
    expect(itemsForPuzzle(1000)).toHaveLength(ITEMS_PER_DAY);
  });
});

describe("ITEMS", () => {
  it("has unique ids and positive prices", () => {
    expect(new Set(ITEMS.map((item) => item.id)).size).toBe(ITEMS.length);
    expect(ITEMS.every((item) => item.price > 0)).toBe(true);
  });
});
