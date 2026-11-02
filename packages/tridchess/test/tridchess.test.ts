import { describe, expect, it } from "vitest";
import { Rng } from "@boredgames/engine";
import { BLACK, K, P, Q, R, WHITE, apply, boardController, chooseMove, exists, idx, inCheck, legalMoves, liveSquares, make, newGame, sameMove, status, typeOf, type TridState } from "../src";

const empty = (): TridState => {
  const s = newGame();
  s.cells.fill(0);
  return s;
};
const place = (s: TridState, x: number, y: number, z: number, type: number, color: 0 | 1) => {
  s.cells[idx(x, y, z)] = make(type, color);
  if (type === K) s.kings[color] = idx(x, y, z);
};
const count = (s: TridState) => s.cells.reduce((n, c) => n + (c ? 1 : 0), 0);

describe("setup", () => {
  it("has 16 pieces a side on live squares and 64 squares", () => {
    const s = newGame();
    expect(count(s)).toBe(32);
    const live = liveSquares(s.boards);
    expect(live).toHaveLength(64);
    for (let i = 0; i < 96; i++) if (s.cells[i]) expect(live).toContain(i);
  });

  it("starts with moves for white and no check", () => {
    const s = newGame();
    expect(legalMoves(s).length).toBeGreaterThan(5);
    expect(status(s)).toEqual({ over: false, check: false });
  });
});

describe("pieces", () => {
  it("a rook slides along all three axes", () => {
    const s = empty();
    place(s, 0, 2, 0, R, WHITE);
    place(s, 3, 0, 0, K, WHITE);
    place(s, 3, 7, 2, K, BLACK);
    const to = legalMoves(s).flatMap((m) => (m.t === "m" && m.from === idx(0, 2, 0) ? [m.to] : []));
    expect(to).toContain(idx(0, 5, 0)); // along the file
    expect(to).toContain(idx(3, 2, 0)); // along the rank
    expect(to).toContain(idx(0, 2, 2)); // up through the levels
  });

  it("a queen's line is stopped by a piece in the way", () => {
    const s = empty();
    place(s, 0, 2, 0, Q, WHITE);
    place(s, 0, 4, 0, P, WHITE);
    place(s, 3, 0, 0, K, WHITE);
    place(s, 3, 7, 2, K, BLACK);
    const to = legalMoves(s).flatMap((m) => (m.t === "m" && m.from === idx(0, 2, 0) ? [m.to] : []));
    expect(to).toContain(idx(0, 3, 0));
    expect(to).not.toContain(idx(0, 4, 0));
    expect(to).not.toContain(idx(0, 5, 0));
  });

  it("pawns promote on the far rank", () => {
    const s = empty();
    place(s, 0, 6, 2, P, WHITE);
    place(s, 3, 2, 0, K, WHITE);
    place(s, 3, 5, 2, K, BLACK);
    const m = legalMoves(s).find((x) => x.t === "m" && x.from === idx(0, 6, 2) && x.to === idx(0, 7, 2));
    expect(m).toBeDefined();
    expect(typeOf(apply(s, m!).cells[idx(0, 7, 2)]!)).toBe(Q);
  });
});

describe("check", () => {
  it("sees check and refuses moves that leave the king attacked", () => {
    const s = empty();
    place(s, 2, 2, 0, K, WHITE);
    place(s, 2, 5, 0, R, BLACK);
    place(s, 0, 5, 2, K, BLACK);
    expect(inCheck(s)).toBe(true);
    const moves = legalMoves(s);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) expect(inCheck(apply(s, m), WHITE)).toBe(false);
  });

  it("status agrees with legalMoves", () => {
    const s = empty();
    place(s, 0, 2, 0, K, WHITE);
    place(s, 0, 2, 1, Q, BLACK);
    place(s, 2, 2, 1, R, BLACK);
    place(s, 3, 7, 2, K, BLACK);
    expect(legalMoves(s).length === 0).toBe(status(s).over);
  });
});

describe("attack boards", () => {
  it("move with their pieces, and only for the side that controls them", () => {
    const s = newGame();
    expect(boardController(s, 0)).toBe(WHITE);
    expect(boardController(s, 2)).toBe(BLACK);
    const m = legalMoves(s).find((x) => x.t === "b" && x.board === 0 && x.z === 1);
    expect(m).toBeDefined();
    const n = apply(s, m!);
    expect(n.boards[0]).toBe(1);
    expect(exists(n.boards, 0, 0, 1)).toBe(true);
    expect(exists(n.boards, 0, 0, 0)).toBe(false);
    expect(count(n)).toBe(32);
    expect(typeOf(n.cells[idx(0, 0, 1)]!)).toBe(R);
  });
});

describe("whole games", () => {
  it.each([1, 2, 3, 4])("random play (seed %i) never breaks an invariant", (seed) => {
    const rng = new Rng(seed);
    let s = newGame();
    for (let i = 0; i < 120; i++) {
      if (status(s).over) break;
      const moves = legalMoves(s);
      expect(moves.length).toBeGreaterThan(0);
      s = apply(s, moves[rng.int(0, moves.length - 1)]!);
      expect(typeOf(s.cells[s.kings[WHITE]]!)).toBe(K);
      expect(typeOf(s.cells[s.kings[BLACK]]!)).toBe(K);
      const live = liveSquares(s.boards);
      for (let k = 0; k < 96; k++) if (s.cells[k]) expect(live).toContain(k);
    }
  });

  it("the computer returns legal moves at every level", () => {
    const rng = new Rng(9);
    for (const level of ["easy", "medium", "hard"] as const) {
      let s = newGame();
      for (let i = 0; i < 4; i++) {
        const m = chooseMove(s, level, () => rng.next());
        expect(legalMoves(s).some((x) => sameMove(x, m))).toBe(true);
        s = apply(s, m);
      }
    }
  }, 30000);

  it("takes a free queen", () => {
    const s = empty();
    place(s, 3, 0, 0, K, WHITE);
    place(s, 3, 7, 2, K, BLACK);
    place(s, 0, 2, 0, R, WHITE);
    place(s, 0, 5, 0, Q, BLACK);
    const m = chooseMove(s, "medium", () => 0.5);
    expect(m).toEqual({ t: "m", from: idx(0, 2, 0), to: idx(0, 5, 0) });
  });
});
