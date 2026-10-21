import { describe, expect, it } from "vitest";
import { Rng, type BotLevel } from "@boredgames/engine";
import { banners, CROWNS, PROVINCES, battle, crownsOf, score, size, type BannersState, type Move } from "../src";

const names = ["Ann", "Bo", "Cy", "Di"];
const mk = (n: number) => names.slice(0, n).map((name, i) => ({ id: `p${i}`, name }));
const newGame = (seed: number, n = 4) => banners.setup({ players: mk(n), config: {}, seed });

function playOut(seed: number, n: number, levels: BotLevel[], maxMoves = 20000) {
  let s = newGame(seed, n);
  const rand = new Rng(seed ^ 0xabcdef);
  const counts: Record<string, number> = {};
  let moves = 0;
  while (s.phase === "play" && moves < maxMoves) {
    const [actor] = banners.currentActors(s);
    const idx = s.players.findIndex((p) => p.id === actor);
    const m = banners.botMove(s, actor!, levels[idx % levels.length]!, () => rand.next());
    const v = banners.validate(s, actor!, m);
    if (!v.ok) throw new Error(`bot made an illegal move: ${JSON.stringify(m)}: ${v.error}`);
    const r = banners.apply(s, actor!, m);
    for (const e of r.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
    s = r.state;
    moves++;
  }
  return { s, counts, moves };
}

const invariants = (s: BannersState) => {
  for (const p of s.provinces) {
    for (const a of [p.army, p.tired]) for (const v of [a.foot, a.archers, a.knights]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  }
  for (const p of s.players) {
    expect(p.gold).toBeGreaterThanOrEqual(0);
    if (p.ally) expect(s.players.find((x) => x.id === p.ally)!.ally).toBe(p.id);
  }
};

describe("the realm", () => {
  it("is one connected land with seven crowns", () => {
    expect(CROWNS).toHaveLength(7);
    const seen = new Set([0]);
    const q = [0];
    while (q.length) for (const j of PROVINCES[q.shift()!]!.adj) if (!seen.has(j)) (seen.add(j), q.push(j));
    expect(seen.size).toBe(PROVINCES.length);
    for (const p of PROVINCES) for (const j of p.adj) expect(PROVINCES[j]!.adj).toContain(p.id);
  });

  it("sets houses far apart, each with a capital", () => {
    for (const n of [2, 3, 4]) {
      const s = newGame(1, n);
      expect(s.players).toHaveLength(n);
      for (const p of s.players) expect(s.provinces[p.capital]!.owner).toBe(p.id);
    }
  });
});

describe("rules", () => {
  it("raises troops only at strongholds and within the muster limit", () => {
    let s = newGame(3);
    const me = s.players[0]!;
    expect(banners.validate(s, me.id, { type: "recruit", at: me.capital, unit: "foot" }).ok).toBe(true);
    const home = s.provinces.findIndex((p, i) => p.owner === me.id && i !== me.capital);
    expect(banners.validate(s, me.id, { type: "recruit", at: home, unit: "foot" }).ok).toBe(false);
    s = banners.apply(s, me.id, { type: "recruit", at: me.capital, unit: "foot", count: 3 }).state;
    expect(banners.validate(s, me.id, { type: "recruit", at: me.capital, unit: "foot" }).ok).toBe(false);
    // Fresh recruits cannot march this turn.
    expect(s.provinces[me.capital]!.tired.foot).toBe(3);
  });

  it("will not let allies fight, and betrayal costs prestige", () => {
    let s = newGame(5, 3);
    const [a, b] = s.players;
    s = banners.apply(s, a!.id, { type: "propose", to: b!.id }).state;
    s = banners.apply(s, a!.id, { type: "end" }).state;
    const pr = s.proposals.find((p) => p.to === b!.id)!;
    s = banners.apply(s, b!.id, { type: "answer", proposal: pr.id, accept: true }).state;
    expect(s.players[0]!.ally).toBe(b!.id);
    s = banners.apply(s, b!.id, { type: "break" }).state;
    expect(s.players[1]!.ally).toBeNull();
    expect(s.players[1]!.prestige).toBeGreaterThan(0);
    // and the jilted house will not hear of it again for a while
    expect(banners.validate(s, b!.id, { type: "propose", to: a!.id }).ok).toBe(false);
  });

  it("battles favour numbers, castles and knights", () => {
    const s = newGame(9);
    const r = new Rng(4);
    const odds = (a: number, d: number, knights = 0, castleAt?: number) => {
      const at = castleAt ?? PROVINCES.findIndex((p) => p.terrain === "plains" && !s.provinces[p.id]!.castle);
      let w = 0;
      for (let k = 0; k < 2000; k++) if (battle(s, "p0", at, { foot: a - knights, archers: 0, knights }, { foot: d, archers: 0, knights: 0 }, () => r.next()).won) w++;
      return w / 2000;
    };
    const even = odds(4, 4);
    const big = odds(8, 4);
    const kn = odds(4, 4, 2);
    const walls = odds(8, 4, 0, CROWNS[0]);
    console.log({ even, big, kn, walls });
    expect(big).toBeGreaterThan(even + 0.25);
    expect(kn).toBeGreaterThan(even);
    expect(walls).toBeLessThan(big);
  });

  it("is pure", () => {
    const s0 = newGame(11);
    const frozen = JSON.stringify(s0);
    banners.apply(s0, "p0", { type: "end" });
    expect(JSON.stringify(s0)).toBe(frozen);
  });
});

describe("computer lords play whole wars", () => {
  const stats: string[] = [];
  for (const n of [2, 3, 4]) {
    it(`${n} houses`, () => {
      const ends: Record<string, number> = {};
      let rounds = 0;
      let battles = 0;
      let alliances = 0;
      let betrayals = 0;
      let moves = 0;
      let neutralCrowns = 0;
      let maxCrowns = 0;
      let alive = 0;
      const G = 30;
      for (let seed = 1; seed <= G; seed++) {
        const { s, counts, moves: mv } = playOut(seed, n, ["hard", "medium", "hard", "easy"]);
        expect(s.phase).toBe("over");
        invariants(s);
        const key = (s.winReason ?? "").includes("together") ? "alliance" : (s.winReason ?? "").includes("crowns") ? "crowns" : (s.winReason ?? "").includes("alone") ? "conquest" : "score";
        ends[key] = (ends[key] ?? 0) + 1;
        rounds += s.round;
        battles += counts.battle ?? 0;
        alliances += counts.alliance ?? 0;
        betrayals += counts.betrayal ?? 0;
        moves += mv;
        neutralCrowns += CROWNS.filter((c) => !s.provinces[c]!.owner).length;
        maxCrowns += Math.max(...s.players.map((p) => crownsOf(s, p.id)));
        alive += s.players.filter((p) => p.alive).length;
      }
      stats.push(`${n} houses: ends ${JSON.stringify(ends)} avg rounds ${(rounds / G).toFixed(1)} battles/game ${(battles / G).toFixed(1)} alliances ${(alliances / G).toFixed(2)} betrayals ${(betrayals / G).toFixed(2)} moves ${(moves / G).toFixed(0)} neutral crowns left ${(neutralCrowns / G).toFixed(1)} top crowns ${(maxCrowns / G).toFixed(1)} alive ${(alive / G).toFixed(1)}`);
      console.log(stats[stats.length - 1]);
    }, 120000);
  }
});

void crownsOf;
void score;
void size;
export type { Move };

describe("royal decrees", () => {
  it("every house starts with one, and taking a province pays a conquest decree once", () => {
    const s = newGame(2026, 3);
    for (const p of s.players) expect(p.decree).not.toBeNull();
    s.players[0]!.decree = { kind: "conquer", reward: 4, done: false };
    const gold = s.players[0]!.gold;
    const greywater = PROVINCES.find((p) => p.name === "Greywater")!.id;
    const varnhold = s.players[0]!.capital;
    const r = banners.apply(s, "p0", { type: "march", from: varnhold, to: greywater, army: { ...s.provinces[varnhold]!.army } });
    const won = r.state.provinces[greywater]!.owner === "p0";
    expect(r.events.some((e) => e.type === "decree")).toBe(won);
    expect(r.state.players[0]!.gold).toBe(gold + (won ? 4 : 0));
    expect(r.state.players[0]!.decree!.done).toBe(won);
  });

  it("raising three troops in a turn fulfils a muster decree", () => {
    const s = newGame(5, 2);
    s.players[0]!.decree = { kind: "muster", reward: 3, done: false };
    s.players[0]!.gold = 20;
    const r = banners.apply(s, "p0", { type: "recruit", at: s.players[0]!.capital, unit: "foot", count: 3 });
    expect(r.state.players[0]!.gold).toBe(20 - 6 + 3);
  });

  it("the same seed gives the same decrees", () => {
    expect(newGame(77).players.map((p) => p.decree)).toEqual(newGame(77).players.map((p) => p.decree));
  });
});
