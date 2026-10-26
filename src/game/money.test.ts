import { describe, expect, it } from "vitest";
import { formatPrice, parsePrice } from "./money";

describe("parsePrice", () => {
  it.each([
    ["250", 250],
    ["$4.99", 4.99],
    ["1,200", 1200],
    [".5", 0.5],
    ["1.5k", 1500],
    ["2M", 2_000_000],
    ["44 b", 44_000_000_000],
    ["62.5t", 62_500_000_000_000],
    ["852q", 852_000_000_000_000_000],
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
    expect(formatPrice(0.0369)).toBe("$0.0369");
    expect(formatPrice(0.05)).toBe("$0.05");
    expect(formatPrice(1.5)).toBe("$1.50");
    expect(formatPrice(1)).toBe("$1");
    expect(formatPrice(666.66)).toBe("$667");
    expect(formatPrice(44e9)).toBe("$44,000,000,000");
  });
});
