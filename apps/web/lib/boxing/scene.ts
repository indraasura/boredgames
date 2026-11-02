import * as THREE from "three";
import { PUNCH, type Fight, type Fighter, type FightEvent, type Punch } from "@boredgames/boxing";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = THREE.MathUtils.lerp;

// ------------------------------------------------------------------- limbs

/** Where the elbow (or knee) goes for a two-bone limb from `s` to `t`, bending toward `pole`. */
function joint(s: THREE.Vector3, t: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, out = V()) {
  const dir = t.clone().sub(s);
  const d = THREE.MathUtils.clamp(dir.length(), 0.001, l1 + l2 - 0.005);
  dir.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0);
  perp.normalize();
  return out.copy(s).addScaledVector(dir, a).addScaledVector(perp, h);
}

const UP = V(0, 1, 0);
/** Stretch a unit-height cylinder from a to b. */
function span(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a);
  const len = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  m.scale.set(1, Math.max(0.001, len), 1);
  m.quaternion.setFromUnitVectors(UP, d.divideScalar(len || 1));
}

// ------------------------------------------------------------------- boxer

const SKIN = [0xe8b896, 0xc68863, 0x8d5a3b, 0xf1c9a5];

class Boxer {
  owned: { dispose(): void }[] = [];
  root = new THREE.Group();
  private body = new THREE.Group();
  private chest = new THREE.Group();
  private head = new THREE.Group();
  private upper = [0, 1].map(() => this.cyl(0.058));
  private fore = [0, 1].map(() => this.cyl(0.05));
  private thigh = [0, 1].map(() => this.cyl(0.085));
  private shin = [0, 1].map(() => this.cyl(0.06));
  private gloves: THREE.Mesh[] = [];
  private torso: THREE.Mesh;
  private bruise: THREE.Mesh[] = [];
  private skin: THREE.MeshStandardMaterial;
  private base: THREE.Color;
  private fall = 0;
  private prev = V();
  private speed = 0;
  private time = Math.random() * 10;

