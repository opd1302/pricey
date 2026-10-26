import { ITEMS, type Item } from "./items";
import { seedFrom } from "./random";

// Every player's browser works out the same items for the same date, so no
// server is needed. Puzzle #1 is the launch day; the count goes up by one each
// day at the player's local midnight (like Wordle).

export const ITEMS_PER_DAY = 5;
/** At most this many lots of one category in a day, so a day is never all "Tech". */
export const MAX_PER_CATEGORY = 2;
const LAUNCH_DAY = new Date(2026, 9, 25); // 25 October 2026 (months count from 0)
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days whose lots are fixed by hand. Day 1 was played before this schedule
 * existed, so it keeps the lots it launched with.
 */
const PINNED_DAYS: Record<number, string[]> = {
  1: ["alaska", "netflix", "steam-deck-oled", "mcdonalds-1955", "jwst"],
};

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
 * The lots for a puzzle. Days are worked out in order from day 1: each day
 * takes the lots that have gone longest without appearing (never-seen lots
 * first), with no more than two from one category. So a lot can't come back
 * until nearly every other lot has had a turn.
 *
 * Each day depends only on the days before it and on which lots were allowed
 * then, so adding new lots never changes past days, as long as each new lot's
 * `from` is set to a day that hasn't happened yet. Editing or removing old lots
 * WILL change the schedule; avoid that once the site is live.
 */
export function itemsForPuzzle(puzzle: number, pool: Item[] = ITEMS): Item[] {
  const days = scheduleFor(pool);
  while (days.length < puzzle) days.push(planDay(days.length + 1, pool, days));
  return days[puzzle - 1];
}

// Working out day N means working out days 1 to N-1 too, so remember them.
const schedules = new WeakMap<Item[], Item[][]>();

function scheduleFor(pool: Item[]): Item[][] {
  let days = schedules.get(pool);
  if (!days) {
    days = [];
    schedules.set(pool, days);
  }
  return days;
}

function planDay(day: number, pool: Item[], earlier: Item[][]): Item[] {
  const pinned = PINNED_DAYS[day];
  if (pinned && pool === ITEMS)
    return pinned.map((id) => ITEMS.find((item) => item.id === id)!);

  const lastSeen = new Map<string, number>();
  earlier.forEach((lots, i) =>
    lots.forEach((item) => lastSeen.set(item.id, i + 1)),
  );

  // Longest-unseen first; ties broken by a shuffle that's the same for everyone.
  const candidates = pool
    .filter((item) => (item.from ?? 1) <= day)
    .map((item) => ({
      item,
      seen: lastSeen.get(item.id) ?? 0,
      tie: seedFrom(day, item.id),
    }))
    .sort((a, b) => a.seen - b.seen || a.tie - b.tie)
    .map((c) => c.item);

  const chosen: Item[] = [];
  const perCategory = new Map<string, number>();
  for (const item of candidates) {
    if (chosen.length === ITEMS_PER_DAY) break;
    const count = perCategory.get(item.category) ?? 0;
    if (count >= MAX_PER_CATEGORY) continue;
    chosen.push(item);
    perCategory.set(item.category, count + 1);
  }
  // With very few lots there may not be enough variety; then ignore the category limit.
  for (const item of candidates) {
    if (chosen.length === ITEMS_PER_DAY) break;
    if (!chosen.includes(item)) chosen.push(item);
  }
  return chosen;
}
