/**
 * Deterministic pseudo-random generator (mulberry32).
 *
 * Scene geometry must be generated during render, and `Math.random()` there is
 * an impure call that breaks React's render rules (and the lint rule that
 * enforces them). A seeded generator is pure: the same scene produces the same
 * particle layout on every render and on both server and client.
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
