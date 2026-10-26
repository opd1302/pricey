// How lots are scored. Scores are a share of the lot's value, not dollars, so
// a $2 hot dog matters as much as a $2 billion company.
//
// - The winner scores what they saved: buy at half its value, +500.
// - Paying a little over costs a little (10% over: about −15), but the
//   penalty grows fast, so wild overbids still cost the full −1,000.
// - Winning within 5% of the real price earns a spot-on bonus.
// - Everyone else whose highest bid was within 10% of the real price gets
//   "good read" points, so bidding right up to the price and then dropping
//   out pays off even when someone else wins.

export const MAX_POINTS = 1000;
export const SPOT_ON_WITHIN = 0.05;
export const SPOT_ON_BONUS = 250;
export const GOOD_READ_WITHIN = 0.1;
export const GOOD_READ_MAX = 200;

/** Points for whoever won the lot, having paid `paid` for something worth `value`. */
export function winnerPoints(value: number, paid: number): number {
  const saved = (value - paid) / value;
  const base =
    saved >= 0
      ? Math.round(MAX_POINTS * saved)
      : -Math.min(MAX_POINTS, Math.round(500 * (-saved) ** 1.5));
  return base + (isSpotOn(value, paid) ? SPOT_ON_BONUS : 0);
}

export function isSpotOn(value: number, paid: number): boolean {
  return Math.abs(value - paid) <= value * SPOT_ON_WITHIN;
}

/** Points for someone who didn't win, based on how close their highest bid came. */
export function readPoints(value: number, highestBid: number): number {
  const off = Math.abs(highestBid - value) / value;
  return off <= GOOD_READ_WITHIN
    ? Math.round(GOOD_READ_MAX * (1 - off / GOOD_READ_WITHIN))
    : 0;
}

/** "+1,240", "−300", "0" */
export function formatPoints(points: number): string {
  const sign = points > 0 ? "+" : points < 0 ? "−" : "";
  return sign + Math.abs(points).toLocaleString("en-US");
}

/** "1st", "2nd", "3rd", "4th" … */
export function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

/** How a lot went for one bidder: won it at a profit or a loss, a good read, or nothing. */
export type Outcome = "profit" | "loss" | "read" | "none";

interface Sale {
  who: string | null;
  price: number;
}

/** Points one bidder earned on a lot: the winner's score, or good-read points for anyone else who bid. */
export function bidderPoints(
  value: number,
  sale: Sale | null,
  who: string,
  highestBid: number | null,
): number {
  if (!sale) return 0;
  if (sale.who === who) return winnerPoints(value, sale.price);
  return highestBid === null ? 0 : readPoints(value, highestBid);
}

export function outcomeFor(
  value: number,
  sale: Sale | null,
  who: string,
  highestBid: number | null,
): Outcome {
  if (!sale) return "none";
  if (sale.who === who)
    return winnerPoints(value, sale.price) >= 0 ? "profit" : "loss";
  return bidderPoints(value, sale, who, highestBid) > 0 ? "read" : "none";
}

/** The highest bid someone made in a list of auction events, or null if they never bid. */
export function highestBidOf(
  events: readonly { kind: string; who?: string | null; amount?: number }[],
  who: string,
): number | null {
  let best: number | null = null;
  for (const e of events) {
    if (e.kind === "bid" && e.who === who && e.amount !== undefined)
      best = Math.max(best ?? 0, e.amount);
  }
  return best;
}
