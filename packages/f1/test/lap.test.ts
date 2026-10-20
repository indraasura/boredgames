import { describe, expect, it } from "vitest";
import { Driver } from "../src/ai";
import { DEFAULT_SETUP, TEAMS, tune } from "../src/car";
import { planFor } from "../src/line";
import { DT, newCar, stepCar, type Env } from "../src/physics";
import { surfaceFor } from "../src/surface";
import { CIRCUITS, getTrack, nearest, trackAt } from "../src/track";
import { airDensity } from "../src/weather";

const fmt = (x: number) => `${Math.floor(x / 60)}:${(x % 60).toFixed(3).padStart(6, "0")}`;

describe("every circuit can be driven round", () => {
  for (const { id, name } of CIRCUITS) {
    it(`${name}`, { timeout: 30000 }, () => {
      const track = getTrack(id);
      const tuned = tune(TEAMS[0]!, DEFAULT_SETUP);
      const env: Env = { rho: airDensity(track.altitude, 25), wetness: 0, trackTemp: 40 };
      const plan = planFor(track, tuned, "medium", 0, env.rho, 30, 0.93);
      const drv = new Driver(track, plan, { skill: 1, aggression: 0.5 });
      const p = trackAt(track, 0);
      const c = newCar(p.x, p.y, p.heading, "medium", 30, 90);
      let lapStart = 0;
      let lastS = 0;
      const laps: number[] = [];
      let offTime = 0;
      let wall = 0;
      for (let t = 0; t < 400 && laps.length < 3; t += DT) {
        const near = nearest(track, c.x, c.y, drv.hint);
        const surf = surfaceFor(track, c, tuned, near, 0);
        if (surf.offTrack) offTime += DT;
        if (surf.wall) wall++;
        const f = drv.drive(c, DT, [], 1);
        stepCar(c, tuned, f.input, env, surf.grip, surf.drag, DT);
        if (f.s < 300 && lastS > track.length - 300) {
          laps.push(t - lapStart);
          lapStart = t;
        }
        lastS = f.s;
      }
      console.log(id.padEnd(9), "plan", fmt(plan.lapTime), "laps", laps.map(fmt).join(" "));
      expect(laps.length).toBe(3);
      expect(offTime).toBeLessThan(15);
      expect(wall).toBe(0);
      // The driven lap is close to the planned one: a little slower, never faster.
      expect(laps[2]! / plan.lapTime).toBeGreaterThan(1);
      expect(laps[2]! / plan.lapTime).toBeLessThan(1.1);
    });
  }
});
