import { Rng, err, ok, type GameEvent, type PlayerId, type Result } from "@boredgames/engine";
import { nextNode } from "./board";
import { BILLS, HOMES_BY_MAP, JOBS, MAP_EVENTS, RULES, SHARED_EVENTS } from "./content";
import { getBoard, getMap } from "./maps";
import type { Choice, Home, JobTier, Market, MilestonesConfig, MilestonesState, Move, Option, PlayerState } from "./types";

export function setup(ctx: {
  players: { id: PlayerId; name: string }[];
  seed: number;
  config?: MilestonesConfig;
}): MilestonesState {
  const def = getMap(ctx.config?.map);
  const players: PlayerState[] = ctx.players.map((p) => ({
    id: p.id,
    name: p.name,
    cash: RULES.startingCash,
    salary: 0,
    career: null,
    route: null,
    tier: null,
    node: getBoard(def.id).start,
    heading: null,
    home: null,
    homeSale: 0,
    loans: 0,
    kids: 0,
    spouse: false,
    retired: false,
    retiredFirst: false,
    fund: 0,
    invested: 0,
    paydays: 0,
    insured: false,
    unpaid: 0,
  }));
  const state: MilestonesState = {
    map: def.id,
    players,
    turn: 0,
    phase: "spin",
    choice: null,
    rng: new Rng(ctx.seed).state,
    turnCount: 0,
    round: 1,
    market: "steady",
  };
  beginTurn(state, []);
  return state;
}

export const currentPlayer = (s: MilestonesState): PlayerState => s.players[s.turn]!;

/** What the player's life is worth right now ($k). At the end of the game this is the score. */
export function netWorth(p: PlayerState): number {
  return Math.round(
    p.cash +
      (p.homeSale || (p.home?.value ?? 0)) +
      p.fund +
      p.kids * RULES.kidValue +
      (p.retiredFirst ? RULES.retireFirstBonus : 0) -
      p.loans * RULES.loanInterest,
  );
}

export function legalMoves(s: MilestonesState, player: PlayerId): Move[] {
  if (s.phase === "over" || currentPlayer(s).id !== player) return [];
  if (s.phase === "spin") return [{ type: "spin" }];
  return (s.choice?.options ?? []).map((_, index) => ({ type: "choose", index }));
}

export function validate(s: MilestonesState, player: PlayerId, move: Move): Result<void> {
  if (s.phase === "over") return err("The game is over.");
  if (currentPlayer(s).id !== player) return err("It is not your turn.");
  if (move.type === "spin") {
    return s.phase === "spin" ? ok(undefined) : err("Make your choice first.");
  }
  if (s.phase !== "choice" || !s.choice) return err("Nothing to choose right now.");
  if (!Number.isInteger(move.index) || move.index < 0 || move.index >= s.choice.options.length) {
    return err("That option does not exist.");
  }
  return ok(undefined);
}

export function apply(
  prev: MilestonesState,
  player: PlayerId,
  move: Move,
): { state: MilestonesState; events: GameEvent[] } {
  const check = validate(prev, player, move);
  if (!check.ok) throw new Error(check.error);

  const s = structuredClone(prev);
  const rng = new Rng(s.rng);
  const events: GameEvent[] = [];

  if (move.type === "spin") spin(s, rng, events);
  else choose(s, move.index, rng, events);

  s.rng = rng.state;
  return { state: s, events };
}

// ---------------------------------------------------------------- turn flow

function beginTurn(s: MilestonesState, events: GameEvent[]): void {
  const p = currentPlayer(s);
  s.turnCount++;
  events.push({ type: "turn", player: p.id, round: s.round });
  if (!p.route) {
    const def = getMap(s.map);
    return openChoice(
      s,
      {
        kind: "route",
        title: "Pick your opening road",
        text: "Each road has a different length and leads to different jobs.",
        then: "spin",
        options: def.paths.map((path) => ({ type: "route", path })),
      },
      events,
    );
  }
  s.phase = "spin";
  s.choice = null;
}

