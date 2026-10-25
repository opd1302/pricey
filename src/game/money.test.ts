import { describe, expect, it } from "vitest";
import { describeMiss, formatPrice, parsePrice } from "./money";

describe("parsePrice", () => {
  it.each([
    ["250", 250],
    ["$4.99", 4.99],
    ["1,200", 1200],
    [".5", 0.5],
    ["1.5k", 1500],
    ["2M", 2_000_000],
    ["44 b", 44_000_000_000],
  ])("reads %s", (input, expected) => {
    expect(parsePrice(input)).toBe(expected);
  });

  it.each(["", "abc", "0", "-5", "1.2.3", "5x"])("rejects %j", (input) => {
    expect(parsePrice(input)).toBeNull();
  });
});

describe("formatPrice", () => {
  it("shows cents only for small, non-whole prices", () => {
    expect(formatPrice(0.78)).toBe("$0.78");
    expect(formatPrice(1.5)).toBe("$1.50");
    expect(formatPrice(1)).toBe("$1");
    expect(formatPrice(666.66)).toBe("$667");
    expect(formatPrice(44e9)).toBe("$44,000,000,000");
  });
});

describe("describeMiss", () => {
  it("uses percentages for near misses and multiples for big ones", () => {
    expect(describeMiss(125, 100)).toBe("25% too high");
    expect(describeMiss(60, 100)).toBe("40% too low");
    expect(describeMiss(300, 100)).toBe("3.0× too high");
    expect(describeMiss(10, 100)).toBe("10× too low");
    expect(describeMiss(1500, 1e10)).toBe("6,666,667× too low");
    expect(describeMiss(100, 100)).toBe("Spot on");
  });
});
