export type Unit = "foot" | "archers" | "knights";
export const UNITS: readonly Unit[] = ["foot", "archers", "knights"];

export interface Army {
  foot: number;
  archers: number;
  knights: number;
}

export type Terrain = "plains" | "forest" | "hills";

export interface ProvinceDef {
  id: number;
  name: string;
  x: number;
  y: number;
  terrain: Terrain;
  income: number;
  crown: boolean;
  adj: readonly number[];
  /** Outline as x,y pairs on the map. */
  poly: readonly number[];
}

export interface Province {
  /** Player id, or null for unclaimed land held by local lords. */
  owner: string | null;
  /** Troops ready to march this turn. */
  army: Army;
  /** Troops that have marched, fought or just been raised: they defend, but cannot march again this turn. */
  tired: Army;
  castle: boolean;
}

export type HouseId = "varn" | "aldmoor" | "brennic" | "corvain";

export interface PlayerState {
  id: string;
  name: string;
  house: HouseId;
  gold: number;
  capital: number;
  alive: boolean;
  /** At most one ally at a time. */
  ally: string | null;
  /** Round from which the alliance counts towards a joint victory. */
  allySince: number;
  /** Score penalty for broken oaths. */
  prestige: number;
  /** Players this one broke with, and the round until which they will not ally again. */
  grudges: { id: string; until: number }[];
  /** Units raised at each stronghold this turn. */
}

export interface Proposal {
  id: number;
  from: string;
  to: string;
  round: number;
}

export type Season = "spring" | "summer" | "autumn" | "winter";
export const SEASONS: readonly Season[] = ["spring", "summer", "autumn", "winter"];

export type Tiding = "quiet" | "harvest" | "plague" | "mercenaries" | "storms";

export interface BannersConfig {
  /** Rounds before the realm is judged. */
  rounds?: number;
}

export interface BannersState {
  players: PlayerState[];
  provinces: Province[];
  /** Index into players of whose turn it is. */
  turn: number;
  round: number;
  rounds: number;
  phase: "play" | "over";
  rng: number;
  proposals: Proposal[];
  nextProposal: number;
  /** Units raised per province this turn (strongholds raise at most a few). */
  mustered: number[];
  tiding: Tiding;
  /** Province the plague or storms hit this round, if any. */
  tidingAt: number | null;
  winners: string[] | null;
  winReason: string | null;
}

export type Move =
  | { type: "recruit"; at: number; unit: Unit; count?: number }
  | { type: "castle"; at: number }
  | { type: "march"; from: number; to: number; army: Army; via?: number }
  | { type: "propose"; to: string }
  | { type: "answer"; proposal: number; accept: boolean }
  | { type: "break" }
  | { type: "tribute"; to: string; gold: number }
  | { type: "end" };

export type BannersView = BannersState;

export interface BattleRound {
  a: number[];
  d: number[];
  aLoss: number;
  dLoss: number;
}
