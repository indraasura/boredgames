import * as THREE from "three";
import { ARENA, CELL, hazardState, partWorld, type PartKind, type PartState, type Robot, type Sim, type SimEvent } from "@boredgames/botbrawl";

/** Every part is built facing +X (forward) with +Z on its right; the robot turns it with the heading. */
interface View {
  group: THREE.Group;
  body: THREE.MeshStandardMaterial;
  base: THREE.Color;
  spin?: THREE.Object3D;
  pivot?: THREE.Object3D;
  flame?: THREE.Object3D;
  alive: boolean;
}

interface Bit {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  max: number;
  gravity: number;
  fade: boolean;
}

const DARK = new THREE.Color(0x15121f);

export class BrawlScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.5, 120);
  private views: View[][] = [];
  private bits: Bit[] = [];
  private flames: THREE.Mesh[][] = [];
  private ringMats: THREE.MeshBasicMaterial[] = [];
  private shake = 0;
  private raf = 0;
  private owned: { dispose(): void }[] = [];
  private cleanup: (() => void)[] = [];
  private sparkGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  private sparkMats = [new THREE.MeshBasicMaterial({ color: 0xffd23f }), new THREE.MeshBasicMaterial({ color: 0xff7a3d }), new THREE.MeshBasicMaterial({ color: 0xffffff })];
  private time = 0;
  private colors: [number, number] = [0x4cc9f0, 0xff5a36];
  private sound: ((kind: string, power: number) => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color(0x0b0916);
    this.scene.fog = new THREE.Fog(0x0b0916, 30, 70);
    this.owned.push(this.sparkGeo, ...this.sparkMats);
    this.buildArena();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas.parentElement ?? canvas);
    this.cleanup.push(() => ro.disconnect());
    this.resize();
  }

  onSound(fn: (kind: string, power: number) => void) {
    this.sound = fn;
  }

  // ------------------------------------------------------------------ arena

  private buildArena() {
    const S = this.scene;
    S.add(new THREE.HemisphereLight(0xbfc8ff, 0x1b1530, 0.8));
    const key = new THREE.DirectionalLight(0xfff2dd, 2.1);
    key.position.set(6, 22, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -14;
    sc.right = 14;
    sc.top = 14;
    sc.bottom = -14;
    sc.far = 60;
    key.shadow.bias = -0.0005;
    S.add(key);

    // Floor with steel plates and a striped border.
    const px = 48;
    const size = 2 * ARENA + 3;
    const cv = document.createElement("canvas");
    cv.width = cv.height = size * px;
    const g = cv.getContext("2d")!;
    g.fillStyle = "#2b2745";
    g.fillRect(0, 0, cv.width, cv.height);
    const off = 1.5 * px;
    g.strokeStyle = "rgba(255,255,255,0.07)";
    g.lineWidth = 2;
    for (let i = 0; i <= 2 * ARENA; i++) {
      g.beginPath();
      g.moveTo(off + i * px, off);
      g.lineTo(off + i * px, off + 2 * ARENA * px);
      g.moveTo(off, off + i * px);
      g.lineTo(off + 2 * ARENA * px, off + i * px);
      g.stroke();
    }
    g.fillStyle = "#14112a";
    g.fillRect(0, 0, cv.width, off);
    g.fillRect(0, cv.height - off, cv.width, off);
    g.fillRect(0, 0, off, cv.height);
    g.fillRect(cv.width - off, 0, off, cv.height);
    g.save();
    g.beginPath();
    g.rect(0, 0, cv.width, cv.height);
    g.rect(off, off, cv.width - 2 * off, cv.height - 2 * off);
    g.clip("evenodd");
    g.fillStyle = "#ffd23f";
    for (let i = -cv.height; i < cv.width + cv.height; i += 60) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 30, 0);
      g.lineTo(i + 30 + cv.height, cv.height);
      g.lineTo(i + cv.height, cv.height);
      g.fill();
    }
    g.restore();
    g.strokeStyle = "rgba(255,255,255,0.1)";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cv.width / 2, cv.height / 2, 3 * px, 0, Math.PI * 2);
    g.stroke();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const floorGeo = new THREE.PlaneGeometry(size, size);
    const floorMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.2 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    S.add(floor);
    this.owned.push(tex, floorGeo, floorMat);

    // The cage: a low wall, bars, and a top rail.
    const metal = new THREE.MeshStandardMaterial({ color: 0x8a86a8, roughness: 0.35, metalness: 0.8 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a3558, roughness: 0.6, metalness: 0.4 });
    const barGeo = new THREE.CylinderGeometry(0.045, 0.045, 2.4, 8);
    this.owned.push(metal, wallMat, barGeo);
    const A = ARENA;
    const wallDefs: [number, number, number, number][] = [
      [0, -A - 0.15, 2 * A + 0.6, 0.3],
      [0, A + 0.15, 2 * A + 0.6, 0.3],
      [-A - 0.15, 0, 0.3, 2 * A],
      [A + 0.15, 0, 0.3, 2 * A],
    ];
    for (const [x, z, w, d] of wallDefs) {
      const geo = new THREE.BoxGeometry(w, 0.6, d);
      const m = new THREE.Mesh(geo, wallMat);
      m.position.set(x, 0.3, z);
      m.castShadow = m.receiveShadow = true;
      S.add(m);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), metal);
      rail.position.set(x, 2.55, z);
      S.add(rail);
      this.owned.push(geo, rail.geometry);
      const n = Math.round(Math.max(w, d) / 1.5);
      for (let i = 0; i <= n; i++) {
        const bar = new THREE.Mesh(barGeo, metal);
        const t = i / n - 0.5;
        bar.position.set(w > d ? x + t * w : x, 1.8, w > d ? z : z + t * d);
        S.add(bar);
      }
    }

    // Flame vents in the corners.
    const ringGeo = new THREE.CylinderGeometry(1.45, 1.45, 0.05, 32);
    const coneGeo = new THREE.ConeGeometry(0.4, 1.8, 10);
    this.owned.push(ringGeo, coneGeo);
    for (const [x, z] of [[-6.4, -6.4], [6.4, 6.4], [6.4, -6.4], [-6.4, 6.4]] as const) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x3a3558 });
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.position.set(x, 0.03, z);
      S.add(ring);
      this.ringMats.push(mat);
      const flames: THREE.Mesh[] = [];
      for (let k = 0; k < 3; k++) {
        const fm = new THREE.MeshBasicMaterial({ color: k === 0 ? 0xffd23f : 0xff6a3d, transparent: true, opacity: 0.85 });
        const f = new THREE.Mesh(coneGeo, fm);
        f.position.set(x + (k - 1) * 0.5, 0.9, z + (k === 1 ? 0.3 : -0.2));
        f.scale.setScalar(0.001);
        S.add(f);
        flames.push(f);
        this.owned.push(fm);
      }
      this.flames.push(flames);
    }
  }

  // ----------------------------------------------------------------- robots

  private buildPart(kind: PartKind, dir: number, color: number): View {
    const base = new THREE.Color(color);
    const body = new THREE.MeshStandardMaterial({ color: base, roughness: 0.45, metalness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1830, roughness: 0.6, metalness: 0.5 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xbdbad6, roughness: 0.25, metalness: 0.9 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.owned.push(body, dark, steel, glow);
    const group = new THREE.Group();
    const inner = new THREE.Group();
    group.add(inner);
    const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = inner) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      this.owned.push(geo);
      return m;
    };
    const cyl = (r: number, h: number, mat: THREE.Material, seg = 16) => {
      const geo = new THREE.CylinderGeometry(r, r, h, seg);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      this.owned.push(geo);
      return m;
    };
    const view: View = { group, body, base, alive: true };
    const s = CELL * 0.95;
    switch (kind) {
      case "core": {
        box(s * 0.8, 0.5, s * 0.8, body, 0, 0.25);
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), glow);
        orb.position.y = 0.62;
        this.owned.push(orb.geometry);
        inner.add(orb);
        break;
      }
      case "hull":
        box(s, 0.28, s, body, 0, 0.16);
        break;
      case "armor":
        box(s, 0.42, s, body, 0, 0.22);
        box(s * 0.9, 0.05, 0.1, dark, 0, 0.45, 0.2);
        box(s * 0.9, 0.05, 0.1, dark, 0, 0.45, -0.2);
        break;
      case "wheel": {
        const w = cyl(0.27, CELL * 0.8, dark);
        w.rotation.x = Math.PI / 2;
        w.position.y = 0.27;
        const hub = cyl(0.13, CELL * 0.86, body);
        hub.rotation.x = Math.PI / 2;
        hub.position.y = 0.27;
        const roll = new THREE.Group();
        roll.position.y = 0.27;
        roll.add(w, hub);
        w.position.y = 0;
        hub.position.y = 0;
        // spokes so rolling is visible
        for (let k = 0; k < 3; k++) box(0.5, 0.05, CELL * 0.88, steel, 0, 0, 0, roll).rotation.z = (k * Math.PI) / 3;
        inner.add(roll);
        view.spin = roll;
        box(0.3, 0.14, s * 0.6, dark, 0, 0.3);
        break;
      }
      case "spinner": {
        box(0.3, 0.2, 0.3, dark, 0, 0.12);
        const blade = new THREE.Group();
        const disc = cyl(0.42, 0.06, steel, 24);
        blade.add(disc);
        for (let k = 0; k < 6; k++) {
          const tooth = box(0.2, 0.07, 0.1, body, Math.cos((k * Math.PI) / 3) * 0.42, 0, Math.sin((k * Math.PI) / 3) * 0.42, blade);
          tooth.rotation.y = -(k * Math.PI) / 3;
        }
        blade.position.y = 0.3;
        inner.add(blade);
        view.spin = blade;
        break;
      }
      case "spike": {
        box(0.42, 0.22, 0.42, body, -0.1, 0.16);
        const geo = new THREE.ConeGeometry(0.15, 0.6, 8);
        const cone = new THREE.Mesh(geo, steel);
        cone.rotation.z = -Math.PI / 2;
        cone.position.set(0.35, 0.2, 0);
        cone.castShadow = true;
        this.owned.push(geo);
        inner.add(cone);
        break;
      }
      case "hammer": {
        box(0.4, 0.22, 0.5, body, -0.12, 0.16);
        const pivot = new THREE.Group();
        pivot.position.set(-0.1, 0.34, 0);
        box(0.62, 0.09, 0.09, steel, 0.31, 0, 0, pivot);
        box(0.24, 0.26, 0.3, dark, 0.66, 0, 0, pivot);
        inner.add(pivot);
        view.pivot = pivot;
        break;
      }
      case "flipper": {
        box(0.3, 0.18, 0.7, body, -0.2, 0.12);
        const pivot = new THREE.Group();
        pivot.position.set(-0.05, 0.12, 0);
        box(0.62, 0.05, 0.7, steel, 0.31, 0, 0, pivot);
        inner.add(pivot);
        view.pivot = pivot;
        break;
      }
      case "booster": {
        const n = cyl(0.17, 0.5, steel);
        n.rotation.z = Math.PI / 2;
        n.position.y = 0.25;
        inner.add(n);
        const geo = new THREE.ConeGeometry(0.2, 0.8, 10);
        const fm = new THREE.MeshBasicMaterial({ color: 0xffa23d, transparent: true, opacity: 0.9 });
        const flame = new THREE.Mesh(geo, fm);
        flame.rotation.z = -Math.PI / 2; // the cone's tip (+Y) now points along +X, out of the nozzle
        flame.position.set(0.65, 0.25, 0);
        flame.scale.set(0.001, 0.001, 0.001);
        this.owned.push(geo, fm);
        inner.add(flame);
        view.flame = flame;
        break;
      }
    }
    inner.rotation.y = -dir * (Math.PI / 2);
    return view;
  }

  /** Build both robots for this fight. */
  setup(sim: Sim, colors: [number, number]) {
    this.colors = colors;
    for (const vs of this.views) for (const v of vs) this.scene.remove(v.group);
    this.views = sim.robots.map((r, i) =>
      r.parts.map((p) => {
        const v = this.buildPart(p.kind, p.dir, colors[i]!);
        this.scene.add(v.group);
        return v;
      }),
    );
    this.frame(sim, 0);
  }

  /** Visual effects for things that just happened. */
  fx(events: SimEvent[]) {
    for (const e of events) {
      if (e.type === "hit") {
        const n = e.big ? 10 : 5;
        for (let i = 0; i < n; i++) this.spark(e.x, 0.4, e.y, e.big ? 7 : 4);
        this.shake = Math.min(1, this.shake + (e.big ? 0.35 : 0.1));
        this.sound?.("hit", e.big ? 1 : 0.4);
      } else if (e.type === "break") {
        for (let i = 0; i < 14; i++) this.spark(e.x, 0.5, e.y, 6);
        this.shake = Math.min(1, this.shake + 0.45);
        this.sound?.("break", 1);
      } else if (e.type === "wall") {
        this.shake = Math.min(1, this.shake + 0.08);
        this.sound?.("wall", Math.min(1, e.power / 8));
      } else if (e.type === "swing") {
        this.sound?.("swing", 0.6);
      } else if (e.type === "boost") {
        this.sound?.("boost", 0.7);
      }
    }
  }

  private spark(x: number, y: number, z: number, speed: number) {
    const m = new THREE.Mesh(this.sparkGeo, this.sparkMats[Math.floor(Math.random() * 3)]!);
    m.position.set(x, y, z);
    this.scene.add(m);
    const a = Math.random() * Math.PI * 2;
    const v = (0.4 + Math.random()) * speed;
    this.bits.push({ mesh: m, vel: new THREE.Vector3(Math.cos(a) * v, 2 + Math.random() * 4, Math.sin(a) * v), spin: new THREE.Vector3(), life: 0.5, max: 0.5, gravity: 14, fade: false });
  }

  // ------------------------------------------------------------------ frame

  frame(sim: Sim, dt: number) {
    this.time += dt;
    sim.robots.forEach((r, ri) => {
      const views = this.views[ri];
      if (!views) return;
      const fwdSpeed = r.vx * Math.cos(r.th) + r.vy * Math.sin(r.th);
      r.parts.forEach((p, i) => this.updatePart(r, p, views[i]!, fwdSpeed, dt));
    });
    sim.hazards.forEach((h, i) => {
      const s = hazardState(h, sim.t);
      const mat = this.ringMats[i]!;
      mat.color.setHex(s === 0 ? 0x3a3558 : s === 1 ? (Math.floor(this.time * 8) % 2 ? 0xff9a3d : 0x5a3a3a) : 0xff3d2a);
      this.flames[i]?.forEach((f, k) => {
        const target = s === 2 ? 0.8 + 0.4 * Math.sin(this.time * 18 + k * 2) : 0.001;
        f.scale.setScalar(THREE.MathUtils.lerp(f.scale.x, target, 0.3));
      });
    });

    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i]!;
      b.life -= dt;
      b.vel.y -= b.gravity * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.rotation.x += b.spin.x * dt;
      b.mesh.rotation.y += b.spin.y * dt;
      b.mesh.rotation.z += b.spin.z * dt;
      if (b.mesh.position.y < 0.05) {
        b.mesh.position.y = 0.05;
        b.vel.y *= -0.35;
        b.vel.x *= 0.7;
        b.vel.z *= 0.7;
      }
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        this.bits.splice(i, 1);
      } else if (b.fade) b.mesh.scale.setScalar(Math.min(1, (b.life / b.max) * 2));
    }

    // The camera sits above the near edge and shakes with the hits.
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake * 0.5;
    this.camera.position.set((Math.random() - 0.5) * s, 21 + (Math.random() - 0.5) * s, 15.5 + (Math.random() - 0.5) * s);
    this.camera.lookAt(0, 0, 0.8);
    this.renderer.render(this.scene, this.camera);
  }

  private updatePart(r: Robot, p: PartState, v: View, fwdSpeed: number, dt: number) {
    if (!p.alive) {
      if (v.alive) {
        // It just came off: let it fly.
        v.alive = false;
        const vel = new THREE.Vector3(r.vx + (Math.random() - 0.5) * 6, 4 + Math.random() * 3, r.vy + (Math.random() - 0.5) * 6);
        this.bits.push({ mesh: v.group, vel, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), life: 2.5, max: 2.5, gravity: 16, fade: true });
      }
      return;
    }
    const pos = partWorld(r, p);
    v.group.position.set(pos.x, 0, pos.y);
    v.group.rotation.y = -r.th;
    // Hurt parts darken and glow red.
    const frac = Math.max(0, p.hp / p.max);
    v.body.color.copy(v.base).lerp(DARK, (1 - frac) * 0.75);
    v.body.emissive.setRGB(frac < 0.35 ? 0.4 * (1 - frac / 0.35) * (0.6 + 0.4 * Math.sin(this.time * 14)) : 0, 0, 0);
    if (v.spin) {
      if (p.kind === "spinner") v.spin.rotation.y += dt * 28;
      else v.spin.rotation.z -= (fwdSpeed * dt) / 0.27;
    }
    if (v.pivot) {
      if (p.kind === "hammer") {
        const t = 1.5 - p.cd;
        v.pivot.rotation.z = p.cd <= 0 ? 1.1 : t < 0.12 ? 1.1 - (t / 0.12) * 1.25 : t < 0.7 ? -0.15 + ((t - 0.12) / 0.58) * 1.25 : 1.1;
      } else {
        const t = 2.2 - p.cd;
        v.pivot.rotation.z = p.cd <= 0 ? -0.05 : t < 0.1 ? (t / 0.1) * 0.9 : t < 0.6 ? 0.9 - ((t - 0.1) / 0.5) * 0.95 : -0.05;
      }
    }
    if (v.flame) {
      const on = r.boostT > 0 ? 1 + 0.3 * Math.sin(this.time * 40) : 0.001;
      v.flame.scale.set(on, on, on);
    }
  }

  resize() {
    const host = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the whole cage in view on tall screens.
    this.camera.fov = w / h < 1 ? 62 : 40;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((f) => f());
    this.owned.forEach((o) => o.dispose());
    this.renderer.dispose();
  }
}
