import type { BotLevel, GameEvent } from "@boredgames/engine";
import { Rng } from "@boredgames/engine";
import {
  RULES,
  TILE_INFO,
  currentPlayer,
  getBoard,
  milestones,
  netWorth,
  nextNode,
  type MilestonesState,
  type Move,
  type Option,
  type PlayerState,
  type TileType,
} from "@boredgames/milestones";
import { audio } from "./audio";
import type { Msg } from "./net";
import type { AheadMarker, BurstKind } from "./scene/WorldScene";

export interface Seat {
  id: string;
  name: string;
  color: string;
  bot?: BotLevel;
}

export interface Toast {
  id: number;
  kicker: string;
  text: string;
  amount: number | null;
  tone: "good" | "bad" | "info";
}

/** One of the next ten tiles on the active player's road. */
export interface AheadTile {
  node: number;
  steps: number;
  type: TileType;
  label: string;
  /** Not blocked by a stop earlier on the road. */
  reachable: boolean;
  /** The road this tile belongs to. */
  segment: string;
}

export interface ResultRow {
  seat: Seat;
  player: PlayerState;
  net: number;
  rank: number;
  portfolio: number;
}

export interface ViewState {
  game: MilestonesState;
  seats: Seat[];
  /** The seat this browser plays. */
  localId: string;
  /** Animations are playing; input is locked. */
  busy: boolean;
  message: string;
  toast: Toast | null;
  wheelDeg: number;
  wheelValue: string;
  /** Index of the seat the camera should follow. */
  focus: number;
  ahead: AheadTile[];
  results: ResultRow[] | null;
}

/** What the controller needs from the 3D scene. */
export interface Stage {
  placeCar(player: number, node: number): void;
  hop(player: number, node: number): Promise<void>;
  setPegs(player: number, colors: string[]): void;
  burst(player: number, kind: BurstKind): void;
  pulse(node: number): void;
  setAhead(list: AheadMarker[]): void;
  setActive(player: number): void;
}

const KID_COLORS = ["#F5D061", "#9AD39A", "#B9A3E3", "#7FB7E6"];
const SPOUSE_COLOR = "#F29BB8";

export function pegColors(seat: Seat, p: PlayerState): string[] {
  const out = [lighten(seat.color)];
  if (p.spouse) out.push(SPOUSE_COLOR);
  for (let i = 0; i < p.kids; i++) out.push(KID_COLORS[i % KID_COLORS.length]!);
  return out.slice(0, 6);
}

function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.55);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

export const money = (n: number) => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US") + "k";

/** The tiles a spin from here could reach, in order. */
export function aheadOf(game: MilestonesState): AheadTile[] {
  const board = getBoard(game.map);
  const p = currentPlayer(game);
  const out: AheadTile[] = [];
  let node = p.node;
  let heading = p.heading;
  let blocked = false;
  for (let steps = 1; steps <= RULES.maxSpin; steps++) {
    const next = nextNode(board, node, heading);
    if (next === null) break;
    if (board.nodes[node]!.next.length > 1) heading = null;
    node = next;
    const n = board.nodes[node]!;
    out.push({
      node,
      steps,
      type: n.type,
      label: n.label ?? TILE_INFO[n.type].name,
      reachable: !blocked,
      segment: n.segment,
    });
    if (n.stop) blocked = true;
  }
  return out;
}

/**
 * Owns one local game: applies moves through the engine, then *plays back* the
 * resulting events (spin, hops, payouts, sounds) before unlocking input. When we go
 * online, the same event playback will be driven by the room server instead.
 */
export class MilestonesController {
  private listeners = new Set<() => void>();
  private view: ViewState;
  private stage: Stage | null = null;
  private disposed = false;
  /** Bumped on restart so in-flight playback from an old game is discarded. */
  private gen = 0;
  private toastSeq = 0;
  private botRng: Rng;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly fast: boolean;
  private hops = 0;
  /** Moves from other players that arrived while an animation was playing. */
  private inbox: { id: string; move: Move }[] = [];
  private readonly send: ((m: Msg) => void) | null;
  private readonly guest: boolean;
  readonly localId: string;

  constructor(
    private seats: Seat[],
    private seed: number,
    private mapId: string,
    opts: { fast?: boolean; send?: (m: Msg) => void; guest?: boolean; localId?: string } = {},
  ) {
    this.fast = !!opts.fast;
    this.send = opts.send ?? null;
    this.guest = !!opts.guest;
    this.localId = opts.localId ?? seats[0]!.id;
    this.botRng = new Rng(seed ^ 0x51ed270b);
    this.view = this.freshView();
  }

