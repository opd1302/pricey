// Scores are based on the *ratio* between guess and answer, not the dollar
// difference, so a $2 miss on a $1 item counts as much as a $2 billion miss on
// a $1 billion item. Guessing double is exactly as bad as guessing half.

export const MAX_POINTS = 1000;
/** Guesses this many times too high (or too low) or worse score nothing. */
export const ZERO_POINTS_RATIO = 4;
/** Within 5% of the answer counts as a bullseye. */
export const BULLSEYE_WITHIN = 0.05;

export function scoreGuess(
  guess: number,
  actual: number,
): { points: number; bullseye: boolean } {
  const howFarOff = Math.abs(Math.log(guess / actual));
  const closeness = 1 - howFarOff / Math.log(ZERO_POINTS_RATIO);
  return {
    points: Math.max(0, Math.round(MAX_POINTS * closeness)),
    bullseye: Math.abs(guess - actual) <= actual * BULLSEYE_WITHIN,
  };
}

/** The coloured square shown for a guess in the share text and progress bar. */
export function tierEmoji(guess: number, actual: number): string {
  const { points, bullseye } = scoreGuess(guess, actual);
  if (bullseye) return "🎯";
  if (points >= 800) return "🟩"; // within about 30%
  if (points >= 500) return "🟨"; // within 2×
  return "🟥";
}
