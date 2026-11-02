import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { B, K, N, P, Q, R, boardSquares, colorOf, idx, typeOf, xOf, yOf, zOf, type Color, type Move, type TridState } from "@boredgames/tridchess";

/** Height between levels, in squares. */
const LH = 2.7;

/** World position of the middle of a square's top face. */
export function squarePos(i: number, out = new THREE.Vector3()) {
  return out.set(xOf(i) - 1.5, zOf(i) * LH, 3.5 - yOf(i));
}

interface Piece {
  g: THREE.Group;
  cell: number;
  target: THREE.Vector3;
  dying: number; // 0 alive, otherwise seconds of fade left
}

export interface Marks {
  selected: number | null;
  targets: { sq: number; capture: boolean }[];
  last: Move | null;
  check: number | null;
}

const lathe = (pts: [number, number][], seg = 28) => new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg);

/** Shared geometries for every piece. */
function buildGeometries() {
  const base: [number, number][] = [
    [0, 0],
    [0.34, 0],
    [0.36, 0.04],
    [0.33, 0.09],
    [0.24, 0.13],
  ];
  const stem = (top: number, r0: number, r1: number): [number, number][] => [...base, [r0, 0.2], [r1, top * 0.7], [r1 + 0.06, top], [0, top]];
  return {
    pawn: lathe([...base, [0.17, 0.22], [0.12, 0.34], [0.2, 0.38], [0.2, 0.4], [0, 0.4]]),
    pawnHead: new THREE.SphereGeometry(0.15, 20, 14),
    rook: lathe([...base, [0.2, 0.2], [0.18, 0.48], [0.27, 0.54], [0.27, 0.66], [0.2, 0.66], [0.2, 0.62], [0, 0.62]]),
    crenel: new THREE.BoxGeometry(0.1, 0.12, 0.1),
    bishop: lathe(stem(0.62, 0.18, 0.1)),
    mitre: new THREE.SphereGeometry(0.17, 20, 16),
    bishopTop: new THREE.SphereGeometry(0.06, 12, 10),
    queen: lathe(stem(0.78, 0.2, 0.12)),
    crownRing: new THREE.TorusGeometry(0.17, 0.045, 10, 24),
    crownBall: new THREE.SphereGeometry(0.07, 14, 12),
    king: lathe(stem(0.84, 0.21, 0.13)),
    crossV: new THREE.BoxGeometry(0.08, 0.28, 0.08),
    crossH: new THREE.BoxGeometry(0.22, 0.08, 0.08),
    knightBase: lathe([...base, [0.2, 0.2], [0.2, 0.26], [0, 0.26]]),
    knightNeck: new THREE.BoxGeometry(0.24, 0.5, 0.3),
    knightHead: new THREE.BoxGeometry(0.22, 0.2, 0.42),
    knightEar: new THREE.ConeGeometry(0.05, 0.12, 6),
  };
}
type Geos = ReturnType<typeof buildGeometries>;