  private freshView(): ViewState {
    const game = milestones.setup({
      players: this.seats.map((s) => ({ id: s.id, name: s.name })),
      config: { map: this.mapId },
      seed: this.seed,
    });
    return {
      game,
      seats: this.seats,
      localId: this.localId,
      busy: false,
      message: "Pick an opening road.",
      toast: null,
      wheelDeg: 0,
      wheelValue: "?",
      focus: 0,
      ahead: [],
      results: null,
    };
  }

  // ------------------------------------------------------------ subscription

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.view;

  private set(patch: Partial<ViewState>) {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  // --------------------------------------------------------------- lifecycle

  attach(stage: Stage) {
    this.disposed = false;
    this.stage = stage;
    this.syncStage();
    this.afterPlayback();
  }

  dispose() {
    this.disposed = true;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  restart(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.gen++;
    this.inbox = [];
    this.seed = seed;
    this.botRng = new Rng(seed ^ 0x51ed270b);
    this.view = this.freshView();
    this.syncStage();
    this.set({});
    this.afterPlayback();
  }

  private syncStage() {
    if (!this.stage) return;
    this.view.game.players.forEach((p, i) => {
      this.stage!.placeCar(i, p.node);
      this.stage!.setPegs(i, pegColors(this.seats[i]!, p));
    });
    this.stage.setActive(this.view.game.turn);
  }

  private sleep(ms: number) {
    const t = this.fast ? ms / 12 : ms;
    return new Promise<void>((resolve) => {
      const h = setTimeout(() => {
        this.timers.delete(h);
        resolve();
      }, t);
      this.timers.add(h);
    });
  }

  // ------------------------------------------------------------------ input

  get current(): { index: number; seat: Seat } {
    const index = this.view.game.turn;
    return { index, seat: this.seats[index]! };
  }

  /** Called by the UI for the human seat. */
  play(move: Move) {
    const { seat } = this.current;
    if (this.view.busy || seat.id !== this.localId || this.view.game.phase === "over") return;
    void this.dispatch(seat.id, move, false);
  }

  /** A move made by another player, in this game or relayed by the host. */
  receive(id: string, move: Move) {
    this.inbox.push({ id, move });
    if (!this.view.busy) this.nextRemote();
  }

  /** A friend left: the computer plays their seat from now on (host only). */
  takeOver(id: string) {
    const seat = this.seats.find((s) => s.id === id);
    if (!seat || seat.bot || this.guest) return;
    seat.bot = "medium";
    if (!this.view.busy && this.current.seat === seat) this.afterPlayback();
  }

  private nextRemote(): boolean {
    const next = this.inbox.shift();
    if (!next) return false;
    void this.dispatch(next.id, next.move, true);
    return true;
  }

  spin() {
    this.play({ type: "spin" });
  }

  private refreshAhead() {
    const g = this.view.game;
    const mine = this.seats[g.turn]!.id === this.localId;
    if (g.phase !== "spin" || !mine || this.view.busy) {
      this.stage?.setAhead([]);
      if (this.view.ahead.length) this.set({ ahead: [] });
      return;
    }
    const ahead = aheadOf(g);
    this.set({ ahead });
    this.stage?.setAhead(ahead.filter((a) => a.reachable).map((a) => ({ node: a.node, steps: a.steps, dim: false })));
  }

  private async dispatch(playerId: string, move: Move, remote: boolean) {
    const check = milestones.validate(this.view.game, playerId, move);
    if (!check.ok) {
      if (!remote) audio.sfx("error");
      return;
    }
    if (!remote) this.send?.({ t: "move", id: playerId, move });
    const { state, events } = milestones.apply(this.view.game, playerId, move);
    const gen = this.gen;
    this.stage?.setAhead([]);
    this.set({ busy: true, ahead: [] });
    this.hops = 0;
    await this.playback(events, state, gen);
    if (this.disposed || gen !== this.gen) return;
    this.set({ game: state, busy: false, focus: state.turn });
    this.syncPegs(state);
    this.stage?.setActive(state.turn);
    this.afterPlayback();
  }

  private syncPegs(state: MilestonesState) {
    state.players.forEach((p, i) => this.stage?.setPegs(i, pegColors(this.seats[i]!, p)));
  }

  /** Decide what happens next: bot moves, or prompt the human. */
  private afterPlayback() {
    const g = this.view.game;
    if (this.disposed || this.view.busy) return;
    if (g.phase === "over") {
      this.inbox = [];
      this.stage?.setAhead([]);
      this.set({ results: this.computeResults(), message: "Everyone has retired.", ahead: [] });
      return;
    }
    if (this.nextRemote()) return;
    const { seat } = this.current;
    if (seat.id !== this.localId) {
      this.stage?.setAhead([]);
      this.set({
        ahead: [],
        message: g.phase === "choice" ? `${seat.name} is choosing…` : `${seat.name} is spinning…`,
      });
      // The host plays the computers and sends their moves to everyone else.
      if (seat.bot && !this.guest) {
        const gen = this.gen;
        void this.sleep(g.phase === "choice" ? 1300 : 1000).then(() => {
          if (this.disposed || this.view.busy || gen !== this.gen || this.view.game !== g || !seat.bot) return;
          const move = milestones.botMove(g, seat.id, seat.bot, () => this.botRng.next());
          void this.dispatch(seat.id, move, false);
        });
      }
    } else {
      this.set({ message: g.phase === "choice" ? (g.choice?.title ?? "Your choice.") : "Your turn. Spin the wheel." });
      if (g.phase === "spin") audio.sfx("yourTurn");
      this.refreshAhead();
    }
  }

  private computeResults(): ResultRow[] {
    const rows = this.view.game.players.map((player, i) => ({
      seat: this.seats[i]!,
      player,
      net: netWorth(player),
      rank: 0,
      portfolio: Math.round(player.fund),
    }));
    rows.sort((a, b) => b.net - a.net);
    rows.forEach((r, i) => {
      r.rank = i > 0 && r.net === rows[i - 1]!.net ? rows[i - 1]!.rank : i + 1;
    });
    return rows;
  }

  // --------------------------------------------------------------- playback

  private seatIndex(id: string) {
    return this.seats.findIndex((s) => s.id === id);
  }

  private who(id: string): string {
    const s = this.seats[this.seatIndex(id)]!;
    return s.id === this.localId ? "You" : s.name;
  }

  private isHuman(id: string) {
    return id === this.localId;
  }

  private async toast(kicker: string, text: string, amount: number | null, hold = 1400, tone: Toast["tone"] = "info") {
    const id = ++this.toastSeq;
    const resolved = tone === "info" && amount !== null ? (amount < 0 ? "bad" : "good") : tone;
    this.set({ toast: { id, kicker, text, amount, tone: resolved } });
    await this.sleep(hold);
    if (this.view.toast?.id === id) this.set({ toast: null });
  }

  private async playback(events: GameEvent[], finalState: MilestonesState, gen: number) {
    for (const e of events) {
      if (this.disposed || gen !== this.gen) return;
      await this.playEvent(e, finalState);
    }
  }

  private async playEvent(e: GameEvent, finalState: MilestonesState) {
    const idx = typeof e.player === "string" ? this.seatIndex(e.player) : -1;
    const stage = this.stage;
    const name = typeof e.player === "string" ? this.who(e.player) : "";
    switch (e.type) {
      case "turn":
        this.set({ focus: idx });
        stage?.setActive(idx);
        await this.sleep(300);
        break;

      case "spun": {
        const n = e.value as number;
        const center = (n - 0.5) * 36;
        const prev = this.view.wheelDeg;
        const delta = (((360 - center - (prev % 360)) % 360) + 360) % 360;
        this.set({ wheelDeg: prev + 360 * 3 + delta, wheelValue: "", message: "Spinning…" });
        audio.wheel(this.fast ? 160 : 1900);
        await this.sleep(1900);
        audio.sfx("spinStop");
        this.set({ wheelValue: String(n), message: `${name} spun a ${n}.` });
        await this.sleep(350);
        break;
      }

      case "step":
        this.set({ focus: idx });
        audio.sfx("hop", this.hops++);
        await stage?.hop(idx, e.node as number);
        break;

      case "landed": {
        stage?.pulse(e.node as number);
        const tile = e.tile as TileType;
        audio.sfx("land");
        const label = TILE_INFO[tile].name;
        this.set({ message: `${name} landed on ${label.toLowerCase()}.` });
        await this.sleep(260);
        break;
      }

      case "payday": {
        const amount = e.amount as number;
        const passing = e.passing as boolean;
        if (amount > 0) {
          stage?.burst(idx, "coins");
          audio.sfx("payday");
          await this.toast("PAYDAY", passing ? "Passed a payday." : "Landed on a payday.", amount, passing ? 1000 : 1300);
        } else if (e.laidOff) {
          stage?.burst(idx, "smoke");
          audio.sfx("bad");
          await this.toast("LAID OFF", "No pay this time.", null, 1100, "bad");
        } else if (!passing) {
          await this.toast("PAYDAY", "No job yet.", null, 1100, "info");
        }
        break;
      }

      case "round": {
        const market = e.market as string;
        if (market === "steady") break;
        const boom = market === "boom";
        audio.sfx(boom ? "good" : "bad");
        await this.toast("MARKET", boom ? "Boom! Growth Funds and homes climb." : "Slump. Growth Funds and homes slide.", null, 1500, boom ? "good" : "bad");
        break;
      }

      case "market": {
        const boom = e.market === "boom";
        stage?.burst(idx, boom ? "coins" : "smoke");
        audio.sfx(boom ? "good" : "bad");
        await this.toast("MARKET", e.headline as string, null, 1800, boom ? "good" : "bad");
        break;
      }

      case "insured":
        stage?.burst(idx, "sparkle");
        audio.sfx("buy");
        await this.toast("INSURANCE", `${name === "You" ? "You are" : name + " is"} covered against the next twist.`, -(e.cost as number), 1400);
        break;

      case "raise":
        audio.sfx("good");
        await this.toast("RAISE", `${name === "You" ? "Your" : name + "'s"} salary is now ${money(e.salary as number)}.`, e.amount as number, 1200);
        break;

      case "card": {
        const amount = e.amount as number;
        if (amount > 0) {
          stage?.burst(idx, "coins");
          audio.sfx("good");
        } else if (amount < 0) {
          stage?.burst(idx, "smoke");
          audio.sfx("bad");
        } else audio.sfx("card");
        await this.toast((e.kicker as string) ?? "LIFE EVENT", e.text as string, amount === 0 ? null : amount, 1600);
        break;
      }

      case "family": {
        const p = finalState.players[idx]!;
        stage?.setPegs(idx, pegColors(this.seats[idx]!, p));
        stage?.burst(idx, "hearts");
        audio.sfx("baby");
        await this.toast("FAMILY", e.twins ? "Twins!" : "A new baby.", null, 1500);
        break;
      }

      case "wedding": {
        const p = finalState.players[idx]!;
        stage?.setPegs(idx, pegColors(this.seats[idx]!, p));
        stage?.burst(idx, "confetti");
        audio.sfx("wedding");
        await this.toast("WEDDING", `${name} got married.`, e.gift as number, 1500);
        break;
      }

      case "retired": {
        const first = e.first as boolean;
        stage?.burst(idx, "confetti");
        audio.sfx("retire");
        await this.toast(
          "RETIRED",
          first
            ? `${name} retired first. +${money(RULES.retireFirstBonus)} at the end.`
            : `${name} retired.`,
          null,
          2000,
          "good",
        );
        break;
      }

      case "chose":
        await this.describeChoice(e.player as string, e.option as Option);
        break;

      case "loan": {
        if (e.student) break;
        stage?.burst(idx, "smoke");
        audio.sfx("loan");
        await this.toast("THE BANK", `Borrowed ${money(e.amount as number)} from the bank.`, null, 1200, "bad");
        break;
      }

      case "invested": {
        stage?.burst(idx, "sparkle");
        audio.sfx("buy");
        await this.toast("GROWTH FUND", `${money(e.amount as number)} put in the Growth Fund.`, null, 1300, "good");
        break;
      }

      case "gift": {
        stage?.burst(idx, "sparkle");
        audio.sfx("dream");
        await this.toast("BONUS", `Your job adds ${money(e.value as number)} to your Growth Fund.`, null, 1400, "good");
        break;
      }

      case "choice":
        if (this.isHuman(e.player as string)) audio.sfx("choice");
        this.set({ message: "Your choice." });
        break;

      case "gameOver":
        audio.sfx("fanfare");
        break;

      default:
        break;
    }
  }

  private async describeChoice(player: string, o: Option) {
    const you = this.who(player) === "You";
    const name = this.who(player);
    if (this.isHuman(player)) audio.sfx("pick");
    switch (o.type) {
      case "route":
        await this.toast(o.path.name.toUpperCase(), you ? o.path.blurb : `${name} chose: ${o.path.name.toLowerCase()}.`, null, 1700, "info");
        break;
      case "branch":
        await this.toast("CROSSROADS", `${you ? "You take" : name + " takes"} the ${o.name.toLowerCase()}.`, null, 1400, "info");
        break;
      case "job":
        await this.toast("NEW JOB", `${you ? "You are" : name + " is"} now a ${o.title.toLowerCase()} on ${money(o.salary)}.`, null, 1500, "good");
        break;
      case "home":
        audio.sfx("house");
        await this.toast("HOME", `${you ? "You bought" : name + " bought"} a ${o.home.name.toLowerCase()}.`, -o.home.price, 1700);
        break;
      case "rent":
        await this.toast("HOME", you ? "You skipped it." : `${name} skipped it.`, null, 1100, "info");
        break;
      default:
        // Investing and events tell their own story.
        break;
    }
  }
}

export function tileLabel(type: TileType): string {
  return TILE_INFO[type].name;
}
