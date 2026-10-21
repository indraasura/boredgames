import {
  COMPOUND_LIST,
  COMPOUNDS,
  DT,
  Race,
  WEATHERS,
  gap,
  trackAt,
  type AidLevel,
  type Compound,
  type PitState,
  type RaceCar,
  type RaceConfig,
  type RaceEvent,
  type Track,
} from "@boredgames/f1";
import { F1Audio } from "./audio";
import { Controls, type Action } from "./controls";
import type { F1Msg, Net } from "./net";
import { F1Scene, styleFor, type CameraMode, type CarFrame } from "./scene/F1Scene";

export interface HudRow {
  id: string;
  name: string;
  color: string;
  position: number;
  /** Seconds behind the leader, and behind the car in front. */
  gap: number;
  interval: number;
  lap: number;
  pit: PitState;
  compound: Compound;
  finished: boolean;
  bestLap: number;
  me: boolean;
}

export interface Message {
  id: number;
  text: string;
  tone: "info" | "good" | "bad";
}

export interface ResultRow {
  id: string;
  name: string;
  color: string;
  position: number;
  time: number;
  gap: number;
  bestLap: number;
  stops: number;
  finished: boolean;
  laps: number;
  me: boolean;
}

export interface Hud {
  phase: Race["phase"];
  lights: number;
  mode: RaceConfig["mode"];
  laps: number;
  lap: number;
  position: number;
  total: number;
  raceTime: number;
  speed: number;
  gear: number;
  rpm: number;
  throttle: number;
  brake: number;
  drsAvailable: boolean;
  drsOpen: boolean;
  ers: number;
  fuel: number;
  compound: Compound;
  temp: number[];
  wear: number[];
  lapTime: number;
  lastLap: number;
  bestLap: number;
  fastestLap: number;
  lapValid: boolean;
  offTrack: boolean;
  wrongWay: boolean;
  pit: PitState;
  pitRequested: boolean;
  pitCompound: Compound;
  pitStops: number;
  standings: HudRow[];
  weather: { kind: string; icon: string; name: string; wetness: number; rain: number; track: number; air: number };
  messages: Message[];
  paused: boolean;
  menu: boolean;
  results: ResultRow[] | null;
  camera: CameraMode;
  muted: boolean;
  gamepad: boolean;
  finishedMe: boolean;
}

export interface ControllerOptions {
  /** The car this computer drives. */
  localId: string;
  net?: Net | null;
  assist: AidLevel;
  fast?: boolean;
  camera?: CameraMode;
  quality?: "low" | "high";
}

const fmtTime = (x: number) => {
  const m = Math.floor(x / 60);
  const s = x - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
};
export { fmtTime };

export function recommendedTyre(wetness: number, laps: number): Compound {
  if (wetness > 0.55) return "wet";
  if (wetness > 0.15) return "inter";
  return laps > 14 ? "hard" : "medium";
}

/** Runs one race: steps the simulation at a fixed rate, draws it, plays the sound and talks to other players. */
export class F1Controller {
  readonly race: Race;
  readonly track: Track;
  private scene: F1Scene | null = null;
  private audio = new F1Audio();
  private controls: Controls;
  private listeners = new Set<() => void>();
  private hud: Hud;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private frame = 0;
  private disposed = false;
  private msgSeq = 0;
  private messages: Message[] = [];
  private paused = false;
  private menu = false;
  private camera: CameraMode = "chase";
  private pitCompound: Compound;
  private fastest = 0;
  private lastSend = 0;
  private lastAiSend = 0;
  /** Each car as it was before the latest physics step, so drawing can blend between steps. */
  private prevPose = new Map<string, { x: number; y: number; psi: number; delta: number }>();
  private weatherKind: string;
  private offNet: (() => void) | null = null;
  private results: ResultRow[] | null = null;
  private lastDrs = false;
  private lastLights = 0;
  private lastPos = 0;
  private resizeObs: ResizeObserver | null = null;
  private guidePlan: unknown = null;

  constructor(
    readonly config: RaceConfig,
    private opts: ControllerOptions,
  ) {
    this.race = new Race(config);
    this.race.setAssist(opts.assist);
    this.track = this.race.track;
    if (opts.camera && ["chase", "close", "cockpit", "top"].includes(opts.camera)) this.camera = opts.camera;
    this.controls = new Controls(() => !this.paused && !this.menu);
    this.controls.onAction((a) => this.action(a));
    this.pitCompound = recommendedTyre(this.race.weather.wetness, config.laps);
    this.weatherKind = this.race.weather.kind;
    this.hud = this.makeHud();
    if (opts.net) {
      this.offNet = opts.net.subscribe((m) => this.receive(m));
    }
  }

