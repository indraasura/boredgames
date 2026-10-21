import { describe, expect, it } from "vitest";
import { Rng, type BotLevel } from "@boredgames/engine";
import {
  MAP_LIST,
  TILE_INFO,
  getBoard,
  milestones,
  netWorth,
  type MilestonesState,
  type Move,
} from "../src";

const names = ["Ann", "Bo", "Cy", "Di"];
const mkPlayers = (n: number) => names.slice(0, n).map((name, i) => ({ id: `p${i}`, name }));
const newGame = (seed: number, n = 2, map = "sunny-isle") =>
  milestones.setup({ players: mkPlayers(n), config: { map }, seed });

/** Chooses the first option of anything, spins normally. */
const firstOptionMove = (s: MilestonesState): Move => (s.phase === "spin" ? { type: "spin" } : { type: "choose", index: 0 });

function playOut(seed: number, nPlayers: number, level: BotLevel, map = "sunny-isle", maxMoves = 4000) {
  let state = newGame(seed, nPlayers, map);
  const rand = new Rng(seed ^ 0x9e3779b9);
  const log: { player: string; move: Move }[] = [];
  const events: { type: string; [k: string]: unknown }[] = [];
  for (let i = 0; i < maxMoves && state.phase !== "over"; i++) {
    const [actor] = milestones.currentActors(state);
    const move = milestones.botMove(state, actor!, level, () => rand.next());
    expect(milestones.legalMoves(state, actor!)).toContainEqual(move);
    const res = milestones.apply(state, actor!, move);
    log.push({ player: actor!, move });
    events.push(...(res.events as { type: string }[]));
    state = res.state;
  }
  return { state, log, events };
}

describe("maps", () => {
  it.each(MAP_LIST.map((m) => [m.id] as const))("%s has a sound board", (id) => {
    const board = getBoard(id);
    const retire = board.nodes.filter((n) => n.type === "retire");
    expect(retire).toHaveLength(1);
    for (const n of board.nodes) {
      expect(n.stop).toBe(TILE_INFO[n.type].stop);
      if (n.next.length > 1) expect(["start", "fork"]).toContain(n.type);
      expect(Number.isFinite(board.distToEnd[n.id])).toBe(true);
    }
  });

  it.each(MAP_LIST.map((m) => [m.id] as const))("%s: every route passes the wedding and the house, once", (id) => {
    const board = getBoard(id);
    const walk = (node: number, seen: string[]): number => {
      const here = board.nodes[node]!;
      const path = [...seen, here.type];
      if (here.type === "retire") {
        expect(path.filter((t) => t === "wedding")).toHaveLength(1);
        expect(path.filter((t) => t === "house")).toHaveLength(1);
        return 1;
      }
      return here.next.reduce((sum, n) => sum + walk(n, path), 0);
    };
    expect(walk(board.start, [])).toBeGreaterThanOrEqual(MAP_LIST.find((m) => m.id === id)!.paths.length);
  });

  it("has long roads", () => {
    for (const m of MAP_LIST) {
      const board = getBoard(m.id);
      const shortest = Math.min(...m.paths.map((p) => board.distToEnd[board.segments[p.segment]!.first]!));
      expect(shortest).toBeGreaterThanOrEqual(95);
    }
  });

  it("every tile type has its own colour and glyph", () => {
    const infos = Object.values(TILE_INFO);
    expect(new Set(infos.map((i) => i.color)).size).toBe(infos.length);
    expect(new Set(infos.map((i) => i.icon)).size).toBe(infos.length);
  });
});

