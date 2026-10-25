// Repeatable randomness. The same seed gives the same numbers on every
// computer, which is how every player gets the same items and the same bot
// behaviour on the same day without a server.

/** Like Math.random(), but seeded. (The well-known "mulberry32" generator.) */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mixes several numbers and words into one seed, e.g. seedFrom(puzzle, lot, "doris"). */
export function seedFrom(...parts: (number | string)[]): number {
  let hash = 2166136261;
  for (const char of parts.join("|")) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

/** A bell-curve random number: usually near `mean`, rarely more than 2 × `spread` away. */
export function normal(random: () => number, mean = 0, spread = 1): number {
  const u = Math.max(random(), 1e-12);
  const v = random();
  return (
    mean + spread * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  );
}

export function shuffle<T>(list: T[], random: () => number): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function pick<T>(list: T[], random: () => number): T {
  return list[Math.floor(random() * list.length)];
}
