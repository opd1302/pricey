const SUFFIXES: Record<string, number> = {
  "": 1,
  k: 1e3,
  m: 1e6,
  b: 1e9,
  t: 1e12,
  q: 1e15,
};

/**
 * Reads a typed price like "1,200", "$4.99", "1.5k", "2m", "44b", "3t" (trillion)
 * or "852q" (quadrillion).
 * Returns null if it isn't a positive number.
 */
export function parsePrice(input: string): number | null {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[$,\s]/g, "");
  const match = /^(\d+(?:\.\d+)?|\.\d+)([kmbtq]?)$/.exec(cleaned);
  if (!match) return null;
  const value = Number(match[1]) * SUFFIXES[match[2]];
  return value > 0 ? value : null;
}

/** "$0.0369", "$0.78", "$5.79", "$850", "$44,000,000,000" */
export function formatPrice(value: number): string {
  const showCents = value < 100 && !Number.isInteger(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: showCents ? 2 : 0,
    // Fractions of a cent only matter for tiny prices, like the cost of making a penny.
    maximumFractionDigits: value < 0.1 ? 4 : value < 100 ? 2 : 0,
  }).format(value);
}
