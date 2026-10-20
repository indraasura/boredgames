import type { PlayerId } from "@boredgames/engine";

export type JobTier = "degree" | "trade" | "corporate" | "venture";

export interface Home {
  name: string;
  /** In $k. */
  price: number;
  /** Today's market value; grows a little every round. */
  value: number;
  /** How quickly this home grows in value (0.6 to 1.6). */
  growth: number;
}

export interface PathInfo {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  /** $k borrowed up front. */
  loan: number;
  /** $k starting bonus. */
  cash: number;
  tier: JobTier;
  /** Jobs are offered at the start of the road or at its Job board stop. */
  jobsAt: "start" | "graduate";
  segment: string;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  /** $k, a whole number. May never be negative: shortfalls become loans. */
  cash: number;
  salary: number;
  career: string | null;
  route: string | null;
  tier: JobTier | null;
  node: number;
  /** Which way to go at the next split (set by the route or crossroads choice). */
  heading: number | null;
  home: Home | null;
  /** Set once, when the game ends. */
  homeSale: number;
  /** $k borrowed, repaid with 10% interest at the end. */
  loans: number;
  kids: number;
  spouse: boolean;
  retired: boolean;
  retiredFirst: boolean;
  /** Current value of the Growth Fund, and what was put in. */
  fund: number;
  invested: number;
  paydays: number;
}

export type Option =
  | { type: "route"; path: PathInfo }
  | { type: "branch"; node: number; name: string; blurb: string; vibe: "safe" | "risky" }
  | { type: "job"; title: string; salary: number; /** Bonus Growth Fund stake, $k. */ perk?: number }
  | { type: "home"; home: Home }
  | { type: "rent" }
  | { type: "invest"; amount: number }
  | { type: "skip"; label: string; detail: string };

export type ChoiceKind = "route" | "branch" | "job" | "home" | "invest";

export interface Choice {
  kind: ChoiceKind;
  title: string;
  text: string;
  /** What the same player does once they've chosen. */
  then: "spin" | "endTurn";
  options: Option[];
}

export interface MilestonesState {
  map: string;
  players: PlayerState[];
  turn: number;
  phase: "spin" | "choice" | "over";
  choice: Choice | null;
  /** PRNG state; part of State so apply() stays pure. */
  rng: number;
  turnCount: number;
  /** Everyone has had this many turns. The Growth Fund and homes grow once per round. */
  round: number;
}

export type Move = { type: "spin" } | { type: "choose"; index: number };

export type MilestonesView = MilestonesState;

export interface MilestonesConfig {
  map?: string;
}
