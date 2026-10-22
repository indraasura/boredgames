import { describe, expect, it } from "vitest";
import { Rng } from "@boredgames/engine";
import { FROZE_MS, OUTLAWS, WINS_NEEDED, judgePress, outlawShot, planRound, quickBonus, rating, resolve } from "../src";

describe("round plans", () => {
  it("are the same for the same seed, round and score", () => {
    for (let r = 1; r <= 5; r++) expect(planRound(42, r, [1, 1])).toEqual(planRound(42, r, [1, 1]));
  });

  it("keep fake-outs well before the call, in order", () => {
    for (let seed = 1; seed < 400; seed++) {
      for (let r = 1; r <= 5; r++) {
        const p = planRound(seed, r, [0, 0]);
        expect(p.delay).toBeGreaterThanOrEqual(900);
        expect(p.delay).toBeLessThanOrEqual(9000);
        let last = 0;
        for (const f of p.fakes) {
          expect(f.at).toBeGreaterThanOrEqual(1000);
          expect(f.at).toBeLessThanOrEqual(p.delay - 900);
          expect(f.at).toBeGreaterThanOrEqual(last);
          last = f.at;
          if (f.kind === "word") expect(f.word).not.toBe("DRAW!");
        }
      }
    }
  });

  it("open with a plain round and end level matches with a showdown", () => {
    expect(planRound(9, 1, [0, 0]).kind).toBe("classic");
    expect(planRound(9, 5, [WINS_NEEDED - 1, WINS_NEEDED - 1]).kind).toBe("showdown");
  });

  it("vary from round three on", () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 200; seed++) kinds.add(planRound(seed, 3, [1, 1]).kind);
    expect(kinds).toEqual(new Set(["classic", "quick", "long", "fakeouts"]));
  });
});

describe("shots", () => {
  it("the faster hit wins", () => {
    expect(resolve({ kind: "hit", ms: 240 }, { kind: "hit", ms: 300 })).toMatchObject({ winner: 0, reason: "faster" });
    expect(resolve({ kind: "hit", ms: 400 }, { kind: "hit", ms: 300 })).toMatchObject({ winner: 1, reason: "faster" });
  });

  it("a foul loses at once, even before the other shot", () => {
    expect(resolve({ kind: "foul", at: 1200 }, null)).toMatchObject({ winner: 1, reason: "foul" });
    expect(resolve(null, { kind: "foul", at: 900 })).toMatchObject({ winner: 0, reason: "foul" });
    expect(resolve({ kind: "hit", ms: 200 }, { kind: "foul", at: 900 })).toMatchObject({ winner: 0 });
  });

  it("when both foul, the first to fire loses", () => {
    expect(resolve({ kind: "foul", at: 800 }, { kind: "foul", at: 1500 })).toMatchObject({ winner: 1 });
  });

  it("waits for both hits, and calls a dead heat a tie", () => {
    expect(resolve({ kind: "hit", ms: 250 }, null)).toBeNull();
    expect(resolve({ kind: "hit", ms: 250 }, { kind: "hit", ms: 250 })).toMatchObject({ winner: null, reason: "tie" });
  });

  it("a press too soon after the call is a guess", () => {
    expect(judgePress(60, 3060)).toEqual({ kind: "foul", at: 3060 });
    expect(judgePress(231.6, 3231)).toEqual({ kind: "hit", ms: 232 });
    expect(judgePress(99999, 0)).toEqual({ kind: "hit", ms: FROZE_MS });
  });
});

describe("outlaws", () => {
  it("get faster down the list, and steadier", () => {
    for (let i = 1; i < OUTLAWS.length; i++) {
      expect(OUTLAWS[i]!.mean).toBeLessThan(OUTLAWS[i - 1]!.mean);
      expect(OUTLAWS[i]!.flinch).toBeLessThan(OUTLAWS[i - 1]!.flinch);
      expect(OUTLAWS[i]!.bounty).toBeGreaterThan(OUTLAWS[i - 1]!.bounty);
    }
  });

  it("react like their numbers say, and flinch at fakes now and then", () => {
    const rng = new Rng(7);
    const rand = () => rng.next();
    for (const o of OUTLAWS) {
      const plain = planRound(1, 1, [0, 0]);
      const times: number[] = [];
      for (let k = 0; k < 2000; k++) {
        const s = outlawShot(o, plain, rand);
        expect("ms" in s).toBe(true);
        if ("ms" in s) times.push(s.ms);
      }
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avg).toBeGreaterThan(o.mean - 20);
      expect(avg).toBeLessThan(o.mean + 40);
      expect(Math.min(...times)).toBeGreaterThanOrEqual(170);
    }
    const tricky = { round: 3, kind: "fakeouts" as const, delay: 6000, fakes: [{ at: 2000, kind: "word" as const, word: "DRAT!" }] };
    let fouls = 0;
    for (let k = 0; k < 2000; k++) if ("foulAt" in outlawShot(OUTLAWS[0]!, tricky, rand)) fouls++;
    expect(fouls / 2000).toBeGreaterThan(0.2);
    expect(fouls / 2000).toBeLessThan(0.4);
  });
});

describe("ratings", () => {
  it("name the speed and pay a bonus for fast shots", () => {
    expect(rating(180).title).toBe("Lightning");
    expect(rating(320).title).toBe("Steady");
    expect(quickBonus(190)).toBeGreaterThan(quickBonus(260));
    expect(quickBonus(400)).toBe(0);
  });
});
