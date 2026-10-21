import { Rng, type BotLevel, type GameEvent } from "@boredgames/engine";
import {
  HOUSES,
  PROVINCES,
  SEASON_INFO,
  TIDING_INFO,
  UNIT_INFO,
  banners,
  current,
  size,
  type Army,
  type BannersState,
  type BattleRound,
  type HouseId,
  type Move,
  type Season,
  type Tiding,
  type Unit,
} from "@boredgames/banners";
import { audio } from "./audio";
import type { Msg } from "./net";

export interface Seat {
  id: string;
  name: string;
  house: HouseId;
  bot?: BotLevel;
}

export interface Entry {
  id: number;
  text: string;
  tone: "war" | "peace" | "gold" | "doom" | "info";
  house?: HouseId;
  round: number;
  /** Entries with the same key replace each other (repeated musters). */
  merge?: string;
}

export interface MarchShow {
  id: number;
  from: number;
  to: number;
  via: number | null;
  house: HouseId;
  count: number;
}

export interface BattleShow {
  id: number;
  from: number;
  at: number;
  attacker: HouseId;
  defender: HouseId | null;
  rounds: BattleRound[];
  aStart: Army;
  dStart: Army;
  aEnd: Army;
  dEnd: Army;
  won: boolean;
  /** One of the houses at the table here is involved, so the battle is shown in full. */
  mine: boolean;
}

export interface Announce {
  id: number;
  kind: "round" | "alliance" | "betrayal" | "fallen" | "turn" | "plunder";
  title: string;
  text: string;
  house?: HouseId;
  other?: HouseId;
  season?: Season;
  tiding?: Tiding;
}

export interface View {
  game: BannersState;
  seats: Seat[];
  localId: string;
  busy: boolean;
  chronicle: Entry[];
  march: MarchShow | null;
  battle: BattleShow | null;
  announce: Announce | null;
  /** Province that just changed hands, for a flash on the map. */
  flash: { at: number; id: number } | null;
}

const houseOf = (seats: Seat[], id: string | null | undefined): HouseId | null => seats.find((s) => s.id === id)?.house ?? null;
const hname = (h: HouseId | null) => (h ? HOUSES[h].name : "the local lords");
const pname = (i: number) => PROVINCES[i]!.name;

export function describeArmy(a: Army): string {
  const parts: string[] = [];
  for (const u of ["knights", "archers", "foot"] as Unit[]) {
    const n = a[u];
    if (n) parts.push(`${n} ${n === 1 ? UNIT_INFO[u].name.toLowerCase() : UNIT_INFO[u].plural.toLowerCase()}`);
  }
  return parts.join(", ") || "no one";
}

/**
 * Runs one war on this computer: applies moves through the rules, plays back what happened (marches, battles,
 * oaths), lets computer lords take their turns, and shares moves with friends when playing online.
 */
export class BannersController {
  private listeners = new Set<() => void>();
  private view: View;
  private seq = 0;
  private disposed = false;
  private inbox: { id: string; move: Move }[] = [];
  private botRng: Rng;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private skip: (() => void) | null = null;
  private readonly send: ((m: Msg) => void) | null;
  private readonly guest: boolean;
  readonly localId: string;

  constructor(
    private seats: Seat[],
    seed: number,
    rounds: number,
    opts: { send?: (m: Msg) => void; guest?: boolean; localId?: string; fast?: boolean } = {},
  ) {
    this.send = opts.send ?? null;
    this.guest = !!opts.guest;
    this.localId = opts.localId ?? seats.find((s) => !s.bot)?.id ?? seats[0]!.id;
    this.fast = !!opts.fast;
    this.botRng = new Rng(seed ^ 0x5bd1e995);
    const game = banners.setup({ players: seats.map((s) => ({ id: s.id, name: s.name })), config: { rounds }, seed });
    this.view = { game, seats, localId: this.localId, busy: false, chronicle: [], march: null, battle: null, announce: null, flash: null };
    this.log(`The year begins. ${SEASON_INFO.spring.name}: ${SEASON_INFO.spring.blurb}`, "info");
  }

