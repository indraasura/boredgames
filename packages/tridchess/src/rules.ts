import { B, BLACK, K, N, P, Q, R, WHITE, colorOf, idx, make, typeOf, xOf, yOf, zOf, type Color, type Move, type Status, type TridState } from "./types";

// ---------------------------------------------------------------- geometry

type V = readonly [number, number, number];

const AXES: V[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const DIAGS: V[] = [];
const TRIAGS: V[] = [];
const KNIGHTS: V[] = [];
for (const a of [-1, 0, 1])
  for (const b of [-1, 0, 1])
    for (const c of [-1, 0, 1]) {
      const n = Math.abs(a) + Math.abs(b) + Math.abs(c);
      if (n === 2) DIAGS.push([a, b, c]);
      if (n === 3) TRIAGS.push([a, b, c]);
    }
for (const big of [0, 1, 2])
  for (const small of [0, 1, 2]) {
    if (big === small) continue;
    for (const sb of [-2, 2])
      for (const ss of [-1, 1]) {
        const v = [0, 0, 0];
        v[big] = sb;
        v[small] = ss;
        KNIGHTS.push(v as unknown as V);
      }
  }
const KING_STEPS: V[] = [...AXES, ...DIAGS, ...TRIAGS];
const QUEEN_DIRS: V[] = [...AXES, ...DIAGS];

const inBounds = (x: number, y: number, z: number) => x >= 0 && x < 4 && y >= 0 && y < 8 && z >= 0 && z < 3;

/** The attack board (0-3) that covers this column of ranks, or -1 on the main boards. */
export function boardAt(x: number, y: number): number {
  if (y >= 2 && y <= 5) return -1;
  return (y < 2 ? 0 : 2) + (x < 2 ? 0 : 1);
}

/** Is there a square here right now? Main boards always; attack boards only at their current level. */
export function exists(boards: readonly number[], x: number, y: number, z: number): boolean {
  if (!inBounds(x, y, z)) return false;
  const b = boardAt(x, y);
  return b < 0 || boards[b] === z;
}

/** The four squares of attack board `b` at level `z`. */
export function boardSquares(b: number, z: number): number[] {
  const x0 = (b & 1) * 2;
  const y0 = b < 2 ? 0 : 6;
  return [idx(x0, y0, z), idx(x0 + 1, y0, z), idx(x0, y0 + 1, z), idx(x0 + 1, y0 + 1, z)];
}

/** Every square that exists right now. */
export function liveSquares(boards: readonly number[]): number[] {
  const out: number[] = [];
  for (let z = 0; z < 3; z++) for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) if (exists(boards, x, y, z)) out.push(idx(x, y, z));
  return out;
}

// ------------------------------------------------------------------- setup

export function newGame(): TridState {
  const cells = new Uint8Array(96);
  const put = (x: number, y: number, z: number, type: number, color: Color) => (cells[idx(x, y, z)] = make(type, color));
  // White: attack boards and main board all on level 0.
  put(0, 0, 0, R, WHITE);
  put(1, 0, 0, N, WHITE);
  put(0, 1, 0, P, WHITE);
  put(1, 1, 0, P, WHITE);
  put(2, 0, 0, B, WHITE);
  put(3, 0, 0, R, WHITE);
  put(2, 1, 0, P, WHITE);
  put(3, 1, 0, P, WHITE);
  put(0, 2, 0, N, WHITE);
  put(1, 2, 0, Q, WHITE);
  put(2, 2, 0, K, WHITE);
  put(3, 2, 0, B, WHITE);
  for (let x = 0; x < 4; x++) put(x, 3, 0, P, WHITE);
  // Black, mirrored on level 2.
  put(0, 7, 2, R, BLACK);
  put(1, 7, 2, N, BLACK);
  put(0, 6, 2, P, BLACK);
  put(1, 6, 2, P, BLACK);
  put(2, 7, 2, B, BLACK);
  put(3, 7, 2, R, BLACK);
  put(2, 6, 2, P, BLACK);
  put(3, 6, 2, P, BLACK);
  put(0, 5, 2, N, BLACK);
  put(1, 5, 2, Q, BLACK);
  put(2, 5, 2, K, BLACK);
  put(3, 5, 2, B, BLACK);
  for (let x = 0; x < 4; x++) put(x, 4, 2, P, BLACK);
  return { cells, boards: [0, 0, 2, 2], turn: WHITE, kings: [idx(2, 2, 0), idx(2, 5, 2)], quiet: 0, ply: 0, last: null };
}

