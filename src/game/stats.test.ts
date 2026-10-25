import { describe, expect, it } from "vitest";
import { EMPTY_STATS, currentStreak, recordGame } from "./stats";

describe("recordGame", () => {
  it("builds a streak on consecutive days", () => {
    let stats = recordGame(EMPTY_STATS, 1, 3000);
    stats = recordGame(stats, 2, 4000);
    expect(stats).toMatchObject({
      played: 2,
      streak: 2,
      bestStreak: 2,
      bestScore: 4000,
      totalScore: 7000,
    });
  });

  it("restarts the streak after a missed day but keeps the best", () => {
    let stats = recordGame(EMPTY_STATS, 1, 3000);
    stats = recordGame(stats, 2, 3000);
    stats = recordGame(stats, 5, 3000);
    expect(stats.streak).toBe(1);
    expect(stats.bestStreak).toBe(2);
  });

  it("ignores a puzzle that was already counted", () => {
    const stats = recordGame(EMPTY_STATS, 1, 3000);
    expect(recordGame(stats, 1, 5000)).toBe(stats);
  });
});

describe("currentStreak", () => {
  it("is kept if they played today or yesterday, and broken otherwise", () => {
    const stats = recordGame(EMPTY_STATS, 4, 3000);
    expect(currentStreak(stats, 4)).toBe(1);
    expect(currentStreak(stats, 5)).toBe(1);
    expect(currentStreak(stats, 6)).toBe(0);
  });
});