  private readonly fast: boolean;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.view;

  private set(patch: Partial<View>) {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  start() {
    this.after();
  }

  dispose() {
    this.disposed = true;
    this.timers.forEach(clearTimeout);
  }

  private sleep(ms: number) {
    return new Promise<void>((res) => {
      const h = setTimeout(() => {
        this.timers.delete(h);
        this.skip = null;
        res();
      }, this.fast ? ms / 10 : ms);
      this.timers.add(h);
      this.skip = () => {
        clearTimeout(h);
        this.timers.delete(h);
        this.skip = null;
        res();
      };
    });
  }

  /** Hurry the current animation along (a click on a battle or a herald). */
  hurry() {
    this.skip?.();
  }

  get myTurn(): boolean {
    const g = this.view.game;
    return g.phase === "play" && current(g).id === this.localId && !this.view.busy;
  }

  play(move: Move): string | null {
    const g = this.view.game;
    if (!this.myTurn) return "Wait for your turn.";
    const check = banners.validate(g, this.localId, move);
    if (!check.ok) {
      audio.sfx("click");
      return check.error;
    }
    void this.dispatch(this.localId, move, false);
    return null;
  }

  receive(id: string, move: Move) {
    this.inbox.push({ id, move });
    if (!this.view.busy) this.nextRemote();
  }

  /** A friend left: the computer takes their house (host only). */
  takeOver(id: string) {
    const seat = this.seats.find((s) => s.id === id);
    if (!seat || seat.bot || this.guest) return;
    seat.bot = "medium";
    this.log(`${HOUSES[seat.house].name} has lost its lord. A steward takes command.`, "doom", seat.house);
    if (!this.view.busy && current(this.view.game).id === id) this.after();
  }

  private nextRemote(): boolean {
    const n = this.inbox.shift();
    if (!n) return false;
    void this.dispatch(n.id, n.move, true);
    return true;
  }

  private async dispatch(id: string, move: Move, remote: boolean) {
    const g = this.view.game;
    if (!banners.validate(g, id, move).ok) return;
    if (!remote) this.send?.({ t: "move", id, move });
    const { state, events } = banners.apply(g, id, move);
    this.set({ busy: true });
    await this.playback(events, state);
    if (this.disposed) return;
    this.set({ game: state, busy: false, march: null });
    this.after();
  }

  private after() {
    if (this.disposed || this.view.busy) return;
    const g = this.view.game;
    if (g.phase === "over") return;
    if (this.nextRemote()) return;
    const seat = this.seats.find((s) => s.id === current(g).id)!;
    if (seat.id === this.localId && !seat.bot) return;
    if (seat.bot && !this.guest) {
      const h = setTimeout(() => {
        this.timers.delete(h);
        if (this.disposed || this.view.busy || this.view.game !== g) return;
        const m = banners.botMove(g, seat.id, seat.bot!, () => this.botRng.next());
        void this.dispatch(seat.id, m, false);
      }, this.fast ? 20 : 260);
      this.timers.add(h);
    }
  }

  private log(text: string, tone: Entry["tone"], house?: HouseId, merge?: string) {
    const e: Entry = { id: ++this.seq, text, tone, house, round: this.view?.game.round ?? 1, merge };
    const prev = this.view?.chronicle ?? [];
    const last = prev[prev.length - 1];
    // Several musters in a row at the same place read as one line.
    const list = (merge && last?.merge === merge ? [...prev.slice(0, -1), { ...e, id: last.id }] : [...prev, e]).slice(-80);
    if (this.view) this.set({ chronicle: list });
  }

  private involvesMe(ids: (string | null)[]) {
    return ids.some((i) => i === this.localId);
  }

  private async playback(events: GameEvent[], final: BannersState) {
    for (const e of events) {
      if (this.disposed) return;
      await this.play1(e, final);
    }
  }

  private async play1(e: GameEvent, final: BannersState) {
    const H = (id: unknown) => houseOf(this.seats, id as string);
    switch (e.type) {
      case "recruit": {
        audio.sfx("muster");
        const at = e.at as number;
        const key = `muster-${e.player}-${at}-${final.round}`;
        const raised = final.provinces[at]!.tired;
        this.log(`${hname(H(e.player))} raises troops at ${pname(at)}: ${describeArmy(raised)} ready next turn.`, "info", H(e.player) ?? undefined, key);
        // Show the new troops on the map at once.
        this.set({ game: { ...this.view.game, provinces: final.provinces, players: final.players, mustered: final.mustered } });
        await this.sleep(this.involvesMe([e.player as string]) ? 120 : 220);
        break;
      }
      case "castle":
        audio.sfx("seal");
        this.log(`${hname(H(e.player))} raises castle walls at ${pname(e.at as number)}.`, "info", H(e.player) ?? undefined);
        this.set({ game: { ...this.view.game, provinces: final.provinces, players: final.players } });
        await this.sleep(300);
        break;
      case "march": {
        audio.sfx("march");
        const army = e.army as Army;
        const show: MarchShow = { id: ++this.seq, from: e.from as number, to: e.to as number, via: (e.via as number | null) ?? null, house: H(e.player)!, count: size(army) };
        // Lift the column off the map while it marches.
        const g = structuredClone(this.view.game);
        const p = g.provinces[show.from]!;
        p.army = { foot: p.army.foot - army.foot, archers: p.army.archers - army.archers, knights: p.army.knights - army.knights };
        this.set({ march: show, game: g });
        await this.sleep(show.via !== null ? 900 : 650);
        break;
      }
      case "seized": {
        audio.sfx("seize");
        const from = H(e.from);
        this.log(`${hname(H(e.player))} takes ${pname(e.at as number)}${from ? ` from ${hname(from)}` : ""} without a fight.`, "war", H(e.player) ?? undefined);
        this.set({ game: { ...this.view.game, provinces: final.provinces }, march: null, flash: { at: e.at as number, id: ++this.seq } });
        await this.sleep(350);
        break;
      }
      case "battle": {
        const mine = this.involvesMe([e.attacker as string, e.defender as string]);
        const b: BattleShow = {
          id: ++this.seq,
          from: e.from as number,
          at: e.to as number,
          attacker: H(e.attacker)!,
          defender: H(e.defender),
          rounds: e.rounds as BattleRound[],
          aStart: e.aStart as Army,
          dStart: e.dStart as Army,
          aEnd: e.aEnd as Army,
          dEnd: e.dEnd as Army,
          won: e.result === "won",
          mine,
        };
        audio.sfx("clash");
        this.set({ battle: b, march: null });
        const per = mine ? 360 : 140;
        await this.sleep(Math.min(mine ? 4200 : 1500, 700 + b.rounds.length * per));
        audio.sfx(b.won ? (mine && e.attacker === this.localId ? "victory" : "seize") : mine && e.defender === this.localId ? "victory" : "defeat");
        await this.sleep(mine ? 1400 : 500);
        const lostA = size(b.aStart) - size(b.aEnd);
        const lostD = size(b.dStart) - size(b.dEnd);
        this.log(
          b.won
            ? `${hname(b.attacker)} storms ${pname(b.at)}, losing ${lostA}; ${hname(b.defender)} lose ${lostD}.`
            : `${hname(b.defender)} hold ${pname(b.at)} against ${hname(b.attacker)} (${lostA} fall attacking, ${lostD} defending).`,
          "war",
          b.attacker,
        );
        this.set({ battle: null, game: { ...this.view.game, provinces: final.provinces }, flash: b.won ? { at: b.at, id: ++this.seq } : this.view.flash });
        break;
      }
      case "plunder":
        audio.sfx("coin");
        this.log(`${hname(H(e.player))} plunders ${e.gold} gold from the capital of ${hname(H(e.from))}.`, "gold", H(e.player) ?? undefined);
        break;
      case "fallen": {
        audio.sfx("betrayal");
        const h = H(e.player)!;
        this.log(`${hname(h)} has fallen. Its banners are torn down.`, "doom", h);
        this.set({ announce: { id: ++this.seq, kind: "fallen", title: `${HOUSES[h].name} has fallen`, text: `Conquered by ${hname(H(e.by))}.`, house: h, other: H(e.by) ?? undefined } });
        await this.sleep(2200);
        this.set({ announce: null });
        break;
      }
      case "propose":
        audio.sfx("seal");
        this.log(`An envoy of ${hname(H(e.from))} rides to ${hname(H(e.to))}.`, "peace", H(e.from) ?? undefined);
        this.set({ game: { ...this.view.game, proposals: final.proposals } });
        await this.sleep(300);
        break;
      case "alliance": {
        audio.sfx("alliance");
        const a = H(e.a)!;
        const b = H(e.b)!;
        this.log(`${hname(a)} and ${hname(b)} swear an alliance.`, "peace", a);
        this.set({ announce: { id: ++this.seq, kind: "alliance", title: "An oath is sworn", text: `${HOUSES[a].name} and ${HOUSES[b].name} will fight as one.`, house: a, other: b }, game: { ...this.view.game, players: final.players, proposals: final.proposals } });
        await this.sleep(2000);
        this.set({ announce: null });
        break;
      }
      case "refused":
        this.log(`${hname(H(e.to))} sends the envoy of ${hname(H(e.from))} home.`, "info", H(e.to) ?? undefined);
        this.set({ game: { ...this.view.game, proposals: final.proposals } });
        break;
      case "betrayal": {
        audio.sfx("betrayal");
        const a = H(e.by)!;
        const b = H(e.of)!;
        this.log(`${hname(a)} breaks its oath to ${hname(b)}!`, "doom", a);
        this.set({ announce: { id: ++this.seq, kind: "betrayal", title: "Betrayal!", text: `${HOUSES[a].name} has broken its oath to ${HOUSES[b].name}.`, house: a, other: b }, game: { ...this.view.game, players: final.players } });
        await this.sleep(2200);
        this.set({ announce: null });
        break;
      }
      case "tribute":
        audio.sfx("coin");
        this.log(`${hname(H(e.from))} sends ${e.gold} gold to ${hname(H(e.to))}.`, "gold", H(e.from) ?? undefined);
        this.set({ game: { ...this.view.game, players: final.players } });
        break;
      case "round": {
        audio.sfx("bell");
        const season = e.season as Season;
        const tiding = e.tiding as Tiding;
        const at = e.at as number | null;
        const year = Math.ceil((e.round as number) / 4);
        this.log(`${SEASON_INFO[season].name} of year ${year}. ${TIDING_INFO[tiding].name}${at !== null ? ` in ${pname(at)}` : ""}.`, tiding === "plague" ? "doom" : "info");
        this.set({ announce: { id: ++this.seq, kind: "round", title: `${SEASON_INFO[season].name}, year ${year}`, text: `${TIDING_INFO[tiding].name}: ${TIDING_INFO[tiding].blurb}${at !== null ? ` (${pname(at)})` : ""}`, season, tiding } });
        await this.sleep(2300);
        this.set({ announce: null });
        break;
      }
      case "turn": {
        const h = H(e.player)!;
        if (e.player === this.localId) audio.sfx("turn");
        if ((e.income as number) > 0) this.log(`${hname(h)} collects ${e.income} gold.`, "gold", h);
        break;
      }
      case "gameOver":
        audio.sfx("fanfare");
        this.log(e.reason as string, "peace");
        break;
      default:
        break;
    }
  }
}
