/**
 * Deterministic randomness.
 *
 * Every roll is keyed on (character, tick), never on wall-clock or call order,
 * so resolving the same span twice yields the same journal. That is what makes
 * offline progression auditable — and what will let the client predict a tick
 * ahead of the server without diverging.
 */

/** FNV-1a over the key, so seeds are stable across processes and languages. */
export function tickSeed(characterId: string, tick: number, salt = ''): number {
  const key = `${characterId}:${tick}:${salt}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export type Rng = () => number;

/** mulberry32 — small, fast, good enough for loot tables. */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngInt(rng: Rng, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1));
}

export function rngPick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function rngChance(rng: Rng, probability: number): boolean {
  return rng() < probability;
}
