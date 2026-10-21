import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { boxFor, offsetsFor, pitOffset, pitPathFor, trackAt, type Track } from "@boredgames/f1";
import {
  SPONSORS,
  asphaltTexture,
  checkerTexture,
  concreteTexture,
  crowdTexture,
  facadeTexture,
  grassTexture,
  gravelTexture,
  sandTexture,
  sponsorTexture,
} from "./textures";

export type Style = "green" | "desert" | "city";

/** Sim coordinates (x east, y north, heading counter-clockwise from +x) to three.js (x, up, z = -y). */
const px = (x: number) => x;
const pz = (y: number) => -y;

export function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const col = (hex: string) => new THREE.Color(hex);

// ------------------------------------------------------------------ geometry helpers

interface RibbonOpts {
  /** Colour per sample, multiplied with the texture. */
  color?: (i: number) => THREE.Color;
  /** How many metres of road one texture tile covers, along and across. */
  tile?: [number, number];
  range?: { from: number; to: number };
}

/** A strip along the track between two lateral offsets, with UVs for tiling textures. */
function ribbon(t: Track, a: (i: number) => number, b: (i: number) => number, y: number, o: RibbonOpts = {}): THREE.BufferGeometry {
  const n = t.n;
  const from = o.range?.from ?? 0;
  const to = o.range?.to ?? n;
  const count = to - from;
  const [along, across] = o.tile ?? [8, 8];
  const pos: number[] = [];
  const colr: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k <= count; k++) {
    const i = (from + k + n * 4) % n;
    const c = o.color?.(i) ?? WHITE;
    const v = ((from + k) * t.ds) / along;
    for (const off of [a(i), b(i)]) {
      pos.push(px(t.x[i]! + t.nx[i]! * off), y, pz(t.y[i]! + t.ny[i]! * off));
      colr.push(c.r, c.g, c.b);
      uv.push(off / across, v);
    }
  }
  for (let k = 0; k < count; k++) {
    const v = k * 2;
    idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Normals must face up whichever way the strip was wound.
  if (g.attributes.normal!.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const tmp = idx[i + 1]!;
      idx[i + 1] = idx[i + 2]!;
      idx[i + 2] = tmp;
    }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

const WHITE = new THREE.Color(1, 1, 1);

/** Quads between neighbouring samples with their own colours (hard-edged stripes). */
function stripes(t: Track, side: 1 | -1, inner: number, outer: number, y: number, pick: (i: number) => THREE.Color | null): THREE.BufferGeometry {
  const pos: number[] = [];
  const colr: number[] = [];
  const idx: number[] = [];
  let v = 0;
  for (let i = 0; i < t.n; i++) {
    const c = pick(i);
    if (!c) continue;
    const j = (i + 1) % t.n;
    for (const [k, off] of [[i, inner], [i, outer], [j, inner], [j, outer]] as const) {
      const o = off * side;
      pos.push(px(t.x[k]! + t.nx[k]! * o), y, pz(t.y[k]! + t.ny[k]! * o));
      colr.push(c.r, c.g, c.b);
    }
    idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    v += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (v > 0 && g.attributes.normal!.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const tmp = idx[i + 1]!;
      idx[i + 1] = idx[i + 2]!;
      idx[i + 2] = tmp;
    }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

function paint(g: THREE.BufferGeometry, color: THREE.Color) {
  const n = g.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) if (!["position", "normal", "color", "uv"].includes(name)) out.deleteAttribute(name);
  if (!out.attributes.uv) out.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(out.attributes.position!.count * 2), 2));
  return out;
}

