import { Rng } from "@boredgames/engine";
import {
  FROZE_MS,
  WINS_NEEDED,
  judgePress,
  outlawShot,
  planRound,
  quickBonus,
  resolve,
  type Fake,
  type Look,
  type Outlaw,
  type Plan,
  type RoundResult,
  type Seat,
  type Shot,
} from "@boredgames/quickdraw";
import { audio } from "./audio";
import type { Msg, Net } from "./net";

export type Mode = "outlaw" | "local" | "online";

export interface Gunslinger {
  name: string;
  look: Look;
}

export interface View {
  phase: "intro" | "standoff" | "called" | "result" | "over";
  round: number;
  score: [number, number];
  plan: Plan | null;
  /** The fake-out showing right now. */
  fake: { id: number; fake: Fake } | null;
  /** The close-up of both pairs of eyes, during a long enough standoff. */
  eyes: boolean;
  shots: [Shot | null, Shot | null];
  result: RoundResult | null;
  history: RoundResult[];
  /** Who won the duel. */
  champion: Seat | null;
  /** Dollars won from the outlaw this duel. */
  bounty: { reward: number; bonus: number } | null;
  /** The other side asked for a rematch (online host only). */
  rematchAsked: boolean;
  /** The friend left. */
  gone: boolean;
}

/** Bounty collected since the page opened. Never saved: close the tab and it is gone. */
export const session = { bounty: 0, claimed: new Set<string>(), best: null as number | null };

const INTRO_MS = 1700;
const RESULT_MS = 2900;

/**
 * One duel: runs the rounds, times the call to the millisecond with requestAnimationFrame, takes shots from
 * the keyboard or screen, plays the computer outlaw, and talks to a friend's browser when online.
 */
export class Duel {
  private listeners = new Set<() => void>();
  private view: View;
  private seed: number;
  private t0 = 0;
  private callAt = 0;
  private raf = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private fakeQueue: Fake[] = [];
  private bot: { foulAt: number } | { ms: number } | null = null;
  private rand: () => number;
  private seq = 0;
  private disposed = false;
  /** Seats whose shots this browser takes. */
  readonly local: Seat[];

  constructor(
    readonly mode: Mode,
    readonly sides: [Gunslinger, Gunslinger],
    seed: number,
    private opts: { outlaw?: Outlaw; net?: Net } = {},
  ) {
    this.seed = seed;
    const rng = new Rng(seed ^ 0x2545f491);
    this.rand = () => rng.next();
    this.local = mode === "local" ? [0, 1] : mode === "online" && opts.net?.role === "guest" ? [1] : [0];
    this.view = this.fresh();
    if (opts.net) {
      opts.net.subscribe((m) => this.receive(m));
      opts.net.onLeave(() => this.set({ gone: true }));
    }
  }

