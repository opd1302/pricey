import {
  applyAction,
  openLot,
  type BidderId,
  type Lot,
  type PlayerAction,
} from "./auction";
import { BOTS, type Bot } from "./bots";
import type { Item } from "./items";
import { pick, seedFrom, seededRandom, shuffle } from "./random";
import { profitPoints } from "./scoring";

// A whole day's sale: five lots in a row, rebuilt from the choices you've made
// so far. Lots after the one you're on haven't opened yet.
//
// Three rivals bid each day: Margaret the Appraiser every day (she's the
// steady one players learn to read), plus two of the others, rotating daily.

export interface Day {
  lots: Lot[];
  /** The rival bots bidding today. */
  room: Bot[];
  /** The category Rupert the Collector is hunting today. Shown to the player. */
  favourite: string;
  finished: boolean;
}

export interface Standing {
  who: BidderId;
  score: number;
  won: number;
}

export function playDay(
  puzzle: number,
  items: Item[],
  actions: PlayerAction[][],
): Day {
  const room = roomForDay(puzzle);
  const favourite = collectorFavourite(puzzle, items);
  const lots: Lot[] = [];
  for (const [index, item] of items.entries()) {
    const lot = openLot(item, puzzle, index, favourite, room);
    lots.push(lot);
    for (const action of actions[index] ?? []) {
      if (lot.sold) break;
      try {
        applyAction(lot, action);
      } catch {
        break; // a saved action that no longer fits; ignore the rest
      }
    }
    if (!lot.sold) break;
  }
  const finished =
    lots.length === items.length && lots.every((lot) => lot.sold);
  return { lots, room, favourite, finished };
}

/** How many rival bots bid each day. */
export const RIVALS_PER_DAY = 3;

export function roomForDay(puzzle: number): Bot[] {
  const [regular, ...others] = BOTS;
  const guests = shuffle(others, seededRandom(seedFrom(puzzle, "room")));
  const today = [regular, ...guests.slice(0, RIVALS_PER_DAY - 1)];
  return BOTS.filter((bot) => today.includes(bot)); // keep a fixed seating order
}

function collectorFavourite(puzzle: number, items: Item[]): string {
  return pick(
    items.map((item) => item.category),
    seededRandom(seedFrom(puzzle, "favourite")),
  );
}

/** Points earned on one lot by whoever won it (you, or a bot). */
export function lotPoints(lot: Lot): number {
  if (!lot.sold?.who) return 0;
  return profitPoints(lot.item.price, lot.sold.price);
}

/** Everyone's total for the day, best first. You're listed above bots you tie with. */
export function standings(lots: Lot[]): Standing[] {
  const table: Standing[] = [
    { who: "you", score: 0, won: 0 },
    ...(lots[0]?.room ?? []).map((bot) => ({ who: bot.id, score: 0, won: 0 })),
  ];
  for (const lot of lots) {
    const row = table.find((s) => s.who === lot.sold?.who);
    if (!row) continue;
    row.score += lotPoints(lot);
    row.won += 1;
  }
  return table.sort((a, b) => b.score - a.score);
}

export function yourStanding(lots: Lot[]): {
  rank: number;
  of: number;
  score: number;
} {
  const table = standings(lots);
  const index = table.findIndex((s) => s.who === "you");
  return { rank: index + 1, of: table.length, score: table[index].score };
}
