import { Rng, err, ok, type GameEvent, type PlayerId, type Result } from "@boredgames/engine";
import {
  BETRAYAL_PRESTIGE,
  CASTLE_COST,
  COST,
  CROWNS,
  CROWNS_ALLIANCE,
  CROWNS_SOLO,
  DECREE_INFO,
  DEFAULT_ROUNDS,
  GRUDGE_ROUNDS,
  HOUSES,
  MUSTER_CAP,
  PROVINCES,
  ROYAL_LEVY,
  SEATING,
  START_GOLD,
  addArmy,
  emptyArmy,
  fits,
  isAdjacent,
  provinceByName,
  size,
  subArmy,
  validArmy,
} from "./realm";
import type { Army, BannersConfig, BannersState, BattleRound, DecreeKind, Move, PlayerState, Province, Season, Tiding, Unit } from "./types";
import { SEASONS } from "./types";

const clone = <T>(x: T): T => structuredClone(x);

export const seasonOf = (round: number): Season => SEASONS[(round - 1) % 4]!;
export const current = (s: BannersState): PlayerState => s.players[s.turn]!;
export const playerById = (s: BannersState, id: string | null) => (id ? s.players.find((p) => p.id === id) : undefined);

export function setup(ctx: { players: { id: PlayerId; name: string }[]; config: BannersConfig; seed: number }): BannersState {
  const n = ctx.players.length;
  if (n < 2 || n > 4) throw new Error("Banners is for 2 to 4 players");
  const rng = new Rng(ctx.seed);
  const provinces: Province[] = PROVINCES.map((p) => {
    // Local lords hold the land until a house takes it. The great cities are walled and well kept.
    const garrison = p.crown ? { foot: 2, archers: 1, knights: 0 } : { foot: rng.int(1, 2), archers: p.terrain === "hills" ? 1 : 0, knights: 0 };
    return { owner: null, army: garrison, tired: emptyArmy(), castle: p.crown };
  });
  const players: PlayerState[] = ctx.players.map((pl, i) => {
    const house = HOUSES[SEATING[n]![i]!];
    const cap = provinceByName(house.capital).id;
    provinces[cap] = { owner: pl.id, army: { foot: 3, archers: 1, knights: 1 }, tired: emptyArmy(), castle: true };
    for (const h of house.home) provinces[provinceByName(h).id] = { owner: pl.id, army: { foot: 1, archers: 0, knights: 0 }, tired: emptyArmy(), castle: false };
    return { id: pl.id, name: pl.name, house: house.id, gold: START_GOLD, capital: cap, alive: true, ally: null, allySince: 0, prestige: 0, grudges: [], decree: null };
  });
  const s: BannersState = {
    players,
    provinces,
    turn: 0,
    round: 1,
    rounds: ctx.config.rounds ?? DEFAULT_ROUNDS,
    phase: "play",
    rng: rng.state,
    proposals: [],
    nextProposal: 1,
    mustered: PROVINCES.map(() => 0),
    tiding: "quiet",
    tidingAt: null,
    winners: null,
    winReason: null,
  };
  assignDecrees(s);
  // The first turn's income is collected here; later turns collect it as they begin.
  collect(s, []);
  return s;
}

// ------------------------------------------------------------------ queries

export const provincesOf = (s: BannersState, id: string) => s.provinces.map((p, i) => (p.owner === id ? i : -1)).filter((i) => i >= 0);
export const crownsOf = (s: BannersState, id: string) => CROWNS.filter((c) => s.provinces[c]!.owner === id).length;
export const isStronghold = (s: BannersState, i: number) => s.provinces[i]!.castle || PROVINCES[i]!.crown;
export const allied = (s: BannersState, a: string | null, b: string | null) => !!a && !!b && a !== b && playerById(s, a)?.ally === b;

export function income(s: BannersState, id: string): number {
  // Every house also draws a royal levy, so even a small realm can keep fighting.
  let g = ROYAL_LEVY;
  for (const i of provincesOf(s, id)) g += PROVINCES[i]!.income;
  if (seasonOf(s.round) === "autumn") g = Math.floor(g * 1.5);
  return g;
}

