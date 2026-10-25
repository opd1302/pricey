import { describe, expect, it } from "vitest";
import { MAX_POINTS, scoreGuess, tierEmoji } from "./scoring";

describe("scoreGuess", () => {
  it("gives full points and a bullseye for an exact guess", () => {
    expect(scoreGuess(100, 100)).toEqual({
      points: MAX_POINTS,
      bullseye: true,
    });
  });

  it("treats 2x too high the same as 2x too low", () => {
    expect(scoreGuess(200, 100)).toEqual(scoreGuess(50, 100));
    expect(scoreGuess(200, 100).points).toBe(500);
  });

  it("judges cheap and expensive items the same way", () => {
    expect(scoreGuess(1.5, 1)).toEqual(scoreGuess(1.5e9, 1e9));
  });

  it("gives nothing for guesses 4x off or worse", () => {
    expect(scoreGuess(400, 100).points).toBe(0);
    expect(scoreGuess(1, 1_000_000).points).toBe(0);
  });

  it("only awards the bullseye within 5%", () => {
    expect(scoreGuess(105, 100).bullseye).toBe(true);
    expect(scoreGuess(106, 100).bullseye).toBe(false);
  });
});

describe("tierEmoji", () => {
  it.each([
    [103, "🎯"],
    [120, "🟩"],
    [190, "🟨"],
    [50, "🟨"],
    [300, "🟥"],
  ])("guess %d on a $100 item is %s", (guess, emoji) => {
    expect(tierEmoji(guess, 100)).toBe(emoji);
  });
});