function scaleUV(g: THREE.BufferGeometry, su: number, sv: number) {
  const uv = g.attributes.uv!;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

/** A flat rectangle on the road: `along` metres of travel by `across` metres wide, centred at a sim position. */
function flatRect(along: number, across: number, x: number, y: number, heading: number, h: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(along, across);
  g.rotateX(-Math.PI / 2);
  g.rotateY(heading);
  g.translate(px(x), h, pz(y));
  return g;
}

// ------------------------------------------------------------------ world

export interface World {
  asphaltMat: THREE.MeshStandardMaterial;
  lights: THREE.Mesh[];
  /** Direction from the scene towards the sun. */
  sunDir: THREE.Vector3;
  /** Ground colour to blend the far hills into. */
  ground: THREE.Mesh;
  groundMat: THREE.MeshStandardMaterial;
  centre: THREE.Vector3;
}

/** Builds everything that never moves: road, run-off, walls, stands, scenery and the start gantry. */
export function buildWorld(scene: THREE.Scene, t: Track, style: Style): World {
  const half = t.width / 2;
  const rnd = rand(t.n * 7919);
  const sunAz = (t.n * 0.37) % (Math.PI * 2);
  const sunDir = new THREE.Vector3(Math.cos(sunAz) * Math.cos(0.72), Math.sin(0.72), Math.sin(sunAz) * Math.cos(0.72)).normalize();
  const centre = new THREE.Vector3((t.bbox.minX + t.bbox.maxX) / 2, 0, -(t.bbox.minY + t.bbox.maxY) / 2);

  const texAsphalt = asphaltTexture();
  const texGrass = grassTexture();
  const texSand = sandTexture();
  const texGravel = gravelTexture();
  const texConcrete = concreteTexture();
  const mat = (map: THREE.Texture, rough = 1, side: THREE.Side = THREE.FrontSide) => new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: rough, metalness: 0, side });

  // ---- ground
  const groundTex = style === "desert" ? texSand : style === "city" ? texAsphalt : texGrass;
  const gt = groundTex.clone();
  gt.needsUpdate = true;
  gt.repeat.set(1800, 1800);
  const groundMat = new THREE.MeshStandardMaterial({ map: gt, color: style === "city" ? 0x8c8e92 : style === "desert" ? 0x9d8760 : 0xb9d9a0, roughness: 1 });
  const gg = new THREE.PlaneGeometry(12000, 12000);
  gg.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(gg, groundMat);
  ground.position.set(centre.x, -0.08, centre.z);
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- run-off: mown grass (or sand, or tarmac) then a gravel bed beside the wall
  const mow = style === "green" ? [col("#ffffff"), col("#c9d8c0")] : [col("#ffffff"), col("#e6e0d8")];
  const runoffTex = style === "green" ? texGrass : style === "desert" ? texSand : texAsphalt;
  const gravelTex = style === "city" ? texConcrete : texGravel;
  const runTint = style === "city" ? col("#d0d0d4") : WHITE;
  for (const side of [1, -1] as const) {
    const g1 = ribbon(t, () => side * (half + 1.2), () => side * (half + 7), -0.03, {
      color: (i) => mow[Math.floor((i * t.ds) / 22) % 2]!.clone().multiply(runTint),
      tile: [8, 8],
    });
    const g2 = ribbon(t, () => side * (half + 7), () => side * (half + 11), -0.025, {
      color: (i) => WHITE.clone().multiplyScalar(0.92 + 0.08 * Math.sin(i * 0.37)),
      tile: [6, 6],
    });
    const m1 = new THREE.Mesh(g1, mat(runoffTex));
    const m2 = new THREE.Mesh(g2, mat(gravelTex));
    m1.receiveShadow = m2.receiveShadow = true;
    scene.add(m1, m2);
  }

  // ---- asphalt, with the racing line rubbered in
  const asphaltMat = mat(texAsphalt, 0.92, THREE.DoubleSide);
  asphaltMat.envMapIntensity = 0.35;
  const base = col("#d8d9de");
  const road = new THREE.Mesh(
    ribbon(t, () => -half, () => half, 0, {
      color: (i) => base.clone().multiplyScalar(0.94 + Math.sin(i * 0.11) * 0.03 + Math.sin(i * 0.031) * 0.03),
      tile: [8, 8],
    }),
    asphaltMat,
  );
  road.receiveShadow = true;
  scene.add(road);

  // Rubber: a dark, soft-edged line on the best way round that is most pronounced through corners.
  const off = offsetsFor(t);
  {
    const pos: number[] = [];
    const clr: number[] = [];
    const idx: number[] = [];
    for (let k = 0; k <= t.n; k++) {
      const i = k % t.n;
      const kap = Math.min(1, Math.abs(t.kappa[i]!) * 260);
      const a = 0.1 + 0.34 * kap;
      for (const [d, alpha] of [[-1.7, 0], [0, a], [1.7, 0]] as const) {
        const o = off[i]! + d;
        pos.push(px(t.x[i]! + t.nx[i]! * o), 0.012, pz(t.y[i]! + t.ny[i]! * o));
        clr.push(0.02, 0.02, 0.025, alpha);
      }
    }
    for (let k = 0; k < t.n; k++) {
      const v = k * 3;
      for (let c = 0; c < 2; c++) idx.push(v + c, v + c + 3, v + c + 1, v + c + 1, v + c + 3, v + c + 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(clr, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (g.attributes.normal!.getY(0) < 0) {
      for (let i = 0; i < idx.length; i += 3) {
        const tmp = idx[i + 1]!;
        idx[i + 1] = idx[i + 2]!;
        idx[i + 2] = tmp;
      }
      g.setIndex(idx);
    }
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })));
  }

  // ---- edge lines and kerbs
  const white = col("#f2f2f2");
  for (const side of [1, -1] as const) {
    const m = new THREE.Mesh(ribbon(t, () => side * (half - 0.2), () => side * (half + 0.06), 0.02, { color: () => white }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }));
    m.receiveShadow = true;
    scene.add(m);
  }
  const red = col("#d3262d");
  const w = col("#f1f1f1");
  const kerbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
  for (const side of [1, -1] as const) {
    const g = stripes(t, side, half + 0.06, half + 1.35, 0.035, (i) => {
      const k = t.kappa[i]!;
      const inside = k * side > 1 / 700;
      const outside = k * side < -1 / 500;
      if (!inside && !outside) return null;
      return Math.floor(i / 1) % 2 === 0 ? red : w;
    });
    const m = new THREE.Mesh(g, kerbMat);
    m.receiveShadow = true;
    scene.add(m);
  }

  // ---- start line and grid boxes
  const p0 = trackAt(t, 0);
  scene.add(new THREE.Mesh(flatRect(1.6, t.width, p0.x, p0.y, p0.heading, 0.03), new THREE.MeshBasicMaterial({ map: checkerTexture() })));
  const marks: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 20; k++) {
    const row = Math.floor(k / 2);
    const side = k % 2 === 0 ? -1 : 1;
    const s0 = -(10 + row * 9) - (side > 0 ? 4 : 0);
    const p = trackAt(t, ((s0 % t.length) + t.length) % t.length);
    const cx = p.x + p.nx * side * 2.6;
    const cy = p.y + p.ny * side * 2.6;
    const fwdx = Math.cos(p.heading);
    const fwdy = Math.sin(p.heading);
    marks.push(flatRect(0.14, 1.9, cx + fwdx * 3.2, cy + fwdy * 3.2, p.heading, 0.03));
    for (const sd of [-0.95, 0.95]) marks.push(flatRect(1.3, 0.12, cx + fwdx * 2.55 + p.nx * sd, cy + fwdy * 2.55 + p.ny * sd, p.heading, 0.03));
  }
  scene.add(new THREE.Mesh(mergeGeometries(marks.map((g) => plain(g)))!, new THREE.MeshBasicMaterial({ color: 0xf2f2f2 })));

  const near = spatialIndex(t, 40);
  buildPits(scene, t, texAsphalt, texConcrete);
  buildWalls(scene, t, near, texConcrete);
  buildTyreWalls(scene, t, near);
  buildStands(scene, t, near, rnd);
  buildBridges(scene, t, near);
  buildScenery(scene, t, style, rnd);
  buildHorizon(scene, t, style, centre, rnd);
  const lights = buildStartGantry(scene, t);

  return { asphaltMat, lights, sunDir, ground, groundMat, centre };
}

