import { describe, expect, it } from "vitest";
import { CROWD_SIZE, closerThan, crowdBids, crowdChart } from "./crowd";

const LOT = { name: "Nintendo Game Boy", price: 89.99 };

describe("the simulated crowd", () => {
  it("is the same every time for the same lot", () => {
    expect(crowdBids(LOT)).toEqual(crowdBids(LOT));
  });

  it("differs between lots, since crowds misjudge some things more than others", () => {
    const a = crowdChart(LOT).average / LOT.price;
    const b =
      crowdChart({ name: "Twitter", price: LOT.price }).average / LOT.price;
    expect(a).not.toBeCloseTo(b, 2);
  });

  it("bids in a believable range around the real price", () => {
    for (const name of ["A", "B", "C", "D", "E"]) {
      const { average } = crowdChart({ name, price: 1000 });
      expect(average).toBeGreaterThan(300);
      expect(average).toBeLessThan(2500);
    }
  });

  it("puts every bid in a bar", () => {
    const { bars } = crowdChart(LOT);
    expect(bars.reduce((a, b) => a + b, 0)).toBe(CROWD_SIZE);
  });

  it("says how many of the crowd you beat", () => {
    expect(closerThan(LOT, LOT.price)).toBeGreaterThan(0.95);
    expect(closerThan(LOT, LOT.price * 50)).toBe(0);
  });
});
