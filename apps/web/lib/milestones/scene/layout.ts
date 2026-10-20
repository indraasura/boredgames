import * as THREE from "three";
import type { Board } from "@boredgames/milestones";

/**
 * Where each map's roads run. Pure geometry (no DOM), so it can be checked in a script.
 * The engine owns the graph; this file only decides where each road goes in space.
 */

export type Pt = [number, number];

export interface MapLayout {
  start: Pt;
  /**
   * Control points per road, x then z. The road begins at its "anchor": the Start tile, the Crossroads
   * it branches from, or the midpoint of the roads that merge into it. So the anchor is not listed.
   */
  roads: Record<string, Pt[]>;
}

export const LAYOUTS: Record<string, MapLayout> = {
  "sunny-isle": {
    start: [-58, 46],
    roads: {
      college: [[-66, 56], [-62, 68], [-46, 72], [-30, 62.5]],
      career: [[-48, 51], [-40, 56], [-34, 58.5], [-30, 57.5]],
      main1: [[-5, 62], [20, 58], [45, 48], [62, 30], [66, 5], [58, -20]],
      boardwalk: [[54, -34], [44, -46], [34, -54], [26, -54.5]],
      jungle: [[46, -24], [38, -32], [34, -42], [32, -48], [26, -49.5]],
      main2: [[8, -56], [-14, -52], [-34, -42], [-48, -26], [-52, -6], [-44, 12], [-28, 22], [-16, 24]],
    },
  },
  "alpine-valley": {
    start: [-64, 58],
    roads: {
      trade: [[-56, 60], [-48, 56], [-40, 56]],
      uni: [[-70, 48], [-64, 38], [-52, 36], [-42, 42], [-40, 51.5]],
      gap: [[-68, 64], [-56, 66], [-46, 64], [-40, 60.5]],
      ascent: [[-20, 52], [10, 50], [36, 52], [52, 46], [54, 34], [40, 26]],
      summit: [[30, 20], [20, 14], [22, 4], [14, -2], [8, -7]],
      valley: [[44, 10], [36, -4], [24, -11], [8, -14]],
      descent: [[-12, -18], [-34, -14], [-54, -20], [-62, -34], [-50, -46], [-28, -50], [-12, -50]],
    },
  },
  "neon-metropolis": {
    start: [-60, 56],
    roads: {
      intern: [[-48, 56], [-36, 56], [-26, 56]],
      garage: [[-56, 50], [-46, 49], [-36, 50.5], [-26, 51.5]],
      night: [[-60, 66], [-46, 72], [-32, 70], [-26, 60.5]],
      downtown: [[10, 56], [40, 56], [52, 50], [54, 38], [48, 28], [20, 26]],
      skyline: [[-2, 26], [-14, 22], [-18, 16], [-20, 13.5]],
      alleys: [[16, 12], [4, 4], [-10, 4], [-20, 6.5]],
      uptown: [[-38, 6], [-52, -6], [-56, -22], [-46, -36], [-26, -42], [-4, -40], [14, -46]],
    },
  },
  "dune-kingdom": {
    start: [-70, 50],
    roads: {
      caravan: [[-60, 49], [-50, 47], [-42, 46]],
      scholar: [[-76, 60], [-66, 70], [-54, 70], [-46, 60], [-42, 50.5]],
      merchant: [[-72, 40], [-62, 36], [-52, 40], [-42, 41.5]],
      dunes1: [[-20, 50], [8, 48], [34, 40], [52, 26]],
      river: [[52, 12], [46, -2], [38, -11], [30, -13]],
      ridge: [[42, 22], [32, 14], [26, 4], [30, -7]],
      dunes2: [[8, -14], [-16, -12], [-38, -18], [-52, -32]],
      bazaar: [[-42, -34], [-30, -40], [-24, -50], [-32, -57]],
      pyramid: [[-58, -42], [-56, -54], [-44, -62], [-32, -63]],
      finale: [[-8, -66], [18, -62], [40, -52], [54, -36]],
    },
  },
};

export interface RoadGeometry {
  segment: string;
  anchor: THREE.Vector3;
  curve: THREE.CatmullRomCurve3;
  /** Last tiles of the roads that lead in, for drawing the merge. */
  feeders: THREE.Vector3[];
}

export interface Layout {
  pos: THREE.Vector3[];
  tan: THREE.Vector3[];
  roads: RoadGeometry[];
  /** Centre and reach of everything on the map. */
  center: THREE.Vector3;
  radius: number;
}

const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);

export function computeLayout(board: Board, layout: MapLayout): Layout {
  const pos: THREE.Vector3[] = [];
  const tan: THREE.Vector3[] = [];
  const roads: RoadGeometry[] = [];

  const start = v(...layout.start);
  pos[board.start] = start;
  const firstRoad = Object.keys(layout.roads)[0]!;
  const t0 = layout.roads[firstRoad]![0]!;
  tan[board.start] = v(t0[0] - start.x, t0[1] - start.z).normalize();

  // Which roads lead into each road?
  const feedersOf: Record<string, string[]> = {};
  for (const info of Object.values(board.segments)) {
    for (const next of board.nodes[info.last]!.next) {
      const target = board.nodes[next]!.segment;
      (feedersOf[target] ??= []).push(info.id);
    }
  }

  for (const info of Object.values(board.segments)) {
    const control = layout.roads[info.id];
    if (!control) throw new Error(`layout is missing the road "${info.id}"`);
    const feeders = feedersOf[info.id] ?? [];
    let feederTiles: THREE.Vector3[];
    let anchor: THREE.Vector3;
    if (feeders.length === 0) {
      anchor = start.clone();
      feederTiles = [start.clone()];
    } else {
      feederTiles = feeders.map((f) => pos[board.segments[f]!.last]!.clone());
      anchor = feederTiles.reduce((a, b) => a.add(b), v(0, 0)).multiplyScalar(1 / feederTiles.length);
    }
    const curve = new THREE.CatmullRomCurve3([anchor, ...control.map(([x, z]) => v(x, z))], false, "centripetal");
    const n = info.length;
    for (let i = 0; i < n; i++) {
      const u = (i + 1) / n;
      const id = info.first + i;
      pos[id] = curve.getPointAt(u);
      tan[id] = curve.getTangentAt(u).setY(0).normalize();
    }
    roads.push({ segment: info.id, anchor, curve, feeders: feederTiles });
  }

  const box = new THREE.Box3();
  for (const p of pos) box.expandByPoint(p);
  const center = box.getCenter(new THREE.Vector3()).setY(0);
  const radius = Math.max(...pos.map((p) => p.distanceTo(center)));
  return { pos, tan, roads, center, radius };
}
