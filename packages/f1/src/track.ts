import { CIRCUIT_DATA, type CircuitData } from "./circuits.data";

/** Distance between centre-line samples, metres. */
export const DS = 4;

/** Passes of 1-2-1 smoothing on the 4 m samples: removes the wobble of hand-placed corner points. */
const SMOOTHING = 36;

export interface DrsZone {
  start: number;
  end: number;
}

export interface Track {
  id: string;
  name: string;
  short: string;
  location: string;
  country: string;
  flag: string;
  altitude: number;
  firstGp: number;
  /** Lap length, metres (matches the official figure). */
  length: number;
  /** Number of samples. Sample i sits at s = i * ds. */
  n: number;
  ds: number;
  x: Float64Array;
  y: Float64Array;
  /** Direction of travel, radians (0 = +x, counter-clockwise). */
  heading: Float64Array;
  /** Signed curvature, 1/m, positive for left turns. */
  kappa: Float64Array;
  /** Left-hand unit normal. */
  nx: Float64Array;
  ny: Float64Array;
  /** Full road width, metres. */
  width: number;
  drs: DrsZone[];
  /** The most open part of the lap: pit lane, grid and start line sit on its main straight. */
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
}

const WIDTHS: Record<string, number> = {
  "mc-1929": 10.5,
  "sg-2008": 11.5,
  "az-2016": 11.5,
  "sa-2021": 12,
  "us-2023": 14,
  "us-2022": 13,
};

function catmull(p0: number, p1: number, p2: number, p3: number, t: number, a0: number, a1: number, a2: number): number {
  // Non-uniform Catmull-Rom (Barry-Goldman) with knot spacing a0, a1, a2 between points.
  const t0 = 0;
  const t1 = t0 + a0;
  const t2 = t1 + a1;
  const t3 = t2 + a2;
  const u = t1 + (t2 - t1) * t;
  const A1 = ((t1 - u) / (t1 - t0)) * p0 + ((u - t0) / (t1 - t0)) * p1;
  const A2 = ((t2 - u) / (t2 - t1)) * p1 + ((u - t1) / (t2 - t1)) * p2;
  const A3 = ((t3 - u) / (t3 - t2)) * p2 + ((u - t2) / (t3 - t2)) * p3;
  const B1 = ((t2 - u) / (t2 - t0)) * A1 + ((u - t0) / (t2 - t0)) * A2;
  const B2 = ((t3 - u) / (t3 - t1)) * A2 + ((u - t1) / (t3 - t1)) * A3;
  return ((t2 - u) / (t2 - t1)) * B1 + ((u - t1) / (t2 - t1)) * B2;
}

/** Closed centripetal Catmull-Rom through the points, sampled densely. */
function spline(pts: number[]): { x: number[]; y: number[] } {
  const n = pts.length / 2;
  const X = (i: number) => pts[((i + n) % n) * 2]!;
  const Y = (i: number) => pts[((i + n) % n) * 2 + 1]!;
  const outX: number[] = [];
  const outY: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = (a: number, b: number) => Math.max(1e-3, Math.pow(Math.hypot(X(b) - X(a), Y(b) - Y(a)), 0.5));
    const a0 = d(i - 1, i);
    const a1 = d(i, i + 1);
    const a2 = d(i + 1, i + 2);
    const segLen = Math.hypot(X(i + 1) - X(i), Y(i + 1) - Y(i));
    const steps = Math.max(2, Math.ceil(segLen / 1.5));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      outX.push(catmull(X(i - 1), X(i), X(i + 1), X(i + 2), t, a0, a1, a2));
      outY.push(catmull(Y(i - 1), Y(i), Y(i + 1), Y(i + 2), t, a0, a1, a2));
    }
  }
  return { x: outX, y: outY };
}

/** Resample a closed polyline to exactly n equally spaced points. */
function resample(px: number[], py: number[], n: number): { x: Float64Array; y: Float64Array; length: number } {
  const m = px.length;
  const cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) cum[i + 1] = cum[i]! + Math.hypot(px[(i + 1) % m]! - px[i]!, py[(i + 1) % m]! - py[i]!);
  const length = cum[m]!;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = (i / n) * length;
    while (cum[j + 1]! < target) j++;
    const seg = cum[j + 1]! - cum[j]!;
    const f = seg > 0 ? (target - cum[j]!) / seg : 0;
    x[i] = px[j]! + (px[(j + 1) % m]! - px[j]!) * f;
    y[i] = py[j]! + (py[(j + 1) % m]! - py[j]!) * f;
  }
  return { x, y, length };
}

