import { describe, expect, it } from "vitest";
import type { Item } from "./items";
import { shareText, totalScore } from "./share";

const item = (price: number): Item => ({
  id: String(price),
  emoji: "",
  name: "",
  detail: "",
  category: "",
  price,
});
const ITEMS = [item(100), item(100), item(100)];
const GUESSES = [100, 200, 1000];

describe("totalScore", () => {
  it("adds up each guess's points", () => {
    expect(totalScore(ITEMS, GUESSES)).toBe(1000 + 500 + 0);
  });
});

describe("shareText", () => {
  it("shows the score and squares without any prices", () => {
    expect(shareText(12, ITEMS, GUESSES, "https://example.com")).toBe(
      "Pricey #12 · 1,500/3,000\n🎯🟨🟥\nhttps://example.com",
    );
  });
});