  constructor(skin: number, trunks: number, glove: number) {
    this.base = new THREE.Color(skin);
    this.skin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.55, metalness: 0 });
    const gloveMat = new THREE.MeshStandardMaterial({ color: glove, roughness: 0.35, metalness: 0.1 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: trunks, roughness: 0.6 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15121b, roughness: 0.8 });
    this.owned.push(this.skin, gloveMat, trunkMat, white, dark);
    this.root.add(this.body);
    this.body.add(this.chest);

    for (const m of [...this.upper, ...this.fore, ...this.thigh, ...this.shin]) {
      m.material = this.skin;
      this.body.add(m);
    }
    const geo = (g: THREE.BufferGeometry) => (this.owned.push(g), g);
    // Torso, shorts, neck, head.
    this.torso = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.19, 0.15, 0.62, 18)), this.skin);
    this.torso.scale.z = 0.62;
    this.torso.castShadow = true;
    this.chest.add(this.torso);
    const shorts = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.17, 0.2, 0.3, 18)), trunkMat);
    shorts.scale.z = 0.7;
    shorts.position.y = -0.38;
    shorts.castShadow = true;
    this.chest.add(shorts);
    const waist = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.172, 0.172, 0.06, 18)), white);
    waist.scale.z = 0.7;
    waist.position.y = -0.24;
    this.chest.add(waist);
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Mesh(geo(new THREE.SphereGeometry(0.08, 12, 10)), this.skin);
      shoulder.position.set(s * 0.22, 0.25, 0);
      this.chest.add(shoulder);
    }
    const neck = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 10)), this.skin);
    neck.position.y = 0.36;
    this.chest.add(neck);
    this.chest.add(this.head);
    this.head.position.y = 0.5;
    const skull = new THREE.Mesh(geo(new THREE.SphereGeometry(0.112, 20, 16)), this.skin);
    skull.scale.set(0.92, 1.12, 1);
    skull.castShadow = true;
    this.head.add(skull);
    const hair = new THREE.Mesh(geo(new THREE.SphereGeometry(0.116, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.45)), dark);
    hair.scale.set(0.93, 1.1, 1.02);
    hair.position.y = 0.012;
    hair.rotation.x = -0.25;
    this.head.add(hair);
    const nose = new THREE.Mesh(geo(new THREE.SphereGeometry(0.02, 8, 6)), this.skin);
    nose.position.set(0, -0.005, 0.112);
    this.head.add(nose);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(geo(new THREE.SphereGeometry(0.014, 8, 6)), dark);
      eye.position.set(s * 0.042, 0.03, 0.1);
      this.head.add(eye);
      const brow = new THREE.Mesh(geo(new THREE.BoxGeometry(0.05, 0.01, 0.01)), dark);
      brow.position.set(s * 0.042, 0.052, 0.105);
      this.head.add(brow);
      const ear = new THREE.Mesh(geo(new THREE.SphereGeometry(0.03, 8, 6)), this.skin);
      ear.scale.z = 0.5;
      ear.position.set(s * 0.1, 0, 0);
      this.head.add(ear);
      // A swelling that grows with the beating.
      const b = new THREE.Mesh(geo(new THREE.SphereGeometry(0.03, 10, 8)), new THREE.MeshStandardMaterial({ color: 0x6b2d4a, roughness: 0.8, transparent: true, opacity: 0 }));
      b.position.set(s * 0.045, 0.01, 0.098);
      b.scale.set(1.3, 1, 0.6);
      this.head.add(b);
      this.bruise.push(b);
      this.owned.push(b.material as THREE.Material);
    }
    const mouth = new THREE.Mesh(geo(new THREE.BoxGeometry(0.05, 0.012, 0.01)), dark);
    mouth.position.set(0, -0.055, 0.1);
    this.head.add(mouth);
    // Gloves with a white cuff.
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const ball = new THREE.Mesh(geo(new THREE.SphereGeometry(0.105, 16, 12)), gloveMat);
      ball.scale.set(0.95, 0.9, 1.15);
      ball.castShadow = true;
      const cuff = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.062, 0.062, 0.07, 12)), white);
      cuff.position.y = -0.1;
      g.add(ball, cuff);
      this.body.add(g);
      this.gloves.push(g as unknown as THREE.Mesh);
    }
    this.root.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : 0));
  }

  private cyl(r: number) {
    const geo = new THREE.CylinderGeometry(r, r * 0.88, 1, 10);
    this.owned.push(geo);
    const m = new THREE.Mesh(geo);
    m.castShadow = true;
    return m;
  }

  /** `me` is this boxer, `foe` the other. Positions are in the sim's metres. */
  update(me: Fighter, foe: Fighter, dt: number) {
    this.time += dt;
    const t = this.time;
    const dx = foe.x - me.x;
    const dz = foe.z - me.z;
    this.root.position.set(me.x, 0, me.z);
    const face = Math.atan2(dx, dz);
    this.root.rotation.y = face;
    const moved = Math.hypot(me.x - this.prev.x, me.z - this.prev.z) / Math.max(dt, 1e-3);
    this.prev.set(me.x, 0, me.z);
    this.speed = lerp(this.speed, Math.min(1, moved), 0.15);

    // Falling and getting up.
    this.fall = lerp(this.fall, me.down !== null ? 1 : 0, me.down !== null ? 0.18 : 0.06);

    const bounce = Math.sin(t * (5 + this.speed * 5)) * (0.012 + this.speed * 0.012);
    const duck = me.duck ? 1 : 0;
    const lean = me.leanT > 0 ? ease(Math.min(1, me.leanT / 0.15)) * me.leanDir : 0;
    const stun = Math.min(1, me.stun * 4);

    const hipY = 0.93 + bounce - duck * 0.27;
    const hips = V(lean * 0.12, hipY, 0);
    this.chest.position.set(lean * 0.2, hipY + 0.4 - duck * 0.05, 0.05 + duck * 0.12);
    this.chest.rotation.set(0.16 + duck * 0.45 - stun * 0.25, 0, -lean * 0.3);
    this.head.rotation.set(-0.1 - stun * 0.3 + duck * -0.3, Math.sin(t * 3) * 0.03, 0);
    this.head.position.z = -stun * 0.05;

    // Which hand is working, and how far out it is.
    const ext = [0, 0];
    let twist = 0;
    const poses = [this.idle(0, me, t), this.idle(1, me, t)];
    if (me.act) {
      const spec = PUNCH[me.act.kind];
      const hand = me.act.kind === "jab" || me.act.kind === "hook" ? 0 : 1;
      const { from, end } = this.path(me.act.kind);
      const p = me.act.t;
      let pos: THREE.Vector3;
      if (p < spec.wind) pos = poses[hand]!.clone().lerp(from, ease(p / spec.wind));
      else if (p < spec.wind + spec.act) pos = from.clone().lerp(end, ease((p - spec.wind) / spec.act));
      else pos = end.clone().lerp(poses[hand]!, ease((p - spec.wind - spec.act) / spec.rec));
      poses[hand] = pos;
      ext[hand] = p < spec.wind ? 0 : p < spec.wind + spec.act ? (p - spec.wind) / spec.act : 1 - (p - spec.wind - spec.act) / spec.rec;
      twist = (hand === 1 ? 1 : -0.6) * ext[hand]! * 0.5;
    }
    this.chest.rotation.y = twist;

    // Arms: shoulders sit on the (twisted) chest.
    const chestM = new THREE.Matrix4().compose(this.chest.position, new THREE.Quaternion().setFromEuler(this.chest.rotation), V(1, 1, 1));
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const shoulder = V(side * 0.22, 0.25, 0).applyMatrix4(chestM);
      const wrist = poses[i]!;
      const elbow = joint(shoulder, wrist, 0.3, 0.29, V(side * 0.7, -1, -0.3));
      span(this.upper[i]!, shoulder, elbow);
      span(this.fore[i]!, elbow, wrist);
      const g = this.gloves[i]!;
      const fdir = wrist.clone().sub(elbow).normalize();
      g.position.copy(wrist).addScaledVector(fdir, 0.07);
      g.quaternion.setFromUnitVectors(UP, fdir.multiplyScalar(-1));
    }

    // Legs: a staggered stance, shuffling when moving.
    const sway = Math.sin(t * 8) * 0.06 * this.speed;
    const feet = [V(-0.17, 0.04, 0.24 + sway), V(0.19, 0.04, -0.2 - sway)];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const hip = V(side * 0.1, hips.y, 0).add(V(hips.x, 0, 0));
      const knee = joint(hip, feet[i]!, 0.46, 0.46, V(0, 0.2, 1));
      span(this.thigh[i]!, hip, knee);
      span(this.shin[i]!, knee, feet[i]!);
    }

    // Bruises and sweat with the damage taken.
    const hurt = 1 - me.hp / 100;
    this.skin.color.copy(this.base).lerp(new THREE.Color(0xd96a5a), Math.min(0.35, hurt * 0.45) + stun * 0.1);
    for (const b of this.bruise) (b.material as THREE.MeshStandardMaterial).opacity = Math.max(0, Math.min(0.85, (hurt - 0.3) * 1.5));

    // Down on the canvas.
    this.body.rotation.x = -this.fall * 1.5;
    this.body.position.set(0, this.fall * 0.2, -this.fall * 0.55);
  }

  private idle(i: number, me: Fighter, t: number) {
    const sway = Math.sin(t * 5 + i) * 0.012;
    if (me.guard) return V(i === 0 ? -0.1 : 0.1, 1.5 + sway, 0.32);
    return i === 0 ? V(-0.16, 1.4 + sway, 0.38) : V(0.17, 1.44 + sway, 0.27);
  }

  private path(kind: Punch) {
    switch (kind) {
      case "jab":
        return { from: V(-0.14, 1.42, 0.2), end: V(-0.08, 1.52, 0.92) };
      case "cross":
        return { from: V(0.2, 1.4, 0.05), end: V(0.04, 1.5, 0.98) };
      case "hook":
        return { from: V(-0.62, 1.5, 0.12), end: V(0.08, 1.52, 0.68) };
      default:
        return { from: V(0.14, 0.98, 0.3), end: V(0.04, 1.42, 0.64) };
    }
  }
}