describe("rules", () => {
  it("opens with a road pick for the first player only", () => {
    const s = newGame(1);
    expect(s.phase).toBe("choice");
    expect(s.choice?.kind).toBe("route");
    expect(milestones.legalMoves(s, "p0")).toHaveLength(2);
    expect(milestones.legalMoves(s, "p1")).toHaveLength(0);
  });

  it("rejects out-of-turn and illegal moves", () => {
    const s = newGame(1);
    expect(milestones.validate(s, "p1", { type: "choose", index: 0 }).ok).toBe(false);
    expect(milestones.validate(s, "p0", { type: "spin" }).ok).toBe(false);
    expect(milestones.validate(s, "p0", { type: "choose", index: 9 }).ok).toBe(false);
    expect(() => milestones.apply(s, "p1", { type: "spin" })).toThrow();
  });

  it("college adds a loan and goes to the wheel; career offers jobs first", () => {
    const s0 = newGame(5);
    const college = milestones.apply(s0, "p0", { type: "choose", index: 0 }).state;
    expect(college.phase).toBe("spin");
    expect(college.players[0]!.loans).toBe(100);
    const career = milestones.apply(s0, "p0", { type: "choose", index: 1 }).state;
    expect(career.choice?.kind).toBe("job");
    const hired = milestones.apply(career, "p0", { type: "choose", index: 0 }).state;
    expect(hired.phase).toBe("spin");
    expect(hired.players[0]!.salary).toBeGreaterThan(0);
  });

  it("apply is pure and deterministic", () => {
    const s0 = newGame(42);
    const frozen = JSON.stringify(s0);
    const a = milestones.apply(s0, "p0", { type: "choose", index: 0 });
    expect(JSON.stringify(s0)).toBe(frozen);
    expect(milestones.apply(s0, "p0", { type: "choose", index: 0 })).toEqual(a);
  });

  it("a seed plus the move log replays to the same final state", () => {
    const { state, log } = playOut(7, 3, "hard");
    let s = newGame(7, 3);
    for (const { player, move } of log) s = milestones.apply(s, player, move).state;
    expect(s).toEqual(state);
  });

  it("view hides the rng state", () => {
    expect(milestones.view(newGame(99), "p1").rng).toBe(0);
  });

  it("the Growth Fund grows each round and counts towards the score", () => {
    const { state, events } = playOut(3, 2, "hard");
    expect(events.some((e) => e.type === "round")).toBe(true);
    expect(events.some((e) => e.type === "invested")).toBe(true);
    for (const p of state.players) expect(netWorth(p)).toBeGreaterThanOrEqual(Math.round(p.cash + p.fund - p.loans * 1.1));
  });

  it("has only a handful of decisions per game", () => {
    let decisions = 0;
    let s = newGame(9, 2);
    const rand = new Rng(9);
    while (s.phase !== "over") {
      const p = milestones.currentActors(s)[0]!;
      const move = milestones.botMove(s, p, "hard", () => rand.next());
      if (move.type === "choose" && p === "p0") decisions++;
      s = milestones.apply(s, p, move).state;
    }
    expect(decisions).toBeLessThanOrEqual(24);
  });

  it("twists shake up games: lawsuits, layoffs, market swings and comebacks all happen", () => {
    const kickers = new Set<string>();
    const markets = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const { events } = playOut(seed, 3, "medium");
      for (const e of events) {
        if (e.type === "card" && e.twist) kickers.add(e.kicker as string);
        if (e.type === "round") markets.add(e.market as string);
        if (e.type === "market") markets.add(e.market as string);
      }
    }
    expect(markets).toEqual(new Set(["boom", "steady", "slump"]));
    for (const k of ["LAYOFF", "TAX AUDIT", "DISASTER", "COMEBACK", "SCANDAL"]) expect(kickers.has(k), k).toBe(true);
    expect([...kickers].some((k) => ["SETTLED", "CASE DISMISSED", "LOST IN COURT"].includes(k))).toBe(true);
  });

});

describe("full games", () => {
  const cases = MAP_LIST.flatMap((m) =>
    [2, 4].flatMap((n) => (["easy", "medium", "hard"] as const).map((l) => [m.id, n, l] as const)),
  );

  it.each(cases)("%s, %i players, %s bots: seeded games finish with sane invariants", (map, n, level) => {
    for (let seed = 1; seed <= 12; seed++) {
      const { state, events } = playOut(seed, n, level, map);
      expect(state.phase, `seed ${seed}`).toBe("over");
      expect(state.players.every((p) => p.retired)).toBe(true);
      expect(state.players.filter((p) => p.retiredFirst)).toHaveLength(1);
      for (const p of state.players) {
        expect(p.cash).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(p.cash)).toBe(true);
        expect(p.loans).toBeGreaterThanOrEqual(0);
        expect(p.fund).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(netWorth(p))).toBe(true);
      }
      const outcome = milestones.outcome(state)!;
      expect(outcome.ranking.flat().sort()).toEqual(state.players.map((p) => p.id).sort());
      expect(events.filter((e) => e.type === "gameOver")).toHaveLength(1);
    }
  });

  it("games are long: dozens of turns each", () => {
    const { state } = playOut(5, 2, "hard");
    expect(state.round).toBeGreaterThanOrEqual(12);
  });

  it("hard bots out-earn easy bots on average", () => {
    let hard = 0;
    let easy = 0;
    const N = 80;
    for (let seed = 1; seed <= N; seed++) {
      let s: MilestonesState = newGame(seed);
      const rand = new Rng(seed * 31);
      while (s.phase !== "over") {
        const p = milestones.currentActors(s)[0]!;
        s = milestones.apply(s, p, milestones.botMove(s, p, p === "p0" ? "hard" : "easy", () => rand.next())).state;
      }
      hard += netWorth(s.players[0]!);
      easy += netWorth(s.players[1]!);
    }
    expect(hard / N).toBeGreaterThan(easy / N);
  });

  it("someone choosing the first option every time still finishes", () => {
    let s = newGame(21, 3, "dune-kingdom");
    for (let i = 0; i < 6000 && s.phase !== "over"; i++) {
      const [actor] = milestones.currentActors(s);
      s = milestones.apply(s, actor!, firstOptionMove(s)).state;
    }
    expect(s.phase).toBe("over");
  });
});