// ------------------------------------------------------------------ pit lane

function buildPits(scene: THREE.Scene, t: Track, texAsphalt: THREE.Texture, texConcrete: THREE.Texture) {
  const L = t.length;
  const path = pitPathFor(t);
  const from = Math.round((L - 340) / t.ds);
  const to = Math.round((L + 340) / t.ds);
  const count = to - from;
  const pts: { x: number; y: number; nx: number; ny: number; off: number }[] = [];
  for (let k = 0; k <= count; k++) {
    const s = (from + k) * t.ds;
    const p = trackAt(t, s);
    pts.push({ x: p.x, y: p.y, nx: p.nx, ny: p.ny, off: pitOffset(t, path, s) });
  }
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  pts.forEach((p, k) => {
    for (const o of [p.off - 3.4, p.off + 3.4]) {
      const x = px(p.x + p.nx * o);
      const z = pz(p.y + p.ny * o);
      pos.push(x, 0.012, z);
      uv.push(x / 8, z / 8);
    }
    if (k < pts.length - 1) {
      const v = k * 2;
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const laneMat = new THREE.MeshStandardMaterial({ map: texAsphalt, color: 0xc9cad0, roughness: 0.95, side: THREE.DoubleSide });
  const lane = new THREE.Mesh(g, laneMat);
  lane.receiveShadow = true;
  scene.add(lane);

  // Garages, pit wall and the signage over each door.
  const wallGeo = scaleUV(new THREE.BoxGeometry(4.2, 1.0, 0.6), 1, 1);
  const garageGeo = new THREE.BoxGeometry(4.2, 4.4, 8);
  const roofGeo = new THREE.BoxGeometry(4.4, 0.35, 11);
  const wallMat = new THREE.MeshStandardMaterial({ map: texConcrete, roughness: 0.85 });
  const garageMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.7, metalness: 0.05 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5f6670, roughness: 0.6, metalness: 0.3 });
  const steps: { x: number; y: number; h: number }[] = [];
  for (let s = 0; s < 220; s += 4) {
    const p = trackAt(t, s);
    steps.push({ x: p.x, y: p.y, h: p.heading });
  }
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, steps.length);
  const garages = new THREE.InstancedMesh(garageGeo, garageMat, steps.length);
  const roofs = new THREE.InstancedMesh(roofGeo, roofMat, steps.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  steps.forEach((st, k) => {
    const p = trackAt(t, k * 4);
    q.setFromAxisAngle(up, st.h);
    const at = (o: number, y: number) => new THREE.Vector3(px(p.x + p.nx * o), y, pz(p.y + p.ny * o));
    m4.compose(at(path.lane + 4.6, 0.5), q, new THREE.Vector3(1, 1, 1));
    walls.setMatrixAt(k, m4);
    m4.compose(at(path.lane - 9.2, 2.2), q, new THREE.Vector3(1, 1, 1));
    garages.setMatrixAt(k, m4);
    m4.compose(at(path.lane - 5.2, 4.55), q, new THREE.Vector3(1, 1, 1));
    roofs.setMatrixAt(k, m4);
  });
  // A dark glazed band along the garage fronts breaks up the wall.
  const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(4.2, 1.1, 0.12), new THREE.MeshStandardMaterial({ color: 0x141b27, roughness: 0.12, metalness: 0.85 }), steps.length);
  steps.forEach((st, k) => {
    const p = trackAt(t, k * 4);
    q.setFromAxisAngle(up, st.h);
    m4.compose(new THREE.Vector3(px(p.x + p.nx * (path.lane - 5.1)), 3.5, pz(p.y + p.ny * (path.lane - 5.1))), q, new THREE.Vector3(1, 1, 1));
    glass.setMatrixAt(k, m4);
  });
  scene.add(glass);
  walls.castShadow = garages.castShadow = roofs.castShadow = true;
  walls.receiveShadow = garages.receiveShadow = true;
  scene.add(walls, garages, roofs);

  const doorColors = ["#E10600", "#00A3E0", "#FF8000", "#0F8F5C", "#C0C6CC", "#8B1D3B", "#1C3F94", "#F26B3A", "#5FD068", "#7D3FC4"];
  for (let i = 0; i < 10; i++) {
    const p = trackAt(t, boxFor(t, i));
    const c = new THREE.Color(doorColors[i]);
    const door = new THREE.Mesh(new THREE.BoxGeometry(5.8, 3.4, 0.2), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.2 }));
    door.position.set(px(p.x + p.nx * (path.lane - 4.95)), 1.8, pz(p.y + p.ny * (path.lane - 4.95)));
    door.rotation.y = p.heading;
    scene.add(door);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.7, 0.25), new THREE.MeshStandardMaterial({ color: 0x16181d, emissive: c, emissiveIntensity: 0.55, roughness: 0.5 }));
    sign.position.set(px(p.x + p.nx * (path.lane - 4.95)), 3.9, pz(p.y + p.ny * (path.lane - 4.95)));
    sign.rotation.y = p.heading;
    scene.add(sign);
  }
}

