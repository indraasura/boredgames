import type { GameDefinition } from "@boredgames/engine";
import { botMove } from "./bot";
import { apply, currentPlayer, legalMoves, netWorth, setup, validate } from "./rules";
import type { MilestonesConfig, MilestonesState, MilestonesView, Move } from "./types";

export * from "./board";
export * from "./content";
export * from "./maps";
export * from "./tiles";
export * from "./types";
export { apply, currentPlayer, legalMoves, netWorth, setup, validate } from "./rules";

export const milestones: GameDefinition<MilestonesState, Move, MilestonesView, MilestonesConfig> = {
  id: "milestones",
  version: 2,
  players: { min: 2, max: 4 },
  setup: (ctx) => setup(ctx),
  currentActors: (s) => (s.phase === "over" ? [] : [currentPlayer(s).id]),
  legalMoves,
  validate,
  apply,
  // Perfect information: everyone sees everything except the RNG state.
  view: (s) => ({ ...s, rng: 0 }),
  outcome: (s) => {
    if (s.phase !== "over") return null;
    const scored = s.players.map((p) => ({ id: p.id, net: netWorth(p) }));
    const nets = [...new Set(scored.map((x) => x.net))].sort((a, b) => b - a);
    return {
      ranking: nets.map((n) => scored.filter((x) => x.net === n).map((x) => x.id)),
      reason: "Everyone has retired.",
    };
  },
  botMove: (s, _player, level, rng) => botMove(s, level, rng),
};
