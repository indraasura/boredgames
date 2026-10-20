import { Rng } from "@boredgames/engine";
import { Driver, pitOffset, type Obstacle, type PitPath } from "./ai";
import { CAR, COMPOUNDS, DEFAULT_SETUP, TEAMS, clampSetup, randomSetup, tune, type Compound, type Setup, type Team, type Tuned } from "./car";
import { planFor, racingOffsets, type Plan } from "./line";
import { DT, newCar, stepCar, type CarState, type Env, type Input } from "./physics";
import { surfaceFor, WALL } from "./surface";
import { gap, getTrack, nearest, trackAt, wrapS, type Track } from "./track";
import { airDensity, startingWeather, stepWeather, type WeatherChoice, type WeatherState } from "./weather";

export type Difficulty = "easy" | "medium" | "hard";
export type Mode = "free" | "race";

export interface Entry {
  id: string;
  name: string;
  team: Team;
  setup: Setup;
  compound: Compound;
  /** Driven by a person on this computer. */
  human: boolean;
  /** Driven by a person on another computer: the car is placed from their snapshots. */
  remote?: boolean;
}

export interface RaceConfig {
  mode: Mode;
  track: string;
  /** 0 for free ride. */
  laps: number;
  weather: WeatherChoice;
  difficulty: Difficulty;
  entries: Entry[];
  seed: number;
}

export type PitState = "none" | "in" | "stopped" | "out";

export interface RaceCar {
  id: string;
  entry: Entry;
  tuned: Tuned;
  state: CarState;
  input: Input;
  driver: Driver | null;
  remote: boolean;
  /** Distance travelled from the start line, metres; negative on the grid. */
  dist: number;
  s: number;
  d: number;
  nearIdx: number;
  lap: number;
  lapStart: number;
  lastLap: number;
  bestLap: number;
  lapValid: boolean;
  /** Time for the sectors of the current lap and the best ones. */
  sectors: number[];
  finished: boolean;
  finishTime: number;
  position: number;
  offTrack: boolean;
  pit: PitState;
  pitRequest: boolean;
  pitCompound: Compound;
  pitTimer: number;
  pitStops: number;
  drsEnabled: boolean;
  stuck: number;
  /** Gap to the car in front, seconds. */
  gapAhead: number;
  /** Rolling lap history. */
  laps: number[];
  /** Seconds of respawn freeze left. */
  frozen: number;
  /** Impact strength for sound and camera, decays. */
  impact: number;
  skill: number;
  /** Grid slot offset from the centre line. */
  gridLat: number;
}

export type RaceEvent =
  | { type: "lights"; count: number }
  | { type: "green" }
  | { type: "lap"; car: string; time: number; best: boolean; lap: number }
  | { type: "finish"; car: string; position: number }
  | { type: "pit"; car: string; what: "in" | "stopped" | "out" }
  | { type: "weather"; kind: string }
  | { type: "impact"; car: string; strength: number }
  | { type: "over" };

export const PIT_LIMIT = 22;
export const PIT_STOP_TIME = 2.4;
const PIT_ENTRY = 560;
const PIT_LANE_END = 300;

const offsetCache = new WeakMap<Track, Float64Array>();
export function offsetsFor(t: Track): Float64Array {
  let o = offsetCache.get(t);
  if (!o) {
    o = racingOffsets(t);
    offsetCache.set(t, o);
  }
  return o;
}

export function pitPathFor(t: Track): PitPath {
  const L = t.length;
  return {
    lane: -(t.width / 2 + 4.5),
    enter: [L - 230, L - 110],
    exit: [PIT_LANE_END - 120, PIT_LANE_END],
    box: 40,
  };
}

/** Box position along the lap for a car, so teams stop at their own garage. */
export function boxFor(t: Track, teamIndex: number): number {
  return 24 + teamIndex * 13;
}

const freshInput = (): Input => ({ throttle: 0, brake: 0, steer: 0, drs: false, steerAssist: false, tractionControl: false });

