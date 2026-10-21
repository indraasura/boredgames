import type { BotLevel } from "@boredgames/engine";
import { JOBS, RULES } from "./content";
import { getBoard } from "./maps";
import { currentPlayer, netWorth } from "./rules";
import type { MilestonesState, Move, Option } from "./types";

/**
 * Bots only ever pick among legal moves. Spinning is luck, so the decisions are road, job, home and
 * the Growth Fund, scored by expected value in $k. `hard` leans to the steady road when ahead and
 * the market-heavy road when trailing; `medium` adds noise; `easy` is random.
 */
export function botMove(s: MilestonesState, level: BotLevel, rand: () => number): Move {
  if (s.phase === "spin" || !s.choice) return { type: "spin" };
  const options = s.choice.options;
  if (level === "easy") return { type: "choose", index: Math.floor(rand() * options.length) };

  const p = currentPlayer(s);
  const board = getBoard(s.map);
  const tiles = board.distToEnd[p.node] ?? 0;
  const paydays = tiles / 5;
  const rounds = tiles / 5.5;
  const rivals = s.players.filter((o) => o !== p);
  const lead = rivals.length ? netWorth(p) - Math.max(...rivals.map(netWorth)) : 0;
  const noise = level === "medium" ? 12 : 0;

  const score = (o: Option): number => {
    switch (o.type) {
      case "route": {
        const jobs = JOBS[o.path.tier];
        const avg = jobs.reduce((sum, j) => sum + j.salary + (j.perk ?? 0) * 0.4, 0) / jobs.length;
        const seg = board.segments[o.path.segment]!;
        const earnTiles = board.distToEnd[o.path.jobsAt === "start" ? seg.first : seg.last] ?? 0;
        return avg * (earnTiles / 5) - o.path.loan * RULES.loanInterest + o.path.cash;
      }
      case "branch":
        return o.vibe === "safe" ? (lead > 0 ? 8 : 0) : lead > 0 ? 0 : 6;
      case "job":
        return o.salary * paydays + (o.perk ?? 0) * 1.3;
      case "home": {
        const gain = o.home.price * (Math.pow(1 + RULES.homeRate * o.home.growth, rounds) - 1);
        const borrowed = Math.max(0, o.home.price - p.cash);
        const interest = Math.ceil(borrowed / RULES.loanChunk) * RULES.loanChunk * (RULES.loanInterest - 1);
        const forgone = Math.min(o.home.price, p.cash) * (Math.pow(1 + RULES.fundRate, rounds) - 1);
        const caution = level === "medium" && borrowed > RULES.loanChunk ? 30 : 0;
        return gain - interest - forgone - caution;
      }
      case "invest": {
        const gain = o.amount * (Math.pow(1 + RULES.fundRate, rounds) - 1);
        // Buy the dip, be wary of a boom that is about to cool, and keep a cushion for bills and lawsuits.
        const mood = s.market === "slump" ? 6 : s.market === "boom" ? -3 : 0;
        return p.cash - o.amount < 40 ? gain - 20 + mood : gain + mood;
      }
      case "insure":
        return p.cash - o.cost < 30 ? -5 : Math.min(22, rounds * 1.1) - o.cost;
      case "settle":
        // The leader protects the lead; someone trailing needs the gamble.
        return -o.amount + (lead > 0 ? 6 : -6);
      case "fight":
        return -o.lose * RULES.fightOdds + (lead > 0 ? -6 : 6);
      case "rent":
        return 0;
      case "skip":
        return 0.5;
    }
  };

  let best = 0;
  let bestScore = -Infinity;
  options.forEach((o, i) => {
    const v = score(o) + (noise ? (rand() - 0.5) * noise : 0);
    if (v > bestScore) {
      bestScore = v;
      best = i;
    }
  });
  return { type: "choose", index: best };
}