// ------------------------------------------------------------------ walls, boards, tyres

/** Is there another part of the track within `r` metres of this point (other than the part near sample i)? */
function spatialIndex(t: Track, cell: number) {
  const grid = new Map<string, number[]>();
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  for (let i = 0; i < t.n; i++) {
    const k = key(Math.floor(t.x[i]! / cell), Math.floor(t.y[i]! / cell));
    let arr = grid.get(k);
    if (!arr) grid.set(k, (arr = []));
    arr.push(i);
  }
  return (x: number, y: number, self: number, r: number): boolean => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const reach = Math.ceil(r / cell);
    for (let a = -reach; a <= reach; a++) {
      for (let b = -reach; b <= reach; b++) {
        const arr = grid.get(key(cx + a, cy + b));
        if (!arr) continue;
        for (const j of arr) {
          let dj = Math.abs(j - self);
          dj = Math.min(dj, t.n - dj);
          if (dj * t.ds < 220) continue;
          if ((t.x[j]! - x) ** 2 + (t.y[j]! - y) ** 2 < r * r) return true;
        }
      }
    }
    return false;
  };
}

type Near = (x: number, y: number, self: number, r: number) => boolean;

function buildWalls(scene: THREE.Scene, t: Track, near: Near, texConcrete: THREE.Texture) {
  const dist = t.width / 2 + 11.2;
  const height = 1.35;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const topPos: number[] = [];
  const topIdx: number[] = [];
  const boards: { x: number; y: number; h: number; side: number; sponsor: number }[] = [];
  const fenceItems: { x: number; y: number; h: number }[] = [];
  let v = 0;
  let tv = 0;
  for (const side of [1, -1] as const) {
    for (let i = 0; i < t.n; i++) {
      const j = (i + 1) % t.n;
      const ax = t.x[i]! + t.nx[i]! * dist * side;
      const ay = t.y[i]! + t.ny[i]! * dist * side;
      const bx = t.x[j]! + t.nx[j]! * dist * side;
      const by = t.y[j]! + t.ny[j]! * dist * side;
      if (near(ax, ay, i, dist - 4)) continue;
      // Inner face, facing the track. Wound for the side.
      const s0 = (i * t.ds) / 5;
      const s1 = ((i + 1) * t.ds) / 5;
      pos.push(px(ax), 0, pz(ay), px(ax), height, pz(ay), px(bx), 0, pz(by), px(bx), height, pz(by));
      uv.push(s0, 0, s0, 0.6, s1, 0, s1, 0.6);
      if (side > 0) idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      else idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      v += 4;
      // Top: a thin cap, 0.5 m deep towards the outside.
      const ox = t.nx[i]! * 0.5 * side;
      const oy = t.ny[i]! * 0.5 * side;
      const ox2 = t.nx[j]! * 0.5 * side;
      const oy2 = t.ny[j]! * 0.5 * side;
      topPos.push(px(ax), height, pz(ay), px(ax + ox), height, pz(ay + oy), px(bx), height, pz(by), px(bx + ox2), height, pz(by + oy2));
      if (side > 0) topIdx.push(tv, tv + 1, tv + 2, tv + 1, tv + 3, tv + 2);
      else topIdx.push(tv, tv + 2, tv + 1, tv + 1, tv + 2, tv + 3);
      tv += 4;
      if (i % 2 === 0) boards.push({ x: ax, y: ay, h: t.heading[i]!, side, sponsor: (Math.floor(i / 2) * 3 + (side > 0 ? 1 : 0)) % SPONSORS.length });
      if (i % 3 === 0) fenceItems.push({ x: ax, y: ay, h: t.heading[i]! });
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const wall = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: texConcrete, roughness: 0.85, side: THREE.DoubleSide }));
  wall.receiveShadow = true;
  scene.add(wall);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute("position", new THREE.Float32BufferAttribute(topPos, 3));
  tg.setIndex(topIdx);
  tg.computeVertexNormals();
  scene.add(new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: 0xb8bbc0, roughness: 0.8, side: THREE.DoubleSide })));

  // Advertising boards, in front of the wall, one geometry per sponsor so each shows its own panel.
  const tex = sponsorTexture();
  const boardMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12, side: THREE.DoubleSide });
  const per: typeof boards[] = SPONSORS.map(() => []);
  for (const b of boards) per[b.sponsor]!.push(b);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  per.forEach((list, si) => {
    if (!list.length) return;
    const geo = new THREE.PlaneGeometry(7.6, 1.0);
    const uv = geo.attributes.uv!;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) + si) / SPONSORS.length);
    const mesh = new THREE.InstancedMesh(geo, boardMat, list.length);
    list.forEach((b, k) => {
      // The board faces the track: its normal points back along the lateral axis.
      const hx = Math.cos(b.h);
      const hy = Math.sin(b.h);
      const nxv = -hy * b.side;
      const nyv = hx * b.side;
      const inward = new THREE.Vector3(-nxv, 0, nyv);
      q.setFromAxisAngle(up, Math.atan2(inward.x, inward.z));
      m4.compose(new THREE.Vector3(px(b.x - nxv * 0.12), 0.7, pz(b.y - nyv * 0.12)), q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(k, m4);
    });
    scene.add(mesh);
  });

  // Catch-fence posts every few metres.
  const postGeo = new THREE.CylinderGeometry(0.05, 0.06, 5.2, 6);
  postGeo.translate(0, 3.9, 0);
  const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.6, metalness: 0.6 }), fenceItems.length);
  fenceItems.forEach((f, k) => {
    m4.compose(new THREE.Vector3(px(f.x), 0, pz(f.y)), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    posts.setMatrixAt(k, m4);
  });
  scene.add(posts);
  // The mesh itself: a see-through strip high above the wall.
  const fenceTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const gx = c.getContext("2d")!;
    gx.clearRect(0, 0, 64, 64);
    gx.strokeStyle = "rgba(210,215,222,0.85)";
    gx.lineWidth = 2;
    for (let k = -64; k < 128; k += 16) {
      gx.beginPath();
      gx.moveTo(k, 0);
      gx.lineTo(k + 64, 64);
      gx.moveTo(k + 64, 0);
      gx.lineTo(k, 64);
      gx.stroke();
    }
    const tx = new THREE.CanvasTexture(c);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    return tx;
  })();
  const fpos: number[] = [];
  const fuv: number[] = [];
  const fidx: number[] = [];
  let fv = 0;
  for (const side of [1, -1] as const) {
    for (let i = 0; i < t.n; i++) {
      const j = (i + 1) % t.n;
      const d = dist + 0.3;
      const ax = t.x[i]! + t.nx[i]! * d * side;
      const ay = t.y[i]! + t.ny[i]! * d * side;
      const bx = t.x[j]! + t.nx[j]! * d * side;
      const by = t.y[j]! + t.ny[j]! * d * side;
      if (near(ax, ay, i, dist - 4)) continue;
      const u0 = (i * t.ds) / 2;
      const u1 = ((i + 1) * t.ds) / 2;
      fpos.push(px(ax), height, pz(ay), px(ax), 6.3, pz(ay), px(bx), height, pz(by), px(bx), 6.3, pz(by));
      fuv.push(u0, 0, u0, 2.5, u1, 0, u1, 2.5);
      fidx.push(fv, fv + 2, fv + 1, fv + 1, fv + 2, fv + 3);
      fv += 4;
    }
  }
  fenceTex.repeat.set(1, 1);
  const fg = new THREE.BufferGeometry();
  fg.setAttribute("position", new THREE.Float32BufferAttribute(fpos, 3));
  fg.setAttribute("uv", new THREE.Float32BufferAttribute(fuv, 2));
  fg.setIndex(fidx);
  scene.add(new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: fenceTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.55 })));
}