const SKILL: Record<Difficulty, [number, number]> = { easy: [0.78, 0.88], medium: [0.88, 0.95], hard: [0.95, 1.0] };

/** Lap fuel for a race: enough to finish plus a little. */
export function raceFuel(track: Track, laps: number): number {
  if (laps <= 0) return 45;
  return Math.min(CAR.maxFuel, laps * (track.length / 1000) * 0.34 + 2);
}

export class Race {
  readonly track: Track;
  readonly cars: RaceCar[] = [];
  readonly weather: WeatherState;
  env: Env;
  time = 0;
  /** Time since the lights-out moment (negative before). */
  raceTime = 0;
  phase: "grid" | "lights" | "racing" | "finished" = "grid";
  lights = 0;
  events: RaceEvent[] = [];
  /** Seconds the race has left before the field is classified after the winner takes the flag. */
  private endTimer = -1;
  private lightsAt = 0;
  private holdUntil = 0;
  private rng: Rng;
  private plans = new Map<string, Plan>();
  private pit: PitPath;
  private winnerFinished = false;

  constructor(readonly config: RaceConfig) {
    this.track = getTrack(config.track);
    this.rng = new Rng(config.seed);
    this.weather = startingWeather(config.weather, () => this.rng.next());
    this.env = this.makeEnv();
    this.pit = pitPathFor(this.track);
    const fuel = raceFuel(this.track, config.laps);
    config.entries.forEach((e, i) => this.addCar(e, i, fuel));
    this.phase = config.mode === "free" ? "racing" : "grid";
    if (config.mode === "free") {
      this.raceTime = 0;
      for (const c of this.cars) c.lapStart = 0;
    }
    this.holdUntil = 3;
    this.rank();
  }

  private makeEnv(): Env {
    return { rho: airDensity(this.track.altitude, this.weather.air), wetness: this.weather.wetness, trackTemp: this.weather.track };
  }

  private addCar(entry: Entry, index: number, fuel: number) {
    const t = this.track;
    const free = this.config.mode === "free";
    // Grid: two columns, staggered. In free ride the car starts on the line, ready to go.
    const row = Math.floor(index / 2);
    const side = index % 2 === 0 ? -1 : 1;
    const s0 = free ? 0 : -(10 + row * 9) - (side > 0 ? 4 : 0);
    const lat = free ? 0 : side * 2.6;
    const p = trackAt(t, wrapS(t, s0));
    const x = p.x + p.nx * lat;
    const y = p.y + p.ny * lat;
    const tuned = tune(entry.team, entry.setup);
    const state = newCar(x, y, p.heading, entry.compound, fuel, 78);
    const skills = SKILL[this.config.difficulty];
    const skill = skills[0] + (skills[1] - skills[0]) * this.rng.next();
    const remote = !!entry.remote;
    const car: RaceCar = {
      id: entry.id,
      entry,
      tuned,
      state,
      input: freshInput(),
      driver: null,
      remote,
      dist: s0,
      s: wrapS(t, s0),
      d: lat,
      nearIdx: -1,
      lap: 0,
      lapStart: 0,
      lastLap: 0,
      bestLap: 0,
      lapValid: true,
      sectors: [],
      finished: false,
      finishTime: 0,
      position: index + 1,
      offTrack: false,
      pit: "none",
      pitRequest: false,
      pitCompound: entry.compound,
      pitTimer: 0,
      pitStops: 0,
      drsEnabled: free,
      stuck: 0,
      gapAhead: 0,
      laps: [],
      frozen: 0,
      impact: 0,
      skill,
      gridLat: lat,
    };
    if (!entry.human && !remote) car.driver = new Driver(t, this.planFor(car), { skill, aggression: 0.5 });
    this.cars.push(car);
  }

  private planFor(c: RaceCar): Plan {
    const key = `${c.entry.team.id}|${c.state.compound}|${Math.round(this.weather.wetness * 10)}|${Math.round(c.state.fuel / 15)}`;
    let p = this.plans.get(key);
    if (!p) {
      p = planFor(this.track, c.tuned, c.state.compound, this.weather.wetness, this.env.rho, Math.max(5, c.state.fuel * 0.6), 0.93, offsetsFor(this.track));
      this.plans.set(key, p);
    }
    return p;
  }

