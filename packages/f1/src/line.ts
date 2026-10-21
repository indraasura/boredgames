import { CAR, COMPOUNDS, wetGrip, type Compound, type Tuned } from "./car";
import { G } from "./physics";
import { catmullRom, type Track } from "./track";

/** A racing line and the speed a car can carry along it. Used by the computer drivers and for reference lap times. */
export interface Plan {
  n: number;
  ds: number;
  /** Lateral offset from the centre line, metres, positive to the left. */
  off: Float64Array;
  x: Float64Array;
  y: Float64Array;
  /** Signed curvature of the line. */
  kappa: Float64Array;
  /** Speed to carry at each sample, m/s. */
  v: Float64Array;
  /** Time for a flying lap at this speed, seconds. */
  lapTime: number;
}

export interface PlanParams {
  mass: number;
  mu: number;
  clA: number;
  cdA: number;
  power: number;
  rho: number;
  /** Fraction of the theoretical limit to plan for. */
  margin?: number;
}

/** The line that hugs the inside: every point is pulled towards the midpoint of its neighbours, within the track edges. */
export function racingOffsets(track: Track, margin = 1.6): Float64Array {
  const n = track.n;
  const off = new Float64Array(n);
  const limit = track.width / 2 - margin;
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const update = () => {
    for (let i = 0; i < n; i++) {
      px[i] = track.x[i]! + track.nx[i]! * off[i]!;
      py[i] = track.y[i]! + track.ny[i]! * off[i]!;
    }
  };
  update();
  for (let pass = 0; pass < 900; pass++) {
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n;
      const b = (i + 1) % n;
      const mx = (px[a]! + px[b]!) / 2;
      const my = (py[a]! + py[b]!) / 2;
      const want = (mx - track.x[i]!) * track.nx[i]! + (my - track.y[i]!) * track.ny[i]!;
      let o = off[i]! + 1.7 * (want - off[i]!);
      if (o > limit) o = limit;
      else if (o < -limit) o = -limit;
      off[i] = o;
      px[i] = track.x[i]! + track.nx[i]! * o;
      py[i] = track.y[i]! + track.ny[i]! * o;
    }
  }
  // Round off the apexes a little: a smoothed line is easier to drive at speed.
  const tmp = new Float64Array(n);
  for (let p = 0; p < 12; p++) {
    for (let i = 0; i < n; i++) tmp[i] = (off[(i + n - 1) % n]! + 2 * off[i]! + off[(i + 1) % n]!) / 4;
    off.set(tmp);
  }
  return off;
}