  // ----------------------------------------------------------------- store

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.hud;

  private publish() {
    this.hud = this.makeHud();
    this.listeners.forEach((fn) => fn());
  }

  get me(): RaceCar | undefined {
    return this.race.cars.find((c) => c.id === this.opts.localId);
  }

  get online(): boolean {
    return !!this.opts.net;
  }

  private makeHud(): Hud {
    const r = this.race;
    const me = this.me;
    const s = me?.state;
    const w = r.weather;
    const def = WEATHERS[w.kind];
    const order = [...r.cars].sort((a, b) => a.position - b.position);
    const leader = order[0];
    const standings: HudRow[] = order.map((c, i) => {
      const L = this.track.length;
      const behind = leader && c !== leader ? Math.max(0, (leader.dist - c.dist) / Math.max(30, Math.hypot(c.state.u, c.state.v))) : 0;
      void L;
      return {
        id: c.id,
        name: c.entry.name,
        color: c.entry.team.color,
        position: c.position,
        gap: behind,
        interval: i === 0 ? 0 : c.gapAhead,
        lap: Math.max(1, c.lap + 1),
        pit: c.pit,
        compound: c.state.compound,
        finished: c.finished,
        bestLap: c.bestLap,
        me: c.id === this.opts.localId,
      };
    });
    const speed = s ? Math.hypot(s.u, s.v) : 0;
    let wrongWay = false;
    if (me && speed > 6) {
      const tp = trackAt(this.track, me.s);
      let d = s!.psi - tp.heading;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      wrongWay = Math.abs(d) > 1.9 && s!.u > 0;
    }
    const ahead = me ? r.cars.find((c) => c.position === me.position - 1) : undefined;
    void ahead;
    return {
      phase: r.phase,
      lights: r.lights,
      mode: this.config.mode,
      laps: this.config.laps,
      lap: me ? Math.max(1, Math.min(this.config.laps || 999, me.lap + 1)) : 1,
      position: me?.position ?? 1,
      total: r.cars.length,
      raceTime: r.raceTime,
      speed: speed * 3.6,
      gear: s?.gear ?? 1,
      rpm: s?.rpm ?? 0,
      throttle: s?.throttle ?? 0,
      brake: s?.brake ?? 0,
      drsAvailable: !!me && me.drsEnabled && r.inDrsZone(me.s),
      drsOpen: !!s?.drs,
      ers: s ? s.ers / 4e6 : 1,
      fuel: s?.fuel ?? 0,
      compound: s?.compound ?? "medium",
      temp: s?.temp ?? [0, 0, 0, 0],
      wear: s?.wear ?? [0, 0, 0, 0],
      lapTime: me && r.phase !== "grid" && r.phase !== "lights" ? Math.max(0, r.raceTime - me.lapStart) : 0,
      lastLap: me?.lastLap ?? 0,
      bestLap: me?.bestLap ?? 0,
      fastestLap: this.fastest,
      lapValid: me?.lapValid ?? true,
      offTrack: !!me?.offTrack,
      wrongWay,
      pit: me?.pit ?? "none",
      pitRequested: !!me?.pitRequest,
      pitCompound: this.pitCompound,
      pitStops: me?.pitStops ?? 0,
      standings,
      weather: { kind: w.kind, icon: def.icon, name: def.name, wetness: w.wetness, rain: w.rain, track: w.track, air: w.air },
      messages: this.messages,
      paused: this.paused,
      menu: this.menu,
      results: this.results,
      camera: this.camera,
      muted: this.audio.isMuted,
      gamepad: this.controls.gamepad,
      finishedMe: !!me?.finished,
    };
  }

  private say(text: string, tone: Message["tone"] = "info", ms = 3200) {
    const id = ++this.msgSeq;
    this.messages = [...this.messages.slice(-2), { id, text, tone }];
    setTimeout(() => {
      this.messages = this.messages.filter((m) => m.id !== id);
      if (!this.disposed) this.publish();
    }, ms);
  }

  // ------------------------------------------------------------- lifecycle