  get human(): RaceCar[] {
    return this.cars.filter((c) => c.entry.human);
  }

  drain(): RaceEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ------------------------------------------------------------------- step

  step(dt = DT) {
    this.time += dt;
    stepWeather(this.weather, this.time, dt);
    this.env = this.makeEnv();

    if (this.phase === "grid") {
      if (this.time >= this.holdUntil) {
        this.phase = "lights";
        this.lightsAt = this.time;
        this.lights = 0;
        this.holdUntil = this.time + 5 + 0.5 + this.rng.next() * 1.8;
      }
    } else if (this.phase === "lights") {
      const n = Math.min(5, Math.floor(this.time - this.lightsAt) + 1);
      if (n !== this.lights && n <= 5) {
        this.lights = n;
        this.events.push({ type: "lights", count: n });
      }
      if (this.time >= this.holdUntil) {
        this.phase = "racing";
        this.lights = 0;
        this.raceTime = 0;
        this.events.push({ type: "green" });
        for (const c of this.cars) c.lapStart = 0;
      }
    } else {
      this.raceTime += dt;
    }

    const racing = this.phase === "racing" || this.phase === "finished";
    for (const c of this.cars) {
      if (c.remote) this.stepRemote(c, dt);
      else this.stepLocal(c, dt, racing);
    }
    this.collide();
    this.rank();
    this.updateGaps();

    if (this.phase === "racing" && this.config.mode === "race") {
      if (this.winnerFinished) {
        this.endTimer -= dt;
        if (this.endTimer <= 0 || this.cars.every((c) => c.finished)) {
          this.phase = "finished";
          this.events.push({ type: "over" });
        }
      }
    }
  }

  private stepRemote(c: RaceCar, dt: number) {
    // Dead reckoning between snapshots.
    const s = c.state;
    const cp = Math.cos(s.psi);
    const sp = Math.sin(s.psi);
    s.x += (s.u * cp - s.v * sp) * dt;
    s.y += (s.u * sp + s.v * cp) * dt;
    s.psi += s.r * dt;
  }

  private stepLocal(c: RaceCar, dt: number, racing: boolean) {
    const t = this.track;
    const s = c.state;
    const near = nearest(t, s.x, s.y, c.nearIdx);
    c.nearIdx = near.i;
    c.s = near.s;
    c.d = near.d;
    const laneOff = pitOffset(t, this.pit, near.s);
    const surf = surfaceFor(t, s, c.tuned, near, this.env.wetness, Math.abs(laneOff) > 0.3 ? laneOff : null);
    c.offTrack = surf.offTrack;
    // A lap does not count once the whole car is beyond the white line.
    if (Math.abs(near.d) > t.width / 2 + 0.9 && this.phase === "racing") c.lapValid = false;

    // ---- progress and lap timing
    const delta = gap(t, wrapS(t, c.dist), near.s);
    const before = c.dist;
    c.dist += delta;
    if (racing) this.lapCrossings(c, before, c.dist);

    // ---- what the car is asked to do
    let input: Input;
    const lockedOnGrid = this.phase !== "racing" && this.config.mode === "race";
    if (c.frozen > 0) {
      c.frozen -= dt;
      input = { ...freshInput(), brake: 1 };
    } else if (lockedOnGrid) {
      input = { ...freshInput(), brake: 1 };
    } else if (c.finished) {
      // Cool-down lap: drive on gently.
      input = this.autopilot(c, dt, 45, true);
    } else if (c.pit !== "none") {
      input = this.pitDrive(c, dt);
    } else if (c.driver) {
      input = this.aiDrive(c, dt);
    } else {
      input = c.input;
      this.checkPitEntry(c);
    }

    // ---- DRS: opens on straights when allowed
    this.updateDrs(c, before, c.dist);
    const drs = input.drs && c.drsEnabled && this.inDrsZone(c.s);
    stepCar(s, c.tuned, { ...input, drs }, this.env, surf.grip, surf.drag, dt);

    // ---- barrier
    if (surf.wall) this.hitWall(c, near.d, near.i);
    if (c.impact > 0) c.impact = Math.max(0, c.impact - dt * 2);

    // ---- stuck? put the car back
    const V = Math.hypot(s.u, s.v);
    let ang = s.psi - t.heading[near.i]!;
    while (ang > Math.PI) ang -= 2 * Math.PI;
    while (ang < -Math.PI) ang += 2 * Math.PI;
    const wrong = Math.abs(ang) > 1.9;
    if (racing && c.pit !== "stopped" && !c.finished && V < 2.5 && (surf.offTrack || wrong || surf.wall)) c.stuck += dt;
    else if (V > 6) c.stuck = 0;
    if (c.stuck > 4) this.respawn(c);
  }

