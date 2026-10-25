import { ITEMS, type Item } from "./items";
import { seededRandom, shuffle } from "./random";

// Every player's browser works out the same items for the same date, so no
// server is needed. Puzzle #1 is the launch day; the count goes up by one each
// day at the player's local midnight (like Wordle).

export const ITEMS_PER_DAY = 5;
const LAUNCH_DAY = new Date(2026, 9, 25); // 25 October 2026 (months count from 0)
const DAY_MS = 24 * 60 * 60 * 1000;

export function puzzleNumber(now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Rounding copes with 23- and 25-hour days when the clocks change.
  const days = Math.round((today.getTime() - LAUNCH_DAY.getTime()) / DAY_MS);
  return Math.max(1, days + 1);
}

export function msUntilNextPuzzle(now = new Date()): number {
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  return tomorrow.getTime() - now.getTime();
}

/**
 * The items for a puzzle. The list is shuffled in a fixed, repeatable way and
 * dealt out five a day, so no item repeats until the whole list has been used.
 * Then it's reshuffled differently for the next pass.
 *
 * Warning: adding or removing items changes which items every future day gets
 * (and today's, for anyone mid-game). Fine for a prototype; a real launch
 * should use a fixed schedule instead.
 */
export function itemsForPuzzle(puzzle: number, pool: Item[] = ITEMS): Item[] {
  const daysPerPass = Math.floor(pool.length / ITEMS_PER_DAY);
  const pass = Math.floor((puzzle - 1) / daysPerPass);
  const day = (puzzle - 1) % daysPerPass;
  const shuffled = shuffle(pool, seededRandom(pass + 1));
  return shuffled.slice(day * ITEMS_PER_DAY, (day + 1) * ITEMS_PER_DAY);
}
