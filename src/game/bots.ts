import type { Item } from "./items";
import { normal } from "./random";

// The five rival bidders. Each one decides, before a lot opens, the most it's
// willing to pay (its "limit"). Their limits are based on the real price plus
// some personality and some luck, so every bot gets it wrong sometimes.

export type BotId = "margaret" | "rupert" | "doris" | "tobias" | "vic";

export interface Bot {
  id: BotId;
  name: string;
  firstName: string;
  title: string;
  initials: string;
  /** Paddle colour on the page. */
  colour: string;
  /** Hint shown on the home page about how they bid. */
  blurb: string;
  /** How quick they are to bid when several bots want to (higher = sooner). */
  eagerness: number;
  /** Sometimes, while the price is still low, they jump well past the minimum. */
  jump?: { chance: number; size: number };
  /** The most this bot will pay for this lot. */
  limit(item: Item, random: () => number, favourite: string): number;
  lines: { bid: string[]; jump?: string[]; out: string[]; win: string[] };
}

/** Multiplies the real price by a random "how wrong are they" factor. */
const estimate = (
  item: Item,
  random: () => number,
  bias: number,
  spread: number,
) => item.price * Math.exp(normal(random, bias, spread));

export const BOTS: Bot[] = [
  {
    id: "margaret",
    name: "Margaret Holloway",
    firstName: "Margaret",
    title: "The Appraiser",
    initials: "MH",
    colour: "#8fb3a0",
    blurb:
      "Knows what things are worth and won't pay a cent more. Usually right. Not always.",
    eagerness: 1,
    limit(item, random) {
      const offDay = random() < 0.15;
      return 0.8 * estimate(item, random, 0, offDay ? 0.45 : 0.1);
    },
    lines: {
      bid: [
        "A sensible figure.",
        "Mm. Yes.",
        "I'll go to that.",
        "Reasonable.",
      ],
      out: [
        "Not at that price.",
        "Beyond its value, I'm afraid.",
        "I'll leave it there.",
      ],
      win: ["Into the archive.", "Fairly bought."],
    },
  },
  {
    id: "rupert",
    name: "Rupert Ashby",
    firstName: "Rupert",
    title: "The Collector",
    initials: "RA",
    colour: "#b48ead",
    blurb:
      "Hunts one kind of thing each day and will pay anything for it. Shrugs at the rest.",
    eagerness: 2,
    limit(item, random, favourite) {
      return item.category === favourite
        ? estimate(item, random, 0.25, 0.2)
        : estimate(item, random, -0.9, 0.3);
    },
    lines: {
      bid: [
        "For the collection!",
        "I simply must.",
        "Mine. Obviously.",
        "Don't you dare.",
      ],
      out: ["Not my sort of thing.", "Hmph. Let it go."],
      win: ["Another for the shelf!", "Ha! The set grows."],
    },
  },
  {
    id: "doris",
    name: "Doris Penny",
    firstName: "Doris",
    title: "The Bargain Hunter",
    initials: "DP",
    colour: "#d39a6a",
    blurb:
      "Bids early and often, but only ever at bargain prices. Drops out the moment it gets dear.",
    eagerness: 3,
    limit(item, random) {
      return 0.6 * estimate(item, random, 0, 0.3);
    },
    lines: {
      bid: ["And not a penny more.", "A bargain at that.", "I'll try my luck."],
      out: [
        "Daylight robbery.",
        "Too rich for me.",
        "I'll wait for the sales.",
      ],
      win: ["Steal of the century.", "Lovely, lovely."],
    },
  },
  {
    id: "tobias",
    name: "Tobias Fairweather III",
    firstName: "Tobias",
    title: "The Heir",
    initials: "TF",
    colour: "#7fa7d9",
    blurb:
      "Has no idea what anything costs and doesn't care. Bored by half the lots, reckless on the rest.",
    eagerness: 3,
    jump: { chance: 0.25, size: 1.3 },
    limit(item, random) {
      const bored = random() < 0.6;
      return bored
        ? 0.35 * estimate(item, random, 0, 0.3)
        : estimate(item, random, -0.1, 0.45);
    },
    lines: {
      bid: [
        "Oh, why not.",
        "Father's paying.",
        "Sounds fun.",
        "Sure, put me down.",
      ],
      jump: ["Let's make it interesting!", "Oh, just round it up."],
      out: ["Bored now.", "Meh. Next."],
      win: ["Oh! Is it mine? Super."],
    },
  },
  {
    id: "vic",
    name: "Vic Lacey",
    firstName: "Vic",
    title: "The Showman",
    initials: "VL",
    colour: "#d97f8f",
    blurb:
      "Makes big, loud jump bids to scare people off, then quietly folds. Don't be fooled.",
    eagerness: 2,
    jump: { chance: 0.6, size: 1.6 },
    limit(item, random) {
      return 0.7 * estimate(item, random, 0, 0.3);
    },
    lines: {
      bid: ["Keep up, everyone.", "Easy.", "Is that all?"],
      jump: ["Let's stop messing about.", "Here's a real bid.", "Watch this."],
      out: ["...You can have that one.", "Wasn't fussed anyway."],
      win: ["As planned."],
    },
  },
];

export const BOT_BY_ID = Object.fromEntries(
  BOTS.map((bot) => [bot.id, bot]),
) as Record<BotId, Bot>;

/**
 * How much a bot bids when the asking price is `ask`. Usually exactly the
 * asking price; jumpy bots sometimes leap well past it while it's still low.
 */
export function botBidAmount(
  bot: Bot,
  limit: number,
  ask: number,
  random: () => number,
  roundDown: (x: number) => number,
): number {
  if (bot.jump && ask < 0.6 * limit && random() < bot.jump.chance) {
    return Math.max(ask, roundDown(Math.min(limit, ask * bot.jump.size)));
  }
  return ask;
}

/** Something for the bot to say. Bots skip about half their ordinary bids, or the feed gets noisy. */
export function botLine(
  bot: Bot,
  kind: keyof Bot["lines"],
  random: () => number,
): string | undefined {
  const options = bot.lines[kind] ?? bot.lines.bid;
  if (kind === "bid" && random() < 0.5) return undefined;
  return options[Math.floor(random() * options.length)];
}