  /** Put a car back on the track facing the right way. */
  respawn(c: RaceCar) {
    const t = this.track;
    const p = trackAt(t, c.s);
    const s = c.state;
    s.x = p.x;
    s.y = p.y;
    s.psi = p.heading;
    s.u = 0;
    s.v = 0;
    s.r = 0;
    s.delta = 0;
    s.gear = 1;
    c.stuck = 0;
    c.frozen = 3;
    c.lapValid = false;
    c.nearIdx = -1;
    if (c.driver) c.driver.hint = -1;
  }

  private hitWall(c: RaceCar, d: number, i: number) {
    const t = this.track;
    const s = c.state;
    const side = d > 0 ? 1 : -1;
    const limit = t.width / 2 + WALL;
    const nx = t.nx[i]! * side;
    const ny = t.ny[i]! * side;
    // Push back inside the wall.
    const over = Math.abs(d) - limit;
    s.x -= nx * (over + 0.2);
    s.y -= ny * (over + 0.2);
    const cp = Math.cos(s.psi);
    const sp = Math.sin(s.psi);
    let vx = s.u * cp - s.v * sp;
    let vy = s.u * sp + s.v * cp;
    const vn = vx * nx + vy * ny;
    if (vn > 0) {
      const speedBefore = Math.hypot(vx, vy);
      vx -= nx * vn * 1.25;
      vy -= ny * vn * 1.25;
      vx *= 0.6;
      vy *= 0.6;
      s.u = vx * cp + vy * sp;
      s.v = -vx * sp + vy * cp;
      s.r *= 0.5;
      const strength = Math.min(1, vn / 30);
      c.impact = Math.max(c.impact, strength);
      if (vn > 4) this.events.push({ type: "impact", car: c.id, strength });
      void speedBefore;
    }
  }

  // ------------------------------------------------------------ timing

  private lapCrossings(c: RaceCar, before: number, after: number) {
    const L = this.track.length;
    // Sector splits at one third and two thirds.
    const bl = Math.floor(before / L);
    const al = Math.floor(after / L);
    if (after > before && al > bl && al >= 1) {
      const completed = al; // laps completed
      const time = this.raceTime - c.lapStart;
      c.lastLap = time;
      c.laps.push(time);
      const best = c.lapValid && (c.bestLap === 0 || time < c.bestLap);
      if (best) c.bestLap = time;
      this.events.push({ type: "lap", car: c.id, time, best, lap: completed });
      c.lapStart = this.raceTime;
      c.lapValid = true;
      c.sectors = [];
      c.lap = completed;
      if (this.config.mode === "race" && this.config.laps > 0 && completed >= this.config.laps && !c.finished) {
        c.finished = true;
        c.finishTime = this.raceTime;
        const pos = this.cars.filter((o) => o.finished).length;
        this.events.push({ type: "finish", car: c.id, position: pos });
        if (!this.winnerFinished) {
          this.winnerFinished = true;
          this.endTimer = this.cars.some((o) => o.entry.human && !o.finished) ? 60 : 30;
        }
      }
    }
  }