function smooth(v: Float64Array, passes: number) {
  const n = v.length;
  const tmp = new Float64Array(n);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) tmp[i] = (v[(i + n - 1) % n]! + 2 * v[i]! + v[(i + 1) % n]!) / 4;
    v.set(tmp);
  }
}

export function buildTrack(data: CircuitData): Track {
  const sp = spline(data.pts);
  const rough = resample(sp.x, sp.y, Math.round(data.length / DS));
  const n = rough.x.length;
  // Hand-picked corner points make small kinks; a light smoothing turns them into proper arcs.
  smooth(rough.x, SMOOTHING);
  smooth(rough.y, SMOOTHING);
  // Scale so the lap is exactly the official length.
  let len = 0;
  for (let i = 0; i < n; i++) len += Math.hypot(rough.x[(i + 1) % n]! - rough.x[i]!, rough.y[(i + 1) % n]! - rough.y[i]!);
  const k = data.length / len;
  const x = rough.x.map((v) => v * k);
  const y = rough.y.map((v) => v * k);
  const ds = data.length / n;

  const heading = new Float64Array(n);
  const nx = new Float64Array(n);
  const ny = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i + 1) % n;
    const b = (i + n - 1) % n;
    const h = Math.atan2(y[a]! - y[b]!, x[a]! - x[b]!);
    heading[i] = h;
    nx[i] = -Math.sin(h);
    ny[i] = Math.cos(h);
  }
  const kappa = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let d = heading[(i + 1) % n]! - heading[(i + n - 1) % n]!;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    kappa[i] = d / (2 * ds);
  }
  smooth(kappa, 3);

  // DRS zones: the longest nearly straight stretches.
  const straight = Array.from(kappa, (c) => Math.abs(c) < 1 / 700);
  const zones: DrsZone[] = [];
  let i0 = straight.findIndex((v) => !v);
  if (i0 < 0) i0 = 0;
  let run = -1;
  for (let step = 0; step <= n; step++) {
    const i = (i0 + step) % n;
    const on = step < n && straight[i];
    if (on && run < 0) run = step;
    if (!on && run >= 0) {
      const lenM = (step - run) * ds;
      if (lenM >= 320) zones.push({ start: ((i0 + run) % n) * ds, end: ((i0 + step) % n) * ds });
      run = -1;
    }
  }
  zones.sort((a, b) => ((b.end - b.start + data.length) % data.length) - ((a.end - a.start + data.length) % data.length));

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, x[i]!);
    maxX = Math.max(maxX, x[i]!);
    minY = Math.min(minY, y[i]!);
    maxY = Math.max(maxY, y[i]!);
  }

  return {
    id: data.id,
    name: data.name,
    short: data.short,
    location: data.location,
    country: data.country,
    flag: data.flag,
    altitude: data.altitude,
    firstGp: data.firstGp,
    length: data.length,
    n,
    ds,
    x,
    y,
    heading,
    kappa,
    nx,
    ny,
    width: WIDTHS[data.id] ?? 13.5,
    drs: zones.slice(0, data.length > 5800 ? 3 : 2).sort((a, b) => a.start - b.start),
    bbox: { minX, maxX, minY, maxY },
  };
}

/** Passes of 1-2-1 smoothing on the 4 m samples: removes the wobble of hand-placed corner points. */


const cache = new Map<string, Track>();

export const CIRCUITS: readonly { id: string; name: string; short: string; country: string; flag: string; length: number }[] = CIRCUIT_DATA.map(
  (c) => ({ id: c.id, name: c.name, short: c.short, country: c.country, flag: c.flag, length: c.length }),
);

export const DEFAULT_CIRCUIT = "gb-1948";

export function getTrack(id: string): Track {
  let t = cache.get(id);
  if (!t) {
    const data = CIRCUIT_DATA.find((c) => c.id === id) ?? CIRCUIT_DATA.find((c) => c.id === DEFAULT_CIRCUIT)!;
    t = buildTrack(data);
    cache.set(id, t);
  }
  return t;
}