export function unitCost(s: BannersState, u: Unit): number {
  return u === "knights" && s.tiding === "mercenaries" ? 3 : COST[u];
}

export function score(s: BannersState, id: string): number {
  const p = playerById(s, id)!;
  const castles = provincesOf(s, id).filter((i) => s.provinces[i]!.castle).length;
  return crownsOf(s, id) * 3 + provincesOf(s, id).length + castles * 2 + Math.floor(p.gold / 10) - p.prestige;
}

/** Total troops a player has everywhere. */
export function strength(s: BannersState, id: string): number {
  let n = 0;
  for (const i of provincesOf(s, id)) n += size(s.provinces[i]!.army) + size(s.provinces[i]!.tired);
  return n;
}

const wrap = (s: BannersState) => {
  const r = new Rng(s.rng);
  return { r, save: () => (s.rng = r.state) };
};

// ------------------------------------------------------------------ validation

export function validate(s: BannersState, player: PlayerId, m: Move): Result<void> {
  if (s.phase !== "play") return err("The war is over.");
  const me = current(s);
  if (me.id !== player) return err("It is not your turn.");
  switch (m.type) {
    case "recruit": {
      const p = s.provinces[m.at];
      const count = m.count ?? 1;
      if (!p || p.owner !== player) return err("You do not hold that province.");
      if (!isStronghold(s, m.at)) return err("Troops can only be raised at a castle or a crown city.");
      if (!Number.isInteger(count) || count < 1) return err("Raise at least one.");
      if (s.mustered[m.at]! + count > MUSTER_CAP) return err(`A stronghold raises at most ${MUSTER_CAP} troops a turn.`);
      if (me.gold < unitCost(s, m.unit) * count) return err("Not enough gold.");
      return ok(undefined);
    }
    case "castle": {
      const p = s.provinces[m.at];
      if (!p || p.owner !== player) return err("You do not hold that province.");
      if (p.castle) return err("There is already a castle.");
      if (me.gold < CASTLE_COST) return err("Not enough gold.");
      return ok(undefined);
    }
    case "march": {
      const from = s.provinces[m.from];
      const to = s.provinces[m.to];
      if (!from || !to || m.from === m.to) return err("Pick two provinces.");
      if (from.owner !== player) return err("Those are not your troops.");
      if (!validArmy(m.army) || size(m.army) === 0) return err("Choose who marches.");
      if (!fits(m.army, from.army)) return err("Those troops are not ready to march.");
      if (s.tiding === "storms" && s.tidingAt === m.to) return err("Storms have washed out the roads there.");
      const winter = seasonOf(s.round) === "winter";
      if (m.via !== undefined) {
        if (winter) return err("In winter, knights ride only one province.");
        if (m.army.foot || m.army.archers) return err("Only knights can ride two provinces.");
        const via = s.provinces[m.via];
        if (!via || !isAdjacent(m.from, m.via) || !isAdjacent(m.via, m.to)) return err("That is not a road.");
        if (via.owner !== player && !allied(s, via.owner, player)) return err("Knights can only ride through your own or allied land.");
        if (s.tiding === "storms" && s.tidingAt === m.via) return err("Storms have washed out the roads there.");
      } else if (!isAdjacent(m.from, m.to)) return err("That province is not next door.");
      if (to.owner && allied(s, to.owner, player)) return err("That is your ally's land.");
      return ok(undefined);
    }
    case "propose": {
      if (s.players.length < 3) return err("Alliances need at least three houses.");
      const t = playerById(s, m.to);
      if (!t || !t.alive || t.id === player) return err("No such house.");
      if (me.ally) return err("You already have an ally.");
      if (t.ally) return err("They already have an ally.");
      if (me.grudges.some((g) => g.id === t.id && g.until >= s.round) || t.grudges.some((g) => g.id === me.id && g.until >= s.round)) return err("There is bad blood between you. Wait a while.");
      if (s.proposals.some((p) => p.from === player && p.to === t.id)) return err("Your envoy is already on the road.");
      return ok(undefined);
    }
    case "answer": {
      const pr = s.proposals.find((p) => p.id === m.proposal);
      if (!pr || pr.to !== player) return err("No such envoy.");
      return ok(undefined);
    }
    case "break":
      return me.ally ? ok(undefined) : err("You have no ally.");
    case "tribute": {
      const t = playerById(s, m.to);
      if (!t || !t.alive || t.id === player) return err("No such house.");
      if (!Number.isInteger(m.gold) || m.gold < 1 || m.gold > me.gold) return err("Not that much gold.");
      return ok(undefined);
    }
    case "end":
      return ok(undefined);
  }
}