/** Stacks of tyres on the outside of the quicker corners, with a coloured one now and then. */
function buildTyreWalls(scene: THREE.Scene, t: Track, near: Near) {
  const dist = t.width / 2 + 10.5;
  const items: { x: number; y: number; row: number; c: number }[] = [];
  const spacing = 0.64;
  for (const side of [1, -1] as const) {
    for (let i = 0; i < t.n; i++) {
      const k = t.kappa[i]! * side;
      if (k > -1 / 650) continue;
      const x = t.x[i]! + t.nx[i]! * dist * side;
      const y = t.y[i]! + t.ny[i]! * dist * side;
      if (near(x, y, i, dist - 4)) continue;
      const h = t.heading[i]!;
      for (let m = 0; m < Math.floor(t.ds / spacing); m++) {
        const along = m * spacing;
        const stack = Math.floor((i * t.ds + along) / spacing);
        for (let row = 0; row < 3; row++) {
          items.push({ x: x + Math.cos(h) * along, y: y + Math.sin(h) * along, row, c: stack });
        }
      }
    }
  }
  if (!items.length) return;
  const geo = new THREE.CylinderGeometry(0.31, 0.31, 0.31, 12);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), items.length);
  const m4 = new THREE.Matrix4();
  const colors = [col("#17181a"), col("#202226"), col("#f2f2f2"), col("#17181a"), col("#1c64b4"), col("#17181a")];
  items.forEach((it, k) => {
    m4.makeTranslation(px(it.x), 0.16 + it.row * 0.31, pz(it.y));
    mesh.setMatrixAt(k, m4);
    // Every sixth stack gets a coloured band on its middle tyre.
    const band = it.c % 12 === 0 && it.row === 1;
    mesh.setColorAt(k, band ? colors[it.c % 5 === 0 ? 2 : 4]! : colors[(it.c + it.row) % 2 === 0 ? 0 : 1]!);
  });
  mesh.castShadow = true;
  scene.add(mesh);
}

// ------------------------------------------------------------------ grandstands and bridges

