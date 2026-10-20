/**
 * Tiny seeded PRNG (mulberry32). The whole generator state is a single
 * uint32, so it can live inside a game's State and keep `apply` pure:
 * same state + same move => same result, on client, server and in replays.
 */
export class Rng {
  constructor(public state: number) {
    this.state = state >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(list: readonly T[]): T {
    const item = list[Math.floor(this.next() * list.length)];
    if (item === undefined) throw new Error("pick() from empty list");
    return item;
  }

  /** `n` distinct items, in random order. */
  sample<T>(list: readonly T[], n: number): T[] {
    const pool = list.slice();
    const out: T[] = [];
    while (out.length < n && pool.length) {
      out.push(pool.splice(Math.floor(this.next() * pool.length), 1)[0] as T);
    }
    return out;
  }
}

export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
