import { Rng } from "@boredgames/engine";

/**
 * Quick Draw: two gunslingers, one street. Wait for the call, then shoot. Shoot before the call and you lose
 * the round. First to WINS_NEEDED rounds takes the duel.
 *
 * Everything here is pure: the same seed gives the same rounds on every browser, so two friends online see
 * the same fake-outs at the same moments after their round starts.
 */

export const WINS_NEEDED = 3;
/** A shot this long after the call counts as frozen to the spot. */
export const FROZE_MS = 3000;
/** Nobody can really react faster than this; quicker "reactions" are guesses, and count as fouls. */
export const HUMAN_LIMIT_MS = 100;

export type Seat = 0 | 1;

/** Things that happen before the call, to make you flinch. */
export type FakeKind = "word" | "crow" | "bottle" | "bell";

export interface Fake {
  /** Milliseconds after the round starts. */
  at: number;
  kind: FakeKind;
  /** The false call shown, for a word fake. */
  word?: string;
}

export type RoundKind = "classic" | "quick" | "long" | "fakeouts" | "showdown";

export interface Plan {
  round: number;
  kind: RoundKind;
  /** Milliseconds from the start of the round to the call. */
  delay: number;
  fakes: Fake[];
}

export const ROUND_INFO: Record<RoundKind, { title: string; hint: string }> = {
  classic: { title: "High noon", hint: "Wait for DRAW!, then shoot." },
  quick: { title: "Hair trigger", hint: "The call comes fast. Be ready." },
  long: { title: "The long wait", hint: "Steady nerves. It will be a while." },
  fakeouts: { title: "Fake-outs", hint: "Shoot only at DRAW! Anything else is a trick." },
  showdown: { title: "Showdown", hint: "Last round. Tricks and a long wait. Don't flinch." },
};

const FAKE_WORDS = ["DRAT!", "DREW!", "DRAWL", "DRAMA", "DRAIN", "DRAG!", "DRAFT"];

/** The plan for round `round` (from 1) of the duel with this seed, given the score before it. */
export function planRound(seed: number, round: number, score: readonly [number, number]): Plan {
  const r = new Rng((seed ^ Math.imul(round, 0x9e3779b1)) >>> 0);
  r.next();
  let kind: RoundKind;
  if (score[0] === WINS_NEEDED - 1 && score[1] === WINS_NEEDED - 1) kind = "showdown";
  else if (round === 1) kind = "classic";
  else if (round === 2) kind = r.next() < 0.5 ? "classic" : "quick";
  else {
    const x = r.next();
    kind = x < 0.4 ? "fakeouts" : x < 0.6 ? "quick" : x < 0.8 ? "long" : "classic";
  }
  const between = (a: number, b: number) => Math.round(a + r.next() * (b - a));
  const delay =
    kind === "quick" ? between(900, 1900) : kind === "long" ? between(6000, 9000) : kind === "fakeouts" ? between(4200, 7000) : kind === "showdown" ? between(5500, 8500) : between(2200, 4800);
  const fakes: Fake[] = [];
  const count = kind === "fakeouts" ? between(1, 3) : kind === "showdown" ? between(2, 3) : kind === "long" ? between(0, 1) : 0;
  // Fakes are spread out, never in the last moment before the call (that would be unfair, not tricky).
  for (let i = 0; i < count; i++) {
    const lo = 1200 + ((delay - 1900) * i) / count;
    const hi = 1200 + ((delay - 1900) * (i + 1)) / count;
    const at = between(lo, Math.max(lo, hi - 300));
    const k = r.next();
    const kindOf: FakeKind = kind === "long" ? (k < 0.5 ? "crow" : "bell") : k < 0.55 ? "word" : k < 0.75 ? "crow" : k < 0.9 ? "bottle" : "bell";
    fakes.push(kindOf === "word" ? { at, kind: kindOf, word: FAKE_WORDS[Math.floor(r.next() * FAKE_WORDS.length)]! } : { at, kind: kindOf });
  }
  return { round, kind, delay, fakes };
}

// --------------------------------------------------------------- shots

/** What one gunslinger did this round. Times are measured on their own computer. */
export type Shot =
  /** Fired before the call, `at` ms into the round. */
  | { kind: "foul"; at: number }
  /** Fired `ms` after the call appeared. */
  | { kind: "hit"; ms: number };

export interface RoundResult {
  /** null for a dead heat, which is fought again. */
  winner: Seat | null;
  reason: "faster" | "foul" | "tie";
  shots: [Shot | null, Shot | null];
}

/** Who wins the round. A shot that is missing has not been fired (yet); a foul ends the round at once. */
export function resolve(a: Shot | null, b: Shot | null): RoundResult | null {
  const shots: [Shot | null, Shot | null] = [a, b];
  const fa = a?.kind === "foul";
  const fb = b?.kind === "foul";
  if (fa && fb) return { winner: a.at <= b.at ? 1 : 0, reason: "foul", shots };
  if (fa) return { winner: 1, reason: "foul", shots };
  if (fb) return { winner: 0, reason: "foul", shots };
  if (!a || !b) return null;
  const ma = (a as Extract<Shot, { kind: "hit" }>).ms;
  const mb = (b as Extract<Shot, { kind: "hit" }>).ms;
  if (ma === mb) return { winner: null, reason: "tie", shots };
  return { winner: ma < mb ? 0 : 1, reason: "faster", shots };
}

