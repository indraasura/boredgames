import type { BotLevel } from "@boredgames/engine";
import { ARENA, hazardState, noInput, partWorld, type Input, type Robot, type Sim } from "./sim";
import { GRID, PARTS, check, type Design, type DesignPart, type Dir, type PartKind } from "./parts";

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The computer's controls for robot `id` this frame. `rand` is only used for sloppiness on easier levels. */
export function botInput(sim: Sim, id: number, level: BotLevel, rand: () => number = Math.random): Input {
  const me = sim.robots[id]!;
  const foe = sim.robots[1 - id]!;
  const out = noInput();
  if (!me.alive || !foe.alive) return out;

  // Which side of the robot hurts? Face that side to the enemy.
  let wu = 0;
  let wv = 0;
  let wn = 0;
  for (const p of me.parts) {
    if (!p.alive || !(p.kind === "spinner" || p.kind === "spike" || p.kind === "hammer" || p.kind === "flipper")) continue;
    const dir = p.kind === "spinner" ? 0 : p.dir;
    wu += dir === 0 ? 1 : dir === 2 ? -1 : 0;
    wv += dir === 1 ? 1 : dir === 3 ? -1 : 0;
    wn++;
  }
  const weaponAngle = wn ? Math.atan2(wv, wu) : 0;

  const target = { x: foe.x, y: foe.y };
  // Lead the shot a little on harder levels.
  const lead = level === "hard" ? 0.25 : level === "medium" ? 0.1 : 0;
  target.x += foe.vx * lead;
  target.y += foe.vy * lead;

  // Steer clear of live flame vents and the walls.
  let ax = target.x;
  let ay = target.y;
  for (const h of sim.hazards) {
    const s = hazardState(h, sim.t);
    if (s === 0) continue;
    const d = Math.hypot(me.x - h.x, me.y - h.y);
    if (d < 3.2) {
      ax += ((me.x - h.x) / d) * 6;
      ay += ((me.y - h.y) / d) * 6;
    }
  }
  const wall = ARENA - 1.6;
  if (Math.abs(me.x) > wall) ax -= Math.sign(me.x) * 4;
  if (Math.abs(me.y) > wall) ay -= Math.sign(me.y) * 4;

  const want = Math.atan2(ay - me.y, ax - me.x) - weaponAngle;
  const err = wrap(want - me.th);
  const dist = Math.hypot(foe.x - me.x, foe.y - me.y);
  const sloppy = level === "easy" ? 0.5 : level === "medium" ? 0.2 : 0.05;

  out.turn = Math.max(-1, Math.min(1, err * 2.2 + (rand() - 0.5) * sloppy));
  const aligned = Math.abs(err) < (level === "easy" ? 1.1 : 0.8);
  out.throttle = aligned ? (dist < 1.6 && wn === 0 ? 0.6 : 1) : 0.15;
  if (level === "easy") out.throttle *= 0.7;
  // A robot with no wheel has nothing to steer with; nothing else to do.
  const speed = Math.hypot(me.vx, me.vy);
  if (speed < 0.25 && dist > 2.5 && sim.t > 2 && Math.floor(sim.t) % 4 === 0) out.throttle = -1;

  // Active weapons.
  if (dist < 2.6 && Math.abs(err) < 0.55) out.fire = level !== "easy" || rand() < 0.4;
  if (dist > 6 && Math.abs(err) < 0.3 && level !== "easy") out.boost = true;
  return out;
}

// ------------------------------------------------------------------ designs

const LEGEND: Record<string, [PartKind, Dir]> = {
  C: ["core", 0],
  H: ["hull", 0],
  A: ["armor", 0],
  W: ["wheel", 0],
  S: ["spinner", 0],
  K: ["spike", 0],
  k: ["spike", 3],
  q: ["spike", 1],
  M: ["hammer", 0],
  F: ["flipper", 0],
  B: ["booster", 2],
};

function parse(name: string, rows: string[]): Design {
  const parts: DesignPart[] = [];
  rows.forEach((row, r) => {
    [...row.replace(/ /g, "")].forEach((ch, c) => {
      const m = LEGEND[ch];
      if (m && c < GRID && r < GRID) parts.push({ c, r, kind: m[0], dir: m[1] });
    });
  });
  return { name, parts };
}

/** Robots the computer can field, and starting points for "surprise me". */
export const TEMPLATES: Design[] = [
  parse("Buzzsaw", ["..SSS..", "..HHH..", "WHHCHHW", "..HHH..", "..A.A.."]),
  parse("Thumper", ["...M...", "..AAA..", "WHHCHHW", "..HHH..", "...B..."]),
  parse("Porcupine", [".K.K.K.", ".AAAAA.", "WHHCHHW", "WHHHHHW", "..A.A.."]),
  parse("Launchpad", ["..FFF..", ".AAAAA.", "WHHCHHW", "..HHH..", "..B...."]),
  parse("Sidewinder", ["k.....q", "kAHHHAq", "WHHCHHW", "WHHHHHW", "..HAH.."]),
  parse("Tank", ["..HKH..", ".AAHAA.", "WAHCHAW", ".AAHAA.", "..W.W.."]),
];

export function randomDesign(rand: () => number = Math.random): Design {
  const t = TEMPLATES[Math.floor(rand() * TEMPLATES.length)]!;
  return { name: t.name, parts: t.parts.map((p) => ({ ...p })) };
}

export const designCost = (d: Design) => check(d).cost;
export { PARTS, partWorld };
export type { Robot };
