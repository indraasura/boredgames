import { Rng, seedFromString } from "@boredgames/engine";
import type { Board, BoardNode, SegmentInfo } from "./board";
import { TILE_INFO, type TileType } from "./tiles";
import type { PathInfo } from "./types";

export type Theme = "island" | "alpine" | "city" | "desert";

export interface SegmentDef {
  id: string;
  name: string;
  tiles: TileType[];
  /** Per-index display names, e.g. { 19: "Graduation" }. */
  labels?: Record<number, string>;
  /** Roads the last tile leads to (more than one means the last tile is a Crossroads). */
  to: string[];
}

export interface BranchInfo {
  name: string;
  blurb: string;
  vibe: "safe" | "risky";
}

export interface MapDef {
  id: string;
  name: string;
  tagline: string;
  blurb: string;
  theme: Theme;
  /** The opening choices from Start. */
  paths: PathInfo[];
  segments: SegmentDef[];
  /** Describes each road that follows a Crossroads, by segment id. */
  branches: Record<string, BranchInfo>;
}

// ------------------------------------------------------------- tile recipes

type Weights = Partial<Record<TileType, number>>;

interface LaneOpts {
  paydayEvery?: number;
  paydayOffset?: number;
  /** Fixed tiles by index (negative counts from the end). */
  fixed?: Record<number, TileType>;
}