  private rank() {
    const order = [...this.cars].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      return b.dist - a.dist;
    });
    order.forEach((c, i) => (c.position = i + 1));
  }

  /** Seconds to the car in front, from distance and speed. */
  private updateGaps() {
    const order = [...this.cars].sort((a, b) => a.position - b.position);
    for (let i = 0; i < order.length; i++) {
      const c = order[i]!;
      if (i === 0) {
        c.gapAhead = 0;
        continue;
      }
      const ahead = order[i - 1]!;
      const dd = ahead.dist - c.dist;
      const v = Math.max(15, Math.hypot(c.state.u, c.state.v));
      c.gapAhead = Math.max(0, dd / v);
    }
  }

  // --------------------------------------------------------------- DRS

  inDrsZone(s: number): boolean {
    for (const z of this.track.drs) {
      if (z.end > z.start ? s >= z.start && s <= z.end : s >= z.start || s <= z.end) return true;
    }
    return false;
  }

  private updateDrs(c: RaceCar, before: number, after: number) {
    if (this.config.mode === "free") {
      c.drsEnabled = true;
      return;
    }
    const L = this.track.length;
    for (const z of this.track.drs) {
      const b = wrapS(this.track, before);
      const a = wrapS(this.track, after);
      const crossed = (b < z.start && a >= z.start) || (z.start < b && a < b && z.start <= a);
      if (crossed && after > before) {
        // Detection: within a second of the car in front when the zone begins; not on the first two laps.
        const ahead = this.cars.find((o) => o.position === c.position - 1);
        c.drsEnabled = !!ahead && c.gapAhead < 1.0 && after > 2 * L;
      }
    }
    if (!this.inDrsZone(c.s)) c.drsEnabled = false;
  }

  // ------------------------------------------------------------- driving

  private traffic(c: RaceCar): Obstacle[] {
    const out: Obstacle[] = [];
    for (const o of this.cars) {
      if (o === c || o.pit !== "none") continue;
      const a = gap(this.track, c.s, o.s);
      if (a > -6 && a < 40) out.push({ s: o.s, d: o.d, speed: Math.hypot(o.state.u, o.state.v) });
    }
    return out;
  }

  private gripScale(c: RaceCar): number {
    const comp = COMPOUNDS[c.state.compound];
    const w = c.state.wear;
    const avgWear = (w[0]! + w[1]! + w[2]! + w[3]!) / 4;
    const temp = (c.state.temp[0]! + c.state.temp[1]! + c.state.temp[2]! + c.state.temp[3]!) / 4;
    const x = (temp - comp.optTemp) / comp.tempWindow;
    const tempF = Math.max(0.6, 1 - 0.25 * x * x);
    const wearF = 1 - 0.22 * avgWear - 3 * Math.max(0, avgWear - 0.75) ** 2;
    return tempF * wearF;
  }

  private aiDrive(c: RaceCar, dt: number): Input {
    const d = c.driver!;
    // Re-plan if the car's tyres or the weather changed enough to matter.
    const plan = this.planFor(c);
    if (plan !== d.plan) d.plan = plan;
    // A computer driver that gets on the wrong tyres for the conditions is slow, as it would be.
    d.bias = this.config.mode === "race" ? c.gridLat * Math.max(0, 1 - Math.max(0, c.dist) / 320) : 0;
    const frame = d.drive(c.state, dt, this.traffic(c), this.gripScale(c), undefined);
    this.aiPitCall(c);
    this.checkPitEntry(c);
    const input = frame.input;
    input.drs = c.drsEnabled;
    return input;
  }

  private aiPitCall(c: RaceCar) {
    if (c.pitRequest || c.pit !== "none" || this.config.mode !== "race") return;
    const w = c.state.wear;
    const maxWear = Math.max(w[0]!, w[1]!, w[2]!, w[3]!);
    const wet = this.weather.wetness;
    const comp = c.state.compound;
    const wrongTyre = (wet > 0.55 && comp !== "wet") || (wet > 0.2 && wet <= 0.55 && comp !== "inter" && comp !== "wet") || (wet < 0.08 && (comp === "inter" || comp === "wet"));
    const lapsLeft = this.config.laps - c.lap;
    if ((maxWear > 0.62 && lapsLeft > 2) || (wrongTyre && lapsLeft > 1 && this.raceTime > 20)) {
      c.pitRequest = true;
      if (wet > 0.55) c.pitCompound = "wet";
      else if (wet > 0.15) c.pitCompound = "inter";
      else c.pitCompound = lapsLeft > 12 ? "medium" : lapsLeft > 6 ? "hard" : "soft";
    }
  }

  /** When a stop is called, the car hands over to the pit lane as it reaches the entry. */
  private checkPitEntry(c: RaceCar) {
    if (!c.pitRequest || c.pit !== "none") return;
    const L = this.track.length;
    const into = wrapS(this.track, c.s - (L - PIT_ENTRY));
    if (into < 60) {
      c.pit = "in";
      c.pitRequest = false;
      this.events.push({ type: "pit", car: c.id, what: "in" });
    }
  }

  private pitDrive(c: RaceCar, dt: number): Input {
    const t = this.track;
    const path = this.pit;
    const team = TEAMS.findIndex((x) => x.id === c.entry.team.id);
    const box = boxFor(t, Math.max(0, team));
    const drv = this.pitDriver(c);
    const delta = gap(t, c.s, box);
    const V = Math.hypot(c.state.u, c.state.v);
    let stop = false;
    if (c.pit === "in") {
      // Slow down smoothly: the limit falls away to the lane speed by the time the lane begins.
      const toLane = gap(t, c.s, path.enter[0]);
      const limit = toLane > 0 && toLane < PIT_ENTRY ? Math.sqrt(PIT_LIMIT * PIT_LIMIT + 2 * 11 * toLane) : PIT_LIMIT;
      // Roll up to the box and stop on it. If the car runs past, it stops where it is.
      const approach = delta > 0 ? Math.sqrt(2 * 8 * Math.max(0, delta - 2)) + 1 : 0;
      if ((delta < 1.5 && V < 3) || delta < -3) {
        c.pit = "stopped";
        c.pitTimer = PIT_STOP_TIME;
        this.events.push({ type: "pit", car: c.id, what: "stopped" });
      }
      const f = drv.drive(c.state, dt, [], 1, { path, stop: delta < 1.5 || delta < -3, limit: Math.min(limit, approach) });
      return f.input;
    }
    if (c.pit === "stopped") {
      c.pitTimer -= dt;
      if (c.pitTimer <= 0) {
        // Fresh tyres. A real stop also refuels in this game: top up to what the race needs.
        const s = c.state;
        s.compound = c.pitCompound;
        s.wear = [0, 0, 0, 0];
        s.temp = [72, 72, 72, 72];
        c.pitStops++;
        c.pit = "out";
        this.events.push({ type: "pit", car: c.id, what: "out" });
        if (c.driver) c.driver.plan = this.planFor(c);
      }
      const f = drv.drive(c.state, dt, [], 1, { path, stop: true, limit: PIT_LIMIT });
      return f.input;
    }
    // Leaving
    const f = drv.drive(c.state, dt, [], 1, { path, stop: false, limit: PIT_LIMIT });
    const out = wrapS(t, c.s - path.exit[0]);
    if (out > 130 && out < t.length / 2) c.pit = "none";
    return f.input;
  }

  private pitDrivers = new Map<string, Driver>();
  private pitDriver(c: RaceCar): Driver {
    let d = this.pitDrivers.get(c.id);
    if (!d) {
      d = new Driver(this.track, c.driver?.plan ?? this.planFor(c), { skill: 1, aggression: 0 });
      this.pitDrivers.set(c.id, d);
    }
    d.plan = c.driver?.plan ?? this.planFor(c);
    return d;
  }

  /** Drive a car round gently (after the flag). */
  private autopilot(c: RaceCar, dt: number, limit: number, _gentle: boolean): Input {
    const d = this.pitDriver(c);
    const f = d.drive(c.state, dt, [], 1, { path: { ...this.pit, lane: 0 }, stop: false, limit });
    return f.input;
  }

  // ----------------------------------------------------------- collisions

  private collide() {
    const cars = this.cars;
    const n = cars.length;
    for (let i = 0; i < n; i++) {
      const A = cars[i]!;
      if (A.pit !== "none") continue;
      for (let j = i + 1; j < n; j++) {
        const B = cars[j]!;
        if (B.pit !== "none") continue;
        if (A.remote && B.remote) continue;
        const dx = A.state.x - B.state.x;
        const dy = A.state.y - B.state.y;
        if (dx * dx + dy * dy > 36) continue;
        this.collidePair(A, B);
      }
    }
  }

  private collidePair(A: RaceCar, B: RaceCar) {
    const centres = (c: RaceCar) => {
      const s = c.state;
      const cp = Math.cos(s.psi);
      const sp = Math.sin(s.psi);
      return [1.7, 0, -1.7].map((o) => ({ x: s.x + cp * o, y: s.y + sp * o }));
    };
    const ca = centres(A);
    const cb = centres(B);
    const R = 0.95;
    let best = 0;
    let nx = 0;
    let ny = 0;
    for (const a of ca) {
      for (const b of cb) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        const pen = 2 * R - d;
        if (pen > best && d > 1e-6) {
          best = pen;
          nx = dx / d;
          ny = dy / d;
        }
      }
    }
    if (best <= 0) return;
    const sa = A.state;
    const sb = B.state;
    const va = { x: sa.u * Math.cos(sa.psi) - sa.v * Math.sin(sa.psi), y: sa.u * Math.sin(sa.psi) + sa.v * Math.cos(sa.psi) };
    const vb = { x: sb.u * Math.cos(sb.psi) - sb.v * Math.sin(sb.psi), y: sb.u * Math.sin(sb.psi) + sb.v * Math.cos(sb.psi) };
    const vn = (va.x - vb.x) * nx + (va.y - vb.y) * ny;
    // Equal masses: each car takes half the push and half the bounce, wherever the other car is simulated.
    const apply = (c: RaceCar, sign: number, v: { x: number; y: number }) => {
      if (c.remote) return;
      const s = c.state;
      s.x += sign * nx * best * 0.5;
      s.y += sign * ny * best * 0.5;
      if (vn < 0) {
        const j = 0.5 * 1.25 * -vn;
        const nvx = v.x + sign * nx * j;
        const nvy = v.y + sign * ny * j;
        const cp = Math.cos(s.psi);
        const sp = Math.sin(s.psi);
        s.u = nvx * cp + nvy * sp;
        s.v = -nvx * sp + nvy * cp;
        c.impact = Math.max(c.impact, Math.min(1, -vn / 20));
        if (-vn > 3) this.events.push({ type: "impact", car: c.id, strength: Math.min(1, -vn / 20) });
      }
    };
    apply(A, 1, va);
    apply(B, -1, vb);
  }

  // ------------------------------------------------------------ network

  /** Place a remote car from a snapshot. */
  applySnapshot(id: string, snap: CarSnapshot) {
    const c = this.cars.find((x) => x.id === id);
    if (!c || !c.remote) return;
    const s = c.state;
    const k = 0.45;
    s.x += (snap.x - s.x) * k;
    s.y += (snap.y - s.y) * k;
    let dp = snap.psi - s.psi;
    while (dp > Math.PI) dp -= 2 * Math.PI;
    while (dp < -Math.PI) dp += 2 * Math.PI;
    s.psi += dp * k;
    s.u = snap.u;
    s.v = snap.v;
    s.r = snap.r;
    s.delta = snap.delta;
    s.rpm = snap.rpm;
    s.gear = snap.gear;
    s.compound = snap.compound;
    s.drs = snap.drs;
    s.throttle = snap.throttle;
    s.brake = snap.brake;
    s.temp = snap.temp;
    s.wear = snap.wear;
    c.dist = snap.dist;
    c.s = wrapS(this.track, snap.dist);
    c.lap = snap.lap;
    c.lastLap = snap.lastLap;
    c.bestLap = snap.bestLap;
    c.finished = snap.finished;
    c.finishTime = snap.finishTime;
    c.pit = snap.pit;
    c.impact = snap.impact;
    c.offTrack = snap.off;
    if (c.finished && !this.winnerFinished) {
      this.winnerFinished = true;
      this.endTimer = this.cars.some((o) => o.entry.human && !o.finished) ? 60 : 30;
    }
  }

  snapshot(c: RaceCar): CarSnapshot {
    const s = c.state;
    return {
      x: s.x,
      y: s.y,
      psi: s.psi,
      u: s.u,
      v: s.v,
      r: s.r,
      delta: s.delta,
      rpm: s.rpm,
      gear: s.gear,
      compound: s.compound,
      drs: s.drs,
      throttle: s.throttle,
      brake: s.brake,
      temp: s.temp,
      wear: s.wear,
      dist: c.dist,
      lap: c.lap,
      lastLap: c.lastLap,
      bestLap: c.bestLap,
      finished: c.finished,
      finishTime: c.finishTime,
      pit: c.pit,
      impact: c.impact,
      off: c.offTrack,
    };
  }

  /** Mark a remote player as gone: the computer takes the wheel. */
  takeOver(id: string) {
    const c = this.cars.find((x) => x.id === id);
    if (!c || !c.remote) return;
    c.remote = false;
    c.entry = { ...c.entry, remote: false, human: false };
    c.driver = new Driver(this.track, this.planFor(c), { skill: 0.9, aggression: 0.4 });
    c.nearIdx = -1;
  }

  /** Ask a car to make a pit stop at the end of the lap. */
  requestPit(c: RaceCar, compound: Compound) {
    if (c.pit !== "none") return;
    c.pitRequest = !c.pitRequest || c.pitCompound !== compound;
    c.pitCompound = compound;
  }

  setup(entry: Entry): Setup {
    return clampSetup(entry.setup ?? DEFAULT_SETUP);
  }
}

