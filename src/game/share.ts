import type { Lot } from "./auction";
import { lotPoints, yourStanding } from "./day";
import { formatPoints, ordinal } from "./scoring";

/** One square per lot: 🟩 won at a profit, 🟥 won at a loss, ⬜ someone else won it. */
export function lotSquare(lot: Lot): string {
  if (lot.sold?.who !== "you") return "⬜";
  return lotPoints(lot) >= 0 ? "🟩" : "🟥";
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
