import { nextBid, openingPrice, roundToTwoFigures } from "./auction";
import { botBidAmount, botLine, type Bot } from "./bots";
import type { Item } from "./items";
import { seedFrom, seededRandom } from "./random";
import {
  bidderPoints,
  highestBidOf,
  outcomeFor,
  winnerPoints,
  type Outcome,
} from "./scoring";

// The rules for one lot at a private table: up to four people, with bots in
// any empty seats. Unlike the daily game, everyone strictly takes turns round
// the table. On your turn you raise (at least the asking price) or drop out.
// Whoever is left when everyone else has dropped out wins the lot.
//
// This file only knows the rules. The game server decides when bots move,
// runs the 30-second turn limit, and tells everyone's browser what happened.

export interface Seat {
  id: string;
  name: string;
  /** Set for a bot seat; empty for a person. */
  bot?: Bot;
}

export type TableEvent =
  | { kind: "open"; price: number }
  | {
      kind: "bid";
      who: string;
      amount: number;
      jump: boolean;
      line?: string;
      /** Placed automatically because the person ran out of time. */
      auto?: boolean;
    }
  | { kind: "out"; who: string; line?: string; timedOut?: boolean }
  | { kind: "sold"; who: string | null; price: number; line?: string };

export type TableAction = { bid: number } | "drop";

export interface TableLot {
  item: Item;
  seats: Seat[];
  opening: number;
  /** Bot seats' secret limits. Never sent to players. */
  limits: Record<string, number>;
  price: number | null;
  leader: string | null;
  out: string[];
  /** The seat whose turn it is, or null once sold. */
  turn: string | null;
  events: TableEvent[];
  sold: { who: string | null; price: number } | null;
  random: () => number;
}

export function openTableLot(
  item: Item,
  seats: Seat[],
  seed: number,
  index: number,
  favourite: string,
): TableLot {
  const random = seededRandom(seedFrom(seed, index, "lot"));
  const limits: Record<string, number> = {};
  for (const seat of seats) {
    if (seat.bot)
      limits[seat.id] = seat.bot.limit(
        item,
        seededRandom(seedFrom(seed, index, seat.id)),
        favourite,
      );
  }
  const opening = openingPrice(item.price, random);
  return {
    item,
    seats,
    opening,
    limits,
    price: null,
    leader: null,
    out: [],
    // A different seat starts each lot, so nobody always goes first.
    turn: seats[index % seats.length].id,
    events: [{ kind: "open", price: opening }],
    sold: null,
    random,
  };
}

export function tableAsk(lot: TableLot): number {
  return lot.price === null ? lot.opening : nextBid(lot.price);
}

export function seatOf(lot: TableLot, id: string): Seat | undefined {
  return lot.seats.find((s) => s.id === id);
}

/**
 * Applies a move by the seat whose turn it is. Throws if it isn't allowed.
 * `timedOut` marks a move made for someone who ran out of time.
 */
export function tableMove(
  lot: TableLot,
  who: string,
  action: TableAction,
  timedOut = false,
): void {
  if (lot.sold || lot.turn !== who) throw new Error("It isn't your turn.");
  const bot = seatOf(lot, who)?.bot;
  if (action === "drop") {
    lot.out.push(who);
    lot.events.push({
      kind: "out",
      who,
      timedOut,
      line: bot && botLine(bot, "out", lot.random),
    });
  } else {
    const ask = tableAsk(lot);
    if (!(action.bid >= ask)) throw new Error("Bid too low.");
    const jump = action.bid > ask;
    lot.price = action.bid;
    lot.leader = who;
    lot.events.push({
      kind: "bid",
      who,
      amount: action.bid,
      jump,
      line: bot && botLine(bot, jump ? "jump" : "bid", lot.random),
      ...(timedOut ? { auto: true } : {}),
    });
  }
  advance(lot);
}

/** What a bot does on its turn: bid up to its secret limit, then drop out. */
export function botMove(lot: TableLot): TableAction {
  const seat = lot.turn ? seatOf(lot, lot.turn) : undefined;
  if (!seat?.bot) throw new Error("It isn't a bot's turn.");
  const ask = tableAsk(lot);
  const limit = lot.limits[seat.id];
  if (limit < ask) return "drop";
  return {
    bid: botBidAmount(seat.bot, limit, ask, lot.random, (x) =>
      roundToTwoFigures(x, "down"),
    ),
  };
}

/** Passes the turn on, or sells the lot if only one bidder is left. */
function advance(lot: TableLot): void {
  const active = lot.seats.filter((s) => !lot.out.includes(s.id));
  if (active.length === 0 || (lot.leader !== null && active.length === 1)) {
    const who = lot.leader;
    const price = lot.price ?? 0;
    lot.sold = { who, price };
    lot.turn = null;
    const bot = who ? seatOf(lot, who)?.bot : undefined;
    lot.events.push({
      kind: "sold",
      who,
      price,
      line: bot && botLine(bot, "win", lot.random),
    });
    return;
  }
  const start = lot.seats.findIndex((s) => s.id === lot.turn);
  for (let step = 1; step <= lot.seats.length; step++) {
    const seat = lot.seats[(start + step) % lot.seats.length];
    if (!lot.out.includes(seat.id) && seat.id !== lot.leader) {
      lot.turn = seat.id;
      return;
    }
  }
}

/** Points earned on one lot by whoever won it. */
export function tableLotPoints(lot: TableLot): number {
  if (!lot.sold?.who) return 0;
  return winnerPoints(lot.item.price, lot.sold.price);
}

/** Points one seat earned on a lot, whether or not they won it. */
export function tablePointsOn(lot: TableLot, who: string): number {
  return bidderPoints(
    lot.item.price,
    lot.sold,
    who,
    highestBidOf(lot.events, who),
  );
}

export function tableOutcomeOn(lot: TableLot, who: string): Outcome {
  return outcomeFor(
    lot.item.price,
    lot.sold,
    who,
    highestBidOf(lot.events, who),
  );
}

/** Everyone's total so far, best first. */
export function tableStandings(
  seats: Seat[],
  lots: TableLot[],
): { id: string; score: number; won: number }[] {
  const table = seats.map((s) => ({ id: s.id, score: 0, won: 0 }));
  for (const lot of lots) {
    for (const row of table) {
      row.score += tablePointsOn(lot, row.id);
      if (lot.sold?.who === row.id) row.won += 1;
    }
  }
  return table.sort((a, b) => b.score - a.score);
}
