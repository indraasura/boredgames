import { CAR } from "./car";
import { sampleAt, type Plan } from "./line";
import { MAX_STEER, type CarState, type Input } from "./physics";
import { gap, nearest, trackAt, wrapS, type Track } from "./track";

export interface Obstacle {
  /** Distance along the lap and lateral offset of another car. */
  s: number;
  d: number;
  speed: number;
}

export interface DriverOptions {
  /** 0.85 (slow) .. 1 (right on the limit). */
  skill: number;
  /** How willing the driver is to make a move. */
  aggression: number;
}

/** The pit lane runs beside the road: offset target as a function of distance. */
export interface PitPath {
  /** Lateral offset of the pit lane from the centre line (negative = right). */
  lane: number;
  /** Distance along the lap where the lane begins to leave the road, where it is fully apart, where it starts to come back and where it is back. */
  enter: [number, number];
  exit: [number, number];
  /** Where the car stops. */
  box: number;
}

export interface DriverFrame {
  input: Input;
  /** Where the driver is, for the race to read back. */
  s: number;
  d: number;
}

/**
 * Follows a racing line with a pure-pursuit steering controller and a speed profile, makes room for
 * traffic, and can run the pit lane. The same controller drives the "auto" pit stop for human drivers.
 */
export class Driver {
  hint = -1;
  private side = 0;
  private extra = 0;
  /** Offset from the line being used to get past a slower car, metres. */
  private integral = 0;
  /** Smoothed pedal output: a real driver does not move the pedals in steps. */
  private pedalOut = 0;

  constructor(
    private track: Track,
    public plan: Plan,
    public opts: DriverOptions,
  ) {}

  /**
   * @param pit when set, the driver follows the pit lane instead of the racing line.
   * @param speedCap extra upper bound on speed (pit limiter).
   * @param gripScale how the current grip compares to what the plan assumed.
   */
  /** Extra offset from the line, metres, set by the race (the grid slot fading out after the start). */
  bias = 0;

  drive(c: CarState, dt: number, traffic: Obstacle[], gripScale: number, pit?: { path: PitPath; stop: boolean; limit: number }): DriverFrame {
    const t = this.track;
    const near = nearest(t, c.x, c.y, this.hint);
    this.hint = near.i;
    const V = Math.hypot(c.u, c.v);
    const s = near.s;

    // ---- traffic: pick a side and a lateral offset
    let wantExtra = 0;
    let follow = Infinity;
    // Intelligent-driver-model braking for the car directly in front.
    let aInt = 0;
    for (const o of traffic) {
      const ahead = gap(t, s, o.s);
      if (ahead < -6 || ahead > 38) continue;
      const lateral = o.d - near.d;
      if (Math.abs(lateral) > 2.4) continue;
      const room = t.width / 2 - 1.4;
      // Move to the side with more room, and stick to it.
      if (this.side === 0) this.side = o.d + near.d > 0 ? -1 : 1;
      const target = this.side * 3.2;
      wantExtra = Math.abs(near.d + target) <= room + 1 ? target : -target;
      if (ahead > 0 && ahead < 45 && Math.abs(lateral) < 2.0) {
        const gapM = Math.max(0.5, ahead - 4.8);
        const sStar = 2.5 + V * 0.55 + (V * Math.max(0, V - o.speed)) / 38;
        aInt = Math.min(aInt, -12 * (sStar / gapM) ** 2);
      }
    }
    if (wantExtra === 0) this.side = 0;
    this.extra += Math.max(-2.2 * dt, Math.min(2.2 * dt, wantExtra - this.extra));

    // ---- where to aim
    const ld = Math.min(48, Math.max(9, 7 + 0.32 * V));
    const sT = s + ld;
    const base = trackAt(t, sT);
    let off = sampleAt(this.plan.off, t.ds, sT, t.length) + this.extra + this.bias;
    let speedCap = Infinity;
    if (pit) {
      off = pitOffset(t, pit.path, sT);
      speedCap = pit.limit;
    }
    const limit = t.width / 2 - 1.2;
    if (!pit) off = Math.max(-limit, Math.min(limit, off));
    const tx = base.x + base.nx * off;
    const ty = base.y + base.ny * off;
    const dx = tx - c.x;
    const dy = ty - c.y;
    const bearing = Math.atan2(dy, dx);
    let eta = bearing - c.psi;
    while (eta > Math.PI) eta -= 2 * Math.PI;
    while (eta < -Math.PI) eta += 2 * Math.PI;
    const dist = Math.max(4, Math.hypot(dx, dy));
    let delta = Math.atan2(2 * (CAR.wheelbase) * Math.sin(eta), dist);
    // Counter a slide: steer against yaw that the line doesn't ask for.
    const kappa = sampleAt(this.plan.kappa, t.ds, s, t.length);
    const wanted = V * kappa;
    delta += 0.05 * (wanted - c.r) * Math.min(1, V / 30);
    delta = Math.max(-MAX_STEER, Math.min(MAX_STEER, delta));

    // ---- how fast
    const look = Math.max(0.12 * V, 2);
    let vTarget = sampleAt(this.plan.v, t.ds, s + look, t.length);
    vTarget *= this.opts.skill * Math.sqrt(Math.max(0.3, gripScale));
    // Slow for a corner that needs more steering than the car can give.
    vTarget = Math.min(vTarget, speedCap, follow);

    let throttle = 0;
    let brake = 0;
    const err = vTarget - V;
    if (err > 0) throttle = Math.min(1, 0.25 + err / 2.5);
    else if (err < -0.4) brake = Math.min(1, -err / 5);
    else throttle = Math.max(0, 0.25 + err / 2);

    if (aInt < -2.5) {
      throttle = 0;
      brake = Math.max(brake, Math.min(1, -aInt / 38));
    }
    void follow;
    if (pit?.stop) {
      // Hold the car on the box.
      throttle = 0;
      brake = 1;
    }
    this.integral = 0;
    // The pedals move smoothly, within about 70 ms (a stab of brake is quicker), and one pedal signal stops
    // throttle and brake fighting each other. The wheel is not filtered: lag in the steering loop makes it weave.
    const want = throttle - brake;
    const kp = 1 - Math.exp(-dt / (want < this.pedalOut - 0.2 ? 0.03 : 0.07));
    this.pedalOut += (want - this.pedalOut) * kp;
    if (pit?.stop) this.pedalOut = -1;
    throttle = Math.max(0, this.pedalOut);
    brake = Math.max(0, -this.pedalOut);
    return {
      input: { throttle, brake, steer: delta / MAX_STEER, drs: false, steerAssist: false, tractionControl: true },
      s,
      d: near.d,
    };
  }
}

/** Offset (from the centre line) the pit lane asks for at distance s. */
export function pitOffset(t: Track, p: PitPath, s: number): number {
  const L = t.length;
  // Work in a frame where the lap starts a little before the pit entry.
  const rel = (x: number) => wrapS(t, x - p.enter[0] + 50);
  const r = rel(s);
  const a0 = rel(p.enter[0]);
  const a1 = rel(p.enter[1]);
  const b0 = rel(p.exit[0]);
  const b1 = rel(p.exit[1]);
  void L;
  if (r < a0) return 0;
  if (r < a1) return p.lane * smooth((r - a0) / (a1 - a0));
  if (r < b0) return p.lane;
  if (r < b1) return p.lane * (1 - smooth((r - b0) / (b1 - b0)));
  return 0;
}

const smooth = (x: number) => x * x * (3 - 2 * x);