export interface Nearest {
  /** Index of the sample just behind the point. */
  i: number;
  /** Distance along the lap, metres, 0..length. */
  s: number;
  /** Signed offset from the centre line, metres, positive to the left. */
  d: number;
}

/** Closest point on the centre line. `hint` is a previous sample index: pass it to search locally. */
export function nearest(t: Track, px: number, py: number, hint = -1): Nearest {
  const n = t.n;
  let best = -1;
  let bestD = Infinity;
  const check = (i: number) => {
    const dx = px - t.x[i]!;
    const dy = py - t.y[i]!;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  };
  if (hint >= 0) {
    const span = 40;
    for (let o = -span; o <= span; o++) check((hint + o + n) % n);
    // Fall back to a full search when the local result is far from the road.
    if (bestD > 80 * 80) {
      for (let i = 0; i < n; i++) check(i);
    }
  } else {
    for (let i = 0; i < n; i++) check(i);
  }
  // Refine on the two adjoining segments.
  const refine = (i: number): { f: number; d2: number; seg: number } => {
    const j = (i + 1) % n;
    const sx = t.x[j]! - t.x[i]!;
    const sy = t.y[j]! - t.y[i]!;
    const l2 = sx * sx + sy * sy;
    const f = Math.max(0, Math.min(1, ((px - t.x[i]!) * sx + (py - t.y[i]!) * sy) / l2));
    const qx = t.x[i]! + sx * f;
    const qy = t.y[i]! + sy * f;
    return { f, d2: (px - qx) ** 2 + (py - qy) ** 2, seg: i };
  };
  const a = refine(best);
  const b = refine((best + n - 1) % n);
  const r = b.d2 < a.d2 ? b : a;
  const i = r.seg;
  const j = (i + 1) % n;
  const qx = t.x[i]! + (t.x[j]! - t.x[i]!) * r.f;
  const qy = t.y[i]! + (t.y[j]! - t.y[i]!) * r.f;
  const nxx = t.nx[i]! + (t.nx[j]! - t.nx[i]!) * r.f;
  const nyy = t.ny[i]! + (t.ny[j]! - t.ny[i]!) * r.f;
  const d = (px - qx) * nxx + (py - qy) * nyy;
  return { i, s: (i + r.f) * t.ds, d };
}

/** Wrap a distance into 0..length. */
export const wrapS = (t: Track, s: number) => ((s % t.length) + t.length) % t.length;

/** Signed shortest distance from a to b along the lap (positive if b is ahead of a). */
export function gap(t: Track, a: number, b: number): number {
  let d = b - a;
  if (d > t.length / 2) d -= t.length;
  if (d < -t.length / 2) d += t.length;
  return d;
}

/** Uniform Catmull-Rom: passes through p1 at u=0 and p2 at u=1 with a continuous slope. */
export function catmullRom(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (3 * p1 - p0 - 3 * p2 + p3) * u3);
}

export function trackAt(t: Track, s: number): { x: number; y: number; heading: number; kappa: number; nx: number; ny: number } {
  const f = wrapS(t, s) / t.ds;
  const i = Math.floor(f) % t.n;
  const j = (i + 1) % t.n;
  const u = f - Math.floor(f);
  let dh = t.heading[j]! - t.heading[i]!;
  while (dh > Math.PI) dh -= 2 * Math.PI;
  while (dh < -Math.PI) dh += 2 * Math.PI;
  const h = t.heading[i]! + dh * u;
  // Catmull-Rom between samples, so a point moving along the lap has no kinks every 4 m.
  const a = (i + t.n - 1) % t.n;
  const b = (j + 1) % t.n;
  return {
    x: catmullRom(t.x[a]!, t.x[i]!, t.x[j]!, t.x[b]!, u),
    y: catmullRom(t.y[a]!, t.y[i]!, t.y[j]!, t.y[b]!, u),
    heading: h,
    kappa: t.kappa[i]! + (t.kappa[j]! - t.kappa[i]!) * u,
    nx: -Math.sin(h),
    ny: Math.cos(h),
  };
}
