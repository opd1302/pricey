import { describe, expect, it } from "vitest";
import { askingPrice, isYourTurn, type PlayerAction } from "./auction";
import { itemsForPuzzle } from "./daily";
import { playDay, roomForDay, standings, yourStanding } from "./day";
import { lotSquare, shareText } from "./share";

const PUZZLE = 4;
const items = itemsForPuzzle(PUZZLE);
const dropAll: PlayerAction[][] = items.map(() => ["drop"]);

describe("playDay", () => {
  it("only opens lots up to the one you're on", () => {
    expect(playDay(PUZZLE, items, []).lots).toHaveLength(1);
    expect(playDay(PUZZLE, items, dropAll.slice(0, 2)).lots).toHaveLength(3);
  });

  it("finishes once every lot is sold", () => {
    const day = playDay(PUZZLE, items, dropAll);
    expect(day.finished).toBe(true);
    expect(day.lots.every((lot) => lot.sold)).toBe(true);
  });

  it("rebuilds exactly the same auction from saved choices", () => {
    const first = playDay(PUZZLE, items, dropAll);
    const again = playDay(PUZZLE, items, dropAll);
    expect(again.lots.map((l) => l.events)).toEqual(
      first.lots.map((l) => l.events),
    );
  });

  it("shows the Collector's favourite, which is one of today's categories", () => {
    const { favourite } = playDay(PUZZLE, items, []);
    expect(items.map((i) => i.category)).toContain(favourite);
  });
});

describe("standings", () => {
  it("lists you and today's three rivals, best first", () => {
    const table = standings(playDay(PUZZLE, items, dropAll).lots);
    expect(table).toHaveLength(4);
    expect(table.map((s) => s.score)).toEqual(
      [...table.map((s) => s.score)].sort((a, b) => b - a),
    );
  });

  it("puts an absurd bidder last", () => {
    const absurd: PlayerAction[][] = [];
    for (let i = 0; i < items.length; i++) {
      const lot = playDay(PUZZLE, items, absurd).lots[i];
      absurd.push(isYourTurn(lot) ? [{ bid: askingPrice(lot) * 1000 }] : []);
    }
    const day = playDay(PUZZLE, items, absurd);
    expect(yourStanding(day.lots)).toEqual({ rank: 4, of: 4, score: -5000 });
    expect(day.lots.map(lotSquare).join("")).toBe("🟥🟥🟥🟥🟥");
  });

  it("gives you zero, and white squares, if you drop out of everything", () => {
    const day = playDay(PUZZLE, items, dropAll);
    expect(yourStanding(day.lots).score).toBe(0);
    expect(shareText(PUZZLE, day.lots, "https://x.test")).toMatch(
      /^Pricey No\. 4 · \d(st|nd|rd|th) of 4 · 0\n⬜⬜⬜⬜⬜\nhttps:\/\/x\.test$/,
    );
  });
});

describe("roomForDay", () => {
  it("always has Margaret plus two other rivals", () => {
    for (let puzzle = 1; puzzle <= 50; puzzle++) {
      const room = roomForDay(puzzle).map((bot) => bot.id);
      expect(room).toHaveLength(3);
      expect(room).toContain("margaret");
    }
  });

  it("changes from day to day", () => {
    const rooms = new Set(
      Array.from({ length: 30 }, (_, i) =>
        roomForDay(i + 1)
          .map((b) => b.id)
          .join(),
      ),
    );
    expect(rooms.size).toBeGreaterThan(3);
  });
});