export function legalMoves(s: BannersState, player: PlayerId): Move[] {
  if (s.phase !== "play" || current(s).id !== player) return [];
  const out: Move[] = [{ type: "end" }];
  for (const i of provincesOf(s, player)) {
    for (const u of ["foot", "archers", "knights"] as const) if (validate(s, player, { type: "recruit", at: i, unit: u }).ok) out.push({ type: "recruit", at: i, unit: u });
    const a = s.provinces[i]!.army;
    if (size(a) > 0) for (const j of PROVINCES[i]!.adj) {
      const m: Move = { type: "march", from: i, to: j, army: { ...a } };
      if (validate(s, player, m).ok) out.push(m);
    }
  }
  return out;
}

// ------------------------------------------------------------------ apply

export function apply(state: BannersState, player: PlayerId, m: Move): { state: BannersState; events: GameEvent[] } {
  const check = validate(state, player, m);
  if (!check.ok) throw new Error(check.error);
  const s = clone(state);
  const ev: GameEvent[] = [];
  const me = current(s);
  switch (m.type) {
    case "recruit": {
      const count = m.count ?? 1;
      me.gold -= unitCost(s, m.unit) * count;
      const p = s.provinces[m.at]!;
      p.tired[m.unit] += count;
      s.mustered[m.at]! += count;
      ev.push({ type: "recruit", player: me.id, at: m.at, unit: m.unit, count });
      if (s.mustered.reduce((a, b) => a + b, 0) >= 3) fulfil(s, me, "muster", ev);
      break;
    }
    case "castle": {
      me.gold -= CASTLE_COST;
      s.provinces[m.at]!.castle = true;
      ev.push({ type: "castle", player: me.id, at: m.at });
      fulfil(s, me, "castle", ev);
      break;
    }
    case "march":
      march(s, me, m, ev);
      break;
    case "propose":
      s.proposals.push({ id: s.nextProposal++, from: me.id, to: m.to, round: s.round });
      ev.push({ type: "propose", from: me.id, to: m.to });
      break;
    case "answer": {
      const pr = s.proposals.find((p) => p.id === m.proposal)!;
      s.proposals = s.proposals.filter((p) => p.id !== pr.id);
      const from = playerById(s, pr.from)!;
      if (m.accept && !from.ally && !me.ally && from.alive) {
        from.ally = me.id;
        me.ally = from.id;
        from.allySince = me.allySince = s.round + 1;
        // Anyone else courting either of them is turned away.
        s.proposals = s.proposals.filter((p) => p.from !== me.id && p.to !== me.id && p.from !== from.id && p.to !== from.id);
        ev.push({ type: "alliance", a: from.id, b: me.id });
      } else {
        ev.push({ type: "refused", from: pr.from, to: me.id });
      }
      break;
    }
    case "break": {
      const other = playerById(s, me.ally)!;
      me.ally = null;
      other.ally = null;
      me.prestige += BETRAYAL_PRESTIGE;
      other.grudges.push({ id: me.id, until: s.round + GRUDGE_ROUNDS });
      ev.push({ type: "betrayal", by: me.id, of: other.id });
      break;
    }
    case "tribute": {
      const t = playerById(s, m.to)!;
      me.gold -= m.gold;
      t.gold += m.gold;
      ev.push({ type: "tribute", from: me.id, to: t.id, gold: m.gold });
      break;
    }
    case "end":
      endTurn(s, ev);
      break;
  }
  return { state: s, events: ev };
}

