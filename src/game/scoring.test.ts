import { describe, expect, it } from "vitest";
import {
  bidderPoints,
  formatPoints,
  highestBidOf,
  ordinal,
  outcomeFor,
  readPoints,
  winnerPoints,
} from "./scoring";

describe("winnerPoints", () => {
  it("rewards buying below value", () => {
    expect(winnerPoints(100, 50)).toBe(500);
    expect(winnerPoints(100, 80)).toBe(200);
  });

  it("only gently punishes overpaying a little", () => {
    expect(winnerPoints(100, 110)).toBe(-16 + 0); // 10% over, outside the spot-on band
    expect(winnerPoints(100, 120)).toBe(-45);
    expect(winnerPoints(100, 150)).toBe(-177);
  });

  it("still costs the full −1000 for wild overbids", () => {
    expect(winnerPoints(100, 500)).toBe(-1000);
    expect(winnerPoints(100, 1_000_000)).toBe(-1000);
  });

  it("adds a spot-on bonus within 5% either side", () => {
    expect(winnerPoints(100, 100)).toBe(250);
    expect(winnerPoints(100, 96)).toBe(40 + 250);
    expect(winnerPoints(100, 105)).toBe(-6 + 175); // smaller bonus when over
    expect(winnerPoints(100, 106)).toBe(-7);
  });

  it("judges cheap and expensive lots the same way", () => {
    expect(winnerPoints(2, 1)).toBe(winnerPoints(2e9, 1e9));
  });
});

describe("readPoints", () => {
  it("rewards a highest bid close to the real price, either side", () => {
    expect(readPoints(100, 100)).toBe(200);
    expect(readPoints(100, 95)).toBe(100);
    expect(readPoints(100, 105)).toBe(70); // smaller when over
    expect(readPoints(100, 89)).toBe(0);
  });
});

describe("bidderPoints and outcomeFor", () => {
  const sale = { who: "vic", price: 120 };

  it("scores the winner as a winner", () => {
    expect(bidderPoints(100, sale, "vic", 120)).toBe(winnerPoints(100, 120));
    expect(outcomeFor(100, sale, "vic", 120)).toBe("loss");
  });

  it("gives everyone else good-read points if they came close", () => {
    expect(bidderPoints(100, sale, "you", 100)).toBe(200);
    expect(outcomeFor(100, sale, "you", 100)).toBe("read");
  });

  it("gives nothing to someone who never bid", () => {
    expect(bidderPoints(100, sale, "you", null)).toBe(0);
    expect(outcomeFor(100, sale, "you", null)).toBe("none");
  });
});

describe("highestBidOf", () => {
  it("finds someone's highest bid among the events", () => {
    const events = [
      { kind: "open", price: 10 },
      { kind: "bid", who: "you", amount: 11 },
      { kind: "bid", who: "vic", amount: 12 },
      { kind: "bid", who: "you", amount: 13 },
    ];
    expect(highestBidOf(events, "you")).toBe(13);
    expect(highestBidOf(events, "doris")).toBeNull();
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
