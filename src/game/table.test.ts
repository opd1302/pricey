import { describe, expect, it } from "vitest";
import { BOT_BY_ID } from "./bots";
import type { Item } from "./items";
import {
  botMove,
  openTableLot,
  tableAsk,
  tableMove,
  tableStandings,
  type Seat,
  type TableLot,
} from "./table";

const ITEM: Item = {
  id: "gb",
  name: "Game Boy",
  detail: "",
  category: "Tech",
  price: 89.99,
};
const SEATS: Seat[] = [
  { id: "p1", name: "Ana" },
  { id: "p2", name: "Ben" },
  { id: "margaret", name: "Margaret", bot: BOT_BY_ID.margaret },
  { id: "vic", name: "Vic", bot: BOT_BY_ID.vic },
];

/** Plays bots automatically; people bid until `max`, then drop. */
function playOut(lot: TableLot, max: Record<string, number>): void {
  while (!lot.sold) {
    const who = lot.turn!;
    if (lot.limits[who] !== undefined) tableMove(lot, who, botMove(lot));
    else
      tableMove(
        lot,
        who,
        tableAsk(lot) <= max[who] ? { bid: tableAsk(lot) } : "drop",
      );
  }
}

describe("a private table", () => {
  it("gives a different seat the first turn on each lot", () => {
    expect(openTableLot(ITEM, SEATS, 1, 0, "Tech").turn).toBe("p1");
    expect(openTableLot(ITEM, SEATS, 1, 1, "Tech").turn).toBe("p2");
  });

  it("goes round the table in order, skipping whoever leads", () => {
    const lot = openTableLot(ITEM, SEATS, 1, 0, "Tech");
    tableMove(lot, "p1", { bid: tableAsk(lot) });
    expect(lot.turn).toBe("p2");
    tableMove(lot, "p2", "drop");
    expect(lot.turn).toBe("margaret");
  });

  it("refuses moves out of turn and bids below the asking price", () => {
    const lot = openTableLot(ITEM, SEATS, 1, 0, "Tech");
    expect(() => tableMove(lot, "p2", "drop")).toThrow();
    expect(() => tableMove(lot, "p1", { bid: tableAsk(lot) - 0.01 })).toThrow();
  });

  it("sells to the last bidder standing", () => {
    const lot = openTableLot(ITEM, SEATS, 1, 0, "Tech");
    tableMove(lot, "p1", { bid: 1000 });
    tableMove(lot, "p2", "drop");
    tableMove(lot, "margaret", "drop");
    tableMove(lot, "vic", "drop");
    expect(lot.sold).toEqual({ who: "p1", price: 1000 });
    expect(lot.turn).toBeNull();
  });

  it("goes unsold if everyone drops without bidding", () => {
    const lot = openTableLot(ITEM, SEATS, 1, 0, "Tech");
    for (const who of ["p1", "p2", "margaret", "vic"])
      tableMove(lot, who, "drop");
    expect(lot.sold).toEqual({ who: null, price: 0 });
  });

  it("always ends, and bots never pass their limits", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const lot = openTableLot(ITEM, SEATS, seed, seed % 5, "Tech");
      playOut(lot, { p1: 70, p2: 85 });
      expect(lot.sold).not.toBeNull();
      for (const e of lot.events) {
        if (e.kind === "bid" && lot.limits[e.who] !== undefined)
          expect(e.amount).toBeLessThanOrEqual(lot.limits[e.who]);
      }
    }
  });

  it("ranks everyone at the table by profit", () => {
    const won = openTableLot(ITEM, SEATS, 1, 0, "Tech");
    tableMove(won, "p1", { bid: 45 });
    for (const who of ["p2", "margaret", "vic"]) tableMove(won, who, "drop");
    const table = tableStandings(SEATS, [won]);
    expect(table[0]).toEqual({ id: "p1", score: 500, won: 1 });
    expect(table).toHaveLength(4);
  });
});
