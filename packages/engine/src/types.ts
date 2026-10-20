export type PlayerId = string;

/** Things that happened, in order. Clients animate events, not state diffs. */
export interface GameEvent {
  type: string;
  [key: string]: unknown;
}

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E = string>(error: E): Result<never, E> => ({ ok: false, error });

export type BotLevel = "easy" | "medium" | "hard";

export interface GameDefinition<State, Move, View, Config = Record<string, never>> {
  id: string;
  /** Bump when rules change; stored on every match so replays use the right rules. */
  version: number;
  players: { min: number; max: number };

  setup(ctx: { players: { id: PlayerId; name: string }[]; config: Config; seed: number }): State;

  /** Who may move right now (more than one during simultaneous phases). */
  currentActors(state: State): PlayerId[];
  legalMoves(state: State, player: PlayerId): Move[];
  validate(state: State, player: PlayerId, move: Move): Result<void>;
  /** Pure. Never mutates `state`. */
  apply(state: State, player: PlayerId, move: Move): { state: State; events: GameEvent[] };

  /** The security boundary for hidden information. */
  view(state: State, viewer: PlayerId | "spectator"): View;
  outcome(state: State): null | { ranking: PlayerId[][]; reason: string };

  /** Pick a move for a bot-controlled player. Must return a legal move. */
  botMove(state: State, player: PlayerId, level: BotLevel, rng: () => number): Move;
}