/** Deterministic: the same map always has the same road. */
function lane(seed: string, len: number, weights: Weights, opts: LaneOpts = {}): TileType[] {
  const rng = new Rng(seedFromString(seed));
  const fixed: Record<number, TileType> = {};
  for (const [k, t] of Object.entries(opts.fixed ?? {})) fixed[Number(k) < 0 ? len + Number(k) : Number(k)] = t;

  const entries = Object.entries(weights) as [TileType, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  const out: TileType[] = [];
  for (let i = 0; i < len; i++) {
    const f = fixed[i];
    if (f) {
      out.push(f);
      continue;
    }
    if (opts.paydayEvery && i % opts.paydayEvery === (opts.paydayOffset ?? 0)) {
      out.push("payday");
      continue;
    }
    let pick: TileType = "event";
    for (let tries = 0; tries < 8; tries++) {
      let roll = rng.next() * total;
      for (const [t, w] of entries) {
        roll -= w;
        if (roll < 0) {
          pick = t;
          break;
        }
      }
      // No two of the same kind in a row, so the road stays varied.
      if (pick !== out[i - 1]) break;
    }
    out.push(pick);
  }
  return out;
}

const STUDENT: Weights = { event: 75, bills: 20, invest: 5 };
const MAIN: Weights = { event: 55, bills: 15, invest: 30 };
const SAFE: Weights = { event: 60, bills: 25, invest: 15 };
const RISKY: Weights = { event: 45, bills: 10, invest: 45 };

const seg = (
  map: string,
  id: string,
  name: string,
  len: number,
  weights: Weights,
  to: string[],
  opts: LaneOpts & { labels?: Record<number, string> } = {},
): SegmentDef => {
  const { labels, ...laneOpts } = opts;
  return { id, name, tiles: lane(`${map}/${id}`, len, weights, laneOpts), labels, to };
};

/** A branch road. Safe roads pay more often; risky roads are full of decisions and swings. */
const safeRoad = (map: string, id: string, name: string, to: string[], len = 16) =>
  seg(map, id, name, len, SAFE, to, { paydayEvery: 4, paydayOffset: 1 });
const riskyRoad = (map: string, id: string, name: string, to: string[], len = 16) =>
  seg(map, id, name, len, RISKY, to, { paydayEvery: 6, paydayOffset: 2 });

// --------------------------------------------------------------------- maps

function sunnyIsle(): MapDef {
  const m = "sunny-isle";
  return {
    id: m,
    name: "Sunny Isle",
    tagline: "Island coast",
    blurb: "A coast road with one crossroads: boardwalk or jungle.",
    theme: "island",
    paths: [
      {
        id: "college",
        name: "Go to college",
        blurb: "Longest road. $100k loan, best-paid jobs.",
        icon: "🎓",
        loan: 100,
        cash: 0,
        tier: "degree",
        jobsAt: "graduate",
        segment: "college",
      },
      {
        id: "career",
        name: "Start working",
        blurb: "Short road. Pick a trade job now.",
        icon: "🛠️",
        loan: 0,
        cash: 0,
        tier: "trade",
        jobsAt: "start",
        segment: "career",
      },
    ],
    segments: [
      seg(m, "college", "Campus road", 20, STUDENT, ["main1"], { fixed: { [-1]: "graduate" }, labels: { 19: "Graduation" } }),
      seg(m, "career", "Working road", 9, { event: 60, invest: 25, bills: 15 }, ["main1"], {
        paydayEvery: 4,
        paydayOffset: 2,
      }),
      seg(m, "main1", "Coast road", 44, MAIN, ["boardwalk", "jungle"], {
        paydayEvery: 5,
        paydayOffset: 2,
        fixed: { 15: "wedding", 28: "baby", 36: "baby", [-1]: "fork" },
        labels: { 43: "Boardwalk or jungle?" },
      }),
      safeRoad(m, "boardwalk", "Boardwalk", ["main2"]),
      riskyRoad(m, "jungle", "Jungle trail", ["main2"]),
      seg(m, "main2", "Home stretch", 40, MAIN, [], {
        paydayEvery: 5,
        paydayOffset: 2,
        fixed: { 10: "house", 22: "baby", 33: "baby", [-1]: "retire" },
      }),
    ],
    branches: {
      boardwalk: { name: "Boardwalk", blurb: "More paydays, a few bills.", vibe: "safe" },
      jungle: { name: "Jungle trail", blurb: "Fewer paydays, more Market tiles.", vibe: "risky" },
    },
  };
}

function alpineValley(): MapDef {
  const m = "alpine-valley";
  return {
    id: m,
    name: "Alpine Valley",
    tagline: "Mountain pass",
    blurb: "Three opening roads, then summit or valley.",
    theme: "alpine",
    paths: [
      {
        id: "trade",
        name: "Trade school",
        blurb: "Short. No debt, $10k tool grant, trade jobs.",
        icon: "🔧",
        loan: 0,
        cash: 10,
        tier: "trade",
        jobsAt: "graduate",
        segment: "trade",
      },
      {
        id: "uni",
        name: "University",
        blurb: "Long. $80k loan, best-paid jobs.",
        icon: "🎓",
        loan: 80,
        cash: 0,
        tier: "degree",
        jobsAt: "graduate",
        segment: "uni",
      },
      {
        id: "gap",
        name: "Gap year",
        blurb: "Take it slow, then pick a trade job.",
        icon: "🎒",
        loan: 0,
        cash: 0,
        tier: "trade",
        jobsAt: "graduate",
        segment: "gap",
      },
    ],
    segments: [
      seg(m, "trade", "Workshop lane", 8, STUDENT, ["ascent"], { fixed: { [-1]: "graduate" }, labels: { 7: "Apprenticeship done" } }),
      seg(m, "uni", "University hill", 18, STUDENT, ["ascent"], { fixed: { [-1]: "graduate" }, labels: { 17: "Graduation" } }),
      seg(m, "gap", "Backpacker trail", 12, { event: 75, invest: 15, bills: 10 }, ["ascent"], {
        fixed: { [-1]: "graduate" },
        labels: { 11: "Back to reality" },
      }),
      seg(m, "ascent", "Switchbacks", 38, MAIN, ["summit", "valley"], {
        paydayEvery: 5,
        paydayOffset: 2,
        fixed: { 13: "wedding", 26: "baby", [-1]: "fork" },
        labels: { 37: "Summit or valley?" },
      }),
      riskyRoad(m, "summit", "Summit trail", ["descent"], 18),
      safeRoad(m, "valley", "Valley road", ["descent"], 18),
      seg(m, "descent", "Long descent", 40, MAIN, [], {
        paydayEvery: 5,
        paydayOffset: 2,
        fixed: { 10: "house", 21: "baby", 31: "baby", [-1]: "retire" },
        labels: { 39: "Chalet retirement" },
      }),
    ],
    branches: {
      summit: { name: "Summit trail", blurb: "Fewer paydays, more Market tiles.", vibe: "risky" },
      valley: { name: "Valley road", blurb: "More paydays.", vibe: "safe" },
    },
  };
}

function neonMetropolis(): MapDef {
  const m = "neon-metropolis";
  return {
    id: m,
    name: "Neon Metropolis",
    tagline: "Night city",
    blurb: "Corporate ladder, startup or night school.",
    theme: "city",
    paths: [
      {
        id: "intern",
        name: "Corporate internship",
        blurb: "Short. No debt, corporate jobs.",
        icon: "🏢",
        loan: 0,
        cash: 0,
        tier: "corporate",
        jobsAt: "graduate",
        segment: "intern",
      },
      {
        id: "garage",
        name: "Garage startup",
        blurb: "Many Market tiles, then startup jobs with a Growth Fund bonus.",
        icon: "🚀",
        loan: 0,
        cash: 0,
        tier: "venture",
        jobsAt: "graduate",
        segment: "garage",
      },
      {
        id: "night",
        name: "Night school",
        blurb: "$60k loan, then degree jobs.",
        icon: "🌙",
        loan: 60,
        cash: 0,
        tier: "degree",
        jobsAt: "graduate",
        segment: "night",
      },
    ],
    segments: [
      seg(m, "intern", "Office park", 10, STUDENT, ["downtown"], { fixed: { [-1]: "graduate" }, labels: { 9: "Job offer" } }),
      seg(m, "garage", "Garage row", 12, { invest: 45, event: 45, bills: 10 }, ["downtown"], {
        fixed: { [-1]: "graduate" },
        labels: { 11: "Seed round" },
      }),
      seg(m, "night", "Night classes", 16, STUDENT, ["downtown"], { fixed: { [-1]: "graduate" }, labels: { 15: "Diploma" } }),
      seg(m, "downtown", "Downtown", 40, MAIN, ["skyline", "alleys"], {
        paydayEvery: 5,
        paydayOffset: 2,
        fixed: { 14: "wedding", 28: "baby", [-1]: "fork" },
        labels: { 39: "Skyline or alleys?" },
      }),
      safeRoad(m, "skyline", "Skyline expressway", ["uptown"]),
      riskyRoad(m, "alleys", "Back alleys", ["uptown"]),
      seg(m, "uptown", "Uptown", 40, MAIN, [], {
        paydayEvery: 5,
        paydayOffset: 2,
        fixed: { 10: "house", 22: "baby", 32: "baby", [-1]: "retire" },
        labels: { 39: "Penthouse retirement" },
      }),
    ],
    branches: {
      skyline: { name: "Skyline expressway", blurb: "More paydays, a few bills.", vibe: "safe" },
      alleys: { name: "Back alleys", blurb: "Fewer paydays, more Market tiles.", vibe: "risky" },
    },
  };
}

function duneKingdom(): MapDef {
  const m = "dune-kingdom";
  return {
    id: m,
    name: "Dune Kingdom",
    tagline: "Desert caravan",
    blurb: "A long route with two crossroads.",
    theme: "desert",
    paths: [
      {
        id: "caravan",
        name: "Caravan guild",
        blurb: "Short. No debt, $10k bonus, trade jobs.",
        icon: "🐪",
        loan: 0,
        cash: 10,
        tier: "trade",
        jobsAt: "graduate",
        segment: "caravan",
      },
      {
        id: "scholar",
        name: "Oasis scholar",
        blurb: "Long. $100k loan, best-paid jobs.",
        icon: "📜",
        loan: 100,
        cash: 0,
        tier: "degree",
        jobsAt: "graduate",
        segment: "scholar",
      },
      {
        id: "merchant",
        name: "Merchant house",
        blurb: "No debt, corporate jobs.",
        icon: "🪙",
        loan: 0,
        cash: 0,
        tier: "corporate",
        jobsAt: "graduate",
        segment: "merchant",
      },
    ],
    segments: [
      seg(m, "caravan", "Caravan track", 8, STUDENT, ["dunes1"], { fixed: { [-1]: "graduate" }, labels: { 7: "Guild papers" } }),
      seg(m, "scholar", "Scholar's path", 18, STUDENT, ["dunes1"], { fixed: { [-1]: "graduate" }, labels: { 17: "Scholar's seal" } }),
      seg(m, "merchant", "Merchant row", 12, { event: 60, invest: 28, bills: 12 }, ["dunes1"], {
        fixed: { [-1]: "graduate" },
        labels: { 11: "Bazaar offers" },
      }),
      seg(m, "dunes1", "First dunes", 30, MAIN, ["river", "ridge"], {
        paydayEvery: 5,
        paydayOffset: 2,
        fixed: { 12: "wedding", 22: "baby", [-1]: "fork" },
        labels: { 29: "River or ridge?" },
      }),
      safeRoad(m, "river", "River road", ["dunes2"], 14),
      riskyRoad(m, "ridge", "Dune ridge", ["dunes2"], 14),
      seg(m, "dunes2", "Middle dunes", 30, MAIN, ["bazaar", "pyramid"], {
        paydayEvery: 5,
        paydayOffset: 2,
        fixed: { 8: "house", 20: "baby", [-1]: "fork" },
        labels: { 29: "Bazaar or pyramid?" },
      }),
      riskyRoad(m, "bazaar", "Grand bazaar", ["finale"], 14),
      safeRoad(m, "pyramid", "Pyramid road", ["finale"], 14),
      seg(m, "finale", "Palace road", 28, MAIN, [], {
        paydayEvery: 5,
        paydayOffset: 2,
        fixed: { 12: "baby", [-1]: "retire" },
        labels: { 27: "Oasis Palace" },
      }),
    ],
    branches: {
      river: { name: "River road", blurb: "More paydays.", vibe: "safe" },
      ridge: { name: "Dune ridge", blurb: "Fewer paydays, more Market tiles.", vibe: "risky" },
      bazaar: { name: "Grand bazaar", blurb: "Fewer paydays, more Market tiles.", vibe: "risky" },
      pyramid: { name: "Pyramid road", blurb: "More paydays.", vibe: "safe" },
    },
  };
}

export const MAPS: Record<string, MapDef> = Object.fromEntries(
  [sunnyIsle(), alpineValley(), neonMetropolis(), duneKingdom()].map((m) => [m.id, m]),
);
export const MAP_LIST: readonly MapDef[] = Object.values(MAPS);
export const DEFAULT_MAP = "sunny-isle";

export function getMap(id: string | undefined): MapDef {
  return MAPS[id ?? DEFAULT_MAP] ?? MAPS[DEFAULT_MAP]!;
}

// -------------------------------------------------------------------- board

const boards = new Map<string, Board>();

export function getBoard(mapId: string | undefined): Board {
  const def = getMap(mapId);
  let board = boards.get(def.id);
  if (!board) {
    board = buildBoard(def);
    boards.set(def.id, board);
  }
  return board;
}

export function buildBoard(def: MapDef): Board {
  const nodes: BoardNode[] = [];
  const add = (segment: string, index: number, type: TileType, label?: string): number => {
    const id = nodes.length;
    nodes.push({ id, segment, index, type, stop: TILE_INFO[type].stop, label, next: [] });
    return id;
  };

  const start = add("start", 0, "start");
  const segments: Record<string, SegmentInfo> = {};
  for (const s of def.segments) {
    const first = nodes.length;
    s.tiles.forEach((type, i) => add(s.id, i, type, s.labels?.[i]));
    segments[s.id] = { id: s.id, name: s.name, length: s.tiles.length, first, last: nodes.length - 1 };
  }

  for (const s of def.segments) {
    const info = segments[s.id]!;
    for (let i = info.first; i < info.last; i++) nodes[i]!.next.push(i + 1);
    const lastTile = nodes[info.last]!;
    if (s.to.length > 1 && lastTile.type !== "fork") throw new Error(`${def.id}/${s.id}: a split must end in a crossroads`);
    for (const t of s.to) {
      const target = segments[t];
      if (!target) throw new Error(`${def.id}/${s.id}: unknown road "${t}"`);
      lastTile.next.push(target.first);
    }
  }
  nodes[start]!.next = def.paths.map((p) => {
    const target = segments[p.segment];
    if (!target) throw new Error(`${def.id}: path "${p.id}" leads nowhere`);
    return target.first;
  });

  const retireNodes = nodes.filter((n) => n.type === "retire");
  if (retireNodes.length !== 1) throw new Error(`${def.id}: needs exactly one retirement`);
  const retire = retireNodes[0]!.id;

  // Fewest steps to the end, by walking the graph backwards from retirement.
  const dist = new Array<number>(nodes.length).fill(Infinity);
  dist[retire] = 0;
  const queue = [retire];
  const parents: number[][] = nodes.map(() => []);
  for (const n of nodes) for (const t of n.next) parents[t]!.push(n.id);
  while (queue.length) {
    const id = queue.shift()!;
    for (const p of parents[id]!) {
      if (dist[p]! > dist[id]! + 1) {
        dist[p] = dist[id]! + 1;
        queue.push(p);
      }
    }
  }
  return { map: def.id, nodes, start, retire, segments, distToEnd: dist };
}