  private fresh(): View {
    return { phase: "intro", round: 0, score: [0, 0], plan: null, fake: null, eyes: false, shots: [null, null], result: null, history: [], champion: null, bounty: null, rematchAsked: false, gone: false };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.view;

  private set(p: Partial<View>) {
    this.view = { ...this.view, ...p };
    this.listeners.forEach((f) => f());
  }

  private get host() {
    return this.mode !== "online" || this.opts.net!.role === "host";
  }

  private later(ms: number, fn: () => void) {
    const h = setTimeout(() => {
      this.timers.delete(h);
      if (!this.disposed) fn();
    }, ms);
    this.timers.add(h);
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    cancelAnimationFrame(this.raf);
  }

  start() {
    this.disposed = false;
    audio.startWind();
    // React may start the same duel twice (strict mode in development): pick up the current round again.
    if (this.host) {
      if (this.view.round === 0) this.nextRound();
      else if (this.view.phase !== "over") this.beginRound(this.view.round);
    }
  }

  dispose() {
    this.disposed = true;
    this.clearTimers();
    audio.stopTension(true);
  }

  // ------------------------------------------------------------- rounds

  private nextRound() {
    const n = this.view.round + 1;
    if (this.mode === "online") this.opts.net!.send({ t: "round", n });
    this.beginRound(n);
  }

  private beginRound(n: number) {
    this.clearTimers();
    const plan = planRound(this.seed, n, this.view.score);
    this.set({ phase: "intro", round: n, plan, fake: null, eyes: false, shots: [null, null], result: null });
    audio.sfx("spurs");
    this.later(INTRO_MS, () => this.standoff(plan));
  }

  private standoff(plan: Plan) {
    this.t0 = performance.now();
    this.callAt = 0;
    this.fakeQueue = [...plan.fakes];
    this.bot = this.mode === "outlaw" ? outlawShot(this.opts.outlaw!, plan, this.rand) : null;
    this.set({ phase: "standoff" });
    audio.standoff(plan.delay);
    if (plan.delay >= 2600) {
      this.later(900, () => this.view.phase === "standoff" && this.set({ eyes: true }));
      this.later(plan.delay - 650, () => this.set({ eyes: false }));
    }
    const tick = () => {
      if (this.disposed) return;
      this.frame(performance.now());
      if (this.view.phase === "standoff" || this.view.phase === "called") this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Called every frame while the round is live. */
  private frame(now: number) {
    const v = this.view;
    const plan = v.plan!;
    const since = now - this.t0;
    if (v.phase === "standoff") {
      while (this.fakeQueue.length && this.fakeQueue[0]!.at <= since) {
        const f = this.fakeQueue.shift()!;
        const id = ++this.seq;
        this.set({ fake: { id, fake: f } });
        audio.sfx(f.kind === "word" ? "call" : f.kind);
        this.later(f.kind === "word" ? 650 : 1400, () => this.view.fake?.id === id && this.set({ fake: null }));
      }
      if (this.bot && "foulAt" in this.bot && since >= this.bot.foulAt) {
        this.fire(1, { kind: "foul", at: Math.round(since) });
        return;
      }
      if (since >= plan.delay) {
        this.callAt = now;
        this.set({ phase: "called", fake: null, eyes: false });
        audio.stopTension(true);
        audio.sfx("call");
      }
      return;
    }
    if (v.phase === "called") {
      const after = now - this.callAt;
      if (this.bot && "ms" in this.bot && after >= this.bot.ms && !v.shots[1]) this.fire(1, { kind: "hit", ms: this.bot.ms });
      // Online: the friend already fired, faster than we can now, so our shot is late whatever happens.
      if (this.mode === "online") {
        const me = this.local[0]!;
        const them = v.shots[1 - me];
        if (!v.shots[me] && them?.kind === "hit" && after >= them.ms) this.fire(me, { kind: "hit", ms: Math.max(them.ms + 1, Math.round(after)) });
      }
      if (after >= FROZE_MS) for (const s of this.local) if (!this.view.shots[s]) this.fire(s, { kind: "hit", ms: FROZE_MS });
    }
  }

  /** A trigger pulled at `at` (an event timestamp, on the performance.now() clock). */
  pull(seat: Seat, stamp: number) {
    // Event timestamps share the performance.now() clock; distrust one that does not.
    const now = performance.now();
    const at = stamp > 0 && Math.abs(now - stamp) < 1000 ? stamp : now;
    const v = this.view;
    if (!this.local.includes(seat) || v.shots[seat]) return;
    if (v.phase === "standoff") this.fire(seat, { kind: "foul", at: Math.max(0, Math.round(at - this.t0)) });
    else if (v.phase === "called") this.fire(seat, judgePress(Math.max(0, at - this.callAt), at - this.t0));
  }

  private fire(seat: Seat, shot: Shot) {
    if (this.view.shots[seat] || (this.view.phase !== "standoff" && this.view.phase !== "called")) return;
    const shots: [Shot | null, Shot | null] = [...this.view.shots];
    shots[seat] = shot;
    this.set({ shots });
    if (shot.kind === "foul") audio.stopTension(true);
    try {
      if (this.local.includes(seat) && "vibrate" in navigator) navigator.vibrate?.(shot.kind === "hit" ? 40 : [20, 40, 20]);
    } catch {
      // Not every browser lets a page vibrate.
    }
    if (this.mode === "online" && this.local.includes(seat)) this.opts.net!.send({ t: "shot", n: this.view.round, shot });
    this.judge();
  }

  /** Decide the round as soon as the shots so far settle it. */
  private judge() {
    const [a, b] = this.view.shots;
    if (this.mode === "online") {
      if (!this.host) return;
      const r = resolve(a, b);
      if (r) {
        this.opts.net!.send({ t: "result", n: this.view.round, result: r });
        this.finish(r);
      }
      return;
    }
    let r = resolve(a, b);
    // On one screen the first clean hit wins at once: nobody can still be quicker.
    if (!r && (a?.kind === "hit" || b?.kind === "hit")) {
      const w: Seat = a?.kind === "hit" ? 0 : 1;
      const shots: [Shot | null, Shot | null] = [a, b];
      // Show what the outlaw would have managed.
      if (this.mode === "outlaw" && w === 0 && this.bot && "ms" in this.bot) shots[1] = { kind: "hit", ms: this.bot.ms };
      r = { winner: w, reason: "faster", shots };
    }
    if (r) this.finish(r);
  }

  private finish(r: RoundResult) {
    if (this.view.phase === "result" || this.view.phase === "over") return;
    cancelAnimationFrame(this.raf);
    audio.stopTension(true);
    const score: [number, number] = [...this.view.score];
    if (r.winner !== null) score[r.winner]++;
    const history = [...this.view.history, r];
    // The winner's gun speaks; a foul is a shot into the dirt first.
    const fouler = r.reason === "foul" ? (r.winner === 0 ? 1 : 0) : null;
    if (fouler !== null) audio.sfx("dud");
    this.later(fouler !== null ? 380 : 0, () => {
      audio.sfx("shot");
      if (this.rand() < 0.5) audio.sfx("ricochet");
    });
    for (const s of this.local) {
      const sh = r.shots[s];
      if (sh?.kind === "hit" && sh.ms < FROZE_MS && (session.best === null || sh.ms < session.best)) session.best = sh.ms;
    }
    this.set({ phase: "result", result: r, score, history, fake: null, eyes: false });
    const done = score[0] >= WINS_NEEDED || score[1] >= WINS_NEEDED;
    this.later(RESULT_MS, () => {
      if (done) this.over(score[0] >= WINS_NEEDED ? 0 : 1);
      else if (this.host) this.nextRound();
    });
  }

  private over(champion: Seat) {
    let bounty: View["bounty"] = null;
    if (this.mode === "outlaw" && champion === 0) {
      const o = this.opts.outlaw!;
      const bonus = this.view.history.reduce((acc, r) => acc + (r.winner === 0 && r.shots[0]?.kind === "hit" ? quickBonus(r.shots[0].ms) : 0), 0);
      bounty = { reward: o.bounty, bonus };
      session.bounty += o.bounty + bonus;
      session.claimed.add(o.id);
    }
    const mine = this.mode === "local" || this.local.includes(champion);
    audio.sfx(mine ? "win" : "lose");
    if (bounty) this.later(900, () => audio.sfx("cash"));
    this.later(1600, () => audio.theme());
    this.set({ phase: "over", champion, bounty });
  }

  // ------------------------------------------------------------- online

  private receive(m: Msg) {
    switch (m.t) {
      case "round":
        if (!this.host) this.beginRound(m.n);
        break;
      case "shot": {
        if (m.n !== this.view.round) return;
        const them = this.local[0] === 0 ? 1 : 0;
        if (this.view.shots[them]) return;
        const shots: [Shot | null, Shot | null] = [...this.view.shots];
        shots[them] = m.shot;
        this.set({ shots });
        this.judge();
        break;
      }
      case "result":
        if (!this.host && m.n === this.view.round) {
          // Show the friend's shot too, then the verdict.
          this.set({ shots: m.result.shots });
          this.finish(m.result);
        }
        break;
      case "again":
        if (this.host) this.set({ rematchAsked: true });
        break;
      case "start":
        if (!this.host) this.reset(m.seed);
        break;
    }
  }

  /** Another duel with the same people. Online, the host deals it and the guest asks for it. */
  again() {
    if (this.mode === "online" && !this.host) {
      this.opts.net!.send({ t: "again" });
      return;
    }
    const seed = (Math.random() * 2 ** 32) >>> 0;
    if (this.mode === "online") this.opts.net!.send({ t: "start", seed, names: [this.sides[0].name, this.sides[1].name] });
    this.reset(seed);
    this.nextRound();
  }

  private reset(seed: number) {
    this.clearTimers();
    this.seed = seed;
    const rng = new Rng(seed ^ 0x2545f491);
    this.rand = () => rng.next();
    this.view = { ...this.fresh(), gone: this.view.gone };
    this.listeners.forEach((f) => f());
  }
}
