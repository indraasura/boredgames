import * as THREE from "three";
import { TILE_INFO, getBoard, getMap, type Board, type BoardNode, type Theme, type TileType } from "@boredgames/milestones";
import { LAYOUTS, computeLayout, type Layout } from "./layout";
import { THEMES, type WorldTheme } from "./themes";

/**
 * The 3D world. Framework-free on purpose: React only owns the <canvas> and calls this class.
 * It knows nothing about game rules; it lays out the engine's board graph in space (per map and
 * theme) and animates cars between node ids.
 */

export type Focus = number | "overview";
export type BurstKind = "coins" | "confetti" | "hearts" | "smoke" | "sparkle";

export interface AheadMarker {
  node: number;
  steps: number;
  /** Outside the currently selected spin range. */
  dim: boolean;
}

export interface HoverInfo {
  node: number;
  /** Pixels from the canvas's top-left. */
  x: number;
  y: number;
}

interface Car {
  group: THREE.Group;
  pegs: THREE.Group[];
  anim: { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number; done: () => void } | null;
  yaw: number;
  yawTarget: number;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  max: number;
  spin: number;
  grow: number;
  gravity: number;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");

/** Small deterministic generator so every map always looks the same. */
function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export class WorldScene {
  readonly board: Board;
  readonly layout: Layout;
  readonly theme: WorldTheme;
  private readonly themeName: Theme;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.5, 1200);
  private sun!: THREE.DirectionalLight;
  private mats = new Map<string, THREE.Material>();
  private disposables: { dispose(): void }[] = [];
  private cleanup: (() => void)[] = [];

  private tileGroups: THREE.Group[] = [];
  private tileMeshes: THREE.Mesh[] = [];
  private tileTop: number[] = [];
  private tileScale = 1;
  private pulses: { node: number; t0: number }[] = [];

  private cars: Car[] = [];
  private active = -1;
  private beacon!: THREE.Mesh;
  private particles: Particle[] = [];
  private clouds: THREE.Group[] = [];
  private flags: THREE.Group[] = [];
  private snow: THREE.Points | null = null;
  private roadPts: THREE.Vector3[] = [];
  private spots: THREE.Vector3[] = [];
  private groundR = 100;

  private markers: THREE.Sprite[] = [];
  private markerState: { node: number; dim: boolean }[] = [];
  private numberTex: THREE.CanvasTexture[] = [];
  private iconTex = new Map<TileType, THREE.CanvasTexture>();
  private hoverRing!: THREE.Mesh;
  private hoverNode = -1;

  private cam = { az: -0.75, el: 0.86, dist: 54, curAz: -0.75, curEl: 1.0, curDist: 180, target: v3(0, 0, 0) };
  private focus: Focus = "overview";
  private aspectFit = 1;
  private raf = 0;
  private dead = false;
  private readonly reduceMotion: boolean;
  private readonly hopMs: number;
  private onHover: ((h: HoverInfo | null) => void) | undefined;

