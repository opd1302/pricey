import type { Lot } from "./auction";
import { outcomeOn, yourStanding } from "./day";
import { formatPoints, ordinal } from "./scoring";

const SQUARES = { profit: "🟩", loss: "🟥", read: "🟨", none: "⬜" };

/** One square per lot: 🟩 won at a profit, 🟥 won at a loss, 🟨 a good read, ⬜ nothing. */
export function lotSquare(lot: Lot): string {
  return SQUARES[outcomeOn(lot, "you")];
}

/**
 * The text copied by the "Share" button. It shows how you did without giving
 * away any prices, like Wordle's coloured squares.
 */
export function shareText(puzzle: number, lots: Lot[], url: string): string {
  const { rank, of, score } = yourStanding(lots);
  const squares = lots.map(lotSquare).join("");
  return `Pricey No. ${puzzle} · ${ordinal(rank)} of ${of} · ${formatPoints(score)}\n${squares}\n${url}`;
}
