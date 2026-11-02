import type { BotLevel } from "@boredgames/engine";

/**
 * A boxing match between fighter 0 (you) and fighter 1. Pure, fixed-step logic: the renderer reads the
 * state and the events, and sends controls in. Both fighters always face each other; distance is in metres.
 */

export type Punch = "jab" | "cross" | "hook" | "upper";

export interface PunchSpec {
  wind: number;
  act: number;
  rec: number;
  dmg: number;
  stam: number;
  /** Centre-to-centre distance at which it can land. */
  range: number;
}

export const PUNCH: Record<Punch, PunchSpec> = {
  jab: { wind: 0.08, act: 0.06, rec: 0.17, dmg: 5, stam: 5, range: 1.5 },
  cross: { wind: 0.14, act: 0.07, rec: 0.3, dmg: 11, stam: 10, range: 1.4 },
  hook: { wind: 0.17, act: 0.07, rec: 0.32, dmg: 13, stam: 12, range: 1.25 },
  upper: { wind: 0.19, act: 0.07, rec: 0.36, dmg: 15, stam: 14, range: 1.2 },
};

export const ROUNDS = 3;
export const ROUND_TIME = 60;
export const REST_TIME = 8;
export const RING = 2.8; // half-size of the ring floor a fighter can stand on
const MIN_GAP = 0.75;

export interface Controls {
  /** Forward (+1, toward the opponent) or back (-1). */
  move: number;
  /** Sideways around the opponent: -1 left, +1 right. */
  strafe: number;
  guard: boolean;
  duck: boolean;
  /** A new punch asked for this step. */
  punch: Punch | null;
  /** A new slip asked for this step. */
  lean: -1 | 0 | 1;
  /** A tap of the get-up button while down. */
  getUp: boolean;
}
export const noControls = (): Controls => ({ move: 0, strafe: 0, guard: false, duck: false, punch: null, lean: 0, getUp: false });

export interface Action {
  kind: Punch;
  t: number;
  landed: boolean;
}

export interface Fighter {
  id: 0 | 1;
  x: number;
  z: number;
  hp: number;
  stamina: number;
  act: Action | null;
  queued: Punch | null;
  guard: boolean;
  duck: boolean;
  leanT: number;
  leanDir: number;
  leanCd: number;
  stun: number;
  /** Seconds on the canvas, or null when standing. */
  down: number | null;
  presses: number;
  knockdowns: number;
  /** Seconds of not being hittable after getting up. */
  safe: number;
  /** For the renderer: which hand threw the last punch, and a small swing. */
  dealt: number;
}

export type Phase = "ready" | "fight" | "rest" | "over";

export type FightEvent =
  | { type: "punch"; by: number; kind: Punch }
  | { type: "hit"; by: number; target: number; kind: Punch; dmg: number }
  | { type: "block"; by: number; target: number; kind: Punch }
  | { type: "slip"; by: number; target: number; kind: Punch }
  | { type: "whiff"; by: number; kind: Punch }
  | { type: "down"; who: number }
  | { type: "up"; who: number }
  | { type: "count"; n: number }
  | { type: "bell"; kind: "start" | "end" };

export interface Result {
  winner: number; // -1 for a draw
  how: "ko" | "tko" | "decision" | "draw";
}

export interface Card {
  you: number;
  them: number;
}

export interface Fight {
  level: BotLevel;
  phase: Phase;
  round: number;
  /** Seconds left in the round or rest or ready countdown. */
  clock: number;
  f: [Fighter, Fighter];
  events: FightEvent[];
  cards: Card[];
  /** Damage each fighter has dealt this round. */
  dealt: [number, number];
  result: Result | null;
  ai: { think: number; def: number; defKind: "guard" | "lean" | "duck" | null; strafe: number; strafeT: number; combo: number };
  lastCount: number;
}

const fighter = (id: 0 | 1): Fighter => ({
  id,
  x: 0,
  z: id === 0 ? 1.0 : -1.0,
  hp: 100,
  stamina: 100,
  act: null,
  queued: null,
  guard: false,
  duck: false,
  leanT: 0,
  leanDir: 0,
  leanCd: 0,
  stun: 0,
  down: null,
  presses: 0,
  knockdowns: 0,
  safe: 0,
  dealt: 0,
});