// ------------------------------------------------------------------- scene

export class BoxingScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(66, 1, 0.05, 80);
  private foe: Boxer;
  private gloves: THREE.Group[] = [];
  private bits: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];
  private crowd: { mesh: THREE.InstancedMesh; base: THREE.Matrix4[]; phase: number[] };
  private owned: { dispose(): void }[] = [];
  private cleanup: (() => void)[] = [];
  private kick = 0;
  private roll = 0;
  private fallCam = 0;
  private time = 0;
  private yaw = 0;
  private bob = 0;
  private fov = 66;
  private sweat = new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.8 });
  private sweatGeo = new THREE.SphereGeometry(0.018, 6, 5);
  private sound: ((k: string, p: number) => void) | null = null;
  private hurt: ((dmg: number) => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    this.scene.background = new THREE.Color(0x06050c);
    this.scene.fog = new THREE.FogExp2(0x07060d, 0.032);
    this.scene.add(this.camera);
    this.owned.push(this.sweat, this.sweatGeo);

    this.buildRing();
    this.crowd = this.buildCrowd();
    this.foe = new Boxer(SKIN[Math.floor(Math.random() * SKIN.length)]!, 0xd62839, 0xd62839);
    this.scene.add(this.foe.root);
    this.buildGloves();

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas.parentElement ?? canvas);
    this.cleanup.push(() => ro.disconnect());
    this.resize();
  }

  onSound(fn: (k: string, p: number) => void) {
    this.sound = fn;
  }
  onHurt(fn: (dmg: number) => void) {
    this.hurt = fn;
  }

  // ------------------------------------------------------------------- build

  private buildRing() {
    const S = this.scene;
    const keep = <T extends { dispose(): void }>(o: T) => (this.owned.push(o), o);
    S.add(new THREE.HemisphereLight(0x8c93c8, 0x120d1c, 0.55));
    for (const [x, z] of [[0, 0], [-3, 2], [3, -2]] as const) {
      const sp = new THREE.SpotLight(0xfff0d8, x === 0 ? 420 : 160, 24, 0.75, 0.55, 1.6);
      sp.position.set(x, 8, z);
      sp.target.position.set(x * 0.2, 0, z * 0.2);
      sp.castShadow = x === 0;
      sp.shadow.mapSize.set(2048, 2048);
      sp.shadow.bias = -0.0003;
      S.add(sp, sp.target);
    }
    // Canvas floor.
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1024;
    const g = cv.getContext("2d")!;
    g.fillStyle = "#1c3f9e";
    g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
      g.fillRect(Math.random() * 1024, Math.random() * 1024, 2 + Math.random() * 30, 1);
    }
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 14;
    g.strokeRect(70, 70, 884, 884);
    g.fillStyle = "rgba(255,255,255,0.88)";
    g.font = "800 150px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("IDLEMINDS", 512, 512);
    g.font = "700 50px system-ui, sans-serif";
    g.fillText("BOXING", 512, 620);
    const tex = keep(new THREE.CanvasTexture(cv));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const floorMat = keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    const floor = new THREE.Mesh(keep(new THREE.BoxGeometry(6.8, 0.3, 6.8)), floorMat);
    floor.position.y = -0.15;
    floor.receiveShadow = true;
    S.add(floor);
    const skirt = new THREE.Mesh(keep(new THREE.BoxGeometry(7.1, 0.9, 7.1)), keep(new THREE.MeshStandardMaterial({ color: 0x160f24, roughness: 0.9 })));
    skirt.position.y = -0.75;
    S.add(skirt);
    // Posts, pads and ropes.
    const postMat = keep(new THREE.MeshStandardMaterial({ color: 0x8e8aa6, roughness: 0.3, metalness: 0.9 }));
    const ropeMats = [0xd62839, 0xf4f0e6, 0x2f6fe0].map((c) => keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })));
    const postGeo = keep(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 12));
    const padGeo = keep(new THREE.BoxGeometry(0.2, 0.26, 0.2));
    const half = 3.3;
    for (const [px, pz, col] of [[-half, -half, 0xd62839], [half, -half, 0x2f6fe0], [-half, half, 0x2f6fe0], [half, half, 0xd62839]] as const) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(px, 0.75, pz);
      post.castShadow = true;
      S.add(post);
      const padMat = keep(new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }));
      for (const y of [0.55, 0.9, 1.25]) {
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.set(px - Math.sign(px) * 0.04, y, pz - Math.sign(pz) * 0.04);
        S.add(pad);
      }
    }
    const ropeGeo = keep(new THREE.CylinderGeometry(0.026, 0.026, half * 2, 8));
    [0.55, 0.9, 1.25].forEach((y, i) => {
      for (const s of [-1, 1]) {
        const a = new THREE.Mesh(ropeGeo, ropeMats[i]!);
        a.rotation.z = Math.PI / 2;
        a.position.set(0, y, s * half);
        S.add(a);
        const b = new THREE.Mesh(ropeGeo, ropeMats[i]!);
        b.rotation.x = Math.PI / 2;
        b.position.set(s * half, y, 0);
        S.add(b);
      }
    });
  }

  private buildCrowd() {
    const geo = this.keep(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8));
    const mat = this.keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
    const count = 520;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const base: THREE.Matrix4[] = [];
    const phase: number[] = [];
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const ring = Math.floor(i / 130);
      const a = (i % 130) / 130 * Math.PI * 2 + Math.random() * 0.04;
      const rad = 7.5 + ring * 1.6 + Math.random() * 0.4;
      const m = new THREE.Matrix4().compose(V(Math.cos(a) * rad, 0.5 + ring * 0.8, Math.sin(a) * rad), new THREE.Quaternion(), V(1, 1 + Math.random() * 0.3, 1));
      base.push(m);
      phase.push(Math.random() * 10);
      mesh.setMatrixAt(i, m);
      color.setHSL(Math.random(), 0.25 + Math.random() * 0.3, 0.1 + Math.random() * 0.14);
      mesh.setColorAt(i, color);
    }
    this.scene.add(mesh);
    return { mesh, base, phase };
  }

  private keep<T extends { dispose(): void }>(o: T) {
    this.owned.push(o);
    return o;
  }

  private buildGloves() {
    const gloveMat = this.keep(new THREE.MeshStandardMaterial({ color: 0x2f6fe0, roughness: 0.35, metalness: 0.1 }));
    const cuffMat = this.keep(new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.6 }));
    const skin = this.keep(new THREE.MeshStandardMaterial({ color: 0xc68863, roughness: 0.55 }));
    const ball = this.keep(new THREE.SphereGeometry(0.085, 18, 14));
    const thumb = this.keep(new THREE.SphereGeometry(0.04, 10, 8));
    const cuffGeo = this.keep(new THREE.CylinderGeometry(0.058, 0.058, 0.08, 14));
    const armGeo = this.keep(new THREE.CylinderGeometry(0.045, 0.055, 0.7, 12));
    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      const glove = new THREE.Mesh(ball, gloveMat);
      glove.scale.set(1, 0.92, 1.25);
      const th = new THREE.Mesh(thumb, gloveMat);
      th.position.set(-side * 0.07, 0.02, 0.04);
      const cuff = new THREE.Mesh(cuffGeo, cuffMat);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.z = 0.13;
      const arm = new THREE.Mesh(armGeo, skin);
      arm.rotation.x = Math.PI / 2;
      arm.position.z = 0.5;
      g.add(glove, th, cuff, arm);
      this.camera.add(g);
      this.gloves.push(g);
    }
  }

  // ------------------------------------------------------------------ events

  fx(events: FightEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case "hit":
          this.sound?.(e.by === 0 ? "hit" : "hurt", Math.min(1, e.dmg / 14));
          if (e.target === 0) {
            this.kick = Math.min(1.6, this.kick + e.dmg / 9);
            this.roll = (Math.random() - 0.5) * (0.06 + e.dmg * 0.012);
            this.hurt?.(e.dmg);
          } else this.sweatBurst(e.dmg);
          break;
        case "block":
          this.sound?.("block", 0.6);
          if (e.target === 0) this.kick = Math.min(1.6, this.kick + 0.15);
          break;
        case "whiff":
          this.sound?.("whoosh", 0.5);
          break;
        case "slip":
          this.sound?.("whoosh", 0.8);
          break;
        case "punch":
          this.sound?.("whoosh", 0.25);
          break;
        case "down":
          this.sound?.("thud", 1);
          this.kick = 2;
          break;
        case "bell":
          this.sound?.("bell", 1);
          break;
        case "count":
          this.sound?.("beep", 0.6);
          break;
      }
    }
  }

  private sweatBurst(power: number) {
    const o = this.foe.root.position;
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(this.sweatGeo, this.sweat);
      m.position.set(o.x + (Math.random() - 0.5) * 0.2, 1.55, o.z + (Math.random() - 0.5) * 0.2);
      this.scene.add(m);
      this.bits.push({ mesh: m, vel: V((Math.random() - 0.5) * 2.4, 0.8 + Math.random() * 1.5, (Math.random() - 0.5) * 2.4 + power * 0.05), life: 0.7 });
    }
  }

  // ------------------------------------------------------------------- frame

  frame(fight: Fight, dt: number) {
    this.time += dt;
    const me = fight.f[0];
    const foe = fight.f[1];
    this.foe.update(foe, me, dt);

    // The crowd sways, and surges a little.
    const { mesh, base, phase } = this.crowd;
    const m = new THREE.Matrix4();
    const pos = V();
    const q = new THREE.Quaternion();
    const sc = V();
    for (let i = 0; i < base.length; i++) {
      m.copy(base[i]!);
      m.decompose(pos, q, sc);
      pos.y += Math.max(0, Math.sin(this.time * 3 + phase[i]!)) * 0.06;
      mesh.setMatrixAt(i, m.compose(pos, q, sc));
    }
    mesh.instanceMatrix.needsUpdate = true;

    // Sweat droplets.
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i]!;
      b.life -= dt;
      b.vel.y -= 9 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        this.bits.splice(i, 1);
      }
    }

    // The camera is your head.
    const dx = foe.x - me.x;
    const dz = foe.z - me.z;
    const want = Math.atan2(dx, dz);
    let dy = want - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 9);
    const lean = me.leanT > 0 ? ease(Math.min(1, me.leanT / 0.15)) * me.leanDir : 0;
    const duck = me.duck ? 1 : 0;
    this.fallCam = lerp(this.fallCam, me.down !== null ? 1 : 0, me.down !== null ? 0.12 : 0.05);
    this.bob += dt * 7 * (Math.abs(me.x) > 0 ? 1 : 1);
    this.kick = Math.max(0, this.kick - dt * 3.2);
    const k = this.kick * this.kick;
    const shake = k * 0.05;
    const side = V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const eye = V(me.x, 1.72 - duck * 0.4 - this.fallCam * 1.2 + Math.sin(this.bob) * 0.008, me.z)
      .addScaledVector(side, lean * 0.28)
      .add(V((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    this.camera.position.copy(eye);
    const look = V(foe.x, 1.5 - this.fallCam * 1.3, foe.z);
    this.camera.lookAt(look);
    this.camera.rotateZ(-lean * 0.1 + this.roll * this.kick + this.fallCam * 0.5);
    this.camera.rotateX(-this.kick * 0.05 + this.fallCam * 0.3);
    this.roll *= 0.97;
    const wantFov = 66 + (me.act ? 2 : 0) - duck * 0;
    this.fov = lerp(this.fov, wantFov, 0.2);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    this.poseGloves(me);
    this.renderer.render(this.scene, this.camera);
  }

  /** Your own hands, in front of the camera. */
  private poseGloves(me: Fighter) {
    const [L, R] = this.gloves as [THREE.Group, THREE.Group];
    const t = this.time;
    const idle = (side: number) => (me.guard ? V(side * 0.13, -0.13, -0.5) : V(side * 0.26, -0.27, -0.46));
    const poses = [idle(-1), idle(1)];
    const rots = [V(0, 0, 0), V(0, 0, 0)];
    poses[0]!.y += Math.sin(t * 5) * 0.004;
    poses[1]!.y += Math.cos(t * 5) * 0.004;
    if (me.act) {
      const spec = PUNCH[me.act.kind];
      const hand = me.act.kind === "jab" || me.act.kind === "hook" ? 0 : 1;
      const side = hand === 0 ? -1 : 1;
      let from: THREE.Vector3;
      let end: THREE.Vector3;
      switch (me.act.kind) {
        case "jab":
          from = V(side * 0.22, -0.22, -0.3);
          end = V(side * 0.03, -0.02, -1.15);
          break;
        case "cross":
          from = V(side * 0.3, -0.3, -0.25);
          end = V(side * 0.0, -0.03, -1.2);
          break;
        case "hook":
          from = V(side * 0.75, -0.12, -0.5);
          end = V(side * -0.02, -0.04, -0.95);
          break;
        default:
          from = V(side * 0.18, -0.62, -0.5);
          end = V(side * 0.04, -0.06, -0.95);
      }
      const p = me.act.t;
      const idlePos = poses[hand]!.clone();
      let pos: THREE.Vector3;
      if (p < spec.wind) pos = idlePos.lerp(from, ease(p / spec.wind));
      else if (p < spec.wind + spec.act) pos = from.clone().lerp(end, ease((p - spec.wind) / spec.act));
      else pos = end.clone().lerp(idlePos, ease((p - spec.wind - spec.act) / spec.rec));
      poses[hand] = pos;
      if (me.act.kind === "hook") rots[hand]!.set(0, side * -0.9 * (1 - Math.min(1, Math.abs(pos.x) / 0.75)), 0);
    }
    [L, R].forEach((g, i) => {
      g.position.copy(poses[i]!);
      g.rotation.set(rots[i]!.x, rots[i]!.y, rots[i]!.z);
    });
  }

  resize() {
    const host = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.cleanup.forEach((f) => f());
    this.owned.forEach((o) => o.dispose());
    this.foe.owned.forEach((o) => o.dispose());
    this.crowd.mesh.dispose();
    this.renderer.dispose();
  }
}
