import { describe, expect, it } from "vitest";
import { Rng } from "@boredgames/engine";
import { PUNCH, ROUNDS, ROUND_TIME, aiControls, createFight, dist, noControls, step, type Controls, type Fight } from "../src";

const DT = 1 / 60;

/** Skip the "ready" countdown. */
const begin = (f: Fight) => {
  for (let i = 0; i < 60 * 3.2; i++) step(f, DT, [noControls(), noControls()]);
  f.events.length = 0;
};
/** Put the two fighters a good punching distance apart. */
const close = (f: Fight, gap = 1.1) => {
  f.f[0].x = 0;
  f.f[0].z = gap / 2;
  f.f[1].x = 0;
  f.f[1].z = -gap / 2;
};
const pass = (f: Fight, secs: number, c0 = noControls(), c1 = noControls()) => {
  for (let i = 0; i < secs * 60; i++) step(f, DT, [c0, c1]);
};
const punch = (f: Fight, kind: keyof typeof PUNCH, other: Controls = noControls()) => {
  step(f, DT, [{ ...noControls(), punch: kind }, other]);
  pass(f, 0.6, noControls(), other);
};

describe("a fight", () => {
  it("starts with a bell and a countdown", () => {
    const f = createFight("medium");
    expect(f.phase).toBe("ready");
    begin(f);
    expect(f.phase).toBe("fight");
  });

  it("a clean punch takes health and costs stamina", () => {
    const f = createFight("medium");
    begin(f);
    close(f);
    punch(f, "cross");
    expect(f.f[1].hp).toBeLessThan(100);
    expect(f.f[0].stamina).toBeLessThan(100);
    expect(f.events.some((e) => e.type === "hit")).toBe(true);
  });

  it("punches miss when the target is too far away", () => {
    const f = createFight("medium");
    begin(f);
    close(f, 2.6);
    punch(f, "jab");
    expect(f.f[1].hp).toBe(100);
    expect(f.events.some((e) => e.type === "whiff")).toBe(true);
  });

  it("guarding cuts the damage and slipping avoids a straight punch", () => {
    const base = createFight("medium");
    begin(base);
    close(base);
    punch(base, "cross");
    const open = 100 - base.f[1].hp;

    const guarded = createFight("medium");
    begin(guarded);
    close(guarded);
    punch(guarded, "cross", { ...noControls(), guard: true });
    expect(100 - guarded.f[1].hp).toBeLessThan(open / 3);

    const slipped = createFight("medium");
    begin(slipped);
    close(slipped);
    step(slipped, DT, [{ ...noControls(), punch: "cross" }, { ...noControls(), lean: 1 }]);
    pass(slipped, 0.6);
    expect(slipped.f[1].hp).toBe(100);
    expect(slipped.events.some((e) => e.type === "slip")).toBe(true);
  });

  it("ducking beats a hook", () => {
    const f = createFight("medium");
    begin(f);
    close(f);
    punch(f, "hook", { ...noControls(), duck: true });
    expect(f.f[1].hp).toBe(100);
  });

  it("a knockdown starts a count; getting up in time keeps the fight alive", () => {
    const f = createFight("medium");
    begin(f);
    close(f);
    f.f[1].hp = 3;
    punch(f, "cross");
    expect(f.f[1].down).not.toBeNull();
    // Mash it.
    for (let i = 0; i < 60 * 4 && f.f[1].down !== null; i++) step(f, DT, [noControls(), { ...noControls(), getUp: i % 3 === 0 }]);
    expect(f.f[1].down).toBeNull();
    expect(f.f[1].hp).toBeGreaterThan(0);
    expect(f.result).toBeNull();
  });

  it("staying down for ten counts is a knockout", () => {
    const f = createFight("easy");
    begin(f);
    close(f);
    f.f[0].hp = 2;
    f.f[1].x = 0;
    step(f, DT, [noControls(), { ...noControls(), punch: "cross" }]);
    pass(f, 0.5);
    expect(f.f[0].down).not.toBeNull();
    pass(f, 11);
    expect(f.result).toEqual({ winner: 1, how: "ko" });
  });

  it("rounds run their course and end in a decision", () => {
    const f = createFight("hard");
    const rng = new Rng(3);
    for (let i = 0; i < 60 * (ROUNDS * (ROUND_TIME + 12) + 20) && f.phase !== "over"; i++) {
      const c1 = aiControls(f, () => rng.next());
      step(f, DT, [noControls(), c1], () => rng.next());
      f.events.length = 0;
    }
    expect(f.phase).toBe("over");
    expect(f.result).not.toBeNull();
  });
});

describe("the computer", () => {
  it("closes distance and throws punches", () => {
    const f = createFight("hard");
    begin(f);
    const rng = new Rng(7);
    let thrown = 0;
    f.f[1].z = -2.4;
    for (let i = 0; i < 60 * 10; i++) {
      step(f, DT, [noControls(), aiControls(f, () => rng.next())], () => rng.next());
      thrown += f.events.filter((e) => e.type === "punch" && e.by === 1).length;
      f.events.length = 0;
    }
    expect(dist(f)).toBeLessThan(2);
    expect(thrown).toBeGreaterThan(3);
  });

  it("never produces NaN", () => {
    const f = createFight("medium");
    const rng = new Rng(11);
    for (let i = 0; i < 60 * 80; i++) {
      step(f, DT, [{ ...noControls(), move: 1, punch: i % 40 === 0 ? "jab" : null }, aiControls(f, () => rng.next())], () => rng.next());
      f.events.length = 0;
    }
    for (const x of f.f) expect(Number.isFinite(x.x + x.z + x.hp + x.stamina)).toBe(true);
  });
});