export function planLine(track: Track, params: PlanParams, off = racingOffsets(track)): Plan {
  const n = track.n;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = track.x[i]! + track.nx[i]! * off[i]!;
    y[i] = track.y[i]! + track.ny[i]! * off[i]!;
  }
  // Curvature of the line from heading change over +/- 3 samples.
  const heading = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i + 1) % n;
    heading[i] = Math.atan2(y[a]! - y[i]!, x[a]! - x[i]!);
  }
  const kappa = new Float64Array(n);
  const seg = new Float64Array(n);
  for (let i = 0; i < n; i++) seg[i] = Math.hypot(x[(i + 1) % n]! - x[i]!, y[(i + 1) % n]! - y[i]!);
  const W = 3;
  for (let i = 0; i < n; i++) {
    let d = heading[(i + W) % n]! - heading[(i + n - W) % n]!;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    let len = 0;
    for (let k = -W; k < W; k++) len += seg[(i + k + n) % n]!;
    kappa[i] = d / len;
  }

  const { mass: m, mu, clA, cdA, power, rho } = params;
  const margin = params.margin ?? 1;
  const muEff = mu * margin;
  const vMaxCap = 105;
  // Tyres grip a little less per newton the harder they are pressed, as in the physics.
  const loadF = (v: number) => Math.min(1.3, Math.max(0.6, 1 - 0.16 * ((m * G + 0.5 * rho * v * v * clA) / 4 / 4500 - 1)));
  const ayMax = (v: number) => muEff * loadF(v) * (G + (0.5 * rho * v * v * clA) / m);
  const vCorner = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.abs(kappa[i]!);
    if (k < 1e-5) {
      vCorner[i] = vMaxCap;
      continue;
    }
    let v = Math.sqrt((muEff * G) / k);
    for (let it = 0; it < 14; it++) v = 0.5 * v + 0.5 * Math.min(vMaxCap, Math.sqrt(ayMax(v) / k));
    vCorner[i] = Math.min(vMaxCap, v);
  }
  const resist = (v: number) => (0.5 * rho * v * v * cdA + 0.011 * (m * G + 0.5 * rho * v * v * clA)) / m;
  const accel = (v: number, k: number) => {
    const ay = v * v * Math.abs(k);
    const lim = ayMax(v);
    const circle = Math.sqrt(Math.max(0, 1 - Math.min(1, (ay / lim) ** 2)));
    const pw = (power * CAR.drivetrainEff * (CAR.icePower * 0.96 + CAR.ersPower * Math.min(1, Math.max(0, (96 - v) / 16)) * 0.8)) / (m * Math.max(v, 8));
    const trac = muEff * loadF(v) * (0.545 * G + (0.5 * rho * v * v * clA * 0.55) / m) * circle * 1.12;
    return Math.min(pw, trac) - resist(v);
  };
  const decel = (v: number, k: number) => {
    const ay = v * v * Math.abs(k);
    const lim = ayMax(v);
    const circle = Math.sqrt(Math.max(0, 1 - Math.min(1, (ay / lim) ** 2)));
    return 0.7 * muEff * loadF(v) * (G + (0.5 * rho * v * v * clA) / m) * circle * 0.98 + resist(v);
  };

  const v = Float64Array.from(vCorner);
  for (let lap = 0; lap < 3; lap++) {
    for (let step = 0; step < 2 * n; step++) {
      const i = step % n;
      const j = (i + 1) % n;
      const a = accel(v[i]!, kappa[i]!);
      const vn = Math.sqrt(Math.max(1, v[i]! * v[i]! + 2 * a * seg[i]!));
      if (vn < v[j]!) v[j] = vn;
    }
    for (let step = 0; step < 2 * n; step++) {
      const j = (2 * n - step) % n;
      const i = (j + n - 1) % n;
      const a = decel(v[j]!, kappa[j]!);
      const vp = Math.sqrt(v[j]! * v[j]! + 2 * a * seg[i]!);
      if (vp < v[i]!) v[i] = vp;
    }
  }
  let time = 0;
  for (let i = 0; i < n; i++) time += seg[i]! / (0.5 * (v[i]! + v[(i + 1) % n]!));
  return { n, ds: track.ds, off, x, y, kappa, v, lapTime: time };
}

/** What share of the tyres’ grip the computer drivers plan to use. */
const PLAN_GRIP = 0.83;

/** Plan for a team's car on a given tyre and weather, mid-race fuel. */
export function planFor(track: Track, tuned: Tuned, compound: Compound, wetness: number, rho: number, fuel = 30, margin = 0.93, off?: Float64Array): Plan {
  const comp = COMPOUNDS[compound];
  const mu = comp.mu * wetGrip(comp, wetness) * PLAN_GRIP;
  return planLine(track, { mass: tuned.mass0 + fuel, mu, clA: tuned.clAf + tuned.clAr, cdA: tuned.cdA, power: tuned.power, rho, margin }, off);
}

/** Linear interpolation on a closed per-sample array. */
export function sampleAt(arr: Float64Array, ds: number, s: number, length: number): number {
  const n = arr.length;
  const f = (((s % length) + length) % length) / ds;
  const i = Math.floor(f) % n;
  const u = f - Math.floor(f);
  // Smooth between samples: a linear blend has a corner at every sample, which a driver feels as a twitch.
  return catmullRom(arr[(i + n - 1) % n]!, arr[i]!, arr[(i + 1) % n]!, arr[(i + 2) % n]!, u);
}