function buildStands(scene: THREE.Scene, t: Track, near: Near, rnd: () => number) {
  const places: { s: number; side: 1 | -1; len: number }[] = [{ s: 90, side: 1, len: 90 }];
  // Corner exits with the most curvature, at least 700 m apart.
  const cand: { s: number; k: number }[] = [];
  for (let i = 0; i < t.n; i += 4) cand.push({ s: i * t.ds, k: t.kappa[i]! });
  cand.sort((a, b) => Math.abs(b.k) - Math.abs(a.k));
  for (const c of cand) {
    if (places.length >= 9) break;
    if (Math.abs(c.k) < 1 / 260) break;
    const tooClose = places.some((p) => Math.min(Math.abs(p.s - c.s), t.length - Math.abs(p.s - c.s)) < 650);
    if (tooClose || c.s < 400 || c.s > t.length - 400) continue;
    places.push({ s: c.s, side: c.k > 0 ? -1 : 1, len: 60 });
  }

  const crowd = crowdTexture();
  const crowdParts: THREE.BufferGeometry[] = [];
  const bodyParts: THREE.BufferGeometry[] = [];
  const roofCol = col("#e4e7ec");
  const steel = col("#59606b");
  for (const pl of places) {
    const p = trackAt(t, pl.s);
    const d0 = t.width / 2 + 22;
    const bx = p.x + p.nx * d0 * pl.side;
    const by = p.y + p.ny * d0 * pl.side;
    if (near(bx, by, Math.round(pl.s / t.ds), d0 - 6)) continue;
    // Local frame: x along the track, z outwards from it.
    const frame = new THREE.Matrix4().compose(
      new THREE.Vector3(px(p.x + p.nx * d0 * pl.side), 0, pz(p.y + p.ny * d0 * pl.side)),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.heading),
      new THREE.Vector3(1, 1, 1),
    );
    // Local +z must point away from the track: the left normal in three space is (-sin, 0, -cos) rotated, so flip for the left side.
    const outward = pl.side > 0 ? -1 : 1;
    const tiers = 7;
    for (let k = 0; k < tiers; k++) {
      const g = new THREE.BoxGeometry(pl.len, 1 + k * 1.1, 2.4);
      g.translate(0, (1 + k * 1.1) / 2, outward * (k * 2.4 + 1.2));
      scaleUV(g, pl.len / 22, 1 + k * 0.4);
      g.applyMatrix4(frame);
      crowdParts.push(plain(paint(g, new THREE.Color().setHSL(0, 0, 0.75 + rnd() * 0.25))));
    }
    // Roof on four columns.
    const roof = new THREE.BoxGeometry(pl.len + 4, 0.45, tiers * 2.4 + 3);
    roof.translate(0, 13.6, outward * (tiers * 1.2 + 0.4));
    roof.applyMatrix4(frame);
    bodyParts.push(plain(paint(roof, roofCol)));
    for (const cx of [-pl.len / 2, -pl.len / 6, pl.len / 6, pl.len / 2]) {
      const c = new THREE.BoxGeometry(0.5, 13.6, 0.5);
      c.translate(cx, 6.8, outward * (tiers * 2.4 + 0.6));
      c.applyMatrix4(frame);
      bodyParts.push(plain(paint(c, steel)));
    }
    // Back wall.
    const back = new THREE.BoxGeometry(pl.len, 9, 0.4);
    back.translate(0, 4.5, outward * (tiers * 2.4 + 1.1));
    back.applyMatrix4(frame);
    bodyParts.push(plain(paint(back, col("#c9ced6"))));
  }
  if (crowdParts.length) {
    const cm = new THREE.Mesh(mergeGeometries(crowdParts, false)!, new THREE.MeshStandardMaterial({ map: crowd, vertexColors: true, roughness: 0.9 }));
    cm.castShadow = true;
    cm.receiveShadow = true;
    scene.add(cm);
  }
  if (bodyParts.length) {
    const bm = new THREE.Mesh(mergeGeometries(bodyParts, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15, side: THREE.DoubleSide }));
    bm.castShadow = true;
    bm.receiveShadow = true;
    scene.add(bm);
  }
}

/** Arches over the track carrying a sponsor banner. */
function buildBridges(scene: THREE.Scene, t: Track, near: Near) {
  const tex = sponsorTexture();
  const count = Math.max(2, Math.round(t.length / 1700));
  const steel = new THREE.MeshStandardMaterial({ color: 0x353a42, roughness: 0.5, metalness: 0.6 });
  for (let k = 0; k < count; k++) {
    const s = 300 + (k * (t.length - 600)) / count + 120;
    const p = trackAt(t, s % t.length);
    const w = t.width + 26;
    if (near(p.x + p.nx * (t.width / 2 + 12), p.y + p.ny * (t.width / 2 + 12), Math.round(s / t.ds) % t.n, t.width / 2 + 7)) continue;
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, w), steel);
    beam.position.set(0, 8.4, 0);
    g.add(beam);
    for (const sd of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 8.4, 1.2), steel);
      post.position.set(0, 4.2, (sd * w) / 2);
      g.add(post);
    }
    const si = k % SPONSORS.length;
    const geo = new THREE.PlaneGeometry(w - 6, 1.6);
    const uv = geo.attributes.uv!;
    for (let j = 0; j < uv.count; j++) uv.setX(j, (uv.getX(j) + si) / SPONSORS.length);
    for (const face of [1, -1]) {
      const banner = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.2 }));
      banner.position.set(face * 0.75, 8.4, 0);
      banner.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(banner);
    }
    g.position.set(px(p.x), 0, pz(p.y));
    g.rotation.y = p.heading;
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    scene.add(g);
  }
}

