/** A player's history, kept in their own browser. */
export interface Stats {
  played: number;
  streak: number;
  bestStreak: number;
  bestScore: number;
  totalScore: number;
  /** The last puzzle number they finished, or 0 if none. */
  lastPuzzle: number;
}

export const EMPTY_STATS: Stats = {
  played: 0,
  streak: 0,
  bestStreak: 0,
  bestScore: 0,
  totalScore: 0,
  lastPuzzle: 0,
};

/** Adds a finished game. Counting the same puzzle twice does nothing. */
export function recordGame(stats: Stats, puzzle: number, score: number): Stats {
  if (puzzle <= stats.lastPuzzle) return stats;
  const streak = stats.lastPuzzle === puzzle - 1 ? stats.streak + 1 : 1;
  return {
    played: stats.played + 1,
    streak,
    bestStreak: Math.max(stats.bestStreak, streak),
    bestScore: Math.max(stats.bestScore, score),
    totalScore: stats.totalScore + score,
    lastPuzzle: puzzle,
  };
}

/** The streak as of today: it's broken if they skipped yesterday. */
export function currentStreak(stats: Stats, today: number): number {
  return stats.lastPuzzle >= today - 1 ? stats.streak : 0;
}
