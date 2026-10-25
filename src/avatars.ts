// Little drawn characters for every bidder, whose faces react to the game:
// they hop and raise a paddle when they bid, think on their turn, slump when
// they drop out, cheer when they win a bargain, and boo anyone who overpays.
import type { BotId } from "./game/bots";

export type Mood =
  "idle" | "thinking" | "bid" | "out" | "cheer" | "boo" | "sheepish";

type HairStyle =
  "bun" | "short" | "curly" | "slick" | "quiff" | "long" | "bob" | "bald";
type Extra =
  "glasses" | "monocle" | "shades" | "bowtie" | "earrings" | "moustache";

export interface Look {
  skin: string;
  hair: string;
  style: HairStyle;
  extras: Extra[];
  /** Clothes colour: the bidder's paddle colour. */
  colour: string;
}

const INK = "#2a2420";

const BOT_LOOKS: Record<BotId, Omit<Look, "colour">> = {
  margaret: {
    skin: "#ecc9ad",
    hair: "#bdb7ae",
    style: "bun",
    extras: ["glasses"],
  },
  rupert: {
    skin: "#e8bd98",
    hair: "#6b4a35",
    style: "slick",
    extras: ["monocle", "moustache"],
  },
  doris: {
    skin: "#d9a27e",
    hair: "#a29aa8",
    style: "curly",
    extras: ["earrings"],
  },
  tobias: {
    skin: "#f2d2b6",
    hair: "#e2c07a",
    style: "quiff",
    extras: ["bowtie"],
  },
  vic: { skin: "#b9805d", hair: "#2b2420", style: "slick", extras: ["shades"] },
};

export function botLook(id: BotId, colour: string): Look {
  return { ...BOT_LOOKS[id], colour };
}

const SKINS = ["#f2d2b6", "#e6b894", "#c98d66", "#9a6444", "#6b4430"];
const HAIRS = [
  "#2b2420",
  "#6b4a35",
  "#c48a3e",
  "#1f1b18",
  "#9c3d2a",
  "#d8c7a0",
];
const STYLES: HairStyle[] = [
  "short",
  "long",
  "curly",
  "bob",
  "quiff",
  "bald",
  "slick",
];

/** A person's look, picked from their name so it stays the same every game. */
export function personLook(name: string, colour: string): Look {
  let hash = 7;
  for (const char of name.toLowerCase())
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const pick = <T>(list: T[], salt: number) =>
    list[(hash >>> salt) % list.length];
  return {
    skin: pick(SKINS, 0),
    hair: pick(HAIRS, 3),
    style: pick(STYLES, 6),
    extras: (hash >>> 9) % 4 === 0 ? ["glasses"] : [],
    colour,
  };
}

const BUBBLES: Partial<Record<Mood, string>> = {
  thinking: "…",
  cheer: "Hooray!",
  boo: "Boo!",
  sheepish: "Oops…",
};

/** The avatar as HTML. Set `bubble: false` for small lists where speech bubbles would clutter. */
export function avatarHtml(
  look: Look,
  mood: Mood = "idle",
  options: { bubble?: boolean } = {},
): string {
  const bubble =
    options.bubble !== false && BUBBLES[mood]
      ? `<span class="av-bubble">${BUBBLES[mood]}</span>`
      : "";
  const paddle =
    mood === "bid" ? `<span class="av-paddle" aria-hidden="true"></span>` : "";
  return `<span class="avatar mood-${mood}" style="--c: ${look.colour}">${bubble}<span class="av-frame">${svg(look, mood)}</span>${paddle}</span>`;
}