/** A press this soon after the call was a guess made before it, so it counts as a foul. */
export function judgePress(msAfterCall: number, roundMs: number): Shot {
  if (msAfterCall < HUMAN_LIMIT_MS) return { kind: "foul", at: roundMs };
  return { kind: "hit", ms: Math.round(Math.min(msAfterCall, FROZE_MS)) };
}

// ------------------------------------------------------------- outlaws

export interface Outlaw {
  id: string;
  name: string;
  /** What the town calls them. */
  alias: string;
  /** Reward for beating them, in dollars. */
  bounty: number;
  /** Typical reaction, and how much it varies (ms). */
  mean: number;
  spread: number;
  /** Chance of firing at a fake-out. */
  flinch: number;
  line: string;
  look: Look;
}

/** How a gunslinger is drawn. */
export interface Look {
  hat: string;
  coat: string;
  shirt: string;
  scarf: string;
  skin: string;
  /** A long coat to the knees, a poncho, or a vest. */
  cut: "duster" | "poncho" | "vest";
  beard?: boolean;
}

export const PLAYER_LOOK: Look = { hat: "#c9a46b", coat: "#5b3a22", shirt: "#3b5d7a", scarf: "#b23a2a", skin: "#d9a27a", cut: "vest" };
export const RIVAL_LOOK: Look = { hat: "#2d2a26", coat: "#6b5d4a", shirt: "#e3d5b8", scarf: "#2f4f6f", skin: "#c58c63", cut: "duster" };

export const OUTLAWS: readonly Outlaw[] = [
  {
    id: "pete",
    name: "Dusty Pete",
    alias: "the Greenhorn Robber",
    bounty: 50,
    mean: 520,
    spread: 90,
    flinch: 0.3,
    line: "I ain't never lost a duel. I ain't never been in one, neither.",
    look: { hat: "#8a6b44", coat: "#9c7b52", shirt: "#d8c49a", scarf: "#c0603a", skin: "#e0aa82", cut: "vest", beard: true },
  },
  {
    id: "kate",
    name: "Calamity Kate",
    alias: "the Stagecoach Queen",
    bounty: 150,
    mean: 420,
    spread: 70,
    flinch: 0.2,
    line: "Draw when you're ready, sugar. I'll be done by then.",
    look: { hat: "#7a2f3a", coat: "#4a3a5e", shirt: "#e8d8c0", scarf: "#d4a03a", skin: "#e6b393", cut: "poncho" },
  },
  {
    id: "joe",
    name: "Rattlesnake Joe",
    alias: "the Canyon Ghost",
    bounty: 400,
    mean: 350,
    spread: 55,
    flinch: 0.12,
    line: "You hear that rattle? That's your nerves.",
    look: { hat: "#4d5a3a", coat: "#6a7a4e", shirt: "#c8b890", scarf: "#a33a2a", skin: "#b9805a", cut: "poncho", beard: true },
  },
  {
    id: "bart",
    name: "Black Bart",
    alias: "the Midnight Bandit",
    bounty: 1000,
    mean: 295,
    spread: 45,
    flinch: 0.07,
    line: "Twelve men faced me at noon. I ate supper alone.",
    look: { hat: "#1b1b1d", coat: "#232327", shirt: "#7a1f1f", scarf: "#111", skin: "#c99572", cut: "duster", beard: true },
  },
  {
    id: "stranger",
    name: "The Stranger",
    alias: "no name, no past",
    bounty: 5000,
    mean: 245,
    spread: 35,
    flinch: 0.03,
    line: "…",
    look: { hat: "#5a4632", coat: "#7d6a4f", shirt: "#3f3a33", scarf: "#6b2a1a", skin: "#c48a62", cut: "poncho" },
  },
];

/** What a computer outlaw does this round: flinch at a fake-out, or fire some time after the call. */
export function outlawShot(o: Outlaw, plan: Plan, rand: () => number): { foulAt: number } | { ms: number } {
  for (const f of plan.fakes) {
    const strength = f.kind === "word" ? 1 : f.kind === "bell" ? 0.6 : 0.4;
    if (rand() < o.flinch * strength) return { foulAt: f.at + 180 + Math.round(rand() * 120) };
  }
  // Normal reaction (Box-Muller), with now and then a fumbled draw.
  const z = Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  let ms = o.mean + o.spread * z;
  if (rand() < 0.06) ms += 150 + rand() * 200;
  return { ms: Math.round(Math.max(170, Math.min(FROZE_MS - 1, ms))) };
}

// -------------------------------------------------------------- ratings

export function rating(ms: number): { title: string; tier: 0 | 1 | 2 | 3 | 4 | 5 } {
  if (ms < 200) return { title: "Lightning", tier: 5 };
  if (ms < 250) return { title: "Deadeye", tier: 4 };
  if (ms < 300) return { title: "Quick", tier: 3 };
  if (ms < 380) return { title: "Steady", tier: 2 };
  if (ms < 600) return { title: "Slow", tier: 1 };
  return { title: "Asleep", tier: 0 };
}

/** Bonus dollars for a fast winning shot. */
export const quickBonus = (ms: number) => (ms < 200 ? 50 : ms < 250 ? 25 : ms < 300 ? 10 : 0);
