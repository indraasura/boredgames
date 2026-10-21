import type { BotLevel } from "@boredgames/engine";
import { CASTLE_COST, CROWNS_SOLO, MUSTER_CAP, PROVINCES, addArmy, emptyArmy, size } from "./realm";
import { allied, battle, crownsOf, current, isStronghold, playerById, provincesOf, score, unitCost, validate } from "./rules";
import type { Army, BannersState, Move, Unit } from "./types";

/**
 * A computer lord. One decision per call, in order: answer envoys, mind its alliance, raise troops,
 * attack where the odds are good, bring reserves up to the front, end the turn.
 */
export function botMove(s: BannersState, id: string, level: BotLevel, rand: () => number): Move {
  const me = current(s);
  const ok = (m: Move) => validate(s, id, m).ok;

  // ---- envoys waiting for an answer
  const envoy = s.proposals.find((p) => p.to === id);
  if (envoy) return { type: "answer", proposal: envoy.id, accept: wantsAlliance(s, id, envoy.from, rand) };

  // ---- alliances
  if (me.ally && shouldBreak(s, id, level, rand)) return { type: "break" };
  if (!me.ally && s.players.filter((p) => p.alive).length >= 3 && s.round >= 2 && rand() < (level === "easy" ? 0.15 : 0.35)) {
    const target = pickPartner(s, id);
    if (target) {
      const m: Move = { type: "propose", to: target };
      if (ok(m)) return m;
    }
  }

  // ---- raise troops at the most threatened stronghold
  const strongholds = provincesOf(s, id).filter((i) => isStronghold(s, i) && s.mustered[i]! < MUSTER_CAP);
  if (strongholds.length && me.gold >= 2) {
    strongholds.sort((a, b) => threat(s, id, b) - threat(s, id, a) || frontier(s, id, b) - frontier(s, id, a));
    const at = strongholds[0]!;
    const danger = threat(s, id, at) >= size(garrison(s, at));
    let unit: Unit = "foot";
    if (danger && me.gold >= unitCost(s, "archers")) unit = "archers";
    else if (me.gold >= unitCost(s, "knights") + 2 && rand() < (level === "hard" ? 0.6 : 0.4)) unit = "knights";
    // Raise as many of them as the purse and the muster allow, up to two at a time.
    const n = Math.max(1, Math.min(2, MUSTER_CAP - s.mustered[at]!, Math.floor(me.gold / unitCost(s, unit))));
    const m: Move = { type: "recruit", at, unit, count: n };
    if (ok(m)) return m;
    const f: Move = { type: "recruit", at, unit: "foot" };
    if (ok(f)) return f;
  }
  // ---- now and then, a castle on a rich border province
  if (me.gold >= CASTLE_COST + 4 && level !== "easy") {
    const spot = provincesOf(s, id).find((i) => !s.provinces[i]!.castle && PROVINCES[i]!.income >= 2 && frontier(s, id, i) > 0);
    if (spot !== undefined && rand() < 0.5) return { type: "castle", at: spot };
  }

  // ---- attacks
  const attack = bestAttack(s, id, level, rand);
  if (attack) return attack;

  // ---- bring reserves forward
  const move = reinforce(s, id);
  if (move) return move;

  return { type: "end" };
}

const garrison = (s: BannersState, i: number): Army => addArmy(s.provinces[i]!.army, s.provinces[i]!.tired);

/** Troops of rival houses next to a province. */
export function threat(s: BannersState, id: string, i: number): number {
  let t = 0;
  for (const j of PROVINCES[i]!.adj) {
    const o = s.provinces[j]!.owner;
    if (o && o !== id && !allied(s, o, id)) t += size(garrison(s, j));
  }
  return t;
}

/** How many neighbours are not ours (or our ally's). */
function frontier(s: BannersState, id: string, i: number): number {
  return PROVINCES[i]!.adj.filter((j) => {
    const o = s.provinces[j]!.owner;
    return o !== id && !allied(s, o, id);
  }).length;
}

export function winChance(s: BannersState, attackerId: string, at: number, army: Army, rand: () => number, trials = 60): number {
  const def = garrison(s, at);
  if (size(def) === 0) return 1;
  let wins = 0;
  for (let k = 0; k < trials; k++) if (battle(s, attackerId, at, { ...army }, { ...def }, rand).won) wins++;
  return wins / trials;
}

