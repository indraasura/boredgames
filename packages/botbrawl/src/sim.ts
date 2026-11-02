import { CELL, GRID, PARTS, check, type Design, type PartKind } from "./parts";

/**
 * A small 2D rigid-body fight. Each robot is a set of circular parts. Wheels push, parts collide, weapons
 * damage the parts they touch, and parts that break (or lose their link to the core) fall off.
 * Plain data and plain functions, so a host can run it and a guest can render snapshots of it.
 *
 * Coordinates: a robot at heading th faces (cos th, sin th); its right-hand side is (-sin th, cos th).
 * Turning right increases th.
 */

export const ARENA = 9; // the cage is a square from -ARENA to ARENA
export const PART_R = CELL * 0.5;
export const TIME_LIMIT = 90;
const MAX_WHEEL = 1.2;
const WHEEL_FORCE = 30;
const BOOST_FORCE = 70;

export interface PartState {
  kind: PartKind;
  /** Position in cells from the grid's middle: lx to the right, ly to the front. */
  lx: number;
  ly: number;
  dir: number;
  hp: number;
  max: number;
  mass: number;
  alive: boolean;
  /** Seconds until this part may act or hit again. */
  cd: number;
}

export interface Input {
  throttle: number; // -1..1
  turn: number; // -1..1, positive turns right
  fire: boolean;
  boost: boolean;
}
export const noInput = (): Input => ({ throttle: 0, turn: 0, fire: false, boost: false });

export interface Robot {
  id: number;
  name: string;
  parts: PartState[];
  x: number;
  y: number;
  th: number;
  vx: number;
  vy: number;
  w: number;
  mass: number;
  inertia: number;
  /** The centre of mass, in cells, in the same frame as the parts. */
  comx: number;
  comy: number;
  input: Input;
  alive: boolean;
  boostT: number;
  boostCd: number;
  immobile: number;
  impactCd: number;
  maxHp: number;
}

export interface Hazard {
  x: number;
  y: number;
  phase: number;
}

export type SimEvent =
  | { type: "hit"; x: number; y: number; amount: number; big: boolean }
  | { type: "break"; robot: number; part: number; x: number; y: number }
  | { type: "swing"; robot: number; part: number }
  | { type: "boost"; robot: number }
  | { type: "wall"; x: number; y: number; power: number };

export interface Outcome {
  /** 0 or 1, or -1 for a draw. */
  winner: number;
  reason: "ko" | "immobilized" | "judges" | "draw";
}

export interface Sim {
  robots: Robot[];
  hazards: Hazard[];
  t: number;
  over: Outcome | null;
  events: SimEvent[];
}

// ------------------------------------------------------------------ helpers

const fwd = (th: number) => [Math.cos(th), Math.sin(th)] as const;
const rgt = (th: number) => [-Math.sin(th), Math.cos(th)] as const;

/** A part's world position. */
export function partWorld(r: Robot, p: PartState, out: { x: number; y: number } = { x: 0, y: 0 }) {
  const u = (p.ly - r.comy) * CELL;
  const v = (p.lx - r.comx) * CELL;
  const [fx, fy] = fwd(r.th);
  const [rx, ry] = rgt(r.th);
  out.x = r.x + u * fx + v * rx;
  out.y = r.y + u * fy + v * ry;
  return out;
}

/** The world direction a part with direction `dir` points. */
export function dirWorld(r: Robot, dir: number): [number, number] {
  const [fx, fy] = fwd(r.th);
  const [rx, ry] = rgt(r.th);
  switch (dir & 3) {
    case 0:
      return [fx, fy];
    case 1:
      return [rx, ry];
    case 2:
      return [-fx, -fy];
    default:
      return [-rx, -ry];
  }
}