export class ChessScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  private controls: OrbitControls;
  private geos = buildGeometries();
  private mats: Record<Color, THREE.MeshStandardMaterial>;
  private pieces = new Map<number, Piece>();
  private dead: Piece[] = [];
  private tiles: THREE.Mesh[] = [];
  private boardGroups: THREE.Group[] = [];
  private boardTarget = [0, 0, 0, 0];
  private marks = new THREE.Group();
  private markTime = 0;
  private state: TridState | null = null;
  private raf = 0;
  private last = performance.now();
  private view: Color = 0;
  private camGoal: THREE.Vector3 | null = null;
  private ray = new THREE.Raycaster();
  private owned: { dispose(): void }[] = [];
  private cleanup: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private onPick: (sq: number | null) => void,
  ) {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color(0x0d0b1a);
    this.scene.fog = new THREE.Fog(0x0d0b1a, 28, 60);

    this.mats = {
      0: new THREE.MeshStandardMaterial({ color: 0xf4ebd3, roughness: 0.32, metalness: 0.08 }),
      1: new THREE.MeshStandardMaterial({ color: 0x2c2547, roughness: 0.28, metalness: 0.45 }),
    };
    this.owned.push(this.mats[0], this.mats[1], ...Object.values(this.geos));

    this.addLights();
    this.addStars();
    this.addBoards();
    this.scene.add(this.marks);

    this.camera.position.set(0, 12.5, 17);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, LH - 0.4, 0.4);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 34;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.enablePan = false;

    // Tap to pick; a drag is for orbiting.
    let down: { x: number; y: number } | null = null;
    const pd = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const pu = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) this.pick(e);
      down = null;
    };
    canvas.addEventListener("pointerdown", pd);
    canvas.addEventListener("pointerup", pu);
    this.cleanup.push(() => canvas.removeEventListener("pointerdown", pd), () => canvas.removeEventListener("pointerup", pu));

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas.parentElement ?? canvas);
    this.cleanup.push(() => ro.disconnect());
    this.resize();
    this.loop();
  }

  // ------------------------------------------------------------------ build

  private addLights() {
    this.scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x1a1530, 0.9));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sun.position.set(6, 16, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -9;
    c.right = 9;
    c.top = 9;
    c.bottom = -9;
    c.near = 1;
    c.far = 40;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    const rim = new THREE.PointLight(0x8b5cf6, 60, 40);
    rim.position.set(-8, 5, -8);
    this.scene.add(rim);
  }

  private addStars() {
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 1.2 - 0.2;
      const d = 40 + Math.random() * 20;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * d;
      pos[i * 3 + 1] = Math.sin(e) * d + 4;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, sizeAttenuation: true, fog: false });
    this.scene.add(new THREE.Points(geo, mat));
    this.owned.push(geo, mat);
  }

  private addBoards() {
    const tileGeo = new THREE.BoxGeometry(0.96, 0.14, 0.96);
    const plateGeo4 = new THREE.BoxGeometry(4.25, 0.16, 4.25);
    const plateGeo2 = new THREE.BoxGeometry(2.25, 0.16, 2.25);
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 2 * LH + 0.6, 10);
    this.owned.push(tileGeo, plateGeo4, plateGeo2, poleGeo);
    const levelTint = [0xe8c98a, 0x9ec7e8, 0x8d7bd6];
    const mk = (hex: number, opacity: number) => {
      const m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.4, metalness: 0.1, transparent: true, opacity });
      this.owned.push(m);
      return m;
    };
    const plateMat = [mk(0x3b3358, 0.55), mk(0x2f3f63, 0.5), mk(0x241d3b, 0.6)];
    const poleMat = mk(0x7d73a8, 0.9);

    const addTiles = (group: THREE.Group, x0: number, y0: number, w: number, h: number, tint: number, b: number, z: number) => {
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++) {
          const light = (x + y) % 2 === 0;
          const col = new THREE.Color(tint).multiplyScalar(light ? 1 : 0.46);
          const mesh = new THREE.Mesh(tileGeo, mk(col.getHex(), 0.82));
          mesh.position.set(x - 1.5, -0.07, 3.5 - y);
          mesh.receiveShadow = true;
          mesh.userData = { x, y, b, z };
          group.add(mesh);
          this.tiles.push(mesh);
        }
    };

    for (let z = 0; z < 3; z++) {
      const g = new THREE.Group();
      g.position.y = z * LH;
      const plate = new THREE.Mesh(plateGeo4, plateMat[z]);
      plate.position.set(0, -0.17, 0);
      g.add(plate);
      addTiles(g, 0, 2, 4, 4, levelTint[z]!, -1, z);
      this.scene.add(g);
    }
    for (let b = 0; b < 4; b++) {
      const g = new THREE.Group();
      const x0 = (b & 1) * 2;
      const y0 = b < 2 ? 0 : 6;
      const lvl = b < 2 ? 0 : 2;
      g.position.y = lvl * LH;
      this.boardTarget[b] = g.position.y;
      const plate = new THREE.Mesh(plateGeo2, plateMat[lvl]);
      plate.position.set(x0 + 0.5 - 1.5, -0.17, 3.5 - y0 - 0.5);
      g.add(plate);
      addTiles(g, x0, y0, 2, 2, b < 2 ? 0x4fe3b5 : 0xff8f7a, b, lvl);
      this.scene.add(g);
      this.boardGroups.push(g);
      // A pole at the outer corner for the board to slide on.
      const pole = new THREE.Mesh(poleGeo, poleMat);
      const px = b & 1 ? 2.25 : -2.25;
      const pz = b < 2 ? 4.45 : -4.45;
      pole.position.set(px, LH, pz);
      this.scene.add(pole);
    }
  }

  private pieceMesh(cell: number): THREE.Group {
    const g = new THREE.Group();
    const color = colorOf(cell);
    const mat = this.mats[color];
    const geo = this.geos;
    const add = (geometry: THREE.BufferGeometry, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geometry, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    switch (typeOf(cell)) {
      case P:
        add(geo.pawn);
        add(geo.pawnHead, 0, 0.5, 0);
        break;
      case R:
        add(geo.rook);
        for (const [x, z] of [
          [0.19, 0.19],
          [-0.19, 0.19],
          [0.19, -0.19],
          [-0.19, -0.19],
        ] as const)
          add(geo.crenel, x, 0.68, z);
        break;
      case B: {
        add(geo.bishop);
        const m = add(geo.mitre, 0, 0.7, 0);
        m.scale.set(0.85, 1.35, 0.85);
        add(geo.bishopTop, 0, 0.94, 0);
        break;
      }
      case Q:
        add(geo.queen);
        add(geo.crownRing, 0, 0.8, 0).rotation.x = Math.PI / 2;
        add(geo.crownBall, 0, 0.9, 0);
        break;
      case K:
        add(geo.king);
        add(geo.crossV, 0, 0.99, 0);
        add(geo.crossH, 0, 1.03, 0);
        break;
      default: {
        // Knight: a base, a leaning neck, a head and two ears, facing the enemy.
        add(geo.knightBase);
        const neck = add(geo.knightNeck, 0, 0.5, 0.02);
        neck.rotation.x = -0.25;
        const head = add(geo.knightHead, 0, 0.72, 0.2);
        head.rotation.x = 0.35;
        add(geo.knightEar, -0.07, 0.88, 0.0);
        add(geo.knightEar, 0.07, 0.88, 0.0);
        g.rotation.y = color === 0 ? Math.PI : 0;
      }
    }
    return g;
  }

  // ------------------------------------------------------------------ state

  private place(i: number, cell: number, from?: THREE.Vector3): Piece {
    const g = this.pieceMesh(cell);
    const target = squarePos(i);
    g.position.copy(from ?? target);
    this.scene.add(g);
    const p: Piece = { g, cell, target, dying: 0 };
    g.userData.sq = i;
    this.pieces.set(i, p);
    return p;
  }

  private clearPieces() {
    for (const p of this.pieces.values()) this.scene.remove(p.g);
    for (const p of this.dead) this.scene.remove(p.g);
    this.pieces.clear();
    this.dead = [];
  }

  private rebuild(s: TridState) {
    this.clearPieces();
    for (let b = 0; b < 4; b++) this.boardTarget[b] = s.boards[b]! * LH;
    this.boardGroups.forEach((g, b) => (g.position.y = this.boardTarget[b]!));
    for (let i = 0; i < 96; i++) if (s.cells[i]) this.place(i, s.cells[i]!);
  }

  /** Show `next`. When `move` is the move that led here, pieces glide; otherwise the board is rebuilt. */
  setState(next: TridState, move: Move | null = null) {
    const prev = this.state;
    this.state = next;
    if (!prev || !move) return this.rebuild(next);
    if (move.t === "b") {
      const from = boardSquares(move.board, prev.boards[move.board]!);
      const to = boardSquares(move.board, move.z);
      const carried = from.map((f) => this.pieces.get(f));
      from.forEach((f) => this.pieces.delete(f));
      carried.forEach((p, i) => {
        if (!p) return;
        this.pieces.set(to[i]!, p);
        p.g.userData.sq = to[i]!;
        squarePos(to[i]!, p.target);
      });
      this.boardTarget[move.board] = move.z * LH;
    } else {
      const victim = this.pieces.get(move.to);
      if (victim) {
        victim.dying = 0.3;
        this.dead.push(victim);
        this.pieces.delete(move.to);
      }
      const p = this.pieces.get(move.from);
      this.pieces.delete(move.from);
      if (p) {
        const now = next.cells[move.to]!;
        let mover = p;
        if (now !== p.cell) {
          // Promotion: a new piece grows where the pawn arrived.
          this.scene.remove(p.g);
          mover = this.place(move.to, now, p.g.position);
          mover.g.scale.setScalar(0.1);
        } else {
          p.g.userData.sq = move.to;
          squarePos(move.to, p.target);
          this.pieces.set(move.to, p);
        }
      }
    }
    // Anything that does not match the rules' view of the world means we missed a step: start again.
    for (let i = 0; i < 96; i++) if ((this.pieces.get(i)?.cell ?? 0) !== next.cells[i]) return this.rebuild(next);
  }

  setMarks(m: Marks) {
    for (const ch of [...this.marks.children]) {
      const mesh = ch as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.marks.remove(ch);
    }
    const ring = (sq: number, color: number, r0: number, r1: number, y = 0.03, opacity = 0.95) => {
      const geo = new THREE.RingGeometry(r0, r1, 32);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthTest: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      squarePos(sq, mesh.position);
      mesh.position.y += y;
      mesh.renderOrder = 10;
      this.marks.add(mesh);
      return mesh;
    };
    const disc = (sq: number, color: number) => {
      const geo = new THREE.CircleGeometry(0.17, 24);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      squarePos(sq, mesh.position);
      mesh.position.y += 0.03;
      mesh.renderOrder = 10;
      this.marks.add(mesh);
    };
    if (m.last?.t === "m") {
      ring(m.last.from, 0xffd23f, 0.34, 0.42, 0.02, 0.55);
      ring(m.last.to, 0xffd23f, 0.34, 0.42, 0.02, 0.8);
    }
    if (m.check !== null) ring(m.check, 0xff3d5a, 0.28, 0.46);
    if (m.selected !== null) ring(m.selected, 0x4cc9f0, 0.3, 0.44);
    for (const t of m.targets) {
      if (t.capture) ring(t.sq, 0xff5a36, 0.3, 0.44);
      else disc(t.sq, 0x3ddc97);
    }
  }

  /** Look from white's side (0) or black's (1). */
  setView(color: Color, snap = false) {
    this.view = color;
    const d = this.camera.position.clone().sub(this.controls.target);
    const flat = Math.hypot(d.x, d.z);
    const goal = new THREE.Vector3(0, d.y, color === 0 ? flat : -flat).add(this.controls.target);
    if (snap) this.camera.position.copy(goal);
    else this.camGoal = goal;
  }

  get facing() {
    return this.view;
  }

  // ------------------------------------------------------------------- loop

  private pick(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const pieceRoots = [...this.pieces.values()].map((p) => p.g);
    const hit = this.ray.intersectObjects([...pieceRoots, ...this.tiles], true)[0];
    if (!hit || !this.state) return this.onPick(null);
    let o: THREE.Object3D | null = hit.object;
    while (o && o.userData.sq === undefined && o.userData.x === undefined) o = o.parent;
    if (!o) return this.onPick(null);
    if (o.userData.sq !== undefined) return this.onPick(o.userData.sq as number);
    const { x, y, b, z } = o.userData as { x: number; y: number; b: number; z: number };
    this.onPick(idx(x, y, b < 0 ? z : this.state.boards[b]!));
  }

  resize() {
    const host = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the whole stack in frame on tall phone screens.
    this.camera.fov = w / h < 0.8 ? 54 : 38;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const k = 1 - Math.exp(-dt * 9);
    for (const p of this.pieces.values()) {
      p.g.position.lerp(p.target, k);
      if (p.g.scale.x < 1) p.g.scale.setScalar(Math.min(1, p.g.scale.x + dt * 4));
    }
    for (let i = this.dead.length - 1; i >= 0; i--) {
      const p = this.dead[i]!;
      p.dying -= dt;
      p.g.scale.setScalar(Math.max(0.001, p.dying / 0.3));
      p.g.position.y += dt * 1.5;
      if (p.dying <= 0) {
        this.scene.remove(p.g);
        this.dead.splice(i, 1);
      }
    }
    this.boardGroups.forEach((g, b) => (g.position.y += (this.boardTarget[b]! - g.position.y) * k));
    if (this.camGoal) {
      this.camera.position.lerp(this.camGoal, 1 - Math.exp(-dt * 4));
      if (this.camera.position.distanceTo(this.camGoal) < 0.05) this.camGoal = null;
    }
    this.markTime += dt;
    this.marks.position.y = Math.sin(this.markTime * 5) * 0.015;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((f) => f());
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !this.owned.includes(m.geometry)) m.geometry.dispose();
    });
    this.owned.forEach((o) => o.dispose());
    this.renderer.dispose();
  }
}