  constructor(
    private canvas: HTMLCanvasElement,
    mapId: string,
    playerColors: string[],
    opts: { fast?: boolean; onHover?: (h: HoverInfo | null) => void } = {},
  ) {
    const def = getMap(mapId);
    this.themeName = def.theme;
    this.theme = THEMES[def.theme];
    this.board = getBoard(def.id);
    this.layout = computeLayout(this.board, LAYOUTS[def.id]!);
    this.onHover = opts.onHover;
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.hopMs = opts.fast ? 30 : this.reduceMotion ? 120 : 300;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.fog = new THREE.Fog(this.theme.fog, 60, 400);

    this.groundR = this.layout.radius + 22;
    this.cam.target.copy(this.layout.center);
    this.computeTileScale();

    this.buildLights();
    this.buildGround();
    this.buildRoads();
    this.buildTiles();
    this.buildLandmarks();
    this.buildDecor();
    this.buildCars(playerColors);
    this.buildMarkers();
    this.bindControls();
    this.observeSize();

    let last = performance.now();
    const loop = (now: number) => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.tick(now, dt);
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------- public API

  setFocus(f: Focus) {
    this.focus = f;
  }

  setActive(player: number) {
    this.active = player;
  }

  placeCar(player: number, node: number) {
    const car = this.cars[player]!;
    car.anim = null;
    car.group.position.copy(this.slot(player, node));
    car.yaw = car.yawTarget = Math.atan2(this.layout.tan[node]!.x, this.layout.tan[node]!.z);
    car.group.rotation.y = car.yaw;
  }

  hop(player: number, node: number): Promise<void> {
    const car = this.cars[player]!;
    const to = this.slot(player, node);
    const from = car.group.position.clone();
    car.yawTarget = Math.atan2(to.x - from.x, to.z - from.z);
    return new Promise((resolve) => {
      car.anim = { from, to, t0: performance.now(), dur: this.hopMs, done: resolve };
    });
  }

  setPegs(player: number, colors: string[]) {
    const car = this.cars[player]!;
    car.pegs.forEach((p) => car.group.remove(p));
    car.pegs = [];
    const slots: [number, number][] = [[-0.24, 0.12], [0.24, 0.12], [-0.24, -0.32], [0.24, -0.32], [-0.24, -0.74], [0.24, -0.74]];
    const body = this.geo(new THREE.CylinderGeometry(0.11, 0.12, 0.34, 10));
    const head = this.geo(new THREE.SphereGeometry(0.15, 12, 10));
    colors.slice(0, slots.length).forEach((css, i) => {
      const g = new THREE.Group();
      g.position.set(slots[i]![0], 0.72, slots[i]![1]);
      const c = parseInt(css.slice(1), 16);
      this.mesh(body, c, 0, 0.17, 0, g);
      this.mesh(head, c, 0, 0.42, 0, g);
      car.group.add(g);
      car.pegs.push(g);
    });
  }

  burst(player: number, kind: BurstKind) {
    if (this.reduceMotion) return;
    const p0 = this.cars[player]!.group.position;
    const spec = {
      coins: { n: 12, color: 0xf2c14e, emissive: 0x6b4a00, shape: "coin", up: 6, spread: 5, life: 1.3, gravity: 16, grow: 0 },
      confetti: { n: 26, color: 0xffffff, emissive: 0x000000, shape: "chip", up: 7, spread: 6, life: 1.7, gravity: 9, grow: 0 },
      hearts: { n: 9, color: 0xff7aa8, emissive: 0x7a1c3c, shape: "ball", up: 4, spread: 2.6, life: 1.6, gravity: -2, grow: 0 },
      smoke: { n: 8, color: 0x7c8494, emissive: 0x000000, shape: "puff", up: 2.5, spread: 1.6, life: 1.2, gravity: -3, grow: 1.4 },
      sparkle: { n: 14, color: 0xfff2a0, emissive: 0x806a00, shape: "chip", up: 5, spread: 4, life: 1.0, gravity: 4, grow: 0 },
    }[kind];
    const confettiColors = [0xff6b6b, 0xffd93d, 0x6bcB77, 0x4d96ff, 0xc77dff, 0xff9ecd];
    for (let k = 0; k < spec.n; k++) {
      const color = kind === "confetti" ? confettiColors[k % confettiColors.length]! : spec.color;
      const mat = this.glowMat(color, spec.emissive);
      const geo = spec.shape === "coin" ? this.sharedGeo("coin") : spec.shape === "chip" ? this.sharedGeo("chip") : this.sharedGeo("ball");
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p0.x, p0.y + 1.2, p0.z);
      if (spec.shape === "coin") m.rotation.x = Math.PI / 2;
      m.castShadow = kind === "coins";
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vel: v3((Math.random() - 0.5) * spec.spread, spec.up + Math.random() * 3, (Math.random() - 0.5) * spec.spread),
        life: spec.life,
        max: spec.life,
        spin: 6 + Math.random() * 8,
        grow: spec.grow,
        gravity: spec.gravity,
      });
    }
  }

  /** Make a tile bounce, to say "this one just happened". */
  pulse(node: number) {
    this.pulses.push({ node, t0: performance.now() });
  }

  /** Floating step numbers over the tiles a spin could reach. */
  setAhead(list: AheadMarker[]) {
    this.markers.forEach((m, i) => {
      const a = list[i];
      if (!a) {
        m.visible = false;
        this.markerState[i] = { node: -1, dim: false };
        return;
      }
      m.visible = true;
      (m.material as THREE.SpriteMaterial).map = this.numberTex[Math.min(a.steps, 10) - 1]!;
      (m.material as THREE.SpriteMaterial).opacity = a.dim ? 0.32 : 1;
      (m.material as THREE.SpriteMaterial).needsUpdate = true;
      this.markerState[i] = { node: a.node, dim: a.dim };
      const p = this.layout.pos[a.node]!;
      m.position.set(p.x, this.tileTop[a.node]! + 2.3, p.z);
    });
  }

  dispose() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((fn) => fn());
    this.disposables.forEach((d) => d.dispose());
    this.mats.forEach((m) => m.dispose());
    this.iconTex.forEach((t) => t.dispose());
    this.numberTex.forEach((t) => t.dispose());
    this.renderer.dispose();
  }

  // ----------------------------------------------------------- tiny helpers

  private geoCache = new Map<string, THREE.BufferGeometry>();
  private sharedGeo(kind: "coin" | "chip" | "ball"): THREE.BufferGeometry {
    let g = this.geoCache.get(kind);
    if (!g) {
      g =
        kind === "coin"
          ? new THREE.CylinderGeometry(0.24, 0.24, 0.07, 14)
          : kind === "chip"
            ? new THREE.BoxGeometry(0.22, 0.04, 0.14)
            : new THREE.SphereGeometry(0.2, 10, 8);
      this.geoCache.set(kind, g);
      this.disposables.push(g);
    }
    return g;
  }

  private glowMat(color: number, emissive: number): THREE.MeshLambertMaterial {
    const key = `g${color}-${emissive}`;
    let m = this.mats.get(key) as THREE.MeshLambertMaterial | undefined;
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, emissive });
      this.mats.set(key, m);
    }
    return m;
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.disposables.push(g);
    return g;
  }

  private mat(color: number, emissive = 0): THREE.MeshLambertMaterial {
    const key = `m${color}-${emissive}`;
    let m = this.mats.get(key) as THREE.MeshLambertMaterial | undefined;
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, emissive: emissive ? color : 0x000000, emissiveIntensity: emissive });
      this.mats.set(key, m);
    }
    return m;
  }

  private mesh(
    geo: THREE.BufferGeometry,
    material: number | THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = this.scene,
    shadows = true,
  ): THREE.Mesh {
    const m = new THREE.Mesh(geo, typeof material === "number" ? this.mat(material) : material);
    m.position.set(x, y, z);
    m.castShadow = shadows;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  private canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    draw(cv.getContext("2d")!);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.disposables.push(tex);
    return tex;
  }

  /** The disc-and-glyph painted on top of every tile. */
  private iconTexture(type: TileType): THREE.CanvasTexture {
    let tex = this.iconTex.get(type);
    if (!tex) {
      const info = TILE_INFO[type];
      tex = this.canvasTexture(160, 160, (x) => {
        x.fillStyle = "rgba(255,255,255,0.96)";
        x.beginPath();
        x.arc(80, 80, 72, 0, Math.PI * 2);
        x.fill();
        x.lineWidth = 8;
        x.strokeStyle = info.color === "#FFFFFF" ? "#d7dee3" : info.color;
        x.stroke();
        x.font = "82px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";
        x.textAlign = "center";
        x.textBaseline = "middle";
        x.fillText(info.icon, 80, 88);
      });
      this.iconTex.set(type, tex);
    }
    return tex;
  }

  private label(text: string, color: number, icon: string | null, pos: THREE.Vector3, scale = 6): THREE.Sprite {
    const tex = this.canvasTexture(512, 128, (x) => {
      x.font = "600 50px ui-rounded, 'Arial Rounded MT Bold', system-ui, sans-serif";
      const iconW = icon ? 64 : 0;
      const w = Math.min(500, x.measureText(text).width + 70 + iconW);
      const l = (512 - w) / 2;
      x.fillStyle = "rgba(255,255,255,0.96)";
      x.beginPath();
      x.moveTo(l + 48, 16);
      x.arcTo(l + w, 16, l + w, 112, 48);
      x.arcTo(l + w, 112, l, 112, 48);
      x.arcTo(l, 112, l, 16, 48);
      x.arcTo(l, 16, l + w, 16, 48);
      x.closePath();
      x.fill();
      x.lineWidth = 6;
      x.strokeStyle = hex(color);
      x.stroke();
      x.fillStyle = "#23303B";
      x.textAlign = "left";
      x.textBaseline = "middle";
      if (icon) {
        x.font = "52px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";
        x.fillText(icon, l + 26, 68);
        x.font = "600 50px ui-rounded, 'Arial Rounded MT Bold', system-ui, sans-serif";
      }
      x.fillText(text, l + 34 + iconW, 68);
    });
    const material = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    this.disposables.push(material);
    const sp = new THREE.Sprite(material);
    sp.scale.set(scale, scale / 4, 1);
    sp.position.copy(pos);
    this.scene.add(sp);
    return sp;
  }

  // ------------------------------------------------------------------ build

  private computeTileScale() {
    let min = Infinity;
    for (const n of this.board.nodes) {
      for (const t of n.next) {
        const d = this.layout.pos[n.id]!.distanceTo(this.layout.pos[t]!);
        // Ignore the loose gaps where roads merge.
        if (d < 4.2) min = Math.min(min, d);
      }
    }
    this.tileScale = Math.max(0.78, Math.min(1, min / 3.0));
  }

  private buildLights() {
    const t = this.theme;
    this.scene.add(new THREE.HemisphereLight(t.hemi.sky, t.hemi.ground, t.hemi.intensity));
    const sun = new THREE.DirectionalLight(t.sun.color, t.sun.intensity);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -58;
    sc.right = 58;
    sc.top = 58;
    sc.bottom = -58;
    sc.near = 1;
    sc.far = 200;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun, sun.target);
    this.sun = sun;
  }

  private buildGround() {
    const c = this.layout.center;
    const R = this.groundR;
    const outer = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(2400, 2400)), this.mat(this.theme.outer));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -1.4;
    outer.receiveShadow = true;
    this.scene.add(outer);

    if (this.themeName === "island") {
      const foam = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(R + 4.5, R + 5, 0.3, 90)), this.mat(0xf4fbfb));
      foam.position.set(c.x, -1.3, c.z);
      this.scene.add(foam);
    }
    if (this.themeName === "city") {
      const glow = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(R + 1.5, R + 1.8, 0.2, 90)), this.mat(0x35e0ff, 1));
      glow.position.set(c.x, -1.2, c.z);
      this.scene.add(glow);
    }
    const ground = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(R, R + 3.5, 3.2, 90)), [
      this.mat(this.theme.groundSide),
      this.mat(this.theme.groundTop),
      this.mat(this.theme.groundSide),
    ]);
    ground.position.set(c.x, -1.6, c.z);
    ground.receiveShadow = true;
    this.scene.add(ground);

    if (this.themeName === "city") {
      // Faint street grid over the plaza.
      const grid = this.canvasTexture(256, 256, (x) => {
        x.fillStyle = "#2a3148";
        x.fillRect(0, 0, 256, 256);
        x.strokeStyle = "rgba(120,140,220,0.22)";
        x.lineWidth = 2;
        for (let i = 0; i <= 256; i += 64) {
          x.beginPath();
          x.moveTo(i, 0);
          x.lineTo(i, 256);
          x.moveTo(0, i);
          x.lineTo(256, i);
          x.stroke();
        }
      });
      grid.wrapS = grid.wrapT = THREE.RepeatWrapping;
      grid.repeat.set(R / 6, R / 6);
      const plane = new THREE.Mesh(this.geo(new THREE.CircleGeometry(R - 0.5, 90)), new THREE.MeshLambertMaterial({ map: grid }));
      this.disposables.push(plane.material as THREE.Material);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(c.x, 0.012, c.z);
      plane.receiveShadow = true;
      this.scene.add(plane);
    }
  }

  private buildRoads() {
    const w = this.themeName === "city" ? 1.25 : 1.05;
    const ribbon = (curve: THREE.Curve<THREE.Vector3>, segs: number) => {
      const tube = new THREE.Mesh(this.geo(new THREE.TubeGeometry(curve, segs, w, 8, false)), this.mat(this.theme.road));
      tube.scale.y = 0.12;
      tube.position.y = 0.03;
      tube.receiveShadow = true;
      this.scene.add(tube);
    };
    for (const road of this.layout.roads) {
      const len = road.curve.getLength();
      ribbon(road.curve, Math.max(24, Math.round(len * 1.6)));
      for (const p of road.curve.getSpacedPoints(Math.max(8, Math.round(len / 2)))) this.roadPts.push(p);
      const first = this.layout.pos[this.board.segments[road.segment]!.first]!;
      for (const f of road.feeders) {
        if (f.distanceTo(first) > 0.5) ribbon(new THREE.LineCurve3(f, first), 6);
      }
    }
    for (const p of this.layout.pos) this.roadPts.push(p);
  }

  private tileColor(type: TileType): number {
    return parseInt(TILE_INFO[type].color.slice(1), 16);
  }

  private buildTiles() {
    const s = this.tileScale;
    const glow = this.theme.glow;
    const tileGeo = this.geo(new THREE.CylinderGeometry(1.25 * s, 1.32 * s, 0.42, 28));
    const rimGeo = this.geo(new THREE.CylinderGeometry(1.48 * s, 1.55 * s, 0.26, 28));
    const stopS = Math.max(s, 0.92);
    const stopGeo = this.geo(new THREE.CylinderGeometry(1.65 * stopS, 1.72 * stopS, 0.68, 32));
    const stopRim = this.geo(new THREE.CylinderGeometry(1.9 * stopS, 2.0 * stopS, 0.4, 32));
    const poleGeo = this.geo(new THREE.CylinderGeometry(0.07, 0.07, 3));
    const flagGeo = this.geo(new THREE.BoxGeometry(1.1, 0.65, 0.05));
    const decalGeo = this.geo(new THREE.PlaneGeometry(1, 1));
    const labelSpots: THREE.Vector3[] = [];

    for (const n of this.board.nodes) {
      const p = this.layout.pos[n.id]!;
      const color = this.tileColor(n.type);
      const group = new THREE.Group();
      group.position.set(p.x, 0, p.z);
      this.scene.add(group);
      this.tileGroups[n.id] = group;
      this.tileTop[n.id] = n.stop ? 0.72 : 0.46;

      let top: THREE.Mesh;
      if (n.type === "start") {
        this.mesh(rimGeo, this.theme.rim, 0, 0.13, 0, group);
        top = this.mesh(tileGeo, 0xffffff, 0, 0.25, 0, group);
        this.tileTop[n.id] = 0.46;
      } else if (n.stop) {
        this.mesh(stopRim, this.theme.rim, 0, 0.2, 0, group);
        top = this.mesh(stopGeo, this.mat(color, glow), 0, 0.38, 0, group);
        const t = this.layout.tan[n.id]!;
        const px = p.x + t.z * 2.6;
        const pz = p.z - t.x * 2.6;
        this.mesh(poleGeo, 0xffffff, px, 1.5, pz);
        const fg = new THREE.Group();
        fg.position.set(px, 2.6, pz);
        this.scene.add(fg);
        this.mesh(flagGeo, this.mat(color, glow), 0.55, 0, 0, fg);
        this.flags.push(fg);
        const info = TILE_INFO[n.type];
        // Stops that sit side by side stack their name tags instead of overlapping.
        const crowd = labelSpots.filter((q) => q.distanceTo(p) < 8).length;
        labelSpots.push(p);
        this.label(n.label ?? info.name, color, info.icon, v3(p.x, 4.6 + crowd * 1.5, p.z), 5.2);
      } else {
        this.mesh(rimGeo, this.theme.rim, 0, 0.13, 0, group);
        top = this.mesh(tileGeo, this.mat(color, glow), 0, 0.25, 0, group);
      }
      top.userData.node = n.id;
      this.tileMeshes.push(top);

      const size = n.stop ? 2.7 * stopS : 1.95 * s;
      const decalMat = new THREE.MeshBasicMaterial({ map: this.iconTexture(n.type), transparent: true, depthWrite: false });
      this.disposables.push(decalMat);
      const decal = new THREE.Mesh(decalGeo, decalMat);
      decal.rotation.x = -Math.PI / 2;
      decal.position.set(0, this.tileTop[n.id]! + 0.02, 0);
      decal.scale.set(size, size, 1);
      group.add(decal);
    }

    // Road names at the start of each opening road and each branch.
    const forkFirsts = new Set<number>();
    for (const n of this.board.nodes) if (n.next.length > 1) n.next.forEach((id) => forkFirsts.add(id));
    const def = getMap(this.board.map);
    for (const info of Object.values(this.board.segments)) {
      if (!forkFirsts.has(info.first)) continue;
      const mid = Math.min(info.length - 1, 3);
      const p = this.layout.pos[info.first + mid]!;
      const branch = def.branches[info.id];
      const path = def.paths.find((x) => x.segment === info.id);
      const name = branch?.name ?? path?.name ?? info.name;
      const color = branch ? (branch.vibe === "risky" ? 0xff7a00 : 0x2fbf71) : 0x8b5a2b;
      this.label(name, color, branch ? (branch.vibe === "risky" ? "⚡" : "🛣️") : (path?.icon ?? null), v3(p.x, 3.3, p.z), 5.4);
    }

    // Start arch.
    const sp = this.layout.pos[this.board.start]!;
    const st = this.layout.tan[this.board.start]!;
    const side = v3(st.z, 0, -st.x);
    const postGeo = this.geo(new THREE.CylinderGeometry(0.22, 0.22, 3.6));
    for (const d of [-2.4, 2.4]) this.mesh(postGeo, 0xffffff, sp.x + side.x * d, 1.8, sp.z + side.z * d);
    const bar = this.mesh(this.geo(new THREE.BoxGeometry(5.4, 0.7, 0.3)), 0xe86f51, sp.x, 3.5, sp.z);
    bar.rotation.y = Math.atan2(side.x, side.z) + Math.PI / 2;
    this.label("Start", 0xe86f51, "🚩", v3(sp.x, 4.9, sp.z));

    // Hover ring.
    this.hoverRing = new THREE.Mesh(
      this.geo(new THREE.RingGeometry(1.7, 2.05, 40)),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.disposables.push(this.hoverRing.material as THREE.Material);
    this.hoverRing.rotation.x = -Math.PI / 2;
    this.hoverRing.visible = false;
    this.scene.add(this.hoverRing);
  }

  // -------------------------------------------------------------- landmarks

  /** A free spot beside the road at `id`, on whichever side has more room. */
  private sideSpot(id: number, dist: number): { p: THREE.Vector3; face: number; score: number } {
    const t = this.layout.tan[id]!;
    const base = this.layout.pos[id]!;
    const side = v3(t.z, 0, -t.x);
    const score = (p: THREE.Vector3) => {
      let min = Infinity;
      for (const q of this.roadPts) {
        const d = q.distanceTo(p);
        if (d < min && q.distanceTo(base) > dist * 0.7) min = d;
      }
      if (p.distanceTo(this.layout.center) > this.groundR - 8) min -= 100;
      for (const s of this.spots) if (s.distanceTo(p) < 8) min -= 50;
      return min;
    };
    const a = base.clone().addScaledVector(side, dist);
    const b = base.clone().addScaledVector(side, -dist);
    const sa = score(a);
    const sb = score(b);
    const p = sa >= sb ? a : b;
    return { p, face: Math.atan2(base.x - p.x, base.z - p.z), score: Math.max(sa, sb) };
  }

  private place(id: number, dist: number, build: (g: THREE.Group) => void) {
    const { p, face, score } = this.sideSpot(id, dist);
    // Crowded (e.g. several job boards at one merge)? The label is enough.
    if (score < 3.5) return;
    const g = new THREE.Group();
    g.position.copy(p);
    g.rotation.y = face;
    this.scene.add(g);
    build(g);
    this.spots.push(p);
  }

  private box(w: number, h: number, d: number) {
    return this.geo(new THREE.BoxGeometry(w, h, d));
  }
  private cone(r: number, h: number, s: number) {
    return this.geo(new THREE.ConeGeometry(r, h, s));
  }
  private cyl(a: number, b: number, h: number, s = 12) {
    return this.geo(new THREE.CylinderGeometry(a, b, h, s));
  }
  private ball(r: number) {
    return this.geo(new THREE.SphereGeometry(r, 14, 10));
  }

  private windowTex(seed: number, rows: number, cols: number): THREE.CanvasTexture {
    const rnd = seeded(seed);
    return this.canvasTexture(64 * cols, 64 * rows, (x) => {
      x.fillStyle = "#1a1f33";
      x.fillRect(0, 0, 64 * cols, 64 * rows);
      for (let r = 0; r < rows * 2; r++) {
        for (let c = 0; c < cols * 2; c++) {
          const lit = rnd() < 0.55;
          x.fillStyle = lit ? (rnd() < 0.2 ? "#6ee7ff" : "#ffd98a") : "#262c45";
          x.fillRect(c * 32 + 6, r * 32 + 6, 20, 20);
        }
      }
    });
  }

  private tower(g: THREE.Group, x: number, z: number, w: number, h: number, d: number, seed: number, tint = 0xc4cbe6) {
    const tex = this.windowTex(seed, Math.max(1, Math.round(h / 3)), Math.max(1, Math.round(w / 2.6)));
    const side = new THREE.MeshLambertMaterial({ color: tint, map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.85 });
    this.disposables.push(side);
    const roof = this.mat(0x2a3050);
    const m = new THREE.Mesh(this.box(w, h, d), [side, side, roof, roof, side, side]);
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  }

  private cottage(g: THREE.Group, x: number, z: number, wall: number, roof: number, s = 1) {
    this.mesh(this.box(2 * s, 1.6 * s, 2 * s), wall, x, 0.8 * s, z, g);
    this.mesh(this.cone(1.75 * s, 1.3 * s, 4), roof, x, 2.25 * s, z, g).rotation.y = Math.PI / 4;
    this.mesh(this.box(0.5 * s, 0.9 * s, 0.1), 0x8c5e45, x, 0.45 * s, z + 1.01 * s, g);
  }

  private buildLandmarks() {
    const th = this.themeName;
    const find = (t: TileType) => this.board.nodes.filter((n) => n.type === t);

    // Job boards (graduations, apprenticeships, offers).
    for (const n of find("graduate")) {
      this.place(n.id, 6.6, (g) => {
        if (th === "island") {
          this.mesh(this.box(5, 2.6, 3), 0xd9826b, 0, 1.3, 0, g);
          this.mesh(this.cyl(0.01, 2.2, 1.4, 4), 0x6b4f8c, 0, 3.3, 0, g).scale.x = 1.7;
          this.mesh(this.box(1, 1.6, 1), 0xf4e6c8, 0, 4.2, 0, g);
          this.mesh(this.cone(0.8, 1, 4), 0x6b4f8c, 0, 5.5, 0, g).rotation.y = Math.PI / 4;
        } else if (th === "alpine") {
          this.mesh(this.box(5.4, 2.4, 3.2), 0xa5754d, 0, 1.2, 0, g);
          this.mesh(this.cyl(0.01, 2.5, 1.7, 4), 0x2f6b4f, 0, 3.2, 0, g).scale.x = 1.6;
          this.mesh(this.box(0.7, 2, 0.7), 0x8a5a38, 1.8, 3.4, 0.6, g);
        } else if (th === "city") {
          this.tower(g, 0, 0, 4.6, 7.5, 3.6, 11, 0x9fc3e8);
          this.mesh(this.box(5.2, 0.3, 4.2), 0x6ee7ff, 0, 7.7, 0, g, false).material = this.mat(0x6ee7ff, 1);
        } else {
          this.mesh(this.box(4.6, 2.4, 3.4), 0xe4c58c, 0, 1.2, 0, g);
          this.mesh(this.ball(1.7), 0x3fa6a0, 0, 2.6, 0, g);
          this.mesh(this.cyl(0.35, 0.35, 5, 10), 0xf2dca8, 3, 2.5, 0, g);
          this.mesh(this.cone(0.5, 0.9, 10), 0x3fa6a0, 3, 5.4, 0, g);
        }
      });
    }

    for (const n of find("wedding")) {
      this.place(n.id, 6.6, (g) => {
        this.mesh(this.box(3, 2.6, 4), 0xfbf7f0, 0, 1.3, 0, g);
        const roof = th === "alpine" ? 0x9a6a46 : th === "desert" ? 0x3fa6a0 : 0xe2665c;
        const r = this.mesh(this.cyl(0.01, 2.4, 1.6, 4), roof, 0, 3.4, 0, g);
        r.rotation.y = Math.PI / 4;
        r.scale.z = 1.3;
        this.mesh(this.box(1.1, 2.4, 1.1), 0xfbf7f0, 0, 3.4, 1.4, g);
        this.mesh(this.cone(0.9, 1.6, 4), roof, 0, 5.4, 1.4, g).rotation.y = Math.PI / 4;
        if (th === "city") this.mesh(this.cyl(1.6, 1.6, 0.1, 24), 0xff7ac8, 0, 0.06, 3.4, g, false).material = this.mat(0xff7ac8, 1);
      });
    }

    for (const n of find("house")) {
      this.place(n.id, 7.4, (g) => {
        if (th === "island") {
          this.cottage(g, -3.2, 0, 0xfce3c8, 0x6fa8db, 0.9);
          this.cottage(g, 0, -0.5, 0xffffff, 0xe2665c, 1.1);
          this.cottage(g, 3.2, 0, 0xe3f0da, 0x8e7cc3, 0.9);
        } else if (th === "alpine") {
          for (const [x, z, s] of [[-3.2, 0, 0.9], [0, -0.6, 1.15], [3.3, 0, 0.9]] as const) {
            this.mesh(this.box(1.8 * s, 0.8 * s, 1.8 * s), 0x8a5a38, x, 0.4 * s, z, g);
            this.mesh(this.cone(1.7 * s, 2.2 * s, 4), 0xf4f8fb, x, 1.9 * s, z, g).rotation.y = Math.PI / 4;
          }
        } else if (th === "city") {
          this.tower(g, -3.2, 0, 2.2, 5, 2.2, 21, 0xe3a6d8);
          this.tower(g, 0, -0.6, 2.4, 7, 2.4, 22, 0x9fc3e8);
          this.tower(g, 3.3, 0, 2.2, 4.4, 2.2, 23, 0xb5e8c7);
        } else {
          for (const [x, z, s, c] of [[-3.2, 0, 0.9, 0xe9c88f], [0, -0.5, 1.1, 0xf3dcae], [3.2, 0, 0.9, 0xdcb677]] as const) {
            this.mesh(this.box(2 * s, 1.6 * s, 2 * s), c, x, 0.8 * s, z, g);
            this.mesh(this.ball(0.8 * s), 0xc9744a, x, 1.7 * s, z, g).scale.y = 0.7;
            this.mesh(this.box(0.5 * s, 0.8 * s, 0.1), 0x7a4a33, x, 0.4 * s, z + 1.01 * s, g);
          }
        }
      });
    }

    // Family stops: a little nursery in pastel.
    for (const n of find("baby")) {
      this.place(n.id, 5.2, (g) => {
        const roof = [0xff9ecd, 0x9ad7ff, 0xffe08a, 0xb6e8a6][n.index % 4]!;
        if (th === "city") {
          this.tower(g, 0, 0, 2.2, 3, 2.2, 30 + n.index, 0xffd0ec);
        } else if (th === "desert") {
          this.mesh(this.cone(1.8, 2.4, 10), 0xf6e6c2, 0, 1.2, 0, g);
          this.mesh(this.cyl(0.04, 0.04, 1, 6), 0xffffff, 0, 2.9, 0, g);
        } else {
          this.cottage(g, 0, 0, 0xfff6e8, roof, 0.9);
        }
        const b = this.mesh(this.ball(0.45), roof, 1.8, 3.2, 0.4, g, false);
        b.scale.y = 1.2;
        this.mesh(this.cyl(0.02, 0.02, 1.6, 4), 0xffffff, 1.8, 2.2, 0.4, g, false);
      });
    }

    for (const n of find("retire")) {
      this.place(n.id, 7, (g) => {
        if (th === "island") {
          this.mesh(this.box(5, 2, 3.2), 0xfff6e6, 0, 1, 0, g);
          this.mesh(this.box(5.6, 0.3, 3.8), 0xe8b04b, 0, 2.15, 0, g);
          this.mesh(this.box(2.4, 1.4, 2.4), 0xfff6e6, -1, 3, -0.2, g);
          this.mesh(this.cyl(0.06, 0.06, 2.4, 6), 0xffffff, 3.6, 1.2, 1.6, g);
          this.mesh(this.cone(1.3, 0.6, 10), 0xe2665c, 3.6, 2.5, 1.6, g);
        } else if (th === "alpine") {
          this.mesh(this.box(6, 2.4, 3.6), 0xa5754d, 0, 1.2, 0, g);
          this.mesh(this.cyl(0.01, 3.4, 2.2, 4), 0xf4f8fb, 0, 3.5, 0, g).scale.x = 1.7;
          this.mesh(this.box(0.8, 2.6, 0.8), 0x8a5a38, 2.2, 3.6, 0.8, g);
          this.mesh(this.cone(1.4, 0.8, 8), 0xe2665c, 3.6, 2.6, 1.8, g);
        } else if (th === "city") {
          this.tower(g, 0, 0, 3.8, 11, 3.8, 41, 0xc9b6f0);
          this.mesh(this.box(4.2, 0.4, 4.2), 0xffd23f, 0, 11.2, 0, g, false).material = this.mat(0xffd23f, 1);
          this.mesh(this.cyl(0.08, 0.08, 2.6, 6), 0xffffff, 0, 12.8, 0, g);
        } else {
          this.mesh(this.box(6, 2.4, 3.6), 0xf6e6c2, 0, 1.2, 0, g);
          for (const x of [-2.2, 0, 2.2]) {
            this.mesh(this.ball(1.1), 0xe0a93e, x, 2.9, 0, g).scale.y = 0.85;
            this.mesh(this.cone(0.18, 0.7, 8), 0xe0a93e, x, 4.2, 0, g);
          }
          for (const x of [-3.4, 3.4]) this.mesh(this.cyl(0.35, 0.35, 5, 10), 0xfff1cf, x, 2.5, 1.2, g);
        }
      });
    }

    // Crossroads signposts.
    for (const n of find("fork")) {
      const p = this.layout.pos[n.id]!;
      const t = this.layout.tan[n.id]!;
      const px = p.x - t.z * 3.0;
      const pz = p.z + t.x * 3.0;
      this.mesh(this.cyl(0.12, 0.12, 5, 8), 0x6b4a33, px, 2.5, pz);
      const boardGeo = this.box(2.4, 0.7, 0.12);
      const a = this.mesh(boardGeo, 0xfff3d1, px, 4.4, pz);
      a.rotation.y = Math.atan2(t.x, t.z) + 0.5;
      const b = this.mesh(boardGeo, 0xd7f0ff, px, 3.5, pz);
      b.rotation.y = Math.atan2(t.x, t.z) - 0.5;
      this.spots.push(v3(px, 0, pz));
    }
  }

  // ----------------------------------------------------------------- decor

  private freeAt(p: THREE.Vector3, clear: number): boolean {
    if (p.distanceTo(this.layout.center) > this.groundR - 3) return false;
    const c2 = clear * clear;
    for (const q of this.roadPts) {
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      if (dx * dx + dz * dz < c2) return false;
    }
    for (const s of this.spots) if (s.distanceTo(p) < 6) return false;
    return true;
  }

  private scatter(count: number, seed: number, clear: number, make: (p: THREE.Vector3, rnd: () => number, i: number) => void) {
    const rnd = seeded(seed);
    let placed = 0;
    let guard = 0;
    while (placed < count && guard++ < count * 40) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * (this.groundR - 3);
      const p = v3(this.layout.center.x + Math.cos(a) * r, 0, this.layout.center.z + Math.sin(a) * r);
      if (!this.freeAt(p, clear)) continue;
      make(p, rnd, placed);
      placed++;
    }
  }

  private buildDecor() {
    switch (this.themeName) {
      case "island":
        this.decorIsland();
        break;
      case "alpine":
        this.decorAlpine();
        break;
      case "city":
        this.decorCity();
        break;
      case "desert":
        this.decorDesert();
        break;
    }
    if (this.themeName !== "city") this.buildClouds();
  }

  private decorIsland() {
    const trunk = this.geo(new THREE.CylinderGeometry(0.16, 0.24, 1, 6));
    const cone = this.geo(new THREE.ConeGeometry(1, 2.3, 7));
    const ball = this.geo(new THREE.SphereGeometry(1, 10, 8));
    const greens = [0x7bbf6a, 0x5fa35a, 0x8fcb78, 0x6db36b];
    this.scatter(150, 7, 3.6, (p, rnd, i) => {
      const tg = new THREE.Group();
      tg.position.copy(p);
      tg.scale.setScalar(0.75 + rnd() * 0.7);
      this.scene.add(tg);
      this.mesh(trunk, 0x9c6b4e, 0, 0.5, 0, tg);
      if (rnd() < 0.6) this.mesh(cone, greens[i % 4]!, 0, 2, 0, tg);
      else this.mesh(ball, greens[i % 4]!, 0, 1.8, 0, tg);
    });
    // Beach rocks.
    this.scatter(30, 19, 3.2, (p, rnd) => {
      const m = this.mesh(this.ball(0.8), 0xb9b4a8, p.x, 0.25, p.z);
      m.scale.set(1 + rnd(), 0.6, 1 + rnd() * 0.6);
    });
  }

  private decorAlpine() {
    const rnd = seeded(5);
    // A ring of mountains beyond the plateau.
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rnd() * 0.2;
      const r = this.groundR + 6 + rnd() * 26;
      const h = 22 + rnd() * 26;
      const w = 12 + rnd() * 12;
      const x = this.layout.center.x + Math.cos(a) * r;
      const z = this.layout.center.z + Math.sin(a) * r;
      this.mesh(this.cone(w, h, 7), 0x8fa4ba, x, h / 2 - 1, z);
      this.mesh(this.cone(w * 0.42, h * 0.42, 7), 0xffffff, x, h * 0.8 - 1, z);
    }
    const trunk = this.geo(new THREE.CylinderGeometry(0.14, 0.2, 0.9, 6));
    const tier = this.geo(new THREE.ConeGeometry(1, 1.5, 8));
    this.scatter(160, 9, 3.6, (p, r0) => {
      const tg = new THREE.Group();
      tg.position.copy(p);
      tg.scale.setScalar(0.8 + r0() * 0.8);
      this.scene.add(tg);
      this.mesh(trunk, 0x6b4a33, 0, 0.45, 0, tg);
      this.mesh(tier, 0x2f6b4f, 0, 1.6, 0, tg).scale.setScalar(1.05);
      this.mesh(tier, 0x3a7e5c, 0, 2.5, 0, tg).scale.setScalar(0.8);
      this.mesh(tier, 0xf4f8fb, 0, 3.3, 0, tg).scale.setScalar(0.52);
    });
    // Frozen pond where there is room.
    this.scatter(3, 33, 12, (p, r0) => {
      const m = this.mesh(this.cyl(5 + r0() * 3, 5 + r0() * 3, 0.1, 30), 0xbfe3f5, p.x, 0.06, p.z, this.scene, false);
      m.scale.z = 0.7;
      this.spots.push(p);
    });
    // Snow.
    const n = 700;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rnd() - 0.5) * 140;
      pos[i * 3 + 1] = rnd() * 50;
      pos[i * 3 + 2] = (rnd() - 0.5) * 140;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.45, transparent: true, opacity: 0.9, depthWrite: false });
    this.disposables.push(g, m);
    this.snow = new THREE.Points(g, m);
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);
  }

  private decorCity() {
    const rnd = seeded(12);
    // Stars.
    const n = 420;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const e = 0.15 + rnd() * 1.2;
      const r = 520;
      pos[i * 3] = this.layout.center.x + Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r;
      pos[i * 3 + 2] = this.layout.center.z + Math.sin(a) * Math.cos(e) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 });
    this.disposables.push(g, m);
    this.scene.add(new THREE.Points(g, m));

    const neon = [0xff4fd8, 0x35e0ff, 0xffd23f, 0x7cff6b];
    this.scatter(120, 14, 6.4, (p, r0, i) => {
      // Low near the road so the view stays open; towers rise further out.
      let road = Infinity;
      for (const q of this.roadPts) road = Math.min(road, q.distanceTo(p));
      const h = 3 + Math.min(18, Math.max(0, road - 6) * 1.1) + r0() * 4;
      const w = 3 + r0() * 3;
      const d = 3 + r0() * 3;
      const g2 = new THREE.Group();
      g2.position.copy(p);
      this.scene.add(g2);
      this.tower(g2, 0, 0, w, h, d, 50 + (i % 9), [0x9aa7d6, 0xb6a6e6, 0x8fc1e3][i % 3]!);
      if (i % 3 === 0) {
        const strip = this.mesh(this.box(w + 0.2, 0.32, d + 0.2), this.mat(neon[i % 4]!, 1), 0, h - 0.7, 0, g2, false);
        strip.receiveShadow = false;
      }
      if (i % 5 === 0) this.mesh(this.cyl(0.05, 0.05, 2.4, 6), 0xffffff, 0, h + 1.3, 0, g2);
    });
    // Street lamps along the roads.
    const lampGeo = this.cyl(0.06, 0.08, 2.6, 6);
    const bulb = this.geo(new THREE.SphereGeometry(0.22, 8, 6));
    let lamp = 0;
    for (const n2 of this.board.nodes) {
      if (n2.index % 4 !== 1 || n2.stop || n2.segment === "start") continue;
      const t = this.layout.tan[n2.id]!;
      const p = this.layout.pos[n2.id]!;
      const side = n2.index % 8 === 1 ? 2.3 : -2.3;
      const x = p.x + t.z * side;
      const z = p.z - t.x * side;
      this.mesh(lampGeo, 0x3a4060, x, 1.3, z, this.scene, false);
      this.mesh(bulb, this.mat(0xfff0b0, 1), x, 2.7, z, this.scene, false);
      if (++lamp > 80) break;
    }
  }

  private decorDesert() {
    const rnd = seeded(21);
    // Dunes: big soft mounds out past the road.
    this.scatter(34, 8, 9, (p, r0, i) => {
      const s = 5 + r0() * 7;
      const m = this.mesh(this.ball(1), i % 2 ? 0xecd197 : 0xf3dcae, p.x, -0.2, p.z, this.scene, false);
      m.scale.set(s * 1.5, s * 0.34, s);
      m.rotation.y = r0() * Math.PI;
      m.receiveShadow = true;
    });
    // Pyramids at the horizon.
    for (let i = 0; i < 4; i++) {
      const a = 0.6 + i * 1.5 + rnd() * 0.4;
      const r = this.groundR + 14 + rnd() * 30;
      const s = 14 + rnd() * 10;
      const m = this.mesh(this.cyl(0.01, s, s * 0.9, 4), 0xe2bd78, this.layout.center.x + Math.cos(a) * r, s * 0.45 - 1, this.layout.center.z + Math.sin(a) * r);
      m.rotation.y = Math.PI / 4;
    }
    // Cacti and palms.
    this.scatter(80, 6, 3.6, (p, r0, i) => {
      const g = new THREE.Group();
      g.position.copy(p);
      g.scale.setScalar(0.8 + r0() * 0.7);
      this.scene.add(g);
      if (i % 3) {
        this.mesh(this.cyl(0.24, 0.3, 2.2, 8), 0x5f9a58, 0, 1.1, 0, g);
        this.mesh(this.cyl(0.16, 0.16, 0.9, 8), 0x5f9a58, 0.5, 1.4, 0, g).rotation.z = 0.5;
        this.mesh(this.cyl(0.15, 0.15, 0.7, 8), 0x5f9a58, -0.45, 1.1, 0, g).rotation.z = -0.5;
      } else {
        this.mesh(this.cyl(0.14, 0.22, 3, 6), 0x9c6b4e, 0, 1.5, 0, g).rotation.z = 0.12;
        for (let k = 0; k < 6; k++) {
          const leaf = this.mesh(this.box(1.9, 0.06, 0.45), 0x4f9a55, Math.cos((k / 6) * Math.PI * 2) * 0.8, 3.0, Math.sin((k / 6) * Math.PI * 2) * 0.8, g);
          leaf.rotation.y = -(k / 6) * Math.PI * 2;
          leaf.rotation.z = -0.35;
        }
      }
    });
    // Oasis pond.
    this.scatter(2, 44, 12, (p) => {
      this.mesh(this.cyl(4.5, 4.5, 0.1, 28), 0x6cc3d5, p.x, 0.07, p.z, this.scene, false);
      this.spots.push(p);
    });
  }

  private buildClouds() {
    const ball = this.geo(new THREE.SphereGeometry(1, 10, 8));
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x444444 });
    this.disposables.push(mat);
    const rnd = seeded(3);
    const R = this.groundR;
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      g.position.set(this.layout.center.x + (rnd() - 0.5) * R * 2.6, 24 + rnd() * 8, this.layout.center.z + (rnd() - 0.5) * R * 2.2);
      this.scene.add(g);
      const puffs = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < puffs; k++) {
        const m = this.mesh(ball, mat, k * 2.2 - puffs, rnd() * 0.8, rnd() * 1.6, g);
        m.scale.setScalar(1.4 + rnd() * 1.2);
        m.receiveShadow = false;
      }
      this.clouds.push(g);
    }
  }

  // ------------------------------------------------------------------ cars

  private buildCars(colors: string[]) {
    const wheel = this.geo(new THREE.CylinderGeometry(0.28, 0.28, 0.22, 16));
    const body = this.geo(new THREE.BoxGeometry(1.12, 0.5, 1.9));
    const glassGeo = this.geo(new THREE.BoxGeometry(1.0, 0.36, 0.08));
    const bumper = this.geo(new THREE.BoxGeometry(1.14, 0.16, 0.3));
    const glass = new THREE.MeshLambertMaterial({ color: 0xddf1fa, transparent: true, opacity: 0.75 });
    this.disposables.push(glass);
    colors.forEach((css) => {
      const group = new THREE.Group();
      this.scene.add(group);
      this.mesh(body, parseInt(css.slice(1), 16), 0, 0.47, 0, group);
      this.mesh(glassGeo, glass, 0, 0.85, 0.55, group);
      this.mesh(bumper, 0xffffff, 0, 0.45, 0.88, group);
      for (const [x, z] of [[-0.6, 0.6], [0.6, 0.6], [-0.6, -0.6], [0.6, -0.6]] as const) {
        this.mesh(wheel, 0x2e3640, x, 0.28, z, group).rotation.z = Math.PI / 2;
      }
      this.cars.push({ group, pegs: [], anim: null, yaw: 0, yawTarget: 0 });
    });
    this.beacon = new THREE.Mesh(
      this.geo(new THREE.ConeGeometry(0.4, 0.8, 4)),
      new THREE.MeshBasicMaterial({ color: 0xffe14d }),
    );
    this.disposables.push(this.beacon.material as THREE.Material);
    this.beacon.rotation.x = Math.PI;
    this.beacon.visible = false;
    this.scene.add(this.beacon);
  }

  private slot(player: number, node: number): THREE.Vector3 {
    const t = this.layout.tan[node]!;
    const p = this.layout.pos[node]!;
    const lane = (player % 2 === 0 ? -0.62 : 0.62) * (player > 1 ? 1.9 : 1) * Math.max(this.tileScale, 0.85);
    return v3(p.x + t.z * lane, this.tileTop[node]!, p.z - t.x * lane);
  }

  // --------------------------------------------------------------- markers

  private buildMarkers() {
    for (let n = 1; n <= 10; n++) {
      this.numberTex.push(
        this.canvasTexture(128, 128, (x) => {
          x.fillStyle = "rgba(35,48,59,0.94)";
          x.beginPath();
          x.arc(64, 64, 54, 0, Math.PI * 2);
          x.fill();
          x.lineWidth = 8;
          x.strokeStyle = "#ffffff";
          x.stroke();
          x.fillStyle = "#ffffff";
          x.font = "700 62px ui-rounded, system-ui, sans-serif";
          x.textAlign = "center";
          x.textBaseline = "middle";
          x.fillText(String(n), 64, 70);
        }),
      );
    }
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.numberTex[0]!, transparent: true, depthWrite: false, depthTest: false });
      this.disposables.push(mat);
      const sp = new THREE.Sprite(mat);
      sp.scale.set(1.5, 1.5, 1);
      sp.visible = false;
      sp.renderOrder = 10;
      this.scene.add(sp);
      this.markers.push(sp);
      this.markerState.push({ node: -1, dim: false });
    }
  }

  // --------------------------------------------------------------- controls

  private bindControls() {
    const c = this.canvas;
    let drag: { x: number; y: number; moved: number } | null = null;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const pick = (e: PointerEvent): number => {
      const r = c.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const hit = ray.intersectObjects(this.tileMeshes, false)[0];
      return hit ? (hit.object.userData.node as number) : -1;
    };
    const setHover = (node: number, e: PointerEvent) => {
      if (node === this.hoverNode) return;
      this.hoverNode = node;
      if (node < 0) {
        this.hoverRing.visible = false;
        this.onHover?.(null);
        return;
      }
      const p = this.layout.pos[node]!;
      const s = this.board.nodes[node]!.stop ? 1.15 : 0.95;
      this.hoverRing.position.set(p.x, this.tileTop[node]! + 0.06, p.z);
      this.hoverRing.scale.setScalar(s * this.tileScale);
      this.hoverRing.visible = true;
      const r = c.getBoundingClientRect();
      this.onHover?.({ node, x: e.clientX - r.left, y: e.clientY - r.top });
    };

    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
      c.style.cursor = "grabbing";
      c.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) {
        if (e.pointerType === "mouse") setHover(pick(e), e);
        return;
      }
      drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
      this.cam.az -= (e.clientX - drag.x) * 0.006;
      this.cam.el = Math.max(0.35, Math.min(1.35, this.cam.el + (e.clientY - drag.y) * 0.004));
      drag = { x: e.clientX, y: e.clientY, moved: drag.moved };
    };
    const up = (e: PointerEvent) => {
      // A tap (no drag) selects a tile, for touch screens.
      if (drag && drag.moved < 8) setHover(pick(e), e);
      drag = null;
      c.style.cursor = "grab";
    };
    const leave = () => {
      drag = null;
      c.style.cursor = "grab";
      this.hoverNode = -1;
      this.hoverRing.visible = false;
      this.onHover?.(null);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.cam.dist = Math.max(20, Math.min(130, this.cam.dist * (e.deltaY > 0 ? 1.08 : 0.93)));
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointerleave", leave);
    c.addEventListener("wheel", wheel, { passive: false });
    this.cleanup.push(() => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointerleave", leave);
      c.removeEventListener("wheel", wheel);
    });
  }

  private observeSize() {
    const apply = () => {
      const w = this.canvas.clientWidth || 1;
      const h = this.canvas.clientHeight || 1;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      // The HUD covers the bottom of the screen (much more on phones), so lift the action above it.
      const shift = Math.round(h * (w <= 900 ? 0.2 : 0.06));
      this.camera.setViewOffset(w, h, 0, shift, w, h);
      this.camera.updateProjectionMatrix();
      this.aspectFit = Math.max(1, 1.45 / this.camera.aspect);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(this.canvas);
    this.cleanup.push(() => ro.disconnect());
  }

  // ------------------------------------------------------------------- tick

  private tick(now: number, dt: number) {
    for (const car of this.cars) {
      const a = car.anim;
      if (a) {
        const t = Math.min(1, (now - a.t0) / a.dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        car.group.position.lerpVectors(a.from, a.to, e);
        if (!this.reduceMotion) car.group.position.y += Math.sin(Math.PI * t) * 0.95;
        if (t >= 1) {
          car.anim = null;
          a.done();
        }
      }
      let d = car.yawTarget - car.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      car.yaw += d * (1 - Math.exp(-dt * 14));
      car.group.rotation.y = car.yaw;
    }

    // The bobbing arrow over whoever is playing.
    const ac = this.cars[this.active];
    this.beacon.visible = !!ac;
    if (ac) {
      this.beacon.position.set(ac.group.position.x, ac.group.position.y + 2.7 + Math.sin(now / 260) * 0.18, ac.group.position.z);
      this.beacon.rotation.y = now / 600;
    }

    // Particles.
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const c = this.particles[i]!;
      c.vel.y -= c.gravity * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.z += dt * c.spin;
      c.mesh.rotation.x += dt * c.spin * 0.6;
      if (c.grow) c.mesh.scale.addScalar(c.grow * dt);
      c.life -= dt;
      if (c.gravity > 0 && c.mesh.position.y < 0.5) {
        c.mesh.position.y = 0.5;
        c.vel.multiplyScalar(0.4);
        c.vel.y = Math.abs(c.vel.y);
      }
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        this.particles.splice(i, 1);
      }
    }

    // Tile bounces.
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i]!;
      const t = (now - p.t0) / 520;
      const g = this.tileGroups[p.node]!;
      if (t >= 1) {
        g.scale.set(1, 1, 1);
        g.position.y = 0;
        this.pulses.splice(i, 1);
      } else {
        const k = Math.sin(t * Math.PI);
        g.scale.set(1 + k * 0.14, 1 + k * 0.5, 1 + k * 0.14);
        g.position.y = k * 0.35;
      }
    }

    // Step markers bob.
    this.markers.forEach((m, i) => {
      if (!m.visible) return;
      const st = this.markerState[i]!;
      m.position.y = this.tileTop[st.node]! + 2.3 + (this.reduceMotion ? 0 : Math.sin(now / 340 + i) * 0.14);
    });

    if (!this.reduceMotion) {
      this.clouds.forEach((cl, k) => {
        cl.position.x += dt * (0.6 + k * 0.05);
        if (cl.position.x > this.layout.center.x + this.groundR * 1.5) cl.position.x = this.layout.center.x - this.groundR * 1.5;
      });
      this.flags.forEach((f, k) => {
        f.rotation.y = Math.sin(now / 700 + k) * 0.35;
      });
    }

    const cs = this.cam;
    const f = this.focus;
    const overview = f === "overview";
    const focusPos = f === "overview" ? this.layout.center : this.cars[f]!.group.position;
    const k1 = 1 - Math.exp(-dt * 3);
    cs.target.x += (focusPos.x - cs.target.x) * k1;
    cs.target.z += (focusPos.z - cs.target.z) * k1;
    cs.target.y += ((overview ? 0 : 0.6) - cs.target.y) * k1;

    const wantEl = overview ? 1.02 : cs.el;
    const wantDist = (overview ? this.layout.radius * 2.6 : cs.dist) * this.aspectFit;
    const k2 = 1 - Math.exp(-dt * 2.2);
    cs.curAz += (cs.az - cs.curAz) * k2;
    cs.curEl += (wantEl - cs.curEl) * k2;
    cs.curDist += (wantDist - cs.curDist) * k2;
    const ce = Math.cos(cs.curEl) * cs.curDist;
    this.camera.position.set(
      cs.target.x + Math.sin(cs.curAz) * ce,
      cs.target.y + Math.sin(cs.curEl) * cs.curDist,
      cs.target.z + Math.cos(cs.curAz) * ce,
    );
    this.camera.lookAt(cs.target);

    // Fog and shadows follow the camera so near things stay crisp and far things fade.
    const fog = this.scene.fog as THREE.Fog;
    fog.near = cs.curDist * 0.9;
    fog.far = cs.curDist * 0.9 + 300;
    this.sun.position.set(cs.target.x + 24, 60, cs.target.z + 34);
    this.sun.target.position.set(cs.target.x, 0, cs.target.z);
    this.sun.target.updateMatrixWorld();

    if (this.snow) {
      const arr = (this.snow.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const y = (arr[i + 1] ?? 0) - dt * (2.2 + (i % 7) * 0.2);
        arr[i + 1] = y < 0 ? 50 : y;
        arr[i] = (arr[i] ?? 0) + Math.sin(now / 1200 + i) * dt * 0.5;
      }
      (this.snow.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      this.snow.position.set(cs.target.x, 0, cs.target.z);
    }
  }
}

export type { BoardNode };