// ---------------------------------------------------------------- attacks

/** Is square `at` attacked by any piece of colour `by`? Probes outward, so it is cheap. */
export function attacked(s: TridState, at: number, by: Color): boolean {
  const { cells, boards } = s;
  const x = xOf(at);
  const y = yOf(at);
  const z = zOf(at);
  // Sliders (and a king one step away).
  for (const dirs of [AXES, DIAGS] as const) {
    const straight = dirs === AXES;
    for (const d of dirs) {
      let cx = x + d[0];
      let cy = y + d[1];
      let cz = z + d[2];
      let first = true;
      while (inBounds(cx, cy, cz)) {
        if (exists(boards, cx, cy, cz)) {
          const c = cells[idx(cx, cy, cz)]!;
          if (c) {
            if (colorOf(c) === by) {
              const t = typeOf(c);
              if (t === Q || (straight ? t === R : t === B) || (first && t === K)) return true;
            }
            break;
          }
        }
        first = false;
        cx += d[0];
        cy += d[1];
        cz += d[2];
      }
    }
  }
  for (const d of TRIAGS) {
    const cx = x + d[0];
    const cy = y + d[1];
    const cz = z + d[2];
    if (exists(boards, cx, cy, cz) && cells[idx(cx, cy, cz)] === make(K, by)) return true;
  }
  for (const d of KNIGHTS) {
    const cx = x + d[0];
    const cy = y + d[1];
    const cz = z + d[2];
    if (exists(boards, cx, cy, cz) && cells[idx(cx, cy, cz)] === make(N, by)) return true;
  }
  // Pawns attack forward-diagonally, so look backwards from the target.
  const f = by === WHITE ? 1 : -1;
  for (const [dx, dy, dz] of [
    [1, f, 0],
    [-1, f, 0],
    [1, 0, f],
    [-1, 0, f],
    [0, f, f],
  ] as const) {
    const cx = x - dx;
    const cy = y - dy;
    const cz = z - dz;
    if (exists(boards, cx, cy, cz) && cells[idx(cx, cy, cz)] === make(P, by)) return true;
  }
  return false;
}

export const inCheck = (s: TridState, color: Color = s.turn) => attacked(s, s.kings[color], (1 - color) as Color);

// ------------------------------------------------------------- generation

/** Which colour may move attack board `b`: the side whose pieces are all that is on it, or its owner if it is empty. */
export function boardController(s: TridState, b: number): Color | null {
  let color: Color | null = null;
  for (const sq of boardSquares(b, s.boards[b]!)) {
    const c = s.cells[sq]!;
    if (!c) continue;
    if (color === null) color = colorOf(c);
    else if (color !== colorOf(c)) return null;
  }
  return color ?? ((b < 2 ? WHITE : BLACK) as Color);
}

