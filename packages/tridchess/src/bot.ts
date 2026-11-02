import type { BotLevel } from "@boredgames/engine";
import { apply, attacked, legalMoves, pseudoMoves } from "./rules";
import { P, colorOf, typeOf, yOf, type Color, type Move, type TridState } from "./types";

const VALUE = [0, 100, 300, 320, 500, 900, 0];
const MATE = 100000;

/** Material plus a nudge for pawns that are marching, from the point of view of `color`. */
function evaluate(s: TridState, color: Color): number {
  let score = 0;
  for (let i = 0; i < 96; i++) {
    const c = s.cells[i]!;
    if (!c) continue;
    const t = typeOf(c);
    let v = VALUE[t]!;
    if (t === P) v += (colorOf(c) === 0 ? yOf(i) : 7 - yOf(i)) * 6;
    score += colorOf(c) === color ? v : -v;
  }
  return score;
}

function order(s: TridState, moves: Move[]) {
  const key = (m: Move) => (m.t === "b" ? 0 : s.cells[m.to] ? 1000 + 10 * VALUE[typeOf(s.cells[m.to]!)]! - VALUE[typeOf(s.cells[m.from]!)]! / 10 : 1);
  return moves.sort((a, b) => key(b) - key(a));
}

class Timeout extends Error {}

function negamax(s: TridState, depth: number, alpha: number, beta: number, deadline: number, counter: { n: number }): number {
  if (++counter.n % 512 === 0 && Date.now() > deadline) throw new Timeout();
  const me = s.turn;
  const them = (1 - me) as Color;
  // The previous mover must not have left their own king attacked.
  if (attacked(s, s.kings[them], me)) return MATE + depth;
  if (depth === 0) return evaluate(s, me);
  let best = -Infinity;
  for (const m of order(s, pseudoMoves(s))) {
    const score = -negamax(apply(s, m), depth - 1, -beta, -alpha, deadline, counter);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  // No move keeps the king safe: mated (a shallow search cannot tell that from stalemate).
  return best <= -MATE ? -MATE - depth : best;
}

/** Choose a legal move. `rand` returns [0,1). */
export function chooseMove(s: TridState, level: BotLevel, rand: () => number = Math.random): Move {
  const legal = legalMoves(s);
  if (!legal.length) throw new Error("no legal moves");
  if (level === "easy") {
    // Takes the best capture it sees, otherwise wanders.
    const caps = legal.filter((m) => m.t === "m" && s.cells[m.to]);
    if (caps.length && rand() < 0.7) return order(s, caps)[0]!;
    return legal[Math.floor(rand() * legal.length)]!;
  }
  const maxDepth = level === "medium" ? 2 : 4;
  const deadline = Date.now() + (level === "medium" ? 350 : 1100);
  let best = order(s, [...legal]);
  const counter = { n: 0 };
  for (let depth = 1; depth <= maxDepth; depth++) {
    let bestScore = -Infinity;
    let bestMove = best[0]!;
    try {
      for (const m of best) {
        const score = -negamax(apply(s, m), depth - 1, -Infinity, Infinity, deadline, counter) + rand() * 4;
        if (score > bestScore) {
          bestScore = score;
          bestMove = m;
        }
      }
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
    best = [bestMove, ...best.filter((m) => m !== bestMove)];
    if (bestScore > MATE / 2) break;
  }
  return best[0]!;
}
