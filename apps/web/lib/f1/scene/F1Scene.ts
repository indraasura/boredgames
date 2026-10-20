import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { COMPOUNDS, boxFor, pitOffset, pitPathFor, trackAt, type Compound, type Team, type Track } from "@boredgames/f1";

export type CameraMode = "chase" | "close" | "cockpit" | "top";
export type Style = "green" | "desert" | "city";

export interface SceneCar {
  id: string;
  team: Team;
  compound: Compound;
  name: string;
  helmet: string;
  /** The car this player drives: no name tag. */
  mine: boolean;
}

export interface CarFrame {
  id: string;
  x: number;
  y: number;
  psi: number;
  delta: number;
  u: number;
  v: number;
  throttle: number;
  brake: number;
  drs: boolean;
  compound: Compound;
  impact: number;
  /** 0..1 amount the tyres are sliding, for smoke and squeal. */
  slip: number;
  offTrack: boolean;
}

export interface EnvFrame {
  wetness: number;
  rain: number;
  cloud: number;
}

const STYLE: Record<string, Style> = {
  "mc-1929": "city",
  "sg-2008": "city",
  "az-2016": "city",
  "sa-2021": "city",
  "us-2023": "city",
  "us-2022": "city",
  "bh-2002": "desert",
  "ae-2009": "desert",
  "qa-2004": "desert",
  "za-1961": "desert",
  "mx-1962": "desert",
  "es-2026": "desert",
  "us-2012": "desert",
  "ru-2014": "city",
};
export const styleFor = (id: string): Style => STYLE[id] ?? "green";

/** Sim coordinates (x east, y north, heading counter-clockwise from +x) to three.js (x, up, z = -y). */
const px = (x: number) => x;
const pz = (y: number) => -y;

function rand(seed: number) {
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

function ribbon(
  t: Track,
  a: (i: number) => number,
  b: (i: number) => number,
  y: number,
  color: (i: number) => THREE.Color,
  range?: { from: number; to: number; centre?: (s: number) => number },
): THREE.BufferGeometry {
  const n = t.n;
  const from = range?.from ?? 0;
  const to = range?.to ?? n;
  const count = to - from;
  const closed = !range;
  const pos: number[] = [];
  const colr: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k <= count; k++) {
    const i = (from + k + n * 4) % n;
    const c = color(i);
    for (const off of [a(i), b(i)]) {
      pos.push(px(t.x[i]! + t.nx[i]! * off), y, pz(t.y[i]! + t.ny[i]! * off));
      colr.push(c.r, c.g, c.b);
    }
  }
  const segments = closed ? count : count;
  for (let k = 0; k < segments; k++) {
    const v = k * 2;
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

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
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    v += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.Color, rotY = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  paint(g, color);
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
  // mergeGeometries needs matching attributes.
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) if (!["position", "normal", "color"].includes(name)) out.deleteAttribute(name);
  return out;
}

/** The car body for a team, built once: x forward, y up, z to the right. Origin on the ground below the centre of gravity. */
function buildBody(team: Team, helmet: string): THREE.BufferGeometry {
  const main = col(team.color);
  const accent = col(team.accent);
  const carbon = col("#16181c");
  const dark = col("#0a0b0d");
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry) => parts.push(plain(g));
  add(box(4.6, 0.07, 1.46, 0.05, 0.1, 0, carbon)); // floor
  add(box(2.9, 0.4, 0.58, 0.5, 0.36, 0, main)); // tub
  const nose = new THREE.CylinderGeometry(0.07, 0.27, 1.85, 12);
  nose.rotateZ(-Math.PI / 2);
  nose.translate(2.05, 0.27, 0);
  add(paint(nose, main));
  // front wing
  add(box(0.5, 0.035, 1.95, 3.0, 0.1, 0, carbon));
  add(box(0.34, 0.03, 1.8, 2.9, 0.19, 0, accent));
  add(box(0.55, 0.3, 0.03, 3.0, 0.2, 0.98, accent));
  add(box(0.55, 0.3, 0.03, 3.0, 0.2, -0.98, accent));
  // sidepods and engine cover
  add(box(1.55, 0.34, 0.42, -0.15, 0.36, 0.56, main));
  add(box(1.55, 0.34, 0.42, -0.15, 0.36, -0.56, main));
  add(box(0.1, 0.22, 0.34, 0.62, 0.38, 0.56, dark));
  add(box(0.1, 0.22, 0.34, 0.62, 0.38, -0.56, dark));
  add(box(1.9, 0.34, 0.42, -1.3, 0.5, 0, main));
  add(box(1.6, 0.34, 0.03, -1.4, 0.74, 0, accent)); // shark fin
  add(box(0.5, 0.36, 0.34, 0.15, 0.76, 0, dark)); // airbox
  // halo
  const halo = new THREE.TorusGeometry(0.28, 0.025, 6, 16, Math.PI);
  halo.rotateY(Math.PI / 2);
  halo.translate(0.68, 0.58, 0);
  add(paint(halo, dark));
  const helm = new THREE.SphereGeometry(0.15, 12, 8);
  helm.translate(0.5, 0.67, 0);
  add(paint(helm, col(helmet)));
  // rear wing, beam wing, diffuser
  add(box(0.5, 0.05, 1.0, -2.42, 0.96, 0, carbon));
  add(box(0.03, 0.55, 0.45, -2.42, 0.7, 0.5, accent));
  add(box(0.03, 0.55, 0.45, -2.42, 0.7, -0.5, accent));
  add(box(0.06, 0.5, 0.06, -2.3, 0.72, 0.25, carbon));
  add(box(0.06, 0.5, 0.06, -2.3, 0.72, -0.25, carbon));
  add(box(0.32, 0.03, 0.9, -2.3, 0.3, 0, carbon));
  add(box(0.7, 0.05, 1.3, -2.2, 0.15, 0, carbon));
  const merged = mergeGeometries(parts, false)!;
  merged.computeVertexNormals();
  return merged;
}