function march(s: BannersState, me: PlayerState, m: Extract<Move, { type: "march" }>, ev: GameEvent[]) {
  const from = s.provinces[m.from]!;
  const to = s.provinces[m.to]!;
  from.army = subArmy(from.army, m.army);
  ev.push({ type: "march", player: me.id, from: m.from, to: m.to, via: m.via ?? null, army: m.army });
  if (to.owner === me.id) {
    to.tired = addArmy(to.tired, m.army);
    return;
  }
  const defenders = addArmy(to.army, to.tired);
  if (size(defenders) === 0) {
    const prev = to.owner;
    to.owner = me.id;
    to.army = emptyArmy();
    to.tired = { ...m.army };
    ev.push({ type: "seized", player: me.id, at: m.to, from: prev });
    afterCapture(s, me, m.to, prev, ev);
    return;
  }
  const { r, save } = wrap(s);
  const result = battle(s, me.id, m.to, { ...m.army }, defenders, () => r.next());
  save();
  ev.push({ type: "battle", attacker: me.id, defender: to.owner, from: m.from, to: m.to, ...result.report });
  if (result.won) {
    const prev = to.owner;
    to.owner = me.id;
    to.army = emptyArmy();
    to.tired = result.attacker;
    afterCapture(s, me, m.to, prev, ev);
    if (m.army.knights > 0) fulfil(s, me, "knights", ev);
  } else {
    // The defenders who are left hold; the attackers who are left fall back, too tired to march again.
    const split = takeFrom(to.army, to.tired, result.defender);
    to.army = split.ready;
    to.tired = split.tired;
    from.tired = addArmy(from.tired, result.attacker);
  }
}

/** Split the surviving defenders back into tired and ready troops. */
function takeFrom(ready: Army, tired: Army, survivors: Army): { ready: Army; tired: Army } {
  const r = emptyArmy();
  const t = emptyArmy();
  for (const u of ["foot", "archers", "knights"] as const) {
    const keepTired = Math.min(tired[u], survivors[u]);
    t[u] = keepTired;
    r[u] = Math.min(ready[u], survivors[u] - keepTired);
  }
  return { ready: r, tired: t };
}

function afterCapture(s: BannersState, me: PlayerState, at: number, prev: string | null, ev: GameEvent[]) {
  fulfil(s, me, "conquer", ev);
  if (PROVINCES[at]!.crown) {
    ev.push({ type: "crownTaken", player: me.id, at, crowns: crownsOf(s, me.id) });
    fulfil(s, me, "crown", ev);
  }
  const loser = playerById(s, prev);
  if (!loser) return;
  if (loser.capital === at) {
    const plunder = Math.floor(loser.gold / 2);
    loser.gold -= plunder;
    me.gold += plunder;
    ev.push({ type: "plunder", player: me.id, from: loser.id, gold: plunder });
  }
  if (provincesOf(s, loser.id).length === 0) {
    loser.alive = false;
    if (loser.ally) {
      const a = playerById(s, loser.ally);
      if (a) a.ally = null;
      loser.ally = null;
    }
    s.proposals = s.proposals.filter((p) => p.from !== loser.id && p.to !== loser.id);
    ev.push({ type: "fallen", player: loser.id, by: me.id });
  }
}

/**
 * Dice battle, fought to a finish or a retreat. Each round the attacker rolls up to three dice (two in winter)
 * and the defender up to two (three behind castle walls); highest against highest, ties to the defender.
 * Knights give the attacker +1 on the best die; archers, hills and a nearby ally each give the defender +1
 * (at most +2). The attacker falls back once two thirds of the column is lost.
 */