function bestAttack(s: BannersState, id: string, level: BotLevel, rand: () => number): Move | null {
  const need = level === "easy" ? 0.72 : level === "medium" ? 0.58 : 0.5;
  // What each of our provinces can spare: everything ready, less a guard where rivals are next door.
  const spare = new Map<number, Army>();
  for (const i of provincesOf(s, id)) {
    const ready = s.provinces[i]!.army;
    if (size(ready) === 0) continue;
    const danger = threat(s, id, i);
    const important = PROVINCES[i]!.crown || s.provinces[i]!.castle;
    const keep = danger > 0 ? Math.min(size(ready) - 1, Math.ceil(danger * (important ? 0.8 : 0.3))) : 0;
    if (size(ready) - keep > 0) spare.set(i, trim(ready, keep));
  }
  let best: { m: Move; v: number } | null = null;
  const targets = new Set<number>();
  for (const i of spare.keys()) for (const j of PROVINCES[i]!.adj) if (s.provinces[j]!.owner !== id) targets.add(j);
  for (const j of targets) {
    // Every neighbour that can spare troops joins in, one column after another.
    const sources = PROVINCES[j]!.adj.filter((i) => spare.has(i) && validate(s, id, { type: "march", from: i, to: j, army: spare.get(i)! }).ok);
    if (!sources.length) continue;
    const total = sources.reduce((acc, i) => addArmy(acc, spare.get(i)!), emptyArmy());
    const p = winChance(s, id, j, total, rand, level === "hard" ? 80 : 40);
    if (p < need) continue;
    const target = PROVINCES[j]!;
    const owner = playerById(s, s.provinces[j]!.owner);
    let value = target.income + (target.crown ? 7 : 0) + (owner && owner.capital === j ? 3 : 0) + (s.provinces[j]!.castle ? 2 : 0);
    if (owner && isLeader(s, owner.id)) value += 2;
    const v = value * p + rand() * (level === "easy" ? 3 : 1);
    if (!best || v > best.v) {
      // Lead with the strongest column.
      const lead = sources.sort((a, b) => size(spare.get(b)!) - size(spare.get(a)!))[0]!;
      best = { m: { type: "march", from: lead, to: j, army: spare.get(lead)! }, v };
    }
  }
  return best?.m ?? null;
}

/** All ready troops except `keep`, keeping the archers home first. */
function trim(a: Army, keep: number): Army {
  const out = { ...a };
  let k = keep;
  for (const u of ["archers", "foot", "knights"] as const) {
    const t = Math.min(k, out[u]);
    out[u] -= t;
    k -= t;
  }
  return out;
}

/** Move a reserve from a quiet province one step towards the nearest border. */
function reinforce(s: BannersState, id: string): Move | null {
  const mine = provincesOf(s, id);
  const dist = new Map<number, number>();
  const queue: number[] = [];
  for (const i of mine) if (frontier(s, id, i) > 0) {
    dist.set(i, 0);
    queue.push(i);
  }
  while (queue.length) {
    const i = queue.shift()!;
    for (const j of PROVINCES[i]!.adj) if (s.provinces[j]!.owner === id && !dist.has(j)) {
      dist.set(j, dist.get(i)! + 1);
      queue.push(j);
    }
  }
  for (const i of mine) {
    const d = dist.get(i) ?? 99;
    const ready = s.provinces[i]!.army;
    if (d === 0 || size(ready) === 0) continue;
    const options = PROVINCES[i]!.adj.filter((j) => s.provinces[j]!.owner === id && (dist.get(j) ?? 99) < d).sort((a, b) => threat(s, id, b) - threat(s, id, a));
    for (const next of options) {
      const m: Move = { type: "march", from: i, to: next, army: { ...ready } };
      if (validate(s, id, m).ok) return m;
    }
  }
  return null;
}

function isLeader(s: BannersState, id: string): boolean {
  const alive = s.players.filter((p) => p.alive);
  const best = Math.max(...alive.map((p) => score(s, p.id)));
  return score(s, id) === best;
}

function wantsAlliance(s: BannersState, me: string, from: string, rand: () => number): boolean {
  if (playerById(s, me)!.ally) return false;
  // Never help the leader run away with it, unless we are the leader's closest rival.
  if (isLeader(s, from) && !isLeader(s, me)) return rand() < 0.2;
  // Prefer partners we do not share long borders with.
  const borders = provincesOf(s, me).filter((i) => PROVINCES[i]!.adj.some((j) => s.provinces[j]!.owner === from)).length;
  return rand() < (borders >= 3 ? 0.35 : 0.75);
}

function pickPartner(s: BannersState, me: string): string | null {
  const others = s.players.filter((p) => p.alive && p.id !== me && !p.ally && !s.proposals.some((q) => q.from === me && q.to === p.id));
  if (!others.length) return null;
  const leader = others.filter((p) => isLeader(s, p.id));
  const pool = others.filter((p) => !leader.includes(p));
  const list = pool.length ? pool : others;
  list.sort((a, b) => sharedBorder(s, me, a.id) - sharedBorder(s, me, b.id));
  return list[0]!.id;
}

const sharedBorder = (s: BannersState, a: string, b: string) => provincesOf(s, a).filter((i) => PROVINCES[i]!.adj.some((j) => s.provinces[j]!.owner === b)).length;

function shouldBreak(s: BannersState, me: string, level: BotLevel, rand: () => number): boolean {
  const p = playerById(s, me)!;
  const ally = playerById(s, p.ally)!;
  // An ally one crown short of winning alone is a danger.
  if (crownsOf(s, ally.id) >= CROWNS_SOLO - 1 && crownsOf(s, me) < crownsOf(s, ally.id)) return rand() < (level === "easy" ? 0.3 : 0.7);
  // Late in the war, a lord who is behind looks for a way past his friend.
  if (s.round >= s.rounds - 2 && score(s, ally.id) > score(s, me) + 3) return rand() < 0.4;
  return false;
}

export { emptyArmy };