  attach(canvas: HTMLCanvasElement) {
    const cars = this.race.cars.map((c) => ({
      id: c.id,
      team: c.entry.team,
      compound: c.state.compound,
      name: c.entry.name,
      helmet: ["#ffffff", "#ffd12e", "#2dd4bf", "#f472b6", "#a3e635", "#fb923c", "#60a5fa", "#e11d48"][Math.abs(hash(c.id)) % 8]!,
      mine: c.id === this.opts.localId,
      number: (Math.abs(hash(c.id)) % 98) + 1,
    }));
    this.scene = new F1Scene(canvas, this.track, cars, styleFor(this.track.id), { quality: this.opts.quality });
    this.scene.setCamera(this.camera);
    this.guidePlan = null;
    this.resizeObs = new ResizeObserver(() => this.scene?.resize());
    this.resizeObs.observe(canvas);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    window.addEventListener("pointerdown", this.unlockAudio, { once: true });
    window.addEventListener("keydown", this.unlockAudio, { once: true });
  }

  private unlockAudio = () => this.audio.unlock();

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.offNet?.();
    this.controls.dispose();
    this.resizeObs?.disconnect();
    this.audio.silence();
    this.audio.dispose();
    this.scene?.dispose();
    window.removeEventListener("pointerdown", this.unlockAudio);
    window.removeEventListener("keydown", this.unlockAudio);
  }

  // ----------------------------------------------------------------- input

  setTouch(k: "left" | "right" | "throttle" | "brake" | "drs", v: boolean) {
    this.controls.setTouch(k, v);
  }

  private action(a: Action) {
    const me = this.me;
    switch (a) {
      case "camera": {
        const modes: CameraMode[] = ["chase", "close", "cockpit", "top"];
        this.camera = modes[(modes.indexOf(this.camera) + 1) % modes.length]!;
        this.scene?.setCamera(this.camera);
        break;
      }
      case "mute":
        this.audio.setMuted(!this.audio.isMuted);
        break;
      case "pause":
        this.toggleMenu();
        return;
      case "tyre": {
        const list = this.race.weather.wetness > 0.1 ? COMPOUND_LIST : COMPOUND_LIST;
        this.pitCompound = list[(list.indexOf(this.pitCompound) + 1) % list.length]!;
        if (me?.pitRequest) this.race.requestPit(me, this.pitCompound);
        break;
      }
      case "pit":
        if (!me || this.config.mode === "free") {
          if (me) this.requestPitFree(me);
        } else if (me.pit === "none") {
          me.pitRequest = !me.pitRequest;
          me.pitCompound = this.pitCompound;
          this.say(me.pitRequest ? `Box this lap: ${COMPOUNDS[this.pitCompound].name}` : "Pit call cancelled", "info");
          this.audio.beep("pit");
        }
        break;
      case "reset":
        if (me && (this.config.mode === "free" || me.state.u < 8)) {
          this.race.respawn(me);
          this.say("Back on track", "info");
        }
        break;
    }
    this.publish();
  }

  private requestPitFree(me: RaceCar) {
    me.pitRequest = !me.pitRequest;
    me.pitCompound = this.pitCompound;
    this.say(me.pitRequest ? `Pit stop next lap: ${COMPOUNDS[this.pitCompound].name}` : "Pit call cancelled");
  }

  setPitCompound(c: Compound) {
    this.pitCompound = c;
    const me = this.me;
    if (me?.pitRequest) me.pitCompound = c;
    this.publish();
  }

  togglePit() {
    this.action("pit");
  }

  cycleCamera() {
    this.action("camera");
  }

  toggleMute() {
    this.action("mute");
  }

  toggleMenu() {
    // Alone, the menu pauses the game. With others it floats over a race that carries on.
    this.menu = !this.menu;
    if (!this.online) this.paused = this.menu;
    if (this.paused) this.audio.silence();
    this.publish();
  }

  // --------------------------------------------------------------- the loop

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
    this.last = now;
    const me = this.me;
    if (!this.paused) {
      if (me && !me.remote) {
        const read = this.controls.read(dt, Math.hypot(me.state.u, me.state.v));
        me.input = { ...read, steerAssist: false, tractionControl: false };
      }
      this.acc += this.opts.fast ? dt * 4 : dt;
      let steps = 0;
      while (this.acc >= DT && steps < 14) {
        this.capturePoses();
        this.race.step(DT);
        this.acc -= DT;
        steps++;
      }
      if (steps === 14) this.acc = 0;
      this.handleEvents(this.race.drain());
      this.sendState(now);
    }

    // ---- draw
    if (this.scene) {
      // The physics runs at 120 Hz and the screen at whatever it likes (60, 144, 165 Hz...). Drawing the
      // latest step as is makes the car judder when the two drift; blend between the last two steps instead.
      const alpha = Math.min(1, Math.max(0, this.acc / DT));
      const frames: CarFrame[] = this.race.cars.map((c) => {
        const s = c.state;
        const p = this.prevPose.get(c.id);
        const blend = !!p && Math.abs(s.x - p.x) + Math.abs(s.y - p.y) < 8;
        let dpsi = blend ? s.psi - p!.psi : 0;
        while (dpsi > Math.PI) dpsi -= 2 * Math.PI;
        while (dpsi < -Math.PI) dpsi += 2 * Math.PI;
        return {
          id: c.id,
          x: blend ? p!.x + (s.x - p!.x) * alpha : s.x,
          y: blend ? p!.y + (s.y - p!.y) * alpha : s.y,
          psi: blend ? p!.psi + dpsi * alpha : s.psi,
          delta: blend ? p!.delta + (s.delta - p!.delta) * alpha : s.delta,
          u: s.u,
          v: s.v,
          throttle: s.throttle,
          brake: s.brake,
          drs: s.drs,
          compound: s.compound,
          impact: c.impact,
          slip: Math.max(s.gripFront, s.gripRear) > 0.98 && Math.hypot(s.u, s.v) > 8 ? Math.min(1, Math.abs(Math.atan2(s.v, Math.max(1, s.u))) * 4 + 0.7) : 0,
          offTrack: c.offTrack,
          ax: s.ax,
          ay: s.ay,
        };
      });
      this.scene.setLights(this.race.phase === "lights" ? this.race.lights : 0);
      this.scene.update(this.paused ? 0 : dt, frames, this.opts.localId, { wetness: this.race.weather.wetness, rain: this.race.weather.rain, cloud: this.race.weather.cloud });
      this.updateGuide();
      this.scene.render();
    }
    this.updateAudio();

    if (++this.frame % 4 === 0 || this.race.phase !== this.hud.phase || this.race.lights !== this.hud.lights) this.publish();
  };

  private capturePoses() {
    for (const c of this.race.cars) {
      const s = c.state;
      let p = this.prevPose.get(c.id);
      if (!p) this.prevPose.set(c.id, (p = { x: 0, y: 0, psi: 0, delta: 0 }));
      p.x = s.x;
      p.y = s.y;
      p.psi = s.psi;
      p.delta = s.delta;
    }
  }

  /** The racing line on the road: shown when the driver has help turned on. */
  private updateGuide() {
    const me = this.me;
    const scene = this.scene;
    if (!me || !scene) return;
    const show = this.opts.assist !== "pro";
    const plan = this.race.linePlan(me);
    if (plan !== this.guidePlan) {
      this.guidePlan = plan;
      scene.setGuide(plan);
    }
    const speed = Math.hypot(me.state.u, me.state.v);
    scene.updateGuide(me.s, speed, show && me.pit === "none" && this.race.phase !== "grid" && this.race.phase !== "lights");
  }

  private updateAudio() {
    const me = this.me;
    if (!me || this.paused) return;
    const s = me.state;
    const speed = Math.hypot(s.u, s.v);
    const others = this.race.cars
      .filter((c) => c !== me)
      .map((c) => {
        const dx = c.state.x - s.x;
        const dy = c.state.y - s.y;
        const d = Math.hypot(dx, dy);
        // Which side of the car the other one is on.
        const side = d > 0.1 ? (-Math.sin(s.psi) * dx + Math.cos(s.psi) * dy) / d : 0;
        return { rpm: c.state.rpm, throttle: c.state.throttle, distance: d, side: -side };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
    this.audio.update({ rpm: this.race.phase === "grid" || this.race.phase === "lights" ? Math.max(5200, s.rpm) : s.rpm, throttle: s.throttle, speed, slip: Math.max(s.gripFront, s.gripRear) > 0.97 ? 1 : 0, offTrack: me.offTrack, rain: this.race.weather.rain }, others);
  }

  private handleEvents(events: RaceEvent[]) {
    const me = this.me;
    for (const e of events) {
      switch (e.type) {
        case "lights":
          this.audio.beep("light");
          break;
        case "green":
          this.audio.beep("green");
          this.say("Go!", "good", 1500);
          break;
        case "lap": {
          if (e.time > 0 && (this.fastest === 0 || (e.best && e.time < this.fastest))) {
            if (e.best) this.fastest = e.time;
          }
          if (e.car === this.opts.localId) {
            this.audio.beep(e.best ? "best" : "lap");
            if (this.config.mode === "free" || e.lap >= 1) this.say(`Lap ${e.lap}: ${fmtTime(e.time)}${e.best ? "  Personal best" : me && !me.lapValid ? "" : ""}`, e.best ? "good" : "info");
            if (me && me.laps.length > 0 && !e.best && this.race.cars.find((c) => c.id === e.car)?.lapValid === false) this.say("That lap went off track and doesn't count", "bad");
          }
          break;
        }
        case "finish":
          if (e.car === this.opts.localId) {
            this.say(`Finished P${e.position}`, "good", 6000);
            this.audio.beep("best");
          }
          break;
        case "pit":
          if (e.car === this.opts.localId) {
            if (e.what === "in") this.say("Pit lane: speed limiter on", "info");
            if (e.what === "stopped") this.say("Changing tyres…", "info", 2400);
            if (e.what === "out") this.say(`${COMPOUNDS[this.me?.state.compound ?? "medium"].name} tyres on. Go!`, "good");
          }
          break;
        case "impact":
          if (e.car === this.opts.localId) this.audio.impact(e.strength);
          break;
        case "over":
          this.finish();
          break;
        default:
          break;
      }
    }
    // DRS, weather and position changes the driver should hear about.
    if (me) {
      const avail = me.drsEnabled && this.race.inDrsZone(me.s);
      if (avail && !this.lastDrs) this.say("DRS available: press Space", "good", 2200);
      this.lastDrs = avail;
    }
    const kind = this.race.weather.kind;
    if (kind !== this.weatherKind) {
      const before = WEATHERS[this.weatherKind as keyof typeof WEATHERS].rain;
      const now = WEATHERS[kind].rain;
      if (now > before + 0.1) this.say("Rain is arriving. Think about tyres.", "bad", 4500);
      else if (now < before - 0.1) this.say("The rain is easing", "good", 4000);
      this.weatherKind = kind;
    }
    if (this.race.lights !== this.lastLights) this.lastLights = this.race.lights;
  }

  private finish() {
    const rows = [...this.race.cars].sort((a, b) => a.position - b.position);
    const winner = rows[0];
    this.results = rows.map((c) => ({
      id: c.id,
      name: c.entry.name,
      color: c.entry.team.color,
      position: c.position,
      time: c.finished ? c.finishTime : 0,
      gap: winner && c.finished ? c.finishTime - winner.finishTime : 0,
      bestLap: c.bestLap,
      stops: c.pitStops,
      finished: c.finished,
      laps: Math.max(0, c.lap),
      me: c.id === this.opts.localId,
    }));
    this.publish();
  }

  /** Free ride has no flag: the driver ends the session. */
  endSession() {
    this.finish();
  }

  // ------------------------------------------------------------------- net

  private sendState(now: number) {
    const net = this.opts.net;
    if (!net) return;
    const me = this.me;
    if (me && now - this.lastSend > 33) {
      this.lastSend = now;
      net.send({ t: "s", id: me.id, snap: this.race.snapshot(me) }, true);
    }
    if (net.role === "host" && now - this.lastAiSend > 50) {
      this.lastAiSend = now;
      const cars = this.race.cars.filter((c) => !c.remote && !c.entry.human).map((c) => ({ id: c.id, snap: this.race.snapshot(c) }));
      if (cars.length) net.send({ t: "a", cars }, true);
    }
  }

  private receive(m: F1Msg) {
    if (m.t === "s") this.race.applySnapshot(m.id, m.snap);
    else if (m.t === "a") for (const c of m.cars) this.race.applySnapshot(c.id, c.snap);
  }

  /** A friend left: the computer drives their car from now on (the host does this and everyone else keeps receiving its snapshots). */
  takeOver(id: string) {
    if (this.opts.net?.role === "host") this.race.takeOver(id);
    this.say(`${this.race.cars.find((c) => c.id === id)?.entry.name ?? "A player"} left. The computer drives their car.`, "bad", 4500);
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export { gap };