// ------------------------------------------------------------------ scenery

function allNear(t: Track, x: number, y: number, r: number): boolean {
  for (let i = 0; i < t.n; i += 2) if ((t.x[i]! - x) ** 2 + (t.y[i]! - y) ** 2 < r * r) return true;
  return false;
}

function buildScenery(scene: THREE.Scene, t: Track, style: Style, rnd: () => number) {
  if (style === "city") return buildCity(scene, t, rnd);
  const items: { x: number; y: number; s: number; c: THREE.Color; r: number }[] = [];
  const want = style === "desert" ? 170 : 900;
  for (let k = 0; k < want * 5 && items.length < want; k++) {
    const i = Math.floor(rnd() * t.n);
    const side = rnd() < 0.5 ? -1 : 1;
    const dist = 22 + rnd() * rnd() * 200;
    const x = t.x[i]! + t.nx[i]! * dist * side;
    const y = t.y[i]! + t.ny[i]! * dist * side;
    if (allNear(t, x, y, 21)) continue;
    const g = rnd();
    const tint = style === "desert" ? new THREE.Color().setHSL(0.27, 0.3, 0.3 + g * 0.1) : new THREE.Color().setHSL(0.3 + g * 0.05, 0.55, 0.14 + g * 0.08);
    items.push({ x, y, s: 0.85 + rnd() * 1.1, c: tint, r: rnd() * Math.PI * 2 });
  }
  const parts: THREE.BufferGeometry[] = [];
  if (style === "desert") {
    // Palms: a curved trunk and a crown of fronds.
    const trunkCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.4, 3.5, 0.1), new THREE.Vector3(0.9, 7, 0.3)]);
    parts.push(plain(paint(new THREE.TubeGeometry(trunkCurve, 8, 0.3, 6, false), col("#7a5a38"))));
    for (let f = 0; f < 8; f++) {
      const a = (f / 8) * Math.PI * 2;
      const frond = new THREE.ConeGeometry(0.35, 4.4, 4);
      frond.rotateZ(Math.PI / 2);
      frond.translate(2.2, 0, 0);
      frond.rotateZ(-0.5);
      frond.rotateY(a);
      frond.translate(0.9, 7, 0.3);
      parts.push(plain(paint(frond, col("#ffffff"))));
    }
  } else {
    // Conifers: three stacked cones on a trunk.
    parts.push(plain(paint(new THREE.CylinderGeometry(0.3, 0.45, 3, 6).translate(0, 1.5, 0), col("#5a3f27"))));
    const cones: [number, number, number][] = [[3.6, 5.5, 4.2], [2.8, 4.6, 7], [1.9, 3.8, 9.6]];
    cones.forEach(([r, h, y], i) => parts.push(plain(paint(new THREE.ConeGeometry(r, h, 9).translate(0, y, 0), new THREE.Color(1, 1, 1).multiplyScalar(0.75 + i * 0.12)))));
  }
  const geo = mergeGeometries(parts, false)!;
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), items.length);
  const m4 = new THREE.Matrix4();
  items.forEach((it, k) => {
    m4.compose(new THREE.Vector3(px(it.x), 0, pz(it.y)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.r), new THREE.Vector3(it.s, it.s * (0.9 + rnd() * 0.3), it.s));
    mesh.setMatrixAt(k, m4);
    mesh.setColorAt(k, it.c.clone().multiplyScalar(style === "desert" ? 1.5 : 1.0));
  });
  mesh.castShadow = true;
  scene.add(mesh);

  // Boulders for the desert, shrubs for the rest.
  const rocks: { x: number; y: number; s: number }[] = [];
  for (let k = 0; k < 600 && rocks.length < 160; k++) {
    const i = Math.floor(rnd() * t.n);
    const side = rnd() < 0.5 ? -1 : 1;
    const dist = 19 + rnd() * 60;
    const x = t.x[i]! + t.nx[i]! * dist * side;
    const y = t.y[i]! + t.ny[i]! * dist * side;
    if (allNear(t, x, y, 18)) continue;
    rocks.push({ x, y, s: 0.5 + rnd() * 1.6 });
  }
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rm = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: style === "desert" ? 0x9b8466 : 0x6f7a62, roughness: 1, flatShading: true }), rocks.length);
  rocks.forEach((r, k) => {
    m4.compose(new THREE.Vector3(px(r.x), r.s * 0.4, pz(r.y)), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(), rnd() * 6, rnd())), new THREE.Vector3(r.s * 1.3, r.s * 0.8, r.s));
    rm.setMatrixAt(k, m4);
  });
  rm.castShadow = true;
  scene.add(rm);
}

