import { describe, expect, it } from "vitest";
import { Aids, type AidLevel } from "../src/aids";
import { Driver } from "../src/ai";
import { DEFAULT_SETUP, TEAMS, tune } from "../src/car";
import { planFor } from "../src/line";
import { DT, newCar, stepCar, type Env, type Input } from "../src/physics";
import { surfaceFor, WALL } from "../src/surface";
import { getTrack, nearest, trackAt } from "../src/track";
import { airDensity } from "../src/weather";

/**
 * A keyboard driver who is not a robot: it reacts a fifth of a second late, only ever presses keys all
 * the way down, brakes a little early or late, and only corrects the car when it is clearly off.
 */
function humanLap(id: string, level: AidLevel | "legacy", seed: number, reaction = 0.2) {
  const track = getTrack(id);
  const tuned = tune(TEAMS[0]!, DEFAULT_SETUP);
  const env: Env = { rho: airDensity(track.altitude, 25), wetness: 0, trackTemp: 40 };
  const plan = planFor(track, tuned, "medium", 0, env.rho, 30, 0.93);
  const eyes = new Driver(track, plan, { skill: 0.9, aggression: 0 });
  const aids = level === "legacy" ? null : new Aids(track, plan, level);
  const p = trackAt(track, 0);
  const c = newCar(p.x, p.y, p.heading, "medium", 30, 90);
  let rs = seed * 7919 + 1;
  const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
  const lag: { steer: number; th: number; br: number }[] = [];
  const delay = Math.round(reaction / DT);
  let steer = 0, th = 0, br = 0, lastS = 0, lapStart = 0, off = 0, walls = 0, spins = 0, wasSpun = false, bias = 1;
  let wasWall = false;
  const laps: number[] = [];
  for (let t = 0; t < 400 && laps.length < 3; t += DT) {
    const near = nearest(track, c.x, c.y, eyes.hint);
    const surf = surfaceFor(track, c, tuned, near, 0);
    if (surf.offTrack) off += DT;
    if (Math.abs(near.d) > track.width / 2 + WALL - 0.5) {
      if (!wasWall) walls++;
      wasWall = true;
    } else wasWall = false;
    const f = eyes.drive(c, DT, [], 1);
    // The key presses a person would make for this moment, a fifth of a second from now.
    if (Math.floor(t / 0.8) !== Math.floor((t - DT) / 0.8)) bias = 0.93 + rnd() * 0.14;
    const want = f.input.steer;
    lag.push({ steer: want > 0.07 ? 1 : want < -0.07 ? -1 : 0, th: f.input.throttle > 0.45 ? 1 : 0, br: f.input.brake * bias > 0.3 ? 1 : 0 });
    const k = lag.length > delay ? lag.shift()! : { steer: 0, th: 0, br: 0 };
    const V = Math.hypot(c.u, c.v);
    const move = (v: number, target: number, up: number, down: number) => {
      const rate = target === 0 || Math.sign(target) !== Math.sign(v) ? down : up;
      const d = target - v;
      return Math.abs(d) <= rate * DT ? target : v + Math.sign(d) * rate * DT;
    };
    steer = move(steer, k.steer, 5, 7);
    th = move(th, k.th, 4, 10);
    br = move(br, k.br, 5, 10);
    let input: Input;
    if (aids) input = aids.apply({ throttle: th, brake: br, steer, drs: false }, c, tuned, env, 1, DT);
    else input = { throttle: th, brake: br, steer, drs: false, steerAssist: true, tractionControl: true };
    stepCar(c, tuned, input, env, surf.grip, surf.drag, DT);
    let ang = c.psi - track.heading[near.i]!;
    while (ang > Math.PI) ang -= 2 * Math.PI;
    while (ang < -Math.PI) ang += 2 * Math.PI;
    const spun = Math.abs(ang) > 1.2 && V > 8;
    if (spun && !wasSpun) spins++;
    wasSpun = spun;
    if (f.s < 300 && lastS > track.length - 300) {
      laps.push(t - lapStart);
      lapStart = t;
    }
    lastS = f.s;
    if (walls > 12) break;
  }
  return { laps, off, walls, spins, plan: plan.lapTime };
}

describe("a person on a keyboard can drive this car", () => {
  const tracks = ["gb-1948", "mc-1929", "it-1922", "jp-1962"];
  for (const level of ["legacy", "pro", "standard", "full"] as const) {
    it(`${level}`, () => {
      const rows = tracks.flatMap((id) =>
        [1, 2, 3].map((seed) => ({ id, ...humanLap(id, level, seed) })),
      );
      const done = rows.filter((r) => r.laps.length >= 2).length;
      const walls = rows.reduce((a, r) => a + r.walls, 0);
      const spins = rows.reduce((a, r) => a + r.spins, 0);
      const off = rows.reduce((a, r) => a + r.off, 0) / rows.length;
      const pace = rows.filter((r) => r.laps.length >= 2).map((r) => r.laps[1]! / r.plan);
      const avg = pace.length ? pace.reduce((a, b) => a + b, 0) / pace.length : 0;
      console.log(`${level}: finished ${done}/${rows.length} walls ${walls} spins ${spins} off-track ${off.toFixed(1)}s pace ${(avg * 100).toFixed(0)}% of plan`);
      if (level === "standard" || level === "full") {
        expect(done).toBe(rows.length);
        expect(walls).toBeLessThanOrEqual(2);
      }
    }, 240000);
  }
});
