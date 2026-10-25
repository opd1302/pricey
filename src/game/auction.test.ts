import { describe, expect, it } from "vitest";
import {
  askingPrice,
  dropOut,
  isYourTurn,
  nextBid,
  openLot,
  placeBid,
  roundToTwoFigures,
  type Lot,
} from "./auction";
import { BOTS } from "./bots";
import type { Item } from "./items";

const ROOM = BOTS.slice(0, 3);
const ITEM: Item = {
  id: "gb",
  name: "Game Boy",
  detail: "",
  category: "Tech",
  price: 89.99,
  fact: "",
};

/** Keeps bidding the asking price until `max`, then drops out. */
function bidUpTo(lot: Lot, max: number): void {
  while (isYourTurn(lot)) {
    if (askingPrice(lot) <= max) placeBid(lot, askingPrice(lot));
    else dropOut(lot);
  }
}

describe("nextBid", () => {
  it("goes up about 10%, to a tidy number", () => {
    expect(nextBid(100)).toBe(110);
    expect(nextBid(89.99)).toBe(99);
    expect(nextBid(1_234_567)).toBe(1_400_000);
  });

  it("always goes up by at least a cent", () => {
    expect(nextBid(0.05)).toBe(0.06);
    expect(nextBid(0.01)).toBe(0.02);
  });
});

describe("roundToTwoFigures", () => {
  it("rounds in the asked direction", () => {
    expect(roundToTwoFigures(1287, "up")).toBe(1300);
    expect(roundToTwoFigures(1287, "down")).toBe(1200);
    expect(roundToTwoFigures(44e9, "down")).toBe(44e9);
  });
});

describe("an auction", () => {
  it("is the same every time for the same puzzle and choices", () => {
    const a = openLot(ITEM, 3, 0, "Tech", ROOM);
    const b = openLot(ITEM, 3, 0, "Tech", ROOM);
    bidUpTo(a, 70);
    bidUpTo(b, 70);
    expect(a.events).toEqual(b.events);
  });

  it("always ends, with a sale", () => {
    for (let puzzle = 1; puzzle <= 200; puzzle++) {
      const lot = openLot(ITEM, puzzle, 0, "History", ROOM);
      bidUpTo(lot, 80);
      expect(lot.sold).not.toBeNull();
    }
  });

  it("sells to you if you outbid everyone", () => {
    const lot = openLot(ITEM, 5, 0, "History", ROOM);
    placeBid(lot, 1_000_000);
    expect(lot.sold).toEqual({ who: "you", price: 1_000_000 });
  });

  it("sells to the bot with the highest limit when you drop out", () => {
    const lot = openLot(ITEM, 8, 0, "History", ROOM);
    if (isYourTurn(lot)) dropOut(lot);
    const keenest = lot.room.reduce((a, b) =>
      lot.limits[a.id] >= lot.limits[b.id] ? a : b,
    );
    if (lot.limits[keenest.id] >= lot.opening) {
      expect(lot.sold?.who).toBe(keenest.id);
      expect(lot.sold!.price).toBeLessThanOrEqual(lot.limits[keenest.id]);
    }
  });

  it("never lets a bot bid above its limit", () => {
    for (let puzzle = 1; puzzle <= 200; puzzle++) {
      const lot = openLot(ITEM, puzzle, 1, "Tech", ROOM);
      bidUpTo(lot, 60);
      for (const event of lot.events) {
        if (event.kind === "bid" && event.who !== "you") {
          expect(event.amount).toBeLessThanOrEqual(lot.limits[event.who]);
        }
      }
    }
  });

  it("rejects bids below the asking price, and bids out of turn", () => {
    const lot = openLot(ITEM, 2, 0, "Tech", ROOM);
    expect(() => placeBid(lot, askingPrice(lot) - 0.01)).toThrow();
    placeBid(lot, 1_000_000);
    expect(() => placeBid(lot, 2_000_000)).toThrow();
  });
});