/** Recompute mass, centre of mass and spin inertia from the parts still attached. `keepPlace` moves the robot so nothing jumps. */
export function recompute(r: Robot, keepPlace: boolean) {
  let m = 0;
  let cx = 0;
  let cy = 0;
  for (const p of r.parts) {
    if (!p.alive) continue;
    m += p.mass;
    cx += p.mass * p.lx;
    cy += p.mass * p.ly;
  }
  if (!m) {
    r.mass = 1;
    r.inertia = 1;
    return;
  }
  cx /= m;
  cy /= m;
  if (keepPlace) {
    const [fx, fy] = fwd(r.th);
    const [rx, ry] = rgt(r.th);
    const du = (cy - r.comy) * CELL;
    const dv = (cx - r.comx) * CELL;
    r.x += du * fx + dv * rx;
    r.y += du * fy + dv * ry;
  }
  r.comx = cx;
  r.comy = cy;
  r.mass = m;
  let inertia = 0;
  for (const p of r.parts) if (p.alive) inertia += p.mass * (((p.lx - cx) * CELL) ** 2 + ((p.ly - cy) * CELL) ** 2 + (CELL * CELL) / 6);
  r.inertia = inertia;
}

function makeRobot(id: number, design: Design, x: number, y: number, th: number): Robot {
  const checked = check(design);
  const half = (GRID - 1) / 2;
  const parts: PartState[] = checked.kept.map((p) => ({
    kind: p.kind,
    lx: p.c - half,
    ly: half - p.r,
    dir: p.dir,
    hp: PARTS[p.kind].hp,
    max: PARTS[p.kind].hp,
    mass: PARTS[p.kind].mass,
    alive: true,
    cd: 0,
  }));
  const r: Robot = {
    id,
    name: design.name,
    parts,
    x,
    y,
    th,
    vx: 0,
    vy: 0,
    w: 0,
    mass: 1,
    inertia: 1,
    comx: 0,
    comy: 0,
    input: noInput(),
    alive: true,
    boostT: 0,
    boostCd: 0,
    immobile: 0,
    impactCd: 0,
    maxHp: parts.reduce((n, p) => n + p.max, 0),
  };
  recompute(r, false);
  return r;
}

export function createSim(designs: [Design, Design]): Sim {
  const d = ARENA - 3.5;
  return {
    robots: [makeRobot(0, designs[0], -d, 0, 0), makeRobot(1, designs[1], d, 0, Math.PI)],
    hazards: [
      { x: -6.4, y: -6.4, phase: 0 },
      { x: 6.4, y: 6.4, phase: 1.5 },
      { x: 6.4, y: -6.4, phase: 3 },
      { x: -6.4, y: 6.4, phase: 4.5 },
    ],
    t: 0,
    over: null,
    events: [],
  };
}

export const hpOf = (r: Robot) => r.parts.reduce((n, p) => n + (p.alive ? p.hp : 0), 0);
export const hpFrac = (r: Robot) => (r.maxHp ? hpOf(r) / r.maxHp : 0);
export const wheelsLeft = (r: Robot) => r.parts.filter((p) => p.alive && p.kind === "wheel").length;

/** 0 = quiet, 1 = warning glow, 2 = flames. */
export function hazardState(h: Hazard, t: number): 0 | 1 | 2 {
  const c = (t + h.phase) % 6;
  return c < 3.6 ? 0 : c < 4.8 ? 1 : 2;
}

// ------------------------------------------------------------------- damage

function damage(sim: Sim, r: Robot, partIndex: number, amount: number, big = false) {
  const p = r.parts[partIndex]!;
  if (!p.alive || amount <= 0) return;
  p.hp -= amount;
  const pos = partWorld(r, p);
  sim.events.push({ type: "hit", x: pos.x, y: pos.y, amount, big });
  if (p.hp <= 0) breakPart(sim, r, partIndex);
}

function breakPart(sim: Sim, r: Robot, partIndex: number) {
  const p = r.parts[partIndex]!;
  if (!p.alive) return;
  p.alive = false;
  p.hp = 0;
  const pos = partWorld(r, p);
  sim.events.push({ type: "break", robot: r.id, part: partIndex, x: pos.x, y: pos.y });
  detach(sim, r);
  recompute(r, true);
}

