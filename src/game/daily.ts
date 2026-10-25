import { ITEMS, type Item } from "./items";

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

function shuffle<T>(list: T[], random: () => number): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Like Math.random(), but the same seed always gives the same sequence of
 * numbers on every computer. (This is the well-known "mulberry32" generator.)
 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