function endTurn(s: MilestonesState, rng: Rng, events: GameEvent[]): void {
  s.choice = null;
  if (s.players.every((p) => p.retired)) return finish(s, events);
  let wrapped = false;
  do {
    s.turn = (s.turn + 1) % s.players.length;
    if (s.turn === 0) wrapped = true;
  } while (currentPlayer(s).retired);
  if (wrapped) tickRound(s, rng, events);
  beginTurn(s, events);
}

function finish(s: MilestonesState, events: GameEvent[]): void {
  for (const p of s.players) p.homeSale = p.home ? Math.round(p.home.value) : 0;
  s.phase = "over";
  s.choice = null;
  events.push({
    type: "gameOver",
    results: s.players.map((p) => ({ player: p.id, net: netWorth(p), homeSale: p.homeSale, fund: Math.round(p.fund) })),
  });
}

/** Cash may never go negative; the bank lends in fixed chunks. */
function settle(p: PlayerState, events: GameEvent[]): void {
  while (p.cash < 0) {
    p.cash += RULES.loanChunk;
    p.loans += RULES.loanChunk;
    events.push({ type: "loan", player: p.id, amount: RULES.loanChunk });
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Moods tend to swing back: slumps are often followed by booms and the reverse. */
const MARKET_NEXT: Record<Market, readonly [Market, number][]> = {
  steady: [["boom", 0.25], ["slump", 0.25], ["steady", 0.5]],
  boom: [["boom", 0.3], ["slump", 0.25], ["steady", 0.45]],
  slump: [["slump", 0.25], ["boom", 0.35], ["steady", 0.4]],
};

/** Once everyone has had a turn, the market moves and with it the Growth Fund and every home. */
function tickRound(s: MilestonesState, rng: Rng, events: GameEvent[]): void {
  s.round++;
  let roll = rng.next();
  let next: Market = s.market;
  for (const [m, w] of MARKET_NEXT[s.market]) {
    next = m;
    if ((roll -= w) < 0) break;
  }
  s.market = next;
  moveMarket(s, RULES.fundRates[next], RULES.homeRate * RULES.homeMult[next]);
  events.push({ type: "round", round: s.round, market: next, change: RULES.fundRates[next] });
}

/** Every Growth Fund moves by `fundPct` and every home by `homePct` x its own growth factor. */
function moveMarket(s: MilestonesState, fundPct: number, homePct: number): void {
  for (const p of s.players) {
    if (p.fund > 0) p.fund = round1(Math.max(0, p.fund * (1 + fundPct)));
    if (p.home) p.home.value = round1(Math.max(1, p.home.value * (1 + homePct * p.home.growth)));
  }
}

// -------------------------------------------------------------------- spin

function spin(s: MilestonesState, rng: Rng, events: GameEvent[]): void {
  const p = currentPlayer(s);
  const board = getBoard(s.map);
  const value = rng.int(1, RULES.maxSpin);
  events.push({ type: "spun", player: p.id, value });

  let left = value;
  while (left > 0) {
    const here = board.nodes[p.node]!;
    const next = nextNode(board, p.node, p.heading);
    if (next === null) break;
    // The pick made at a split is used up once we drive through it.
    if (here.next.length > 1) p.heading = null;
    p.node = next;
    left--;
    const node = board.nodes[next]!;
    events.push({ type: "step", player: p.id, node: next });
    if (node.stop) break;
    // Passing (not landing on) a payday still pays out.
    if (node.type === "payday" && left > 0) collectPay(p, next, true, events);
  }
  land(s, p, rng, events);
}

function collectPay(p: PlayerState, node: number, passing: boolean, events: GameEvent[]): void {
  if (p.unpaid > 0 && p.salary > 0) {
    p.unpaid--;
    events.push({ type: "payday", player: p.id, node, passing, amount: 0, laidOff: true });
    return;
  }
  if (p.salary <= 0) {
    events.push({ type: "payday", player: p.id, node, passing, amount: 0 });
    return;
  }
  p.cash += p.salary;
  p.paydays++;
  events.push({ type: "payday", player: p.id, node, passing, amount: p.salary });
  if (p.paydays % RULES.raiseEvery === 0) {
    const raise = Math.max(2, Math.round(p.salary * RULES.raisePct));
    p.salary += raise;
    events.push({ type: "raise", player: p.id, amount: raise, salary: p.salary });
  }
}

function land(s: MilestonesState, p: PlayerState, rng: Rng, events: GameEvent[]): void {
  const board = getBoard(s.map);
  const node = board.nodes[p.node]!;
  events.push({ type: "landed", player: p.id, node: node.id, tile: node.type });

  switch (node.type) {
    case "payday":
      collectPay(p, node.id, false, events);
      return endTurn(s, rng, events);

    case "event": {
      if (rng.next() < RULES.twistOnEvent) return twist(s, p, true, rng, events);
      const e = rng.pick([...SHARED_EVENTS, ...(MAP_EVENTS[s.map] ?? [])]);
      p.cash += e.cash;
      events.push({ type: "card", player: p.id, kicker: "LIFE EVENT", text: e.text, amount: e.cash });
      settle(p, events);
      return endTurn(s, rng, events);
    }

    case "bills": {
      if (rng.next() < RULES.twistOnBills) return twist(s, p, false, rng, events);
      const bill = rng.pick(BILLS);
      const base = Math.max(RULES.billFloor, p.salary);
      const amount = Math.max(10, Math.round((base * bill.rate) / 5) * 5);
      p.cash -= amount;
      events.push({ type: "card", player: p.id, kicker: "BILLS", text: bill.text, amount: -amount });
      settle(p, events);
      return endTurn(s, rng, events);
    }

    case "invest": {
      const options: Option[] = RULES.fundAmounts.filter((a) => a <= p.cash).map((amount) => ({ type: "invest", amount }));
      if (!p.insured && p.cash >= RULES.insuranceCost) options.push({ type: "insure", cost: RULES.insuranceCost });
      if (options.length === 0) {
        events.push({
          type: "card",
          player: p.id,
          kicker: "MARKET",
          text: "You have no cash to invest.",
          amount: 0,
        });
        return endTurn(s, rng, events);
      }
      options.push({ type: "skip", label: "Not now", detail: "Keep your cash." });
      return openChoice(
        s,
        {
          kind: "invest",
          title: "Invest, or cover yourself?",
          text: `The market is ${MOOD[s.market]}. The Growth Fund rises and falls with it and is paid out at the end. Insurance blocks your next twist.`,
          then: "endTurn",
          options,
        },
        events,
      );
    }

    case "baby": {
      const twins = rng.next() < RULES.twinsChance;
      const added = twins ? 2 : 1;
      p.kids += added;
      events.push({ type: "family", player: p.id, added, twins });
      return endTurn(s, rng, events);
    }

    case "graduate":
      return offerJobs(s, p.tier ?? "trade", "endTurn", rng, events);

    case "wedding":
      p.spouse = true;
      p.cash += RULES.weddingGift;
      events.push({ type: "wedding", player: p.id, gift: RULES.weddingGift });
      return endTurn(s, rng, events);

    case "house": {
      const homes = rng.sample(HOMES_BY_MAP[s.map] ?? HOMES_BY_MAP["sunny-isle"]!, 2);
      const options: Option[] = homes.map((h) => ({ type: "home", home: { ...h, value: h.price } as Home }));
      options.push({ type: "rent" });
      return openChoice(
        s,
        {
          kind: "home",
          title: "Buy a home?",
          text: "A home gains value every round and is sold when you retire. If you are short, the bank lends in $50k chunks.",
          then: "endTurn",
          options,
        },
        events,
      );
    }

    case "fork": {
      const def = getMap(s.map);
      const options: Option[] = node.next.map((id) => {
        const road = board.nodes[id]!.segment;
        const info = def.branches[road];
        return {
          type: "branch",
          node: id,
          name: info?.name ?? board.segments[road]!.name,
          blurb: info?.blurb ?? "",
          vibe: info?.vibe ?? "safe",
        };
      });
      return openChoice(
        s,
        { kind: "branch", title: "Which road?", text: "The road splits. Compare the tiles on each one.", then: "endTurn", options },
        events,
      );
    }

    case "retire":
      p.retired = true;
      p.retiredFirst = !s.players.some((o) => o !== p && o.retired);
      events.push({ type: "retired", player: p.id, first: p.retiredFirst });
      return endTurn(s, rng, events);

    default:
      return endTurn(s, rng, events);
  }
}

// ------------------------------------------------------------------ twists

const MOOD: Record<Market, string> = { boom: "booming (+10% a round)", steady: "steady (+4% a round)", slump: "in a slump (−8% a round)" };

type TwistKind = "lawsuit" | "layoff" | "audit" | "disaster" | "crash" | "boom" | "windfall" | "scandal";
const BAD_TWISTS: readonly TwistKind[] = ["lawsuit", "layoff", "audit", "disaster"];

/** 0 = richest. */
function standing(s: MilestonesState, p: PlayerState): number {
  return s.players.filter((o) => o !== p && netWorth(o) > netWorth(p)).length;
}

const round5 = (n: number) => Math.round(n / 5) * 5;

/**
 * A twist replaces an ordinary Event / Bills card. Bad ones bite the leader harder and good ones
 * favour whoever is behind, so a lead is never safe and a bad start is never hopeless.
 */
function twist(s: MilestonesState, p: PlayerState, anyKind: boolean, rng: Rng, events: GameEvent[]): void {
  const behind = s.players.length > 1 && standing(s, p) === s.players.length - 1;
  const ahead = s.players.length > 1 && standing(s, p) === 0;
  const weights: [TwistKind, number][] = [
    ["lawsuit", ahead ? 4 : 3],
    ["layoff", p.salary > 0 && p.unpaid === 0 ? 2 : 0],
    ["audit", ahead ? 4 : behind ? 0 : 2],
    ["disaster", 2],
  ];
  if (anyKind) {
    weights.push(["crash", 1.5], ["boom", 1.5], ["windfall", behind ? 6 : 3], ["scandal", ahead ? 0 : behind ? 4 : 2]);
  }
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng.next() * total;
  let kind = weights[0]![0];
  for (const [k, w] of weights) {
    if (w > 0) kind = k;
    if ((roll -= w) < 0) break;
  }

  const net = Math.max(0, netWorth(p));
  const card = (kicker: string, text: string, amount: number) => events.push({ type: "card", player: p.id, kicker, text, amount, twist: true });

  if (BAD_TWISTS.includes(kind) && p.insured) {
    p.insured = false;
    events.push({ type: "card", player: p.id, kicker: "INSURED", text: `Your insurance absorbed a ${kind}.`, amount: 0, twist: true });
    return endTurn(s, rng, events);
  }

  switch (kind) {
    case "lawsuit": {
      const amount = Math.max(20, round5(p.salary * 0.3 + net * 0.08));
      return openChoice(
        s,
        {
          kind: "lawsuit",
          title: "You are being sued",
          text: `Settle quietly, or fight it? Even odds in court: win and you pay nothing, lose and you pay double.`,
          then: "endTurn",
          options: [
            { type: "settle", amount },
            { type: "fight", lose: amount * 2 },
          ],
        },
        events,
      );
    }
    case "layoff":
      p.unpaid = 2;
      p.cash += 10;
      card("LAYOFF", "Restructuring. Your next two paydays are skipped. Severance covers a little.", 10);
      break;
    case "audit": {
      const amount = Math.max(15, round5(net * 0.1));
      p.cash -= amount;
      card("TAX AUDIT", "Back taxes, plus penalties.", -amount);
      settle(p, events);
      break;
    }
    case "disaster":
      if (p.home) {
        const loss = Math.round(p.home.value * 0.15);
        p.home.value = round1(p.home.value - loss);
        card("DISASTER", `Storm damage to your ${p.home.name.toLowerCase()}. Its value drops.`, -loss);
      } else {
        const amount = 25;
        p.cash -= amount;
        card("DISASTER", "Your landlord’s pipes burst. You pay for the move.", -amount);
        settle(p, events);
      }
      break;
    case "crash":
      s.market = "slump";
      moveMarket(s, -0.12, 0);
      events.push({ type: "market", player: p.id, market: "slump", headline: "Flash crash! Every Growth Fund drops 12%." });
      break;
    case "boom":
      s.market = "boom";
      moveMarket(s, 0.1, 0);
      events.push({ type: "market", player: p.id, market: "boom", headline: "Market rally! Every Growth Fund jumps 10%." });
      break;
    case "windfall": {
      const amount = behind ? 90 : 40;
      p.cash += amount;
      card(behind ? "COMEBACK" : "WINDFALL", behind ? "An angel investor backs your side project." : "A long-lost relative remembers you.", amount);
      break;
    }
    case "scandal": {
      const leader = s.players.filter((o) => o !== p).sort((a, b) => netWorth(b) - netWorth(a))[0]!;
      const take = Math.min(40, leader.cash);
      leader.cash -= take;
      p.cash += take;
      card("SCANDAL", `${leader.name} is caught in a scandal and you pick up ${take > 0 ? `$${take}k` : "the pieces"}.`, take);
      break;
    }
  }
  endTurn(s, rng, events);
}

// ------------------------------------------------------------------ choices

function openChoice(s: MilestonesState, choice: Choice, events: GameEvent[]): void {
  s.phase = "choice";
  s.choice = choice;
  events.push({ type: "choice", player: currentPlayer(s).id, kind: choice.kind });
}

function offerJobs(s: MilestonesState, tier: JobTier, then: Choice["then"], rng: Rng, events: GameEvent[]): void {
  const jobs = rng.sample(JOBS[tier], 3);
  openChoice(
    s,
    {
      kind: "job",
      title: "Pick a job",
      text: "You get your salary each time you land on or pass a Payday tile.",
      then,
      options: jobs.map((j) => ({ type: "job", title: j.title, salary: j.salary, perk: j.perk })),
    },
    events,
  );
}

function choose(s: MilestonesState, index: number, rng: Rng, events: GameEvent[]): void {
  const p = currentPlayer(s);
  const board = getBoard(s.map);
  const choice = s.choice!;
  const option = choice.options[index]!;
  s.choice = null;
  events.push({ type: "chose", player: p.id, kind: choice.kind, option });

  switch (option.type) {
    case "route": {
      const path = option.path;
      p.route = path.id;
      p.tier = path.tier;
      p.heading = board.segments[path.segment]!.first;
      p.cash += path.cash;
      if (path.loan > 0) {
        p.loans += path.loan;
        events.push({ type: "loan", player: p.id, amount: path.loan, student: true });
      }
      if (path.jobsAt === "start") return offerJobs(s, path.tier, "spin", rng, events);
      break;
    }

    case "branch":
      p.heading = option.node;
      break;

    case "job":
      p.career = option.title;
      p.salary = option.salary;
      if (option.perk) {
        p.fund += option.perk;
        events.push({ type: "gift", player: p.id, value: option.perk });
      }
      break;

    case "home":
      p.home = { ...option.home };
      p.cash -= option.home.price;
      settle(p, events);
      break;

    case "invest":
      p.cash -= option.amount;
      p.fund = round1(p.fund + option.amount);
      p.invested += option.amount;
      events.push({ type: "invested", player: p.id, amount: option.amount });
      break;

    case "insure":
      p.cash -= option.cost;
      p.insured = true;
      events.push({ type: "insured", player: p.id, cost: option.cost });
      break;

    case "settle":
      p.cash -= option.amount;
      events.push({ type: "card", player: p.id, kicker: "SETTLED", text: "You settled out of court.", amount: -option.amount, twist: true });
      settle(p, events);
      break;

    case "fight": {
      const won = rng.next() < RULES.fightOdds;
      if (!won) p.cash -= option.lose;
      events.push({
        type: "card",
        player: p.id,
        kicker: won ? "CASE DISMISSED" : "LOST IN COURT",
        text: won ? "The judge threw it out. You pay nothing." : "The jury sided against you.",
        amount: won ? 0 : -option.lose,
        twist: true,
      });
      settle(p, events);
      break;
    }

    case "rent":
    case "skip":
      break;
  }

  if (choice.then === "spin") s.phase = "spin";
  else endTurn(s, rng, events);
}
