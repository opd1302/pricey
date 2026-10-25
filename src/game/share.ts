import type { Item } from "./items";
import { MAX_POINTS, scoreGuess, tierEmoji } from "./scoring";

export function totalScore(items: Item[], guesses: number[]): number {
  return guesses.reduce(
    (sum, guess, i) => sum + scoreGuess(guess, items[i].price).points,
    0,
  );
}

/**
 * The text copied by the "Share" button. It shows how well you did without
 * giving away any prices, like Wordle's coloured squares.
 */
export function shareText(
  puzzle: number,
  items: Item[],
  guesses: number[],
  url: string,
): string {
  const score = totalScore(items, guesses).toLocaleString("en-US");
  const max = (items.length * MAX_POINTS).toLocaleString("en-US");
  const squares = guesses
    .map((guess, i) => tierEmoji(guess, items[i].price))
    .join("");
  return `Pricey #${puzzle} · ${score}/${max}\n${squares}\n${url}`;
}