export interface CarSnapshot {
  x: number;
  y: number;
  psi: number;
  u: number;
  v: number;
  r: number;
  delta: number;
  rpm: number;
  gear: number;
  compound: Compound;
  drs: boolean;
  throttle: number;
  brake: number;
  temp: number[];
  wear: number[];
  dist: number;
  lap: number;
  lastLap: number;
  bestLap: number;
  finished: boolean;
  finishTime: number;
  pit: PitState;
  impact: number;
  off: boolean;
}

/** Entries for a field of computer drivers, filling the grid after the people. */
export function fillGrid(humans: Entry[], total: number, seed: number, weather: WeatherChoice): Entry[] {
  const rng = new Rng(seed ^ 0x9e3779b9);
  const out = [...humans];
  const teamsUsed = new Map<string, number>();
  for (const e of humans) teamsUsed.set(e.team.id, (teamsUsed.get(e.team.id) ?? 0) + 1);
  const names = [...DRIVER_NAMES_SHUFFLED(rng)];
  let k = 0;
  while (out.length < total) {
    // Each team gets two cars before anyone gets three.
    const team = [...TEAMS].sort((a, b) => (teamsUsed.get(a.id) ?? 0) - (teamsUsed.get(b.id) ?? 0) || rng.next() - 0.5)[0]!;
    teamsUsed.set(team.id, (teamsUsed.get(team.id) ?? 0) + 1);
    const wet = weather === "rain" || weather === "storm";
    const damp = weather === "drizzle";
    const compound: Compound = wet ? (weather === "storm" ? "wet" : "wet") : damp ? "inter" : (["soft", "medium", "hard"] as const)[rng.int(0, 2)]!;
    out.push({
      id: `ai-${k}`,
      name: names[k % names.length]!,
      team,
      setup: clampSetup({ ...randomSetup(() => rng.next()), brakeBias: 0.575 + (rng.next() - 0.5) * 0.04 }),
      compound,
      human: false,
    });
    k++;
  }
  return out;
}

import { DRIVER_NAMES } from "./car";
function DRIVER_NAMES_SHUFFLED(rng: Rng): string[] {
  const a = [...DRIVER_NAMES];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
