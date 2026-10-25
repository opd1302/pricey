import { describe, expect, it } from "vitest";
import { formatPoints, ordinal, profitPoints } from "./scoring";

describe("profitPoints", () => {
  it("rewards buying below value", () => {
    expect(profitPoints(100, 50)).toBe(500);
    expect(profitPoints(100, 90)).toBe(100);
  });

  it("scores zero at exactly the value", () => {
    expect(profitPoints(100, 100)).toBe(0);
  });

  it("punishes overpaying, down to −1000 at double or worse", () => {
    expect(profitPoints(100, 150)).toBe(-500);
    expect(profitPoints(100, 200)).toBe(-1000);
    expect(profitPoints(100, 1_000_000)).toBe(-1000);
  });

  it("judges cheap and expensive lots the same way", () => {
    expect(profitPoints(2, 1)).toBe(profitPoints(2e9, 1e9));
  });
});

describe("formatPoints", () => {
  it("shows a sign", () => {
    expect(formatPoints(1240)).toBe("+1,240");
    expect(formatPoints(-300)).toBe("−300");
    expect(formatPoints(0)).toBe("0");
  });
});

describe("ordinal", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [22, "22nd"],
  ])("%d is %s", (n, text) => {
    expect(ordinal(n)).toBe(text);
  });
});