/** Moves that obey how pieces move, but may leave the mover's own king attacked. */
export function pseudoMoves(s: TridState, color: Color = s.turn, out: Move[] = []): Move[] {
  const { cells, boards } = s;
  for (let from = 0; from < 96; from++) {
    const c = cells[from]!;
    if (!c || colorOf(c) !== color) continue;
    const t = typeOf(c);
    const x = xOf(from);
    const y = yOf(from);
    const z = zOf(from);
    const add = (cx: number, cy: number, cz: number, captureOnly = false, moveOnly = false) => {
      if (!exists(boards, cx, cy, cz)) return;
      const to = idx(cx, cy, cz);
      const o = cells[to]!;
      if (o) {
        if (colorOf(o) !== color && !moveOnly) out.push({ t: "m", from, to });
        return;
      }
      if (!captureOnly) out.push({ t: "m", from, to });
    };
    if (t === P) {
      const f = color === WHITE ? 1 : -1;
      add(x, y + f, z, false, true);
      add(x, y, z + f, false, true);
      add(x + 1, y + f, z, true);
      add(x - 1, y + f, z, true);
      add(x + 1, y, z + f, true);
      add(x - 1, y, z + f, true);
      add(x, y + f, z + f, true);
    } else if (t === N) {
      for (const d of KNIGHTS) add(x + d[0], y + d[1], z + d[2]);
    } else if (t === K) {
      for (const d of KING_STEPS) add(x + d[0], y + d[1], z + d[2]);
    } else {
      const dirs = t === R ? AXES : t === B ? DIAGS : QUEEN_DIRS;
      for (const d of dirs) {
        let cx = x + d[0];
        let cy = y + d[1];
        let cz = z + d[2];
        while (inBounds(cx, cy, cz)) {
          if (exists(boards, cx, cy, cz)) {
            const o = cells[idx(cx, cy, cz)]!;
            if (o) {
              if (colorOf(o) !== color) out.push({ t: "m", from, to: idx(cx, cy, cz) });
              break;
            }
            out.push({ t: "m", from, to: idx(cx, cy, cz) });
          }
          cx += d[0];
          cy += d[1];
          cz += d[2];
        }
      }
    }
  }
  for (let b = 0; b < 4; b++) {
    if (boardController(s, b) !== color) continue;
    for (const dz of [-1, 1]) {
      const z = boards[b]! + dz;
      if (z >= 0 && z < 3) out.push({ t: "b", board: b, z });
    }
  }
  return out;
}

export function apply(s: TridState, m: Move): TridState {
  const cells = s.cells.slice();
  const boards = [...s.boards] as TridState["boards"];
  const kings = [...s.kings] as TridState["kings"];
  let quiet = s.quiet + 1;
  if (m.t === "b") {
    const from = boardSquares(m.board, boards[m.board]!);
    const to = boardSquares(m.board, m.z);
    for (let i = 0; i < 4; i++) {
      const c = cells[from[i]!]!;
      cells[from[i]!] = 0;
      cells[to[i]!] = c;
      if (c && typeOf(c) === K) kings[colorOf(c)] = to[i]!;
    }
    boards[m.board] = m.z;
  } else {
    const c = cells[m.from]!;
    if (cells[m.to] || typeOf(c) === P) quiet = 0;
    cells[m.from] = 0;
    const color = colorOf(c);
    cells[m.to] = typeOf(c) === P && yOf(m.to) === (color === WHITE ? 7 : 0) ? make(Q, color) : c;
    if (typeOf(c) === K) kings[color] = m.to;
  }
  return { cells, boards, turn: (1 - s.turn) as Color, kings, quiet, ply: s.ply + 1, last: m };
}

export function legalMoves(s: TridState, color: Color = s.turn): Move[] {
  const out: Move[] = [];
  for (const m of pseudoMoves(s, color)) {
    const n = apply(s, m);
    if (!attacked(n, n.kings[color], (1 - color) as Color)) out.push(m);
  }
  return out;
}

export function status(s: TridState): Status {
  const check = inCheck(s);
  if (!legalMoves(s).length) return check ? { over: true, winner: (1 - s.turn) as Color, reason: "checkmate" } : { over: true, winner: null, reason: "stalemate" };
  let pieces = 0;
  for (const c of s.cells) if (c) pieces++;
  if (pieces <= 2) return { over: true, winner: null, reason: "material" };
  if (s.quiet >= 100) return { over: true, winner: null, reason: "fifty" };
  return { over: false, check };
}

export const sameMove = (a: Move, b: Move) => (a.t === "m" && b.t === "m" ? a.from === b.from && a.to === b.to : a.t === "b" && b.t === "b" && a.board === b.board && a.z === b.z);

// ---------------------------------------------------------------- notation

const LEVEL = ["W", "N", "B"];

export function squareName(i: number): string {
  return `${"abcd"[xOf(i)]}${yOf(i) + 1}${LEVEL[zOf(i)]}`;
}

export function moveName(s: TridState, m: Move): string {
  if (m.t === "b") return `Board ${m.board + 1} to level ${LEVEL[m.z]}`;
  const sym = ["", "", "N", "B", "R", "Q", "K"][typeOf(s.cells[m.from]!)];
  return `${sym}${squareName(m.from)}${s.cells[m.to] ? "x" : "-"}${squareName(m.to)}`;
}