/** Anything no longer linked to the core falls off. */
function detach(sim: Sim, r: Robot) {
  const core = r.parts.findIndex((p) => p.kind === "core" && p.alive);
  if (core < 0) {
    if (r.alive) r.alive = false;
    return;
  }
  const at = new Map<string, number>();
  r.parts.forEach((p, i) => p.alive && at.set(`${p.lx},${p.ly}`, i));
  const seen = new Set<number>([core]);
  const stack = [core];
  while (stack.length) {
    const p = r.parts[stack.pop()!]!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = at.get(`${p.lx + dx},${p.ly + dy}`);
      if (n !== undefined && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  r.parts.forEach((p, i) => {
    if (p.alive && !seen.has(i)) {
      const pos = partWorld(r, p);
      p.alive = false;
      p.hp = 0;
      sim.events.push({ type: "break", robot: r.id, part: i, x: pos.x, y: pos.y });
    }
  });
}

// ---------------------------------------------------------------- impulses

/** Impulse (jx, jy) applied at world point (px, py). */
function impulse(r: Robot, jx: number, jy: number, px: number, py: number) {
  r.vx += jx / r.mass;
  r.vy += jy / r.mass;
  const rx = px - r.x;
  const ry = py - r.y;
  r.w += (rx * jy - ry * jx) / r.inertia;
}

const pointVel = (r: Robot, px: number, py: number): [number, number] => [r.vx - r.w * (py - r.y), r.vy + r.w * (px - r.x)];

// ------------------------------------------------------------------- step

const E = 0.35;

export function step(sim: Sim, dt: number) {
  if (sim.over) return;
  sim.t += dt;
  const { robots } = sim;

  for (const r of robots) {
    if (!r.alive) continue;
    r.impactCd = Math.max(0, r.impactCd - dt);
    r.boostT = Math.max(0, r.boostT - dt);
    r.boostCd = Math.max(0, r.boostCd - dt);
    for (const p of r.parts) p.cd = Math.max(0, p.cd - dt);
    drive(sim, r, dt);
    actions(sim, r, dt);

    // Friction with the floor, and wheels that grip sideways.
    const wheels = wheelsLeft(r);
    const [fx, fy] = fwd(r.th);
    const [rx, ry] = rgt(r.th);
    let vf = r.vx * fx + r.vy * fy;
    let vr = r.vx * rx + r.vy * ry;
    const grip = Math.min(1, wheels / 2);
    vr *= Math.exp(-(1.2 + 9 * grip) * dt);
    vf *= Math.exp(-(wheels ? 0.5 : 1.1) * dt);
    r.vx = vf * fx + vr * rx;
    r.vy = vf * fy + vr * ry;
    r.w *= Math.exp(-(wheels ? 2.6 : 1.4) * dt);
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.th += r.w * dt;
  }

  for (const r of robots) if (r.alive) walls(sim, r);
  const [a, b] = robots as [Robot, Robot];
  if (a.alive && b.alive) collide(sim, a, b);
  hazards(sim, dt);
  judge(sim, dt);
}

function drive(sim: Sim, r: Robot, dt: number) {
  void sim;
  void dt;
  const { throttle, turn } = r.input;
  const [fx, fy] = fwd(r.th);
  for (const p of r.parts) {
    if (!p.alive || p.kind !== "wheel") continue;
    // Tank steering: the wheels on the outside of a turn push harder.
    const side = p.lx - r.comx > 0.01 ? 1 : p.lx - r.comx < -0.01 ? -1 : 0;
    const f = Math.max(-MAX_WHEEL, Math.min(MAX_WHEEL, throttle - side * turn)) * WHEEL_FORCE;
    const pos = partWorld(r, p);
    impulse(r, fx * f * dt, fy * f * dt, pos.x, pos.y);
  }
  if (r.boostT > 0) {
    for (const p of r.parts) {
      if (!p.alive || p.kind !== "booster") continue;
      const [dx, dy] = dirWorld(r, p.dir);
      const pos = partWorld(r, p);
      impulse(r, -dx * BOOST_FORCE * dt, -dy * BOOST_FORCE * dt, pos.x, pos.y);
    }
  }
}

function actions(sim: Sim, r: Robot, dt: number) {
  void dt;
  const enemy = sim.robots[1 - r.id]!;
  if (r.input.boost && r.boostCd <= 0 && r.parts.some((p) => p.alive && p.kind === "booster")) {
    r.boostT = 0.7;
    r.boostCd = 3.5;
    sim.events.push({ type: "boost", robot: r.id });
  }
  if (!r.input.fire) return;
  r.parts.forEach((p, i) => {
    if (!p.alive || p.cd > 0 || (p.kind !== "hammer" && p.kind !== "flipper")) return;
    const hammer = p.kind === "hammer";
    p.cd = hammer ? 1.5 : 2.2;
    sim.events.push({ type: "swing", robot: r.id, part: i });
    const [dx, dy] = dirWorld(r, p.dir);
    const pos = partWorld(r, p);
    const cx = pos.x + dx * CELL * 1.1;
    const cy = pos.y + dy * CELL * 1.1;
    let hit = false;
    enemy.parts.forEach((q, qi) => {
      if (!q.alive || !enemy.alive) return;
      const qp = partWorld(enemy, q);
      if (Math.hypot(qp.x - cx, qp.y - cy) < CELL * 1.15) {
        hit = true;
        damage(sim, enemy, qi, hammer ? 26 : 5, hammer);
      }
    });
    if (hit && enemy.alive) {
      const power = hammer ? 55 : 120;
      impulse(enemy, dx * power, dy * power, cx, cy);
      impulse(r, -dx * power * 0.25, -dy * power * 0.25, pos.x, pos.y);
    }
  });
}

function walls(sim: Sim, r: Robot) {
  const lim = ARENA - PART_R;
  for (const p of r.parts) {
    if (!p.alive) continue;
    const pos = partWorld(r, p);
    for (const [nx, ny, pen] of [
      [-1, 0, pos.x - lim],
      [1, 0, -lim - pos.x],
      [0, -1, pos.y - lim],
      [0, 1, -lim - pos.y],
    ] as const) {
      if (pen <= 0) continue;
      r.x += nx * pen;
      r.y += ny * pen;
      const [vx, vy] = pointVel(r, pos.x, pos.y);
      const vn = vx * nx + vy * ny;
      if (vn >= 0) continue;
      const rx = pos.x - r.x;
      const ry = pos.y - r.y;
      const rn = rx * ny - ry * nx;
      const j = (-(1 + 0.3) * vn) / (1 / r.mass + (rn * rn) / r.inertia);
      impulse(r, nx * j, ny * j, pos.x, pos.y);
      if (-vn > 2.5) sim.events.push({ type: "wall", x: pos.x, y: pos.y, power: -vn });
    }
  }
}

const SCRATCH = { x: 0, y: 0 };

function collide(sim: Sim, a: Robot, b: Robot) {
  for (let i = 0; i < a.parts.length; i++) {
    const pa = a.parts[i]!;
    if (!pa.alive) continue;
    const wa = partWorld(a, pa, { x: 0, y: 0 });
    for (let j = 0; j < b.parts.length; j++) {
      const pb = b.parts[j]!;
      if (!pb.alive || !a.alive || !b.alive) continue;
      const wb = partWorld(b, pb, SCRATCH);
      const dx = wb.x - wa.x;
      const dy = wb.y - wa.y;
      const d2 = dx * dx + dy * dy;
      const min = 2 * PART_R * 0.96;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const cx = wa.x + nx * PART_R;
      const cy = wa.y + ny * PART_R;
      // Push apart in proportion to how light each robot is.
      const pen = min - d;
      const share = b.mass / (a.mass + b.mass);
      a.x -= nx * pen * share;
      a.y -= ny * pen * share;
      b.x += nx * pen * (1 - share);
      b.y += ny * pen * (1 - share);
      wa.x -= nx * pen * share;
      wa.y -= ny * pen * share;

      const [avx, avy] = pointVel(a, cx, cy);
      const [bvx, bvy] = pointVel(b, cx, cy);
      const vn = (bvx - avx) * nx + (bvy - avy) * ny;
      const closing = Math.max(0, -vn);

      weaponHit(sim, a, i, b, j, nx, ny, closing);
      weaponHit(sim, b, j, a, i, -nx, -ny, closing);
      if (closing > 2 && a.impactCd <= 0 && b.impactCd <= 0) {
        a.impactCd = b.impactCd = 0.25;
        const dmg = (closing - 2) * 1.8;
        damage(sim, a, i, dmg);
        damage(sim, b, j, dmg);
      }

      if (vn < 0) {
        const rna = (cx - a.x) * ny - (cy - a.y) * nx;
        const rnb = (cx - b.x) * ny - (cy - b.y) * nx;
        const jn = (-(1 + E) * vn) / (1 / a.mass + 1 / b.mass + (rna * rna) / a.inertia + (rnb * rnb) / b.inertia);
        impulse(a, -nx * jn, -ny * jn, cx, cy);
        impulse(b, nx * jn, ny * jn, cx, cy);
      }
    }
  }
}

/** `src` (part si of robot s) touches `dst` (part di of robot d) along direction n (from src to dst). */
function weaponHit(sim: Sim, s: Robot, si: number, d: Robot, di: number, nx: number, ny: number, closing: number) {
  const src = s.parts[si]!;
  if (src.cd > 0) return;
  if (src.kind === "spinner") {
    src.cd = 0.5;
    damage(sim, d, di, 4 + 2 * Math.max(closing, 1.5), closing > 3);
  } else if (src.kind === "spike") {
    const [dx, dy] = dirWorld(s, src.dir);
    if (dx * nx + dy * ny > 0.55) {
      src.cd = 0.3;
      damage(sim, d, di, 7 + 3 * Math.max(closing, 1), closing > 3);
    }
  }
}

function hazards(sim: Sim, dt: number) {
  for (const h of sim.hazards) {
    if (hazardState(h, sim.t) !== 2) continue;
    for (const r of sim.robots) {
      if (!r.alive) continue;
      r.parts.forEach((p, i) => {
        if (!p.alive) return;
        const pos = partWorld(r, p);
        if (Math.hypot(pos.x - h.x, pos.y - h.y) < 1.5) {
          p.hp -= 22 * dt;
          if (p.hp <= 0) breakPart(sim, r, i);
        }
      });
    }
  }
}

function judge(sim: Sim, dt: number) {
  const [a, b] = sim.robots as [Robot, Robot];
  for (const r of sim.robots) {
    if (!r.alive) continue;
    r.immobile = wheelsLeft(r) === 0 ? r.immobile + dt : 0;
  }
  if (!a.alive || !b.alive) {
    sim.over = a.alive ? { winner: 0, reason: "ko" } : b.alive ? { winner: 1, reason: "ko" } : { winner: -1, reason: "draw" };
    return;
  }
  if (a.immobile > 8 && b.immobile <= 8) sim.over = { winner: 1, reason: "immobilized" };
  else if (b.immobile > 8 && a.immobile <= 8) sim.over = { winner: 0, reason: "immobilized" };
  else if (sim.t >= TIME_LIMIT) {
    const fa = hpFrac(a);
    const fb = hpFrac(b);
    sim.over = Math.abs(fa - fb) < 0.02 ? { winner: -1, reason: "draw" } : { winner: fa > fb ? 0 : 1, reason: "judges" };
  }
}

// ---------------------------------------------------------------- snapshots

export interface RobotSnap {
  x: number;
  y: number;
  th: number;
  vx: number;
  vy: number;
  w: number;
  hp: number[];
  alive: boolean;
  boostT: number;
  cd: number[];
}
export interface Snap {
  t: number;
  r: [RobotSnap, RobotSnap];
  over: Outcome | null;
  ev: SimEvent[];
}

const round = (n: number, k = 100) => Math.round(n * k) / k;

export function snapshot(sim: Sim): Snap {
  return {
    t: round(sim.t),
    r: sim.robots.map((r) => ({
      x: round(r.x),
      y: round(r.y),
      th: round(r.th, 1000),
      vx: round(r.vx),
      vy: round(r.vy),
      w: round(r.w),
      hp: r.parts.map((p) => (p.alive ? Math.round(p.hp * 10) / 10 : 0)),
      alive: r.alive,
      boostT: round(r.boostT),
      cd: r.parts.map((p) => round(p.cd)),
    })) as Snap["r"],
    over: sim.over,
    ev: sim.events,
  };
}

/** Make a guest's copy of the fight look like the host's snapshot. */
export function applySnapshot(sim: Sim, s: Snap) {
  sim.t = s.t;
  sim.over = s.over;
  s.r.forEach((rs, i) => {
    const r = sim.robots[i]!;
    let changed = false;
    r.parts.forEach((p, k) => {
      const hp = rs.hp[k] ?? 0;
      const alive = hp > 0;
      if (alive !== p.alive) changed = true;
      p.alive = alive;
      p.hp = hp;
      p.cd = rs.cd[k] ?? 0;
    });
    r.alive = rs.alive;
    r.boostT = rs.boostT;
    if (changed) recompute(r, false);
    r.x = rs.x;
    r.y = rs.y;
    r.th = rs.th;
    r.vx = rs.vx;
    r.vy = rs.vy;
    r.w = rs.w;
  });
  sim.events.push(...s.ev);
}
