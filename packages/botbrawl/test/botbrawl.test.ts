import { describe, expect, it } from "vitest";
import { Rng } from "@boredgames/engine";
import { BUDGET, GRID, TEMPLATES, applySnapshot, autoFix, botInput, check, createSim, hpFrac, noInput, snapshot, step, wheelsLeft, type Design, type Sim } from "../src";

const fight = (a: Design, b: Design, seed = 1, maxSeconds = 100) => {
  const sim = createSim([a, b]);
  const rng = new Rng(seed);
  for (let i = 0; i < maxSeconds * 60 && !sim.over; i++) {
    sim.robots[0]!.input = botInput(sim, 0, "hard", () => rng.next());
    sim.robots[1]!.input = botInput(sim, 1, "medium", () => rng.next());
    step(sim, 1 / 60);
    sim.events.length = 0;
  }
  return sim;
};

describe("building", () => {
  it.each(TEMPLATES.map((t) => [t.name, t] as const))("the %s template is a legal robot", (_name, t) => {
    const res = check(t);
    expect(res.error).toBeUndefined();
    expect(res.ok).toBe(true);
    expect(res.cost).toBeLessThanOrEqual(BUDGET);
    expect(res.kept).toHaveLength(t.parts.length);
  });

  it("needs exactly one core", () => {
    expect(check({ name: "x", parts: [{ c: 3, r: 3, kind: "hull", dir: 0 }] }).ok).toBe(false);
    expect(
      check({
        name: "x",
        parts: [
          { c: 3, r: 3, kind: "core", dir: 0 },
          { c: 4, r: 3, kind: "core", dir: 0 },
        ],
      }).ok,
    ).toBe(false);
  });

  it("drops parts that are not connected to the core", () => {
    const res = check({
      name: "x",
      parts: [
        { c: 3, r: 3, kind: "core", dir: 0 },
        { c: 3, r: 2, kind: "hull", dir: 0 },
        { c: 0, r: 0, kind: "hull", dir: 0 },
      ],
    });
    expect(res.kept).toHaveLength(2);
  });

  it("does not wrap around the edge of the grid", () => {
    const res = check({
      name: "x",
      parts: [
        { c: GRID - 1, r: 2, kind: "core", dir: 0 },
        { c: 0, r: 3, kind: "hull", dir: 0 },
      ],
    });
    expect(res.kept).toHaveLength(1);
  });

  it("autoFix makes an over-budget design legal and adds a missing core", () => {
    const parts: Design["parts"] = [];
    for (let c = 0; c < GRID; c++) for (let r = 0; r < GRID; r++) parts.push({ c, r, kind: "armor", dir: 0 });
    parts.find((p) => p.c === 3 && p.r === 3)!.kind = "core";
    expect(check({ name: "big", parts }).ok).toBe(false);
    expect(check(autoFix({ name: "big", parts })).ok).toBe(true);
    expect(check(autoFix({ name: "none", parts: [{ c: 0, r: 0, kind: "hull", dir: 0 }] })).ok).toBe(true);
  });
});

describe("driving", () => {
  const drive = (): Sim => createSim([TEMPLATES[0]!, TEMPLATES[2]!]);

  it("a robot with wheels drives where it points and steers", () => {
    const sim = drive();
    const r = sim.robots[0]!;
    const x0 = r.x;
    r.input = { ...noInput(), throttle: 1 };
    for (let i = 0; i < 120; i++) step(sim, 1 / 60);
    expect(r.x).toBeGreaterThan(x0 + 1.5);
    expect(Math.abs(r.y)).toBeLessThan(0.5);

    const sim2 = drive();
    sim2.robots[0]!.input = { ...noInput(), turn: 1 };
    for (let i = 0; i < 60; i++) step(sim2, 1 / 60);
    expect(sim2.robots[0]!.th).toBeGreaterThan(0.3);
  });

  it("stays in the cage", () => {
    const sim = drive();
    sim.robots[0]!.input = { ...noInput(), throttle: 1, turn: 0.2 };
    sim.robots[1]!.input = { ...noInput(), throttle: -1 };
    for (let i = 0; i < 60 * 40 && !sim.over; i++) step(sim, 1 / 60);
    for (const r of sim.robots) {
      expect(Math.abs(r.x)).toBeLessThan(11);
      expect(Math.abs(r.y)).toBeLessThan(11);
    }
  });
});

describe("fighting", () => {
  it("never produces NaN and every fight ends", () => {
    for (let a = 0; a < TEMPLATES.length; a++) {
      const sim = fight(TEMPLATES[a]!, TEMPLATES[(a + 2) % TEMPLATES.length]!, a + 1);
      expect(sim.over).not.toBeNull();
      for (const r of sim.robots) {
        expect(Number.isFinite(r.x + r.y + r.th + r.mass)).toBe(true);
        expect(hpFrac(r)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("weapons hurt: fighting costs somebody health", () => {
    const sim = fight(TEMPLATES[0]!, TEMPLATES[2]!, 5, 30);
    const lost = sim.robots.reduce((n, r) => n + (1 - hpFrac(r)), 0);
    expect(lost).toBeGreaterThan(0.05);
  });

  it("a robot with no core left is knocked out", () => {
    const sim = createSim([TEMPLATES[0]!, TEMPLATES[1]!]);
    const r = sim.robots[1]!;
    // Put the spinner robot's blade right on the other core.
    r.parts.find((p) => p.kind === "core")!.hp = 0.001;
    sim.robots[0]!.x = -1;
    sim.robots[1]!.x = 1.2;
    sim.robots[0]!.input = { ...noInput(), throttle: 1 };
    for (let i = 0; i < 60 * 10 && !sim.over; i++) step(sim, 1 / 60);
    expect(sim.over).not.toBeNull();
  });

  it("losing every wheel leaves a robot immobile", () => {
    const sim = createSim([TEMPLATES[0]!, TEMPLATES[1]!]);
    const r = sim.robots[0]!;
    for (const p of r.parts) if (p.kind === "wheel") p.alive = false;
    expect(wheelsLeft(r)).toBe(0);
    for (let i = 0; i < 60 * 9 && !sim.over; i++) step(sim, 1 / 60);
    expect(sim.over).toEqual({ winner: 1, reason: "immobilized" });
  });
});

describe("snapshots", () => {
  it("a guest copy follows the host", () => {
    const host = createSim([TEMPLATES[0]!, TEMPLATES[2]!]);
    const guest = createSim([TEMPLATES[0]!, TEMPLATES[2]!]);
    host.robots[0]!.input = { ...noInput(), throttle: 1 };
    for (let i = 0; i < 300; i++) step(host, 1 / 60);
    applySnapshot(guest, JSON.parse(JSON.stringify(snapshot(host))));
    expect(guest.robots[0]!.x).toBeCloseTo(host.robots[0]!.x, 1);
    expect(guest.robots[1]!.parts.map((p) => p.alive)).toEqual(host.robots[1]!.parts.map((p) => p.alive));
  });
});
