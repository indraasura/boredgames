import { Driver } from "./ai";
import { COMPOUNDS, wetGrip, type Tuned } from "./car";
import type { Plan } from "./line";
import { G, MAX_STEER, steerLimit, type CarState, type Env, type Input } from "./physics";
import type { Track } from "./track";

/**
 * How much help the driver gets.
 * - pro: no help. The steering still asks for cornering force (so the same push turns the car the same at any
 *   speed), but nothing catches slides, nothing brakes for you, and there is no traction control.
 * - standard: the steering asks for cornering force instead of wheel angle, the car is held stable,
 *   and the brakes step in when you are far too fast for a corner.
 * - full: as standard, and the car also eases back towards the racing line when you are not steering.
 */
export type AidLevel = "pro" | "standard" | "full";

export const AID_LEVELS: readonly { id: AidLevel; name: string; blurb: string }[] = [
  { id: "full", name: "Full", blurb: "Keeps the car on the racing line and brakes for corners. Just steer and press go." },
  { id: "standard", name: "Standard", blurb: "Smooth, stable steering and braking help. You choose the line." },
  { id: "pro", name: "Pro", blurb: "No traction control, no braking or slide help. You control the car." },
];

/** Per-level tuning: how much cornering force full input asks for, how hard the car is pulled onto the line when the wheel is let go, and how brave the braking help is. */
const TUNING = {
  pro: { authority: 1.1, line: 0, skill: 1 },
  standard: { authority: 0.65, line: 0.75, skill: 0.92 },
  full: { authority: 0.65, line: 0.88, skill: 0.88 },
} as const;

export interface RawInput {
  throttle: number;
  brake: number;
  /** -1..1, positive turns left. */
  steer: number;
  drs: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smoothstep = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/** What the help is doing right now, for the display. */
export interface AidReport {
  braking: boolean;
  steering: boolean;
}

/**
 * Turns what a driver asks of the keys or the pad into what the car is told to do. The steering is a
 * cornering-force controller: full input is the most the tyres can give at this speed, half input is
 * half of that, and the wheel angle needed is found by watching the car's own yaw rate. That is what
 * makes a car feel natural: the same push turns it the same way at 60 or 300 km/h, and it never
 * snaps round.
 */
export class Aids {
  /** A computer driver running alongside, only to know where to be and how fast. */
  private ghost: Driver;
  private trim = 0;
  report: AidReport = { braking: false, steering: false };

  constructor(
    private track: Track,
    plan: Plan,
    public level: AidLevel,
  ) {
    this.ghost = new Driver(track, plan, { skill: TUNING[level].skill, aggression: 0 });
  }

  setPlan(plan: Plan) {
    this.ghost.plan = plan;
  }

  setLevel(level: AidLevel) {
    this.level = level;
    this.ghost.opts.skill = TUNING[level].skill;
  }

  apply(raw: RawInput, c: CarState, k: Tuned, env: Env, gripScale: number, dt: number): Input {
    const V = Math.hypot(c.u, c.v);
    const L = k.a + k.b;
    const m = k.mass0 + Math.max(0, c.fuel);

    // ---- what the tyres can give sideways at this speed
    const comp = COMPOUNDS[c.compound];
    const muEst = comp.mu * wetGrip(comp, env.wetness) * Math.max(0.6, gripScale);
    const q = 0.5 * env.rho * V * V;
    const df = q * (k.clAf + k.clAr);
    const ayLimit = (muEst * (m * G + df)) / m;

    const cfg = TUNING[this.level];

    // ---- the ghost: where the racing line is, and how fast to be
    const g = this.ghost.drive(c, dt, [], gripScale);

    // ---- steering: ask for cornering force, let the controller find the angle
    const sIn = Math.sign(raw.steer) * Math.abs(raw.steer) ** 1.25;
    const aDes = sIn * ayLimit * cfg.authority;
    const rKin = (V * Math.tan(MAX_STEER * 0.92)) / L;
    const rDes = clamp(aDes / Math.max(V, 8), -rKin, rKin);
    const dFF = Math.atan((L * rDes) / Math.max(V, 3));

    // Integrate the yaw-rate error so the angle settles where the car really does what was asked.
    if (V > 10) {
      this.trim = clamp(this.trim + 0.22 * (rDes - c.r) * dt * (Math.abs(sIn) > 0.02 ? 1 : 0), -0.06, 0.06);
    }
    if (Math.abs(sIn) < 0.02) this.trim *= Math.max(0, 1 - 6 * dt);
    let delta = dFF + this.trim + 0.045 * (rDes - c.r) * Math.min(1, V / 25);

    // Catch a sliding rear before it becomes a spin (not in pro: a slide is yours to catch).
    if (V > 8 && this.level !== "pro") {
      const betaRear = Math.atan2(c.v - k.b * c.r, Math.max(c.u, 5));
      delta -= clamp(betaRear * 0.75, -0.14, 0.14);
    }
    // Never ask for more lock than the front tyres can use at this speed.
    const lock = steerLimit(V, true, ayLimit, L);
    delta = clamp(delta, -lock, lock);

    // At parking speeds the wheel is simply the wheel.
    const low = raw.steer * MAX_STEER;
    delta = low + (delta - low) * smoothstep((V - 6) / 10);

    // Full help: let go of the wheel and the car follows the line.
    let steering = false;
    if (V > 12) {
      const w = clamp(1 - Math.abs(raw.steer) / 0.35, 0, 1) * cfg.line;
      if (w > 0) {
        const gd = g.input.steer * MAX_STEER;
        delta = delta * (1 - w) + clamp(gd, -lock, lock) * w;
        steering = w > 0.3;
      }
    }

    // ---- pedals
    let brake = raw.brake;
    let throttle = raw.throttle;
    const gb = g.input.brake;
    let braking = false;
    if (gb > 0.12 && V > 12 && this.level !== "pro") {
      const take = this.level === "full" ? 1 : 0.8;
      if (gb * take > brake) {
        brake = gb * take;
        braking = true;
      }
    }
    if (brake > 0.05) throttle = 0;
    else if (this.level === "full") throttle = Math.min(throttle, g.input.throttle + 0.3);

    this.report = { braking, steering };
    return { throttle, brake, steer: clamp(delta / MAX_STEER, -1, 1), drs: raw.drs, steerAssist: false, tractionControl: this.level !== "pro" };
  }
}

