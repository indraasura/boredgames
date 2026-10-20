import { describe, expect, it } from "vitest";
import { DEFAULT_SETUP, TEAMS, tune } from "../src/car";
import { DT, newCar, stepCar, type Env, type Input } from "../src/physics";
import { airDensity } from "../src/weather";

const dry: Env = { rho: airDensity(100, 25), wetness: 0, trackTemp: 40 };
const team = TEAMS[0]!;
const tuned = tune(team, DEFAULT_SETUP);
const flat = [1, 1, 1, 1];

function run(seconds: number, input: (t: number, c: ReturnType<typeof newCar>) => Partial<Input>, start = 0, env = dry, fuel = 40) {
  const c = newCar(0, 0, 0, "medium", fuel, 95);
  c.u = start;
  c.gear = start > 0 ? 3 : 1;
  const log: { t: number; c: typeof c }[] = [];
  for (let t = 0; t < seconds; t += DT) {
    const inp: Input = { throttle: 0, brake: 0, steer: 0, drs: false, steerAssist: false, tractionControl: true, ...input(t, c) };
    stepCar(c, tuned, inp, env, flat, 0, DT);
    log.push({ t, c: { ...c, temp: [...c.temp], wear: [...c.wear], alpha: [...c.alpha] } });
  }
  return { c, log };
}

describe("car physics at real-car magnitudes", () => {
  it("accelerates 0-100 km/h in a believable time", () => {
    const { log } = run(8, () => ({ throttle: 1 }));
    const at100 = log.find((l) => l.c.u * 3.6 >= 100);
    const at200 = log.find((l) => l.c.u * 3.6 >= 200);
    console.log("0-100:", at100?.t.toFixed(2), "0-200:", at200?.t.toFixed(2));
    expect(at100).toBeDefined();
    expect(at100!.t).toBeGreaterThan(1.8);
    expect(at100!.t).toBeLessThan(3.4);
    expect(at200!.t).toBeGreaterThan(3.8);
    expect(at200!.t).toBeLessThan(6.8);
  });

  it("has a top speed around 330-350 km/h", () => {
    const { c } = run(70, () => ({ throttle: 1 }));
    console.log("top speed km/h:", (c.u * 3.6).toFixed(1), "gear", c.gear);
    expect(c.u * 3.6).toBeGreaterThan(315);
    expect(c.u * 3.6).toBeLessThan(375);
  });

  it("brakes from 300 km/h to a stop in a believable distance and time", () => {
    const { log } = run(8, () => ({ brake: 1 }), 300 / 3.6);
    const stop = log.find((l) => l.c.u < 0.5);
    console.log("300->0 distance m:", stop?.c.x.toFixed(0), "time s:", stop?.t.toFixed(2));
    expect(stop).toBeDefined();
    expect(stop!.c.x).toBeGreaterThan(88);
    expect(stop!.c.x).toBeLessThan(260);
    const slow = run(5, () => ({ brake: 1 }), 100 / 3.6);
    const s2 = slow.log.find((l) => l.c.u < 0.5);
    console.log("100->0 distance m:", s2?.c.x.toFixed(1));
    expect(s2!.c.x).toBeGreaterThan(14);
    expect(s2!.c.x).toBeLessThan(40);
  });

  it("holds high lateral g at speed thanks to downforce", () => {
    // Circle at constant speed with the steering that holds a radius; read the peak lateral acceleration.
    let peak = 0;
    for (const kmh of [100, 180, 250]) {
      const { log } = run(6, (t, c) => ({ steer: Math.min(1, t * 0.5) * 0.35, throttle: c.u * 3.6 < kmh ? 0.7 : 0.2 }), kmh / 3.6);
      const g = Math.max(...log.map((l) => Math.abs(l.c.ay) / 9.81));
      console.log(kmh, "km/h peak lateral g:", g.toFixed(2));
      peak = Math.max(peak, g);
    }
    expect(peak).toBeGreaterThan(3.2);
    expect(peak).toBeLessThan(7);
  });

  it("grip falls on a wet track with slicks and recovers with the right tyre", () => {
    const wet: Env = { ...dry, wetness: 0.7 };
    const lat = (compound: "medium" | "wet", env: Env) => {
      const c = newCar(0, 0, 0, compound, 40, 80);
      c.u = 40;
      c.gear = 3;
      let g = 0;
      for (let t = 0; t < 4; t += DT) {
        stepCar(c, tuned, { throttle: c.u < 40 ? 0.6 : 0.1, brake: 0, steer: Math.min(1, t) * 0.4, drs: false, steerAssist: false, tractionControl: true }, env, flat, 0, DT);
        g = Math.max(g, Math.abs(c.ay) / 9.81);
      }
      return g;
    };
    const slickDry = lat("medium", dry);
    const slickWet = lat("medium", wet);
    const wetTyreWet = lat("wet", wet);
    console.log("lat g: slick dry", slickDry.toFixed(2), "slick wet", slickWet.toFixed(2), "wet tyre wet", wetTyreWet.toFixed(2));
    expect(slickWet).toBeLessThan(slickDry * 0.65);
    expect(wetTyreWet).toBeGreaterThan(slickWet);
  });
});
