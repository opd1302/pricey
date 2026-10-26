import { normal, seedFrom, seededRandom } from "./random";

// A *simulated* crowd: what a large number of players might plausibly have
// bid on a lot. This isn't real data (the game has no server collecting
// bids), so the page always labels it as simulated.
//
// Each lot gets a crowd "lean" (crowds underestimate some things and
// overestimate others), then each imaginary player guesses around it and,
// like most bidders, stops a little below what they think it's worth.

export const CROWD_SIZE = 1000;

interface CrowdLot {
  /** Used to make the crowd the same for everyone who sees this lot. */
  name: string;
  price: number;
}

/** Each simulated player's highest bid on the lot. */
export function crowdBids(lot: CrowdLot, size = CROWD_SIZE): number[] {
  const random = seededRandom(seedFrom("crowd", lot.name));
  const lean = normal(random, -0.1, 0.3);
  const bids: number[] = [];
  for (let i = 0; i < size; i++) {
    const guess = lot.price * Math.exp(normal(random, lean, 0.45));
    bids.push(guess * (0.75 + 0.25 * random()));
  }
  return bids;
}

export interface CrowdChart {
  /** How many bids fell in each bar, left to right. */
  bars: number[];
  /** The price range the chart covers (bars are spaced evenly on a log scale). */
  low: number;
  high: number;
  average: number;
}

/** Groups the crowd's bids into bars, on a scale where cheap and expensive lots look alike. */
export function crowdChart(lot: CrowdLot, barCount = 28): CrowdChart {
  const bids = crowdBids(lot);
  const low = lot.price / 6;
  const high = lot.price * 4;
  const bars = new Array<number>(barCount).fill(0);
  for (const bid of bids) {
    const at = Math.floor(position(bid, low, high) * barCount);
    bars[Math.min(barCount - 1, Math.max(0, at))]++;
  }
  const average = bids.reduce((sum, b) => sum + b, 0) / bids.length;
  return { bars, low, high, average };
}

/** Where a price falls between `low` and `high` on a log scale, from 0 to 1. */
export function position(price: number, low: number, high: number): number {
  return (Math.log(price) - Math.log(low)) / (Math.log(high) - Math.log(low));
}

/** The share of the crowd whose bid was further from the real price than `bid` (0 to 1). */
export function closerThan(lot: CrowdLot, bid: number): number {
  const miss = (b: number) => Math.abs(Math.log(b / lot.price));
  const yours = miss(bid);
  const bids = crowdBids(lot);
  return bids.filter((b) => miss(b) > yours).length / bids.length;
}