export function createFight(level: BotLevel): Fight {
  return {
    level,
    phase: "ready",
    round: 1,
    clock: 3,
    f: [fighter(0), fighter(1)],
    events: [{ type: "bell", kind: "start" }],
    cards: [],
    dealt: [0, 0],
    result: null,
    ai: { think: 0.4, def: 0, defKind: null, strafe: 0, strafeT: 0, combo: 0 },
    lastCount: 0,
  };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const dist = (fight: Fight) => Math.hypot(fight.f[0].x - fight.f[1].x, fight.f[0].z - fight.f[1].z);
export const total = (k: Punch) => PUNCH[k].wind + PUNCH[k].act + PUNCH[k].rec;
export const downNeeded = (f: Fighter) => 7 + 2 * f.knockdowns;

// ------------------------------------------------------------------- step

export function step(fight: Fight, dt: number, controls: [Controls, Controls], rand: () => number = Math.random) {
  if (fight.phase === "over") return;
  const [a, b] = fight.f;

  if (fight.phase === "ready" || fight.phase === "rest") {
    fight.clock -= dt;
    for (const f of fight.f) {
      f.stamina = Math.min(100, f.stamina + 30 * dt);
      f.guard = f.duck = false;
    }
    if (fight.clock <= 0) {
      if (fight.phase === "rest") {
        fight.round++;
        resetRound(fight);
      }
      fight.phase = "fight";
      fight.clock = ROUND_TIME;
      fight.events.push({ type: "bell", kind: "start" });
    }
    return;
  }

  fight.clock -= dt;
  const anyDown = a.down !== null || b.down !== null;

  for (const f of fight.f) {
    const c = controls[f.id];
    const o = fight.f[1 - f.id]!;
    f.stun = Math.max(0, f.stun - dt);
    f.leanT = Math.max(0, f.leanT - dt);
    f.leanCd = Math.max(0, f.leanCd - dt);
    f.safe = Math.max(0, f.safe - dt);
    f.dealt = Math.max(0, f.dealt - dt);

    if (f.down !== null) {
      f.down += dt;
      if (c.getUp) f.presses++;
      continue;
    }
    if (anyDown) {
      // The referee sends the standing fighter away: no punching while a count is on.
      f.act = null;
      f.queued = null;
      f.guard = f.duck = false;
      continue;
    }

    f.guard = c.guard && f.stun <= 0 && !f.act;
    f.duck = c.duck && f.stun <= 0 && !f.act;

    // Move.
    const dx = o.x - f.x;
    const dz = o.z - f.z;
    const d = Math.hypot(dx, dz) || 1;
    const fx = dx / d;
    const fz = dz / d;
    const slow = (f.act ? 0.3 : 1) * (f.guard ? 0.55 : 1) * (f.duck ? 0.4 : 1) * (f.hp < 25 ? 0.8 : 1) * (f.stun > 0 ? 0.3 : 1);
    const fwd = c.move > 0 ? 1.5 : 1.15;
    f.x += (fx * c.move * fwd + -fz * c.strafe * 1.25) * slow * dt;
    f.z += (fz * c.move * fwd + fx * c.strafe * 1.25) * slow * dt;
    f.x = clamp(f.x, -RING, RING);
    f.z = clamp(f.z, -RING, RING);

    // Slip.
    if (c.lean && f.leanCd <= 0 && !f.act && f.stun <= 0 && f.stamina > 3) {
      f.leanT = 0.3;
      f.leanDir = c.lean;
      f.leanCd = 0.55;
      f.stamina -= 3;
    }

    // Punch.
    if (c.punch) {
      if (!f.act && f.stun <= 0 && f.stamina > 1) startPunch(fight, f, c.punch);
      else if (f.act) f.queued = c.punch;
    }
    if (f.act) {
      const spec = PUNCH[f.act.kind];
      const before = f.act.t;
      f.act.t += dt;
      if (before < spec.wind && f.act.t >= spec.wind && !f.act.landed) {
        f.act.landed = true;
        resolve(fight, f, o, f.act.kind);
      }
      if (f.act && f.act.t >= total(f.act.kind)) {
        f.act = null;
        if (f.queued && f.stamina > 1) {
          const q = f.queued;
          f.queued = null;
          startPunch(fight, f, q);
        }
        f.queued = null;
      }
    }
    f.stamina = clamp(f.stamina + (f.act ? 0 : f.guard ? 7 : 15) * dt, 0, 100);
  }

  // Keep fighters apart.
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  if (d < MIN_GAP) {
    const push = (MIN_GAP - d) / 2;
    const nx = d ? dx / d : 0;
    const nz = d ? dz / d : 1;
    a.x = clamp(a.x - nx * push, -RING, RING);
    a.z = clamp(a.z - nz * push, -RING, RING);
    b.x = clamp(b.x + nx * push, -RING, RING);
    b.z = clamp(b.z + nz * push, -RING, RING);
  }

  count(fight, controls, rand);

  if (fight.phase === "fight" && fight.clock <= 0 && !anyDownNow(fight)) endRound(fight);
}

const anyDownNow = (fight: Fight) => fight.f[0].down !== null || fight.f[1].down !== null;

function startPunch(fight: Fight, f: Fighter, kind: Punch) {
  f.act = { kind, t: 0, landed: false };
  f.stamina = Math.max(0, f.stamina - PUNCH[kind].stam);
  f.guard = f.duck = false;
  fight.events.push({ type: "punch", by: f.id, kind });
}

function resolve(fight: Fight, a: Fighter, d: Fighter, kind: Punch) {
  const spec = PUNCH[kind];
  const gap = dist(fight);
  if (gap > spec.range + 0.12 || d.down !== null || d.safe > 0) {
    fight.events.push({ type: "whiff", by: a.id, kind });
    return;
  }
  const straight = kind === "jab" || kind === "cross";
  if (d.leanT > 0 && (straight || kind === "upper") && !d.act) {
    fight.events.push({ type: "slip", by: a.id, target: d.id, kind });
    return;
  }
  if (d.duck && kind === "hook") {
    fight.events.push({ type: "slip", by: a.id, target: d.id, kind });
    return;
  }
  const tired = 0.6 + 0.4 * (a.stamina / 100);
  if (d.guard && kind !== "upper") {
    const broken = d.stamina <= 1;
    const dmg = spec.dmg * tired * (broken ? 0.5 : 0.1);
    d.hp -= dmg;
    d.stamina = Math.max(0, d.stamina - (6 + spec.dmg * 0.7));
    d.stun = broken ? 0.3 : 0.08;
    fight.events.push({ type: "block", by: a.id, target: d.id, kind });
    return;
  }
  // A clean hit; catching someone mid-swing hurts more.
  const counter = d.act && d.act.t < PUNCH[d.act.kind].wind ? 1.35 : 1;
  const pierced = d.guard && kind === "upper" ? 0.6 : 1;
  const dmg = spec.dmg * tired * counter * pierced * (d.stun > 0 ? 1.1 : 1) * (0.9 + Math.random() * 0.2);
  d.hp -= dmg;
  d.stun = 0.16 + dmg * 0.018;
  if (d.act && d.act.t < PUNCH[d.act.kind].wind + PUNCH[d.act.kind].act) {
    d.act = null;
    d.queued = null;
  }
  a.dealt = 0.25;
  fight.dealt[a.id] += dmg;
  fight.events.push({ type: "hit", by: a.id, target: d.id, kind, dmg });
  // A little shove away.
  const dx = d.x - a.x;
  const dz = d.z - a.z;
  const n = Math.hypot(dx, dz) || 1;
  d.x = clamp(d.x + (dx / n) * 0.12, -RING, RING);
  d.z = clamp(d.z + (dz / n) * 0.12, -RING, RING);
  if (d.hp <= 0) knockDown(fight, d);
}

function knockDown(fight: Fight, d: Fighter) {
  d.hp = 0;
  d.down = 0;
  d.presses = 0;
  d.act = null;
  d.queued = null;
  d.knockdowns++;
  fight.lastCount = 0;
  fight.events.push({ type: "down", who: d.id });
}

/** The referee's count, and getting up. */
function count(fight: Fight, controls: [Controls, Controls], rand: () => number) {
  for (const f of fight.f) {
    if (f.down === null) continue;
    // The computer taps now and then.
    if (f.id === 1) {
      const rate = fight.level === "hard" ? 5 : fight.level === "medium" ? 3.6 : 2.6;
      if (rand() < rate / 60 && controls[1] !== undefined) f.presses++;
    }
    const n = Math.min(10, Math.floor(f.down) + 1);
    if (n > fight.lastCount) {
      fight.lastCount = n;
      fight.events.push({ type: "count", n });
    }
    if (f.down >= 1.5 && f.presses >= downNeeded(f) && f.down < 10) {
      f.down = null;
      f.hp = 22;
      f.stun = 0;
      f.safe = 1;
      f.stamina = Math.max(f.stamina, 50);
      fight.events.push({ type: "up", who: f.id });
      if (f.knockdowns >= 3) finish(fight, 1 - f.id, "tko");
    } else if (f.down >= 10) finish(fight, 1 - f.id, "ko");
  }
}

function finish(fight: Fight, winner: number, how: Result["how"]) {
  fight.result = { winner, how };
  fight.phase = "over";
  fight.events.push({ type: "bell", kind: "end" });
}

function endRound(fight: Fight) {
  fight.events.push({ type: "bell", kind: "end" });
  const [da, db] = fight.dealt;
  const kdA = fight.f[0].knockdowns;
  const kdB = fight.f[1].knockdowns;
  // Ten points to the round's winner, nine (less a point for each knockdown) to the other.
  const score = (mine: number, theirs: number, kdMine: number) => (Math.abs(mine - theirs) < 4 ? 10 : mine > theirs ? 10 : Math.max(7, 9 - kdMine));
  fight.cards.push({ you: score(da, db, kdA), them: score(db, da, kdB) });
  if (fight.round >= ROUNDS) {
    const you = fight.cards.reduce((n, c) => n + c.you, 0);
    const them = fight.cards.reduce((n, c) => n + c.them, 0);
    fight.result = you === them ? { winner: -1, how: "draw" } : { winner: you > them ? 0 : 1, how: "decision" };
    fight.phase = "over";
    return;
  }
  fight.phase = "rest";
  fight.clock = REST_TIME;
}

function resetRound(fight: Fight) {
  fight.dealt = [0, 0];
  fight.f.forEach((f, i) => {
    f.x = 0;
    f.z = i === 0 ? 1 : -1;
    f.hp = Math.min(100, f.hp + 22);
    f.stamina = 100;
    f.act = null;
    f.queued = null;
    f.stun = 0;
    f.knockdowns = 0;
    f.down = null;
  });
}

// ----------------------------------------------------------------------- AI

export function aiControls(fight: Fight, rand: () => number = Math.random): Controls {
  const me = fight.f[1];
  const foe = fight.f[0];
  const c = noControls();
  const ai = fight.ai;
  if (fight.phase !== "fight" || me.down !== null || foe.down !== null) return c;
  const L = fight.level;
  const react = L === "hard" ? 0.7 : L === "medium" ? 0.42 : 0.18;
  const aggro = L === "hard" ? 0.7 : L === "medium" ? 0.45 : 0.28;
  const d = dist(fight);
  const dt = 1 / 60;

  ai.think -= dt;
  ai.def = Math.max(0, ai.def - dt);
  ai.strafeT -= dt;
  if (ai.strafeT <= 0) {
    ai.strafe = rand() < 0.35 ? 0 : rand() < 0.5 ? -1 : 1;
    ai.strafeT = 0.5 + rand() * 1.2;
  }

  // See a punch coming.
  if (foe.act && foe.act.t < PUNCH[foe.act.kind].wind + 0.05 && d < PUNCH[foe.act.kind].range + 0.35 && ai.def <= 0 && rand() < react * 0.12) {
    const k = foe.act.kind;
    ai.defKind = k === "hook" ? (rand() < 0.5 ? "duck" : "guard") : rand() < 0.5 ? "lean" : "guard";
    ai.def = 0.34;
  }
  if (ai.def > 0) {
    if (ai.defKind === "guard") c.guard = true;
    else if (ai.defKind === "duck") c.duck = true;
    else if (ai.defKind === "lean") {
      c.lean = rand() < 0.5 ? -1 : 1;
      ai.def = 0;
    }
    return c;
  }

  // Keep a fighting distance.
  const ideal = 1.25;
  if (d > ideal + 0.1) c.move = 1;
  else if (d < ideal - 0.3) c.move = -0.7;
  c.strafe = ai.strafe * 0.7;
  // Rest behind the guard when tired.
  if (me.stamina < 18) {
    c.guard = true;
    c.move = d < 1.8 ? -0.5 : 0;
    return c;
  }

  if (ai.think <= 0 && !me.act && me.stun <= 0) {
    ai.think = (L === "hard" ? 0.16 : L === "medium" ? 0.26 : 0.4) + rand() * 0.2;
    const inRange = d < PUNCH.jab.range;
    if (inRange && rand() < aggro) {
      const r = rand();
      const options: Punch[] = d < PUNCH.hook.range ? ["jab", "cross", "hook", "upper"] : ["jab", "cross"];
      c.punch = r < 0.45 ? "jab" : r < 0.72 ? "cross" : (options[options.length > 2 ? (r < 0.9 ? 2 : 3) : 1] ?? "jab");
      // Throw a second one on a hit.
      ai.combo = foe.stun > 0 ? 1 : 0;
    } else if (!inRange && rand() < 0.15) {
      c.guard = true;
    }
  } else if (me.act && ai.combo > 0 && !me.queued) {
    c.punch = rand() < 0.5 ? "cross" : "hook";
    ai.combo = 0;
  } else if (foe.stun > 0 && ai.think > 0.1) {
    ai.think = 0; // pounce on a stunned opponent
  }
  return c;
}
