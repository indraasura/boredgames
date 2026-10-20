import { describe, expect, it } from "vitest";
import { Driver } from "../src/ai";
import { DEFAULT_SETUP, TEAMS, tune } from "../src/car";
import { planFor } from "../src/line";
import { DT, newCar, stepCar, type Env } from "../src/physics";
import { surfaceFor } from "../src/surface";
import { getTrack, nearest, trackAt } from "../src/track";
import { airDensity } from "../src/weather";

/** A driver who can only press keys: steering and pedals are on or off, smoothed like the real controls. */
function keyboardLap(id: string, assist: boolean, tc: boolean, pace: number) {
  const track = getTrack(id);
  const tuned = tune(TEAMS[0]!, DEFAULT_SETUP);
  const env: Env = { rho: airDensity(track.altitude, 25), wetness: 0, trackTemp: 40 };
  const plan = planFor(track, tuned, "medium", 0, env.rho, 30, 0.93);
  const drv = new Driver(track, plan, { skill: pace, aggression: 0.5 });
  const p = trackAt(track, 0);
  const c = newCar(p.x, p.y, p.heading, "medium", 30, 90);
  let steer = 0, th = 0, br = 0, lapStart = 0, lastS = 0, off = 0, wall = 0;
  const laps: number[] = [];
  const move = (v: number, target: number, up: number, down: number) => {
    const rate = target === 0 || Math.sign(target) !== Math.sign(v) ? down : up;
    const d = target - v;
    return Math.abs(d) <= rate * DT ? target : v + Math.sign(d) * rate * DT;
  };
  for (let t = 0; t < 300 && laps.length < 2; t += DT) {
    const near = nearest(track, c.x, c.y, drv.hint);
    const surf = surfaceFor(track, c, tuned, near, 0);
    if (surf.offTrack) off += DT;
    if (surf.wall) wall++;
    const f = drv.drive(c, DT, [], 1);
    const V = Math.hypot(c.u, c.v);
    const want = f.input.steer;
    const tSteer = want > 0.12 ? 1 : want < -0.12 ? -1 : 0;
    steer = move(steer, tSteer, 5.2 - Math.min(3.4, V * 0.045), 9);
    th = move(th, f.input.throttle > 0.5 ? 1 : 0, 6, 12);
    br = move(br, f.input.brake > 0.3 ? 1 : 0, 7, 14);
    stepCar(c, tuned, { throttle: th, brake: br, steer, drs: false, steerAssist: assist, tractionControl: tc }, env, surf.grip, surf.drag, DT);
    if (f.s < 300 && lastS > track.length - 300) {
      laps.push(t - lapStart);
      lapStart = t;
    }
    lastS = f.s;
  }
  return { laps, off, wall, plan: plan.lapTime };
}

describe("a keyboard driver can get round", () => {
  for (const id of ["gb-1948", "mc-1929", "it-1922", "jp-1962"]) {
    it(`${id} with the aids on`, () => {
      const r = keyboardLap(id, true, true, 0.85);
      console.log(id, "keyboard laps", r.laps.map((l) => l.toFixed(1)), "plan", r.plan.toFixed(1), "off s", r.off.toFixed(1), "wall", r.wall);
      expect(r.laps.length).toBeGreaterThanOrEqual(1);
      expect(r.wall).toBe(0);
    });
  }
});
