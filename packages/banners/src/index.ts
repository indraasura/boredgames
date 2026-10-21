import type { GameDefinition } from "@boredgames/engine";
import { botMove } from "./bot";
import { apply, current, legalMoves, ranking, setup, validate } from "./rules";
import type { BannersConfig, BannersState, BannersView, Move } from "./types";

export * from "./types";
export * from "./realm";
export { apply, battle, crownsOf, current, income, isStronghold, legalMoves, playerById, provincesOf, ranking, score, seasonOf, setup, strength, unitCost, validate, allied } from "./rules";
export { botMove, threat, winChance } from "./bot";

export const banners: GameDefinition<BannersState, Move, BannersView, BannersConfig> = {
  id: "banners",
  version: 1,
  players: { min: 2, max: 4 },
  setup: (ctx) => setup(ctx),
  currentActors: (s) => (s.phase === "over" ? [] : [current(s).id]),
  legalMoves,
  validate,
  apply,
  // Everything on the map is public; only the dice are hidden.
  view: (s) => ({ ...s, rng: 0 }),
  outcome: (s) => (s.phase === "over" ? { ranking: ranking(s), reason: s.winReason ?? "" } : null),
  botMove: (s, player, level, rng) => botMove(s, player, level, rng),
};
