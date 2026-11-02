/**
 * Tri-Dimensional Chess, the Star Trek variant Sheldon plays in The Big Bang Theory.
 *
 * Space is 4 files (x) by 8 ranks (y) by 3 levels (z). Three 4x4 main boards sit on ranks 2-5, one per
 * level (white's, the neutral one, black's). Four 2x2 attack boards hang off the ends on ranks 0-1 and
 * 6-7, and each can slide up and down its own pole to another level, taking its pieces with it.
 *
 * A square is addressed by one number: x + 4*y + 32*z.
 */

export const P = 1;
export const N = 2;
export const B = 3;
export const R = 4;
export const Q = 5;
export const K = 6;

export type Color = 0 | 1; // 0 = white, 1 = black
/** A cell is 0 (empty) or a piece type (1..6) plus 8 for black. */
export type Cell = number;

export const WHITE: Color = 0;
export const BLACK: Color = 1;

export const idx = (x: number, y: number, z: number) => x + 4 * y + 32 * z;
export const xOf = (i: number) => i & 3;
export const yOf = (i: number) => (i >> 2) & 7;
export const zOf = (i: number) => i >> 5;

export const colorOf = (c: Cell): Color => (c >> 3) as Color;
export const typeOf = (c: Cell) => c & 7;
export const make = (type: number, color: Color): Cell => type | (color << 3);

/** Attack boards: white left, white right, black left, black right. */
export const BOARD_NAMES = ["White left", "White right", "Black left", "Black right"] as const;

export type Move = { t: "m"; from: number; to: number } | { t: "b"; board: number; z: number };

export interface TridState {
  cells: Uint8Array;
  /** Level of each attack board (see BOARD_NAMES). */
  boards: [number, number, number, number];
  turn: Color;
  kings: [number, number];
  /** Half moves since the last capture or pawn move. */
  quiet: number;
  ply: number;
  last: Move | null;
}

export type Status = { over: false; check: boolean } | { over: true; winner: Color | null; reason: "checkmate" | "stalemate" | "fifty" | "material" };

export const PIECE_NAMES = ["", "Pawn", "Knight", "Bishop", "Rook", "Queen", "King"] as const;
