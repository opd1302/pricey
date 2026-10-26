import { botBidAmount, botLine, type Bot, type BotId } from "./bots";
import type { Item } from "./items";
import { seedFrom, seededRandom } from "./random";

// The rules of one lot's auction. The price climbs in steps of about 10%.
// When it's your turn you either bid (at least the asking price) or drop out.
// Bots bid until their secret limit is passed, then drop out. When nobody
// will go higher, the lot is sold to whoever made the last bid.
//
// Everything is seeded from the puzzle number, so the same choices by you
// always lead to the same auction. That's what lets the page rebuild an
// auction from your saved choices after a refresh.

export type BidderId = BotId | "you";

export type AuctionEvent =
  | { kind: "open"; price: number }
  | { kind: "bid"; who: BidderId; amount: number; jump: boolean; line?: string }
  | { kind: "out"; who: BidderId; line?: string }
  | { kind: "sold"; who: BidderId | null; price: number; line?: string };

/** What you did on one of your turns. Saved so the auction can be replayed. */
export type PlayerAction = { bid: number } | "drop";

export interface Lot {
  item: Item;
  /** The rival bots bidding today. */
  room: Bot[];
  opening: number;
  limits: Record<BotId, number>;
  /** The current highest bid, or null before anyone has bid. */
  price: number | null;
  leader: BidderId | null;
  out: BidderId[];
  events: AuctionEvent[];
  sold: { who: BidderId | null; price: number } | null;
  random: () => number;
}

const OPENING_LOW = 0.04;
const OPENING_HIGH = 0.65;

/** How many bot bids happen before your first turn, to get things going. */
const OPENING_BIDS = 2;

export function openLot(
  item: Item,
  puzzle: number,
  index: number,
  favourite: string,
  room: Bot[],
): Lot {
  const random = seededRandom(seedFrom(puzzle, index, "lot"));
  const limits = {} as Record<BotId, number>;
  for (const bot of room) {
    limits[bot.id] = bot.limit(
      item,
      seededRandom(seedFrom(puzzle, index, bot.id)),
      favourite,
    );
  }
  const opening = openingPrice(item.price, random);
  const lot: Lot = {
    item,
    room,
    opening,
    limits,
    price: null,
    leader: null,
    out: [],
    events: [{ kind: "open", price: opening }],
    sold: null,
    random,
  };
  runBots(lot, OPENING_BIDS);
  return lot;
}

/**
 * Where bidding opens: anywhere from about 4% to 65% of the real price, more
 * often low than high. It hints at the size of the number without giving the
 * answer away.
 */
export function openingPrice(value: number, random: () => number): number {
  const share = OPENING_LOW * (OPENING_HIGH / OPENING_LOW) ** random();
  return roundToTwoFigures(value * share, "down");
}

/** The lowest bid that would be accepted right now. */
export function askingPrice(lot: Lot): number {
  return lot.price === null ? lot.opening : nextBid(lot.price);
}

export function isYourTurn(lot: Lot): boolean {
  return !lot.sold && isIn(lot, "you") && lot.leader !== "you";
}

export function placeBid(lot: Lot, amount: number): void {
  if (!isYourTurn(lot)) throw new Error("It isn't your turn.");
  const ask = askingPrice(lot);
  if (!(amount >= ask)) throw new Error("Bid too low.");
  lot.price = amount;
  lot.leader = "you";
  lot.events.push({ kind: "bid", who: "you", amount, jump: amount > ask });
  runBots(lot, 1);
}

export function dropOut(lot: Lot): void {
  if (!isYourTurn(lot)) throw new Error("It isn't your turn.");
  lot.out.push("you");
  lot.events.push({ kind: "out", who: "you" });
  runBots(lot, Infinity);
}

export function applyAction(lot: Lot, action: PlayerAction): void {
  if (action === "drop") dropOut(lot);
  else placeBid(lot, action.bid);
}

/** The next step up from a price: about 10% more, rounded to a tidy number. */
export function nextBid(price: number): number {
  return Math.max(roundToTwoFigures(price * 1.1, "up"), cents(price + 0.01));
}

/**
 * Bots take turns bidding until it's your turn again (after `maxBids` bids),
 * or until nobody will go higher and the lot is sold.
 */
function runBots(lot: Lot, maxBids: number): void {
  let bids = 0;
  for (;;) {
    const ask = askingPrice(lot);
    for (const bot of lot.room) {
      if (
        isIn(lot, bot.id) &&
        lot.leader !== bot.id &&
        lot.limits[bot.id] < ask
      ) {
        lot.out.push(bot.id);
        lot.events.push({
          kind: "out",
          who: bot.id,
          line: say(lot, bot, "out"),
        });
      }
    }
    const keen = lot.room.filter(
      (bot) => isIn(lot, bot.id) && lot.leader !== bot.id,
    );
    const youCanBid = isIn(lot, "you") && lot.leader !== "you";
    if (youCanBid && (keen.length === 0 || bids >= maxBids)) return;
    if (keen.length === 0) {
      sell(lot);
      return;
    }
    const bot = chooseBidder(lot, keen);
    const amount = botBid(lot, bot, ask);
    const jump = amount > ask;
    lot.price = amount;
    lot.leader = bot.id;
    lot.events.push({
      kind: "bid",
      who: bot.id,
      amount,
      jump,
      line: say(lot, bot, jump ? "jump" : "bid"),
    });
    bids++;
  }
}

function sell(lot: Lot): void {
  const who = lot.leader;
  const price = lot.price ?? 0;
  lot.sold = { who, price };
  const bot = lot.room.find((b) => b.id === who);
  lot.events.push({
    kind: "sold",
    who,
    price,
    line: bot && say(lot, bot, "win"),
  });
}

/** Picks which willing bot bids next. Keener bots are more likely to go first. */
function chooseBidder(lot: Lot, keen: Bot[]): Bot {
  const total = keen.reduce((sum, bot) => sum + bot.eagerness, 0);
  let roll = lot.random() * total;
  for (const bot of keen) {
    roll -= bot.eagerness;
    if (roll < 0) return bot;
  }
  return keen[keen.length - 1];
}

function botBid(lot: Lot, bot: Bot, ask: number): number {
  return botBidAmount(bot, lot.limits[bot.id], ask, lot.random, (x) =>
    roundToTwoFigures(x, "down"),
  );
}

function say(lot: Lot, bot: Bot, kind: keyof Bot["lines"]): string | undefined {
  return botLine(bot, kind, lot.random);
}

function isIn(lot: Lot, who: BidderId): boolean {
  return !lot.out.includes(who);
}

/** Rounds to two significant figures (e.g. 1,287 → 1,300) and whole cents. */
export function roundToTwoFigures(x: number, direction: "up" | "down"): number {
  if (x <= 0.01) return 0.01;
  const unit = 10 ** (Math.floor(Math.log10(x)) - 1);
  const steps =
    direction === "up"
      ? Math.ceil(x / unit - 1e-9)
      : Math.floor(x / unit + 1e-9);
  return Math.max(0.01, cents(steps * unit));
}

function cents(x: number): number {
  return Math.round(x * 100) / 100;
}
