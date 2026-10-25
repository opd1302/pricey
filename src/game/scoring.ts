// You score for what you *save*: win a lot for less than it's really worth and
// you gain points; pay more than it's worth and you lose them. Scores are a
// share of the lot's value, not dollars, so a $2 hot dog matters as much as a
// $2 billion company.

export const MAX_POINTS = 1000;

/** Buy at half its value: +500. Pay double or worse: −1000. */
export function profitPoints(value: number, paid: number): number {
  return Math.max(
    -MAX_POINTS,
    Math.round((MAX_POINTS * (value - paid)) / value),
  );
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
