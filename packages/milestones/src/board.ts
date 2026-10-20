import type { TileType } from "./tiles";

export type { TileType } from "./tiles";

export interface BoardNode {
  id: number;
  /** The road this tile belongs to (ids come from the map definition). */
  segment: string;
  /** Position within its segment (the client maps this onto a curve). */
  index: number;
  type: TileType;
  /** Landing here always ends a move, even with spaces left. */
  stop: boolean;
  /** Overrides the tile type's display name, e.g. "Graduation". */
  label?: string;
  next: number[];
}

export interface SegmentInfo {
  id: string;
  name: string;
  length: number;
  first: number;
  last: number;
}

export interface Board {
  map: string;
  nodes: readonly BoardNode[];
  start: number;
  retire: number;
  segments: Record<string, SegmentInfo>;
  /** Fewest steps from each node to retirement. */
  distToEnd: readonly number[];
}

/** Where a car goes next. At a split, `heading` (the player's pick) decides. */
export function nextNode(board: Board, nodeId: number, heading: number | null): number | null {
  const node = board.nodes[nodeId]!;
  if (node.next.length === 0) return null;
  if (node.next.length === 1) return node.next[0]!;
  return heading !== null && node.next.includes(heading) ? heading : node.next[0]!;
}