export function battle(
  s: BannersState,
  attackerId: string,
  at: number,
  attacker: Army,
  defender: Army,
  rand: () => number,
): { won: boolean; attacker: Army; defender: Army; report: { rounds: BattleRound[]; aStart: Army; dStart: Army; aEnd: Army; dEnd: Army; result: "won" | "repelled" } } {
  const aStart = { ...attacker };
  const dStart = { ...defender };
  const prov = s.provinces[at]!;
  const def = PROVINCES[at]!;
  const winter = seasonOf(s.round) === "winter";
  const ally = playerById(s, prov.owner)?.ally ?? null;
  const allyNear = !!ally && def.adj.some((j) => s.provinces[j]!.owner === ally && size(addArmy(s.provinces[j]!.army, s.provinces[j]!.tired)) > 0);
  const startSize = size(attacker);
  const floor = Math.ceil(startSize / 3);
  const rounds: BattleRound[] = [];
  const die = () => 1 + Math.floor(rand() * 6);
  const lose = (a: Army) => {
    // The cheapest troops fall first.
    if (a.foot > 0) a.foot--;
    else if (a.archers > 0) a.archers--;
    else a.knights--;
  };
  while (size(attacker) > 0 && size(defender) > 0 && rounds.length < 40) {
    if (size(attacker) < floor && rounds.length > 0) break;
    const aN = Math.min(winter ? 2 : 3, size(attacker));
    const dN = Math.min(prov.castle ? 3 : 2, size(defender));
    const a = Array.from({ length: aN }, die).sort((x, y) => y - x);
    const d = Array.from({ length: dN }, die).sort((x, y) => y - x);
    if (attacker.knights > 0 && def.terrain !== "forest") a[0] = a[0]! + 1;
    const dBonus = Math.min(2, (defender.archers > 0 ? 1 : 0) + (def.terrain === "hills" ? 1 : 0) + (allyNear ? 1 : 0));
    d[0] = d[0]! + dBonus;
    let aLoss = 0;
    let dLoss = 0;
    for (let k = 0; k < Math.min(a.length, d.length); k++) {
      if (a[k]! > d[k]!) {
        lose(defender);
        dLoss++;
      } else {
        lose(attacker);
        aLoss++;
      }
    }
    rounds.push({ a, d, aLoss, dLoss });
  }
  const won = size(defender) === 0 && size(attacker) > 0;
  void attackerId;
  return { won, attacker, defender, report: { rounds, aStart, dStart, aEnd: { ...attacker }, dEnd: { ...defender }, result: won ? "won" : "repelled" } };
}

// ------------------------------------------------------------------ turns and rounds

function endTurn(s: BannersState, ev: GameEvent[]) {
  const me = current(s);
  // Rest: everyone who marched this turn is ready again next time.
  for (const i of provincesOf(s, me.id)) {
    const p = s.provinces[i]!;
    p.army = addArmy(p.army, p.tired);
    p.tired = emptyArmy();
  }
  ev.push({ type: "turnEnd", player: me.id });
  // Next living house; a new round when we wrap.
  let next = s.turn;
  let wrapped = false;
  for (let k = 0; k < s.players.length; k++) {
    next = (next + 1) % s.players.length;
    if (next === 0) wrapped = true;
    if (s.players[next]!.alive) break;
  }
  if (wrapped) {
    endRound(s, ev);
    if (s.phase === "over") return;
  }
  s.turn = next;
  collect(s, ev);
}

function collect(s: BannersState, ev: GameEvent[]) {
  const me = current(s);
  s.mustered = PROVINCES.map(() => 0);
  // Envoys this house sent last time and nobody answered come home.
  s.proposals = s.proposals.filter((p) => !(p.from === me.id && p.round < s.round));
  const g = income(s, me.id);
  me.gold += g;
  ev.push({ type: "turn", player: me.id, round: s.round, season: seasonOf(s.round), income: g });
}