// ------------------------------------------------------------------------- scene

interface CarMesh {
  group: THREE.Group;
  wheels: THREE.Mesh[];
  fronts: THREE.Group[];
  rings: THREE.Mesh[];
  flap: THREE.Mesh;
  brakeLight: THREE.Mesh;
  label: THREE.Sprite | null;
  spin: number;
  compound: Compound;
  shadow: THREE.Mesh;
  smoke: number;
}

const TYRE_RADIUS = 0.355;

export class F1Scene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, 1, 0.3, 4000);
  private cars = new Map<string, CarMesh>();
  private ground!: THREE.Mesh;
  private asphalt!: THREE.Mesh;
  private asphaltMat!: THREE.MeshStandardMaterial;
  private sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private hemi = new THREE.HemisphereLight(0xbcd8f2, 0x5f7a4a, 0.9);
  private lightsMeshes: THREE.Mesh[] = [];
  private rain!: THREE.LineSegments;
  private rainPos!: Float32Array;
  private particles!: THREE.Points;
  private pPos = new Float32Array(900 * 3);
  private pVel = new Float32Array(900 * 3);
  private pLife = new Float32Array(900);
  private pCol = new Float32Array(900 * 3);
  private pCursor = 0;
  private camPos = new THREE.Vector3();
  private camYaw = 0;
  private camInit = false;
  private mode: CameraMode = "chase";
  private shake = 0;
  private disposed = false;
  private bodies = new Map<string, THREE.BufferGeometry>();
  private tyreMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  private rimMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.7, roughness: 0.35 });
  private bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2 });
  private wheelGeo = new THREE.CylinderGeometry(TYRE_RADIUS, TYRE_RADIUS, 0.4, 20);
  private rimGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.42, 14);
  private ringGeo = new THREE.TorusGeometry(0.3, 0.012, 6, 28);
  private ringMats = new Map<Compound, THREE.MeshBasicMaterial>();
  private shadowTex: THREE.Texture;
  private time = 0;
  private skyMat: THREE.MeshBasicMaterial | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private track: Track,
    cars: SceneCar[],
    private style: Style,
    private opts: { quality?: "low" | "high" } = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.quality === "low" ? 1 : 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene.background = new THREE.Color(0x8ec8f0);
    this.scene.fog = new THREE.Fog(0x8ec8f0, 400, 3000);
    this.shadowTex = this.makeShadowTexture();
    this.buildEnvironment();
    this.buildWorld();
    this.buildStartGantry();
    this.buildRain();
    this.buildParticles();
    this.sun.position.set(300, 500, 200);
    this.scene.add(this.sun, this.hemi);
    for (const c of cars) this.addCar(c);
    this.resize();
  }

  // --------------------------------------------------------------- build

  private makeShadowTexture(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  private buildEnvironment() {
    // A small sky-and-ground scene, baked into reflections for the paint and the wet road.
    const env = new THREE.Scene();
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(50, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {},
        vertexShader: "varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader:
          "varying vec3 p; void main(){ float h = clamp(p.y*0.5+0.5, 0.0, 1.0); vec3 top = vec3(0.45,0.65,0.95); vec3 hor = vec3(0.92,0.95,1.0); vec3 low = vec3(0.25,0.28,0.25); vec3 c = h>0.5 ? mix(hor, top, (h-0.5)*2.0) : mix(low, hor, h*2.0); gl_FragColor = vec4(c*1.2,1.0); }",
      }),
    );
    env.add(sky);
    const sun = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff4d6 }));
    sun.position.set(25, 35, 15);
    env.add(sun);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(env, 0.02).texture;
    this.scene.environmentIntensity = 0.7;
    pm.dispose();
    sky.geometry.dispose();
  }

  private buildWorld() {
    const t = this.track;
    const half = t.width / 2;
    const rnd = rand(t.n * 7919);
    const ground: Record<Style, string> = { green: "#6f9e4f", desert: "#d6b98a", city: "#8a8d90" };
    const groundCol = col(ground[this.style]);

    // Ground, large and a little uneven in colour.
    const size = 20000;
    const gg = new THREE.PlaneGeometry(size, size);
    gg.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: groundCol, roughness: 1 }));
    this.ground.position.set((t.bbox.minX + t.bbox.maxX) / 2, -0.06, -(t.bbox.minY + t.bbox.maxY) / 2);
    this.scene.add(this.ground);

    // Run-off: grass then gravel, beside the road.
    const grassCol = col(this.style === "desert" ? "#cdb383" : this.style === "city" ? "#9a9c9e" : "#5f9448");
    const gravelCol = col(this.style === "city" ? "#b5b7b9" : "#cdbf9b");
    for (const side of [1, -1] as const) {
      const g1 = ribbon(t, () => side * (half + 1.2), () => side * (half + 7), -0.03, (i) => grassCol.clone().offsetHSL(0, 0, Math.sin(i * 0.05) * 0.02));
      const g2 = ribbon(t, () => side * (half + 7), () => side * (half + 11), -0.025, () => gravelCol);
      for (const g of [g1, g2]) this.scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })));
    }

    // Asphalt.
    const base = col("#34363b");
    const geo = ribbon(t, () => -half, () => half, 0.0, (i) => base.clone().offsetHSL(0, 0, Math.sin(i * 0.11) * 0.012 + Math.sin(i * 0.031) * 0.01));
    this.asphaltMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide });
    this.asphalt = new THREE.Mesh(geo, this.asphaltMat);
    this.scene.add(this.asphalt);

    // White edge lines and a dashed centre guide is left out: kerbs on the corners instead.
    const white = col("#f2f2f2");
    for (const side of [1, -1] as const) {
      this.scene.add(new THREE.Mesh(ribbon(t, () => side * (half - 0.22), () => side * (half + 0.02), 0.02, () => white), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    }
    const red = col("#d3262d");
    const w = col("#f4f4f4");
    const kerbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
    for (const side of [1, -1] as const) {
      const g = stripes(t, side, half + 0.02, half + 1.3, 0.025, (i) => {
        // Kerbs where the track turns, on the inside, and a little on the outside of the exit.
        const k = t.kappa[i]!;
        const inside = k * side > 1 / 700;
        const outside = k * side < -1 / 500;
        if (!inside && !outside) return null;
        return Math.floor(i / 1) % 2 === 0 ? red : w;
      });
      this.scene.add(new THREE.Mesh(g, kerbMat));
    }

    // Start line and grid slots.
    const check = document.createElement("canvas");
    check.width = 64;
    check.height = 16;
    const cg = check.getContext("2d")!;
    for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 16; xx++) {
      cg.fillStyle = (xx + yy) % 2 === 0 ? "#fff" : "#111";
      cg.fillRect(xx * 4, yy * 8, 4, 8);
    }
    const checkTex = new THREE.CanvasTexture(check);
    checkTex.magFilter = THREE.NearestFilter;
    const p0 = trackAt(t, 0);
    const line = new THREE.Mesh(this.flat(1.4, t.width, p0.x, p0.y, p0.heading, 0.03), new THREE.MeshBasicMaterial({ map: checkTex }));
    this.scene.add(line);
    const marks: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 20; k++) {
      const row = Math.floor(k / 2);
      const side = k % 2 === 0 ? -1 : 1;
      const s0 = -(10 + row * 9) - (side > 0 ? 4 : 0);
      const p = trackAt(t, ((s0 % t.length) + t.length) % t.length);
      const cx = p.x + p.nx * side * 2.6;
      const cy = p.y + p.ny * side * 2.6;
      // A front bar and two side ticks, painted just ahead of where the car sits.
      const fwdx = Math.cos(p.heading);
      const fwdy = Math.sin(p.heading);
      marks.push(this.flat(0.14, 1.9, cx + fwdx * 3.2, cy + fwdy * 3.2, p.heading, 0.03));
      for (const sd of [-0.95, 0.95]) marks.push(this.flat(1.3, 0.12, cx + fwdx * 2.55 + p.nx * sd, cy + fwdy * 2.55 + p.ny * sd, p.heading, 0.03));
    }
    this.scene.add(new THREE.Mesh(mergeGeometries(marks.map(plain))!, new THREE.MeshBasicMaterial({ color: 0xf2f2f2 })));

    this.buildPits();
    this.buildBarriers();
    this.buildScenery(rnd);
  }

  /** A flat rectangle on the road: `along` metres of travel by `across` metres wide, centred at a sim position. */
  private flat(along: number, across: number, x: number, y: number, heading: number, h: number): THREE.BufferGeometry {
    const g = new THREE.PlaneGeometry(along, across);
    g.rotateX(-Math.PI / 2);
    g.rotateY(heading);
    g.translate(px(x), h, pz(y));
    return g;
  }

  private buildPits() {
    const t = this.track;
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
    // Pit lane road.
    const pos: number[] = [];
    const idx: number[] = [];
    pts.forEach((p, k) => {
      for (const o of [p.off - 3.4, p.off + 3.4]) pos.push(px(p.x + p.nx * o), 0.012, pz(p.y + p.ny * o));
      if (k < pts.length - 1) {
        const v = k * 2;
        idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const road = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x3b3d42, roughness: 0.95, side: THREE.DoubleSide }));
    this.scene.add(road);
    // Garages and pit wall, where the lane runs straight.
    const garage = new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.8 });
    const wall = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.8 });
    for (let s = 0; s < 220; s += 4) {
      const p = trackAt(t, s);
      const off = path.lane;
      const wallPos = (o: number, h: number, ww: number, mat: THREE.Material) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(4.2, h, ww), mat);
        m.position.set(px(p.x + p.nx * o), h / 2, pz(p.y + p.ny * o));
        m.rotation.y = p.heading;
        this.scene.add(m);
      };
      wallPos(off + 4.6, 1.0, 0.6, wall);
      wallPos(off - 9.2, 4.2, 8, garage);
    }
    const doorColors = ["#E10600", "#00A3E0", "#FF8000", "#0F8F5C", "#C0C6CC", "#8B1D3B", "#1C3F94", "#F26B3A", "#5FD068", "#7D3FC4"];
    for (let i = 0; i < 10; i++) {
      const p = trackAt(t, boxFor(t, i));
      const door = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.2, 0.2), new THREE.MeshStandardMaterial({ color: doorColors[i], roughness: 0.6 }));
      door.position.set(px(p.x + p.nx * (path.lane - 5.2)), 1.7, pz(p.y + p.ny * (path.lane - 5.2)));
      door.rotation.y = p.heading;
      this.scene.add(door);
    }
  }

  private buildBarriers() {
    const t = this.track;
    const dist = t.width / 2 + 11.2;
    const near = this.spatialIndex(40);
    const red = new THREE.Color("#c8242b");
    const white = new THREE.Color("#f0f0f0");
    const geo = new THREE.BoxGeometry(4, 1.1, 0.7);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    const items: { x: number; y: number; h: number; c: THREE.Color }[] = [];
    for (let i = 0; i < t.n; i += 1) {
      for (const side of [1, -1]) {
        const x = t.x[i]! + t.nx[i]! * dist * side;
        const y = t.y[i]! + t.ny[i]! * dist * side;
        if (near(x, y, i, dist - 4)) continue;
        items.push({ x, y, h: t.heading[i]!, c: Math.floor(i / 2) % 2 === 0 ? red : white });
      }
    }
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    items.forEach((it, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.h);
      m4.compose(new THREE.Vector3(px(it.x), 0.55, pz(it.y)), q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(k, m4);
      mesh.setColorAt(k, it.c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
  }

  /** Is there another part of the track within `r` metres of this point (other than the part near sample i)? */
  private spatialIndex(cell: number) {
    const t = this.track;
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
            // Ignore the stretch of road the point belongs to.
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

  private buildScenery(rnd: () => number) {
    const t = this.track;
    const close = this.spatialIndex(40);
    // Everywhere within a distance of the road.
    const allNear = (x: number, y: number, r: number) => {
      for (let i = 0; i < t.n; i += 2) if ((t.x[i]! - x) ** 2 + (t.y[i]! - y) ** 2 < r * r) return true;
      return false;
    };
    void close;
    if (this.style === "city") {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 });
      const items: { x: number; y: number; w: number; d: number; h: number; c: THREE.Color }[] = [];
      for (let k = 0; k < 900 && items.length < 260; k++) {
        const i = Math.floor(rnd() * t.n);
        const side = rnd() < 0.5 ? -1 : 1;
        const dist = 24 + rnd() * 150;
        const x = t.x[i]! + t.nx[i]! * dist * side;
        const y = t.y[i]! + t.ny[i]! * dist * side;
        const w = 18 + rnd() * 30;
        const d = 18 + rnd() * 30;
        if (allNear(x, y, 26 + Math.max(w, d) * 0.5)) continue;
        const shade = 0.55 + rnd() * 0.35;
        items.push({ x, y, w, d, h: 14 + rnd() * rnd() * 120, c: new THREE.Color(shade, shade * 1.02, shade * 1.08) });
      }
      const mesh = new THREE.InstancedMesh(geo, mat, items.length);
      const m4 = new THREE.Matrix4();
      items.forEach((b, k) => {
        m4.compose(new THREE.Vector3(px(b.x), b.h / 2, pz(b.y)), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d));
        mesh.setMatrixAt(k, m4);
        mesh.setColorAt(k, b.c);
      });
      this.scene.add(mesh);
      return;
    }
    // Trees (or palms and rocks in the desert).
    const trunk = new THREE.CylinderGeometry(0.4, 0.55, 3, 6);
    trunk.translate(0, 1.5, 0);
    const crown = this.style === "desert" ? new THREE.SphereGeometry(2.4, 7, 5) : new THREE.ConeGeometry(3, 8, 8);
    crown.translate(0, this.style === "desert" ? 4.2 : 7, 0);
    const items: { x: number; y: number; s: number; c: THREE.Color }[] = [];
    const want = this.style === "desert" ? 140 : 520;
    for (let k = 0; k < want * 4 && items.length < want; k++) {
      const i = Math.floor(rnd() * t.n);
      const side = rnd() < 0.5 ? -1 : 1;
      const dist = 17 + rnd() * rnd() * 160;
      const x = t.x[i]! + t.nx[i]! * dist * side;
      const y = t.y[i]! + t.ny[i]! * dist * side;
      if (allNear(x, y, 15)) continue;
      const g = this.style === "desert" ? 0.35 + rnd() * 0.15 : 0.28 + rnd() * 0.2;
      items.push({ x, y, s: 0.8 + rnd() * 1.1, c: new THREE.Color(this.style === "desert" ? 0.3 + g * 0.2 : 0.12, g + 0.3, this.style === "desert" ? 0.2 : 0.14) });
    }
    const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 }), items.length);
    const crowns = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ roughness: 0.9 }), items.length);
    const m4 = new THREE.Matrix4();
    items.forEach((tr, k) => {
      m4.compose(new THREE.Vector3(px(tr.x), 0, pz(tr.y)), new THREE.Quaternion(), new THREE.Vector3(tr.s, tr.s, tr.s));
      trunks.setMatrixAt(k, m4);
      crowns.setMatrixAt(k, m4);
      crowns.setColorAt(k, tr.c);
    });
    this.scene.add(trunks, crowns);
    // A grandstand opposite the pits.
    const stand = new THREE.Mesh(new THREE.BoxGeometry(160, 9, 8), new THREE.MeshStandardMaterial({ color: 0x8e96a3, roughness: 0.8 }));
    const sp = trackAt(t, 70);
    stand.position.set(px(sp.x + sp.nx * 34), 4.5, pz(sp.y + sp.ny * 34));
    stand.rotation.y = sp.heading;
    this.scene.add(stand);
  }

  private buildStartGantry() {
    const t = this.track;
    const p = trackAt(t, 0);
    const g = new THREE.Group();
    const frame = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6, metalness: 0.4 });
    const w = t.width + 8;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, w), frame);
    beam.position.set(0, 8.6, 0);
    g.add(beam);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1, 8.6, 1), frame);
      post.position.set(0, 4.3, (s * w) / 2);
      g.add(post);
    }
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), new THREE.MeshBasicMaterial({ color: 0x3a0a0a }));
      m.rotation.z = Math.PI / 2;
      m.position.set(-0.7, 8.6, (i - 2) * 1.2);
      g.add(m);
      this.lightsMeshes.push(m);
    }
    g.position.set(px(p.x), 0, pz(p.y));
    g.rotation.y = p.heading;
    this.scene.add(g);
  }

  private buildRain() {
    const n = 2600;
    this.rainPos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 80;
      const y = Math.random() * 40;
      const z = (Math.random() - 0.5) * 80;
      this.rainPos.set([x, y, z, x - 0.12, y + 1.1, z + 0.12], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xcfe0f0, transparent: true, opacity: 0.5, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  private buildParticles() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(this.pCol, 3));
    this.particles = new THREE.Points(
      g,
      new THREE.PointsMaterial({ size: 1.6, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true }),
    );
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
    for (let i = 0; i < 900; i++) this.pPos[i * 3 + 1] = -100;
  }

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, c: THREE.Color) {
    const i = this.pCursor++ % 900;
    this.pPos.set([x, y, z], i * 3);
    this.pVel.set([vx, vy, vz], i * 3);
    this.pLife[i] = life;
    this.pCol.set([c.r, c.g, c.b], i * 3);
  }

  private bodyFor(team: Team, helmet: string) {
    const key = `${team.id}|${helmet}`;
    let g = this.bodies.get(key);
    if (!g) {
      g = buildBody(team, helmet);
      this.bodies.set(key, g);
    }
    return g;
  }

  private addCar(c: SceneCar) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.bodyFor(c.team, c.helmet), this.bodyMat);
    group.add(body);
    // Heading is applied to the outer group; the body points along +x of the car group, which is its own forward.
    const wheels: THREE.Mesh[] = [];
    const fronts: THREE.Group[] = [];
    const rings: THREE.Mesh[] = [];
    const spots: [number, number, number][] = [
      [1.96, 0.8, 0.4],
      [1.96, -0.8, 0.4],
      [-1.64, 0.82, 0.5],
      [-1.64, -0.82, 0.5],
    ];
    spots.forEach(([x, z, wd], i) => {
      const holder = new THREE.Group();
      holder.position.set(x, TYRE_RADIUS, z);
      const wheel = new THREE.Mesh(this.wheelGeo, this.tyreMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.scale.set(1, wd / 0.4, 1);
      const rim = new THREE.Mesh(this.rimGeo, this.rimMat);
      wheel.add(rim);
      const spinner = new THREE.Group();
      spinner.add(wheel);
      holder.add(spinner);
      const ring = new THREE.Mesh(this.ringGeo, this.ringMat(c.compound));
      ring.position.set(0, 0, Math.sign(z) * (wd / 2 + 0.005));
      holder.add(ring);
      rings.push(ring);
      group.add(holder);
      wheels.push(wheel);
      if (i < 2) fronts.push(holder);
    });
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.98), new THREE.MeshStandardMaterial({ color: new THREE.Color(c.team.accent), roughness: 0.5 }));
    flap.position.set(-2.46, 1.04, 0);
    group.add(flap);
    const brakeLight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.22), new THREE.MeshBasicMaterial({ color: 0x400000 }));
    brakeLight.position.set(-2.72, 0.5, 0);
    group.add(brakeLight);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2), new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(-0.1, 0.045, 0);
    group.add(shadow);
    let label: THREE.Sprite | null = null;
    if (!c.mine) {
      label = this.makeLabel(c.name, c.team.color);
      label.position.set(0, 2.2, 0);
      group.add(label);
    }
    const outer = new THREE.Group();
    outer.add(group);
    this.scene.add(outer);
    this.cars.set(c.id, { group: outer, wheels, fronts, rings, flap, brakeLight, label, spin: 0, compound: c.compound, shadow, smoke: 0 });
  }

  private ringMat(c: Compound) {
    let m = this.ringMats.get(c);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: COMPOUNDS[c].color });
      this.ringMats.set(c, m);
    }
    return m;
  }

  private makeLabel(text: string, color: string): THREE.Sprite {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const g = c.getContext("2d")!;
    g.font = "600 30px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const w = g.measureText(text).width + 36;
    g.fillStyle = "rgba(10,12,16,0.72)";
    g.beginPath();
    g.roundRect(128 - w / 2, 8, w, 48, 14);
    g.fill();
    g.fillStyle = color;
    g.fillRect(128 - w / 2 + 8, 22, 6, 20);
    g.fillStyle = "#fff";
    g.fillText(text, 128 + 6, 33);
    const tex = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
    s.scale.set(0.2, 0.05, 1);
    s.renderOrder = 10;
    return s;
  }

  // ---------------------------------------------------------------- frame

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setCamera(mode: CameraMode) {
    this.mode = mode;
  }

  setLights(count: number) {
    this.lightsMeshes.forEach((m, i) => (m.material as THREE.MeshBasicMaterial).color.set(i < count ? 0xff2a1a : 0x3a0a0a));
  }

  update(dt: number, cars: CarFrame[], focusId: string, env: EnvFrame) {
    if (this.disposed) return;
    this.time += dt;
    // ---- cars
    let focus: CarFrame | null = null;
    for (const f of cars) {
      const m = this.cars.get(f.id);
      if (!m) continue;
      if (f.id === focusId) focus = f;
      m.group.position.set(px(f.x), 0, pz(f.y));
      m.group.rotation.y = f.psi;
      const spin = (f.u / TYRE_RADIUS) * dt;
      m.spin += spin;
      m.wheels.forEach((w, i) => {
        w.parent!.rotation.z = -m.spin;
        void i;
      });
      m.fronts.forEach((h) => (h.rotation.y = f.delta));
      if (f.compound !== m.compound) {
        m.compound = f.compound;
        m.rings.forEach((r) => (r.material = this.ringMat(f.compound)));
      }
      m.flap.rotation.z = f.drs ? 0.55 : 0;
      (m.brakeLight.material as THREE.MeshBasicMaterial).color.set(f.brake > 0.1 ? 0xff2020 : 0x400000);
      if (m.label) {
        const d = Math.hypot(f.x - (focus?.x ?? f.x), f.y - (focus?.y ?? f.y));
        m.label.visible = !!focus && d > 14 && d < 140;
      }

      // ---- particles: tyre smoke, dust, spray
      const speed = Math.hypot(f.u, f.v);
      if (speed > 8) {
        const cp = Math.cos(f.psi);
        const sp = Math.sin(f.psi);
        const rx = f.x - cp * 1.7;
        const ry = f.y - sp * 1.7;
        if (f.slip > 0.85 && Math.random() < 0.7) {
          this.emit(px(rx), 0.2, pz(ry), (Math.random() - 0.5) * 2, 1.2, (Math.random() - 0.5) * 2, 1.0, new THREE.Color(0.85, 0.85, 0.85));
        }
        if (f.offTrack && Math.random() < 0.8) {
          const c = this.style === "desert" ? new THREE.Color(0.8, 0.7, 0.5) : new THREE.Color(0.45, 0.4, 0.3);
          this.emit(px(rx), 0.2, pz(ry), (Math.random() - 0.5) * 3, 1.5, (Math.random() - 0.5) * 3, 1.2, c);
        }
        if (env.wetness > 0.25 && speed > 30 && Math.random() < 0.9 * Math.min(1, env.wetness + 0.2)) {
          for (const side of [-0.8, 0.8]) {
            const lx = rx - sp * side;
            const ly = ry + cp * side;
            this.emit(px(lx), 0.3, pz(ly), -cp * speed * 0.05 + (Math.random() - 0.5), 1.4 + Math.random(), sp * speed * 0.05 + (Math.random() - 0.5), 0.9, new THREE.Color(0.78, 0.82, 0.88));
          }
        }
      }
    }

    // ---- particles
    for (let i = 0; i < 900; i++) {
      if (this.pLife[i]! <= 0) continue;
      this.pLife[i]! -= dt;
      this.pPos[i * 3] = this.pPos[i * 3]! + this.pVel[i * 3]! * dt;
      this.pPos[i * 3 + 1] = this.pPos[i * 3 + 1]! + this.pVel[i * 3 + 1]! * dt;
      this.pPos[i * 3 + 2] = this.pPos[i * 3 + 2]! + this.pVel[i * 3 + 2]! * dt;
      this.pVel[i * 3 + 1]! *= 0.98;
      if (this.pLife[i]! <= 0) this.pPos[i * 3 + 1] = -100;
    }
    this.particles.geometry.attributes.position!.needsUpdate = true;
    this.particles.geometry.attributes.color!.needsUpdate = true;

    // ---- weather
    this.applyEnvironment(env);

    // ---- camera
    if (focus) this.followCamera(dt, focus);
    if (this.rain.visible) this.updateRain(dt);
  }

  private applyEnvironment(env: EnvFrame) {
    const dry = new THREE.Color(this.style === "desert" ? 0x9fcff2 : 0x8ec8f0);
    const grey = new THREE.Color(0x77818b);
    const dark = new THREE.Color(0x3f4852);
    const bg = dry.clone().lerp(grey, Math.min(1, env.cloud * 0.8)).lerp(dark, Math.min(1, env.rain * 0.8));
    (this.scene.background as THREE.Color).copy(bg);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(bg);
    fog.near = 300 - env.rain * 240;
    fog.far = 3200 - env.rain * 2500 - env.cloud * 300;
    this.sun.intensity = 2.3 * (1 - env.cloud * 0.65) + 0.2;
    this.hemi.intensity = 0.85 + env.cloud * 0.25;
    this.scene.environmentIntensity = 0.75 * (1 - env.cloud * 0.5);
    this.asphaltMat.roughness = 0.93 - env.wetness * 0.62;
    this.asphaltMat.metalness = env.wetness * 0.25;
    this.asphaltMat.color.setScalar(1 - env.wetness * 0.35);
    this.rain.visible = env.rain > 0.03;
    (this.rain.material as THREE.LineBasicMaterial).opacity = 0.15 + env.rain * 0.5;
    this.renderer.toneMappingExposure = 1 - env.rain * 0.25;
  }

  private updateRain(dt: number) {
    const n = this.rainPos.length / 6;
    const fall = 38 * dt;
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      this.rainPos[o + 1]! -= fall;
      this.rainPos[o + 4]! -= fall;
      if (this.rainPos[o + 1]! < 0) {
        const y = 40;
        this.rainPos[o + 1] = y;
        this.rainPos[o + 4] = y + 1.1;
      }
    }
    this.rain.geometry.attributes.position!.needsUpdate = true;
    this.rain.position.set(this.camera.position.x, 0, this.camera.position.z);
  }

  private followCamera(dt: number, f: CarFrame) {
    const x = px(f.x);
    const z = pz(f.y);
    const speed = Math.hypot(f.u, f.v);
    // The camera turns with the car, a little behind it, so a slide looks like a slide.
    let dy = f.psi - this.camYaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    if (!this.camInit) {
      this.camYaw = f.psi;
      this.camInit = true;
    } else {
      this.camYaw += dy * Math.min(1, dt * (this.mode === "cockpit" ? 40 : 5));
    }
    const yaw = this.camYaw;
    const fx = Math.cos(yaw);
    const fz = -Math.sin(yaw);
    const target = new THREE.Vector3();
    const look = new THREE.Vector3();
    let fov = 62;
    if (this.mode === "chase") {
      target.set(x - fx * 9.5, 3.4, z - fz * 9.5);
      look.set(x + fx * 14, 0.9, z + fz * 14);
      fov = 62 + Math.min(18, speed * 0.07);
    } else if (this.mode === "close") {
      target.set(x - fx * 5.4, 1.7, z - fz * 5.4);
      look.set(x + fx * 14, 0.9, z + fz * 14);
      fov = 68 + Math.min(18, speed * 0.07);
    } else if (this.mode === "cockpit") {
      const cp = Math.cos(f.psi);
      const sp = Math.sin(f.psi);
      target.set(x + cp * 0.2, 0.95, z - sp * 0.2);
      look.set(x + Math.cos(f.psi + f.delta * 0.5) * 30, 0.9, z - Math.sin(f.psi + f.delta * 0.5) * 30);
      fov = 80 + Math.min(14, speed * 0.05);
    } else {
      target.set(x - fx * 6, 70, z - fz * 6);
      look.set(x + fx * 10, 0, z + fz * 10);
      fov = 55;
    }
    if (this.mode === "cockpit") this.camPos.copy(target);
    else this.camPos.lerp(target, Math.min(1, dt * 12));
    this.shake = Math.max(this.shake - dt * 3, f.impact);
    const shakeAmt = this.shake * 0.6 + (f.offTrack ? Math.min(0.12, speed * 0.002) : 0);
    this.camera.position.copy(this.camPos);
    if (shakeAmt > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * shakeAmt;
    }
    this.camera.lookAt(look);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }
  }

  render() {
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}