function buildCity(scene: THREE.Scene, t: Track, rnd: () => number) {
  const facade = facadeTexture();
  const parts: THREE.BufferGeometry[] = [];
  const add = (x: number, y: number, w: number, d: number, h: number, shade: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    // Windows tile at a fixed size, so UVs follow the real dimensions.
    const uv = g.attributes.uv!;
    const nrm = g.attributes.normal!;
    for (let i = 0; i < uv.count; i++) {
      const horiz = Math.abs(nrm.getY(i)) > 0.5;
      const across = Math.abs(nrm.getX(i)) > 0.5 ? d : w;
      uv.setXY(i, uv.getX(i) * (horiz ? 1 : across / 9), uv.getY(i) * (horiz ? 1 : h / 9));
    }
    g.translate(px(x), h / 2, pz(y));
    paint(g, new THREE.Color(shade, shade * 1.01, shade * 1.04));
    parts.push(plain(g));
  };
  let placed = 0;
  for (let k = 0; k < 1400 && placed < 320; k++) {
    const i = Math.floor(rnd() * t.n);
    const side = rnd() < 0.5 ? -1 : 1;
    const dist = 28 + rnd() * 170;
    const x = t.x[i]! + t.nx[i]! * dist * side;
    const y = t.y[i]! + t.ny[i]! * dist * side;
    const w = 18 + rnd() * 28;
    const d = 18 + rnd() * 28;
    if (allNear(t, x, y, 27 + Math.max(w, d) * 0.5)) continue;
    add(x, y, w, d, 16 + rnd() * rnd() * 130, 0.62 + rnd() * 0.38);
    placed++;
  }
  // A skyline in the distance.
  const cx = (t.bbox.minX + t.bbox.maxX) / 2;
  const cy = (t.bbox.minY + t.bbox.maxY) / 2;
  const spanR = Math.hypot(t.bbox.maxX - t.bbox.minX, t.bbox.maxY - t.bbox.minY) / 2;
  for (let k = 0; k < 160; k++) {
    const a = rnd() * Math.PI * 2;
    const r = spanR + 250 + rnd() * 1400;
    add(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 40 + rnd() * 50, 40 + rnd() * 50, 70 + rnd() * rnd() * 330, 0.6 + rnd() * 0.3);
  }
  const mesh = new THREE.Mesh(
    mergeGeometries(parts, false)!,
    new THREE.MeshStandardMaterial({ map: facade, vertexColors: true, roughness: 0.6, metalness: 0.08, envMapIntensity: 0.5 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

/** A ring of hills at the edge of the world, so the sky meets something. */
function buildHorizon(scene: THREE.Scene, t: Track, style: Style, centre: THREE.Vector3, rnd: () => number) {
  if (style === "city") return;
  const spanR = Math.hypot(t.bbox.maxX - t.bbox.minX, t.bbox.maxY - t.bbox.minY) / 2;
  const radius = Math.max(2400, spanR + 1800);
  const segs = 160;
  const phase = rnd() * 100;
  const layers = style === "desert" ? [["#c9a77a", 0.55, 160], ["#b39066", 0.7, 90]] as const : [["#5f7f6f", 0.5, 260], ["#4a6b45", 0.75, 130]] as const;
  layers.forEach(([color, scale, hmax], li) => {
    const pos: number[] = [];
    const clr: number[] = [];
    const idx: number[] = [];
    const base = new THREE.Color(color);
    for (let k = 0; k <= segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const r = radius * (0.92 + li * 0.1);
      const n = Math.sin(a * 3 + phase) * 0.5 + Math.sin(a * 7 + phase * 1.7) * 0.3 + Math.sin(a * 17 + phase * 2.3) * 0.2;
      const h = hmax * (0.35 + 0.65 * (0.5 + n * 0.5)) * scale * 1.4;
      pos.push(centre.x + Math.cos(a) * r, -5, centre.z + Math.sin(a) * r, centre.x + Math.cos(a) * r, h, centre.z + Math.sin(a) * r);
      const top = base.clone().multiplyScalar(1.15);
      clr.push(base.r * 0.7, base.g * 0.7, base.b * 0.7, top.r, top.g, top.b);
    }
    for (let k = 0; k < segs; k++) {
      const v = k * 2;
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(clr, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true })));
  });
}

// ------------------------------------------------------------------ start gantry

function buildStartGantry(scene: THREE.Scene, t: Track): THREE.Mesh[] {
  const p = trackAt(t, 0);
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5, metalness: 0.55 });
  const w = t.width + 10;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, w), frame);
  beam.position.set(0, 9.2, 0);
  g.add(beam);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.3, 9.2, 1.3), frame);
    post.position.set(0, 4.6, (s * w) / 2);
    g.add(post);
  }
  // Sponsor strip along the underside of the beam.
  const tex = sponsorTexture();
  const geo = new THREE.PlaneGeometry(w - 4, 1.1);
  const uv = geo.attributes.uv!;
  for (let j = 0; j < uv.count; j++) uv.setX(j, (uv.getX(j) * 2) / SPONSORS.length);
  const strip = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 }));
  strip.position.set(0.82, 9.2, 0);
  strip.rotation.y = Math.PI / 2;
  g.add(strip);
  // Five pairs of lights facing the grid.
  const lights: THREE.Mesh[] = [];
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 7.2), new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.4 }));
  housing.position.set(-0.95, 8.0, 0);
  g.add(housing);
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.2, 18), new THREE.MeshBasicMaterial({ color: 0x3a0a0a }));
    m.rotation.z = Math.PI / 2;
    m.position.set(-1.25, 8.0, (i - 2) * 1.35);
    g.add(m);
    lights.push(m);
  }
  g.position.set(px(p.x), 0, pz(p.y));
  g.rotation.y = p.heading;
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  scene.add(g);
  return lights;
}