function svg(look: Look, mood: Mood): string {
  const { skin, hair, colour } = look;
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M11 66c1-12 9-18 21-18s20 6 21 18z" fill="${colour}" />
    <rect x="28" y="37" width="8" height="12" rx="3" fill="${skin}" />
    ${hairBack(look.style, hair)}
    <circle cx="19.5" cy="29.5" r="2.6" fill="${skin}" />
    <circle cx="44.5" cy="29.5" r="2.6" fill="${skin}" />
    <circle cx="32" cy="28" r="13" fill="${skin}" />
    ${hairFront(look.style, hair)}
    ${face(mood)}
    ${look.extras.map((extra) => extraSvg(extra, hair)).join("")}
  </svg>`;
}

function hairBack(style: HairStyle, hair: string): string {
  if (style === "long")
    return `<path d="M17 28c0-10 7-16 15-16s15 6 15 16v16c-3 1-6 1-8 0V28H25v16c-2 1-5 1-8 0z" fill="${hair}" />`;
  if (style === "bob")
    return `<path d="M17 28c0-10 7-16 15-16s15 6 15 16v10h-6V28H23v10h-6z" fill="${hair}" />`;
  return "";
}

function hairFront(style: HairStyle, hair: string): string {
  const cap = `<path d="M19 27c-1-9 5-15 13-15s14 6 13 15c-2-5-7-8-13-8s-11 3-13 8z" fill="${hair}" />`;
  switch (style) {
    case "short":
    case "long":
    case "bob":
      return cap;
    case "bun":
      return `${cap}<circle cx="32" cy="12.5" r="5" fill="${hair}" />`;
    case "curly":
      return [
        [21, 22, 5],
        [25, 16.5, 5],
        [32, 14.5, 5.5],
        [39, 16.5, 5],
        [43, 22, 5],
        [32, 19, 5],
      ]
        .map(
          ([x, y, r]) =>
            `<circle cx="${x}" cy="${y}" r="${r}" fill="${hair}" />`,
        )
        .join("");
    case "slick":
      return `<path d="M19 26c0-8 6-14 14-14 7 0 12 5 12 12-6-4-16-4-26 2z" fill="${hair}" />`;
    case "quiff":
      return `${cap}<path d="M23 18c3-7 14-8 18-2-5-1-10 0-13 4z" fill="${hair}" />`;
    case "bald":
      return `<path d="M19.5 25c0-2 1-4 2.5-5M44.5 25c0-2-1-4-2.5-5" fill="none" stroke="${hair}" stroke-width="2.5" stroke-linecap="round" />`;
  }
}

function face(mood: Mood): string {
  const line = (d: string) =>
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />`;
  const dots = (y = 29, dx = 0) =>
    `<circle cx="${27 + dx}" cy="${y}" r="1.6" fill="${INK}" /><circle cx="${37 + dx}" cy="${y}" r="1.6" fill="${INK}" />`;
  const blush = `<circle cx="23" cy="33" r="2.2" fill="#e07a6a" opacity="0.35" /><circle cx="41" cy="33" r="2.2" fill="#e07a6a" opacity="0.35" />`;
  switch (mood) {
    case "idle":
      return dots() + line("M28 34.5q4 2.5 8 0");
    case "bid":
      return (
        dots() +
        line("M24.5 25.2l4.5-.8M39.5 25.2l-4.5-.8") +
        `<path d="M28 33.8q4 4.2 8 0z" fill="${INK}" />`
      );
    case "thinking":
      return dots(27.6, 1) + line("M34.5 23.8q3-2 6 0") + line("M30 35.2h5");
    case "out":
      return line("M25 29.5h4M35 29.5h4") + line("M28.5 36q3.5-2.5 7 0");
    case "cheer":
      return (
        line("M24.5 29.8q2.5-3.2 5 0M34.5 29.8q2.5-3.2 5 0") +
        `<path d="M26.5 33.2q5.5 7.5 11 0z" fill="${INK}" />` +
        blush
      );
    case "boo":
      return (
        dots() +
        line("M24 24.8l5 1.6M40 24.8l-5 1.6") +
        `<ellipse cx="32" cy="35.6" rx="2.4" ry="3" fill="${INK}" />`
      );
    case "sheepish":
      return (
        dots() +
        line("M24 26.4l5-1.4M40 26.4l-5-1.4") +
        line("M28 35.6q2-1.6 4 0t4 0") +
        `<path d="M46 20q2.2 3.2 0 4.6q-2.2-1.4 0-4.6z" fill="#9fd0e8" />`
      );
  }
}

function extraSvg(extra: Extra, hair: string): string {
  switch (extra) {
    case "glasses":
      return `<g fill="none" stroke="#3a3530" stroke-width="1.3"><circle cx="27" cy="29" r="3.8" /><circle cx="37" cy="29" r="3.8" /><path d="M30.8 29h2.4" /></g>`;
    case "monocle":
      return `<circle cx="37" cy="29" r="4" fill="none" stroke="#d9b45f" stroke-width="1.3" /><path d="M40.8 30.5q2 6-1.5 12" fill="none" stroke="#d9b45f" stroke-width="0.8" />`;
    case "shades":
      return `<g fill="#1d1a18"><rect x="22.5" y="26.4" width="8.6" height="5.2" rx="2.2" /><rect x="32.9" y="26.4" width="8.6" height="5.2" rx="2.2" /></g><path d="M31 28h2" stroke="#1d1a18" stroke-width="1.2" />`;
    case "bowtie":
      return `<path d="M26.5 46.5l5.5 2.8-5.5 2.8zM37.5 46.5l-5.5 2.8 5.5 2.8z" fill="#c94f5c" /><circle cx="32" cy="49.3" r="1.3" fill="#a63d49" />`;
    case "earrings":
      return `<circle cx="19.5" cy="33.6" r="1.4" fill="#d9b45f" /><circle cx="44.5" cy="33.6" r="1.4" fill="#d9b45f" />`;
    case "moustache":
      return `<path d="M26.5 33q2.8-2.4 5.5-.4q2.7-2 5.5.4q-2.7 1.8-5.5.3q-2.8 1.5-5.5-.3z" fill="${hair}" />`;
  }
}

/**
 * Everyone's mood for a lot, from what has happened so far. When it sells,
 * the winner cheers a bargain; if they overpaid, the rest of the room boos.
 */
export function roomMoods(lot: {
  bidders: string[];
  out: Iterable<string>;
  /** Whoever made the most recent bid, so they can raise their paddle. */
  justBid: string | null;
  /** Whose turn it is, if the game waits for someone (private games). */
  turn: string | null;
  sold: { who: string | null; points: number } | null;
}): Record<string, Mood> {
  const out = new Set(lot.out);
  const moods: Record<string, Mood> = {};
  for (const who of lot.bidders) {
    if (lot.sold) {
      const winner = lot.sold.who;
      if (!winner) moods[who] = "idle";
      else if (who === winner)
        moods[who] =
          lot.sold.points > 0
            ? "cheer"
            : lot.sold.points < 0
              ? "sheepish"
              : "idle";
      else moods[who] = lot.sold.points < 0 ? "boo" : "idle";
    } else if (out.has(who)) {
      moods[who] = "out";
    } else if (who === lot.justBid) {
      moods[who] = "bid";
    } else if (who === lot.turn) {
      moods[who] = "thinking";
    } else {
      moods[who] = "idle";
    }
  }
  return moods;
}
