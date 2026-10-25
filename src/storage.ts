// Saving progress and stats in the player's browser (localStorage), shared by
// the home page and the game page.
import type { PlayerAction } from "./game/auction";
import type { Item } from "./game/items";
import { EMPTY_STATS, type Stats } from "./game/stats";

const PROGRESS_KEY = "pricey-auction";
const STATS_KEY = "pricey-stats";

interface Progress {
  puzzle: number;
  itemIds: string[];
  /** Your choices on each lot, in order. Replaying them rebuilds the auction. */
  actions: PlayerAction[][];
}

/** Today's choices so far, if they were saved for these same items. */
export function loadActions(puzzle: number, items: Item[]): PlayerAction[][] {
  const saved = load<Progress | null>(PROGRESS_KEY, null);
  if (
    saved?.puzzle === puzzle &&
    saved.itemIds.join() === items.map((i) => i.id).join() &&
    Array.isArray(saved.actions)
  ) {
    return saved.actions;
  }
  return [];
}

/** Forgets today's game so it can be played again. Used by the dev-only reset link. */
export function clearActions(): void {
  try {
    localStorage.removeItem(PROGRESS_KEY);
  } catch {
    // ignore
  }
}

export function saveActions(
  puzzle: number,
  items: Item[],
  actions: PlayerAction[][],
): void {
  save<Progress>(PROGRESS_KEY, {
    puzzle,
    itemIds: items.map((i) => i.id),
    actions,
  });
}

export function loadStats(): Stats {
  return { ...EMPTY_STATS, ...load<Partial<Stats>>(STATS_KEY, {}) };
}

export function saveStats(stats: Stats): void {
  save(STATS_KEY, stats);
}

// Browsers can block storage (e.g. some private modes). Then the game still
// works; it just won't remember anything after the page closes.
function load<T>(key: string, fallback: T): T {
  try {
    const text = localStorage.getItem(key);
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}
