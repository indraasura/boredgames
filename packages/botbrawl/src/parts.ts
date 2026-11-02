/**
 * Bot Brawl: build a remote-controlled fighting robot from blocks in a short time, then fight in a cage.
 *
 * A robot is a small grid of parts. "Up" on the grid is the front of the robot.
 */

export type PartKind = "core" | "hull" | "armor" | "wheel" | "spinner" | "spike" | "hammer" | "flipper" | "booster";
export type Dir = 0 | 1 | 2 | 3; // front, right, back, left

export interface PartSpec {
  kind: PartKind;
  label: string;
  cost: number;
  hp: number;
  mass: number;
  /** Points a way (front, right, back, left) and can be rotated while building. */
  directional: boolean;
  blurb: string;
}

export const PARTS: Record<PartKind, PartSpec> = {
  core: { kind: "core", label: "Core", cost: 5, hp: 40, mass: 2, directional: false, blurb: "The brain. Every robot needs exactly one. Lose it and you are out." },
  hull: { kind: "hull", label: "Hull", cost: 2, hp: 20, mass: 1, directional: false, blurb: "Cheap, light frame that holds everything together." },
  armor: { kind: "armor", label: "Armor", cost: 4, hp: 55, mass: 2.4, directional: false, blurb: "Tough and heavy. Slows you down but soaks up hits." },
  wheel: { kind: "wheel", label: "Wheel", cost: 6, hp: 12, mass: 1, directional: false, blurb: "Drives the robot. Wheels on both sides to steer." },
  spinner: { kind: "spinner", label: "Spinner", cost: 12, hp: 14, mass: 1.5, directional: false, blurb: "A spinning blade. Grinds anything it touches, from any side." },
  spike: { kind: "spike", label: "Spike", cost: 5, hp: 16, mass: 0.6, directional: true, blurb: "Stabs whatever its tip rams into. Point it where you charge." },
  hammer: { kind: "hammer", label: "Hammer", cost: 10, hp: 16, mass: 1.4, directional: true, blurb: "Press Fire to smash what is in front of it. Big damage, slow to reload." },
  flipper: { kind: "flipper", label: "Flipper", cost: 9, hp: 14, mass: 1.2, directional: true, blurb: "Press Fire to launch the other robot across the cage." },
  booster: { kind: "booster", label: "Booster", cost: 8, hp: 10, mass: 0.8, directional: true, blurb: "Press Boost for a burst of speed, opposite to the way its nozzle points." },
};

export const PART_ORDER: PartKind[] = ["core", "hull", "armor", "wheel", "spinner", "spike", "hammer", "flipper", "booster"];

export const GRID = 7;
export const BUDGET = 90;
/** World size of one grid cell. */
export const CELL = 0.8;

export interface DesignPart {
  /** Column and row, 0..GRID-1. Row 0 is the front. */
  c: number;
  r: number;
  kind: PartKind;
  dir: Dir;
}

export interface Design {
  name: string;
  parts: DesignPart[];
}

export interface Check {
  ok: boolean;
  cost: number;
  error?: string;
  /** The parts that are connected to the core and inside the grid. */
  kept: DesignPart[];
}

const key = (c: number, r: number) => r * GRID + c;

/** Is this design legal? Disconnected parts are dropped, not an error. */
export function check(design: Design): Check {
  const cells = new Map<number, DesignPart>();
  for (const p of design.parts) {
    if (p.c < 0 || p.c >= GRID || p.r < 0 || p.r >= GRID || !PARTS[p.kind]) continue;
    cells.set(key(p.c, p.r), p);
  }
  const cores = [...cells.values()].filter((p) => p.kind === "core");
  if (cores.length !== 1) return { ok: false, cost: 0, kept: [], error: cores.length ? "Use only one core." : "Add a core: every robot needs one." };
  const seen = new Set<number>([key(cores[0]!.c, cores[0]!.r)]);
  const queue = [cores[0]!];
  while (queue.length) {
    const p = queue.pop()!;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = cells.get(key(p.c + dc, p.r + dr));
      if (n && !seen.has(key(n.c, n.r)) && p.c + dc >= 0 && p.c + dc < GRID) {
        seen.add(key(n.c, n.r));
        queue.push(n);
      }
    }
  }
  const kept = [...seen].map((k) => cells.get(k)!);
  const cost = kept.reduce((n, p) => n + PARTS[p.kind].cost, 0);
  if (cost > BUDGET) return { ok: false, cost, kept, error: `Over budget by ${cost - BUDGET}.` };
  return { ok: true, cost, kept };
}

/** Make a design legal when time runs out: add a core if missing, then drop the priciest parts until it fits. */
export function autoFix(design: Design): Design {
  let parts = [...design.parts];
  const cores = parts.filter((p) => p.kind === "core");
  if (cores.length > 1) parts = parts.filter((p) => p.kind !== "core" || p === cores[0]);
  if (!cores.length) {
    const spot = { c: 3, r: 3 };
    parts = parts.filter((p) => !(p.c === spot.c && p.r === spot.r));
    parts.push({ ...spot, kind: "core", dir: 0 });
  }
  let res = check({ name: design.name, parts });
  while (!res.ok && res.kept.length > 1) {
    const worst = [...res.kept].filter((p) => p.kind !== "core").sort((a, b) => PARTS[b.kind].cost - PARTS[a.kind].cost)[0];
    if (!worst) break;
    parts = parts.filter((p) => p !== worst);
    res = check({ name: design.name, parts });
  }
  return { name: design.name, parts: res.kept };
}

export interface Stats {
  cost: number;
  mass: number;
  hp: number;
  wheels: number;
  weapons: number;
  /** 0..1 rough top speed. */
  speed: number;
}

export function stats(parts: DesignPart[]): Stats {
  let mass = 0;
  let hp = 0;
  let wheels = 0;
  let weapons = 0;
  let cost = 0;
  for (const p of parts) {
    const s = PARTS[p.kind];
    mass += s.mass;
    hp += s.hp;
    cost += s.cost;
    if (p.kind === "wheel") wheels++;
    if (p.kind === "spinner" || p.kind === "spike" || p.kind === "hammer" || p.kind === "flipper") weapons++;
  }
  return { cost, mass, hp, wheels, weapons, speed: mass ? Math.min(1, (wheels * 5) / mass / 2.2) : 0 };
}