function endRound(s: BannersState, ev: GameEvent[]) {
  const alive = s.players.filter((p) => p.alive);
  // ---- victory
  for (const p of alive) {
    if (crownsOf(s, p.id) >= CROWNS_SOLO) return finish(s, [p.id], `${HOUSES[p.house].name} holds ${crownsOf(s, p.id)} crowns and takes the realm.`, ev);
  }
  for (const p of alive) {
    const a = playerById(s, p.ally);
    if (a && a.alive && p.allySince <= s.round && p.id < a.id && crownsOf(s, p.id) + crownsOf(s, a.id) >= CROWNS_ALLIANCE) {
      return finish(s, [p.id, a.id], `${HOUSES[p.house].name} and ${HOUSES[a.house].name} rule the realm together.`, ev);
    }
  }
  if (alive.length === 1) return finish(s, [alive[0]!.id], `${HOUSES[alive[0]!.house].name} stands alone.`, ev);
  if (s.round >= s.rounds) {
    const best = Math.max(...alive.map((p) => score(s, p.id)));
    const top = alive.filter((p) => score(s, p.id) === best).map((p) => p.id);
    return finish(s, top, "The years of war are over, and the realm judges who stands tallest.", ev);
  }
  // ---- a new round, and its tidings
  s.round++;
  for (const p of s.players) p.grudges = p.grudges.filter((g) => g.until >= s.round);
  const { r, save } = wrap(s);
  const roll = r.next();
  const t: Tiding = roll < 0.4 ? "quiet" : roll < 0.58 ? "harvest" : roll < 0.74 ? "mercenaries" : roll < 0.88 ? "storms" : "plague";
  s.tiding = t;
  s.tidingAt = null;
  if (t === "harvest") for (const p of alive) p.gold += 2;
  if (t === "plague") {
    const hit = s.provinces.map((p, i) => (p.owner && p.army.foot + p.tired.foot >= 3 ? i : -1)).filter((i) => i >= 0);
    if (hit.length) {
      const i = hit[Math.floor(r.next() * hit.length)]!;
      const p = s.provinces[i]!;
      p.army.foot = Math.ceil(p.army.foot / 2);
      p.tired.foot = Math.ceil(p.tired.foot / 2);
      s.tidingAt = i;
    }
  }
  if (t === "storms") s.tidingAt = Math.floor(r.next() * PROVINCES.length);
  save();
  assignDecrees(s);
  ev.push({ type: "round", round: s.round, season: seasonOf(s.round), tiding: t, at: s.tidingAt });
}

/** Each living house gets a decree for the new round, suited to where it stands. */
function assignDecrees(s: BannersState) {
  const { r, save } = wrap(s);
  for (const p of s.players) {
    if (!p.alive) {
      p.decree = null;
      continue;
    }
    const mine = provincesOf(s, p.id);
    const crownNear = CROWNS.some((c) => {
      const o = s.provinces[c]!.owner;
      return o !== p.id && !allied(s, o, p.id) && mine.some((i) => PROVINCES[i]!.adj.includes(c));
    });
    const pool: DecreeKind[] = ["conquer", "conquer", "knights", "muster"];
    if (crownNear) pool.push("crown", "crown");
    if (p.gold >= CASTLE_COST) pool.push("castle");
    const kind = pool[Math.floor(r.next() * pool.length)]!;
    p.decree = { kind, reward: DECREE_INFO[kind].reward, done: false };
  }
  save();
}

/** Complete a house's decree, if this is what it asked for. */
function fulfil(s: BannersState, me: PlayerState, kind: DecreeKind, ev: GameEvent[]) {
  const d = me.decree;
  if (!d || d.done || d.kind !== kind) return;
  d.done = true;
  me.gold += d.reward;
  ev.push({ type: "decree", player: me.id, kind, reward: d.reward });
}

function finish(s: BannersState, winners: string[], reason: string, ev: GameEvent[]) {
  s.phase = "over";
  s.winners = winners;
  s.winReason = reason;
  ev.push({ type: "gameOver", winners, reason });
}

export function ranking(s: BannersState): string[][] {
  const order = [...s.players].sort((a, b) => {
    const wa = s.winners?.includes(a.id) ? 1 : 0;
    const wb = s.winners?.includes(b.id) ? 1 : 0;
    if (wa !== wb) return wb - wa;
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return score(s, b.id) - score(s, a.id);
  });
  const out: string[][] = [];
  for (const p of order) {
    const last = out[out.length - 1];
    const prev = last ? s.players.find((x) => x.id === last[0]) : undefined;
    const same = prev && (s.winners?.includes(prev.id) ?? false) === (s.winners?.includes(p.id) ?? false) && score(s, prev.id) === score(s, p.id) && prev.alive === p.alive;
    if (same) last!.push(p.id);
    else out.push([p.id]);
  }
  return out;
}
