import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import type { Compound, Plan, Team, Track } from "@boredgames/f1";
import { TYRE_RADIUS, buildCar, makeCarMaterials, setCompound, type CarMaterials, type CarRig } from "./carModel";
import { cloudTexture, puffTexture } from "./textures";
import { buildWorld, type Style, type World } from "./world";

export type CameraMode = "chase" | "close" | "cockpit" | "top";
export type { Style };

export interface SceneCar {
  id: string;
  team: Team;
  compound: Compound;
  name: string;
  helmet: string;
  /** The car this player drives: no name tag. */
  mine: boolean;
  number?: number;
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
  /** Accelerations in the car frame, m/s². */
  ax?: number;
  ay?: number;
  /** Is the car braking hard with a lot of speed: brake glow. */
  rear?: boolean;
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

const px = (x: number) => x;
const pz = (y: number) => -y;

const hashNum = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

interface CarMesh {
  rig: CarRig;
  group: THREE.Group;
  label: THREE.Sprite | null;
  spin: number;
  compound: Compound;
  shadow: THREE.Mesh;
  helmet: THREE.Object3D[];
  roll: number;
  pitch: number;
}

/** Vignette, a touch of radial blur at speed and a faint grain, in one pass. */
const FinishShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, speed: { value: 0 }, time: { value: 0 }, vignette: { value: 0.28 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float speed; uniform float time; uniform float vignette; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - vec2(0.5, 0.46);
      float r = length(d);
      float blur = speed * smoothstep(0.18, 0.75, r);
      vec3 c = vec3(0.0);
      float total = 0.0;
      for (int i = 0; i < 7; i++) {
        float k = float(i) / 6.0;
        float w = 1.0 - k * 0.5;
        c += texture2D(tDiffuse, vUv - d * blur * 0.07 * k).rgb * w;
        total += w;
      }
      c /= total;
      // Slight colour split towards the edges.
      float ca = 0.0016 * smoothstep(0.3, 0.8, r);
      c.r = mix(c.r, texture2D(tDiffuse, vUv - d * ca * 6.0).r, 0.6);
      c.b = mix(c.b, texture2D(tDiffuse, vUv + d * ca * 6.0).b, 0.6);
      float v = smoothstep(0.95, 0.25, r * (1.0 + vignette));
      c *= mix(1.0 - vignette, 1.0, v);
      c += (hash(vUv * 1000.0 + time) - 0.5) * 0.012;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class F1Scene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, 1, 0.2, 7000);
  private cars = new Map<string, CarMesh>();
  private world: World;
  private mats: CarMaterials;
  private sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  private hemi = new THREE.HemisphereLight(0xcfe3f7, 0x6a7a52, 0.55);
  private sky: Sky;
  private clouds: THREE.Mesh;
  private rain!: THREE.LineSegments;
  private rainPos!: Float32Array;
  private particles!: THREE.Points;
  private N = 700;
  private pPos = new Float32Array(this.N * 3);
  private pVel = new Float32Array(this.N * 3);
  private pLife = new Float32Array(this.N);
  private pCol = new Float32Array(this.N * 3);
  private pCursor = 0;
  private camPos = new THREE.Vector3();
  private camYaw = 0;
  private camInit = false;
  private mode: CameraMode = "chase";
  private shake = 0;
  private disposed = false;
  private shadowTex: THREE.Texture;
  private time = 0;
  private composer: EffectComposer | null = null;
  private finish: ShaderPass | null = null;
  private roll = 0;
  private wheelMesh: THREE.Group;
  private guide: { plan: Plan; mesh: THREE.Mesh; colors: Float32Array; lit: number; last: number } | null = null;
  private speedBlur = 0;
  private focusPos = new THREE.Vector3();
  private skyScene = new THREE.Scene();

  constructor(
    private canvas: HTMLCanvasElement,
    private track: Track,
    cars: SceneCar[],
    private style: Style,
    private opts: { quality?: "low" | "high" } = {},
  ) {
    const high = opts.quality !== "low";
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !high, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 2 : 1));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.64;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.fog = new THREE.Fog(0xbcd3e8, 500, 4200);

    this.mats = makeCarMaterials();
    this.shadowTex = this.makeShadowTexture();
    this.world = buildWorld(this.scene, track, style);
    this.sky = this.buildSky();
    this.clouds = this.buildClouds();
    this.buildEnvironment();
    this.buildRain();
    this.buildParticles();
    this.wheelMesh = this.buildSteeringWheel();

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -60;
    sc.right = 60;
    sc.top = 60;
    sc.bottom = -60;
    sc.near = 10;
    sc.far = 600;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    for (const c of cars) this.addCar(c);
    this.setupPost(high);
    this.resize();
  }

  // --------------------------------------------------------------- build

  private makeShadowTexture(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,0,0,0.6)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  private buildSky(): Sky {
    const sky = new Sky();
    sky.scale.setScalar(3200);
    const u = sky.material.uniforms;
    u.turbidity!.value = 4.2;
    u.rayleigh!.value = 1.5;
    u.mieCoefficient!.value = 0.004;
    u.mieDirectionalG!.value = 0.82;
    u.sunPosition!.value.copy(this.world.sunDir);
    this.scene.add(sky);
    return sky;
  }

  private buildClouds(): THREE.Mesh {
    const tex = cloudTexture();
    tex.repeat.set(3, 1.5);
    const geo = new THREE.SphereGeometry(3000, 40, 16, 0, Math.PI * 2, 0, Math.PI * 0.46);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false, opacity: 0.55 }));
    m.position.copy(this.world.centre);
    m.renderOrder = -1;
    this.scene.add(m);
    return m;
  }

  /** Bake the sky into reflections for the paint and the wet road. */
  private buildEnvironment() {
    const env = new THREE.Scene();
    const sky = new Sky();
    sky.scale.setScalar(450);
    const u = sky.material.uniforms;
    u.turbidity!.value = 4.2;
    u.rayleigh!.value = 1.5;
    u.mieCoefficient!.value = 0.004;
    u.mieDirectionalG!.value = 0.82;
    u.sunPosition!.value.copy(this.world.sunDir);
    env.add(sky);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(300, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: this.style === "desert" ? 0xb59e78 : this.style === "city" ? 0x6c6f74 : 0x4f6a3d }));
    ground.position.y = -2;
    env.add(ground);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(env, 0.02).texture;
    this.scene.environmentIntensity = 0.9;
    pm.dispose();
    sky.geometry.dispose();
    this.skyScene = env;
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
      new THREE.PointsMaterial({ size: 3.4, map: puffTexture(), vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true }),
    );
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
    for (let i = 0; i < this.N; i++) this.pPos[i * 3 + 1] = -100;
  }

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, c: THREE.Color) {
    const i = this.pCursor++ % this.N;
    this.pPos.set([x, y, z], i * 3);
    this.pVel.set([vx, vy, vz], i * 3);
    this.pLife[i] = life;
    this.pCol.set([c.r, c.g, c.b], i * 3);
  }

  /** The wheel you see from the cockpit. */
  private buildSteeringWheel(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.3), new THREE.MeshPhysicalMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.6, clearcoat: 0.8 }));
    g.add(body);
    for (const s of [-1, 1]) {
      const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.16, 4, 8), new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.95 }));
      grip.position.set(0, -0.01, s * 0.2);
      grip.rotation.x = 0.15 * s;
      g.add(grip);
    }
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.06), new THREE.MeshBasicMaterial({ color: 0x38e8b0 }));
    screen.position.set(-0.032, 0.02, 0);
    screen.rotation.y = -Math.PI / 2;
    g.add(screen);
    g.position.set(0.82, 0.56, 0);
    g.rotation.z = 0.7;
    g.visible = false;
    return g;
  }

  private addCar(c: SceneCar) {
    const number = c.number ?? (hashNum(c.id) % 98) + 1;
    const rig = buildCar(c.team, c.helmet, number, c.compound, this.mats);
    const helmet = rig.group.children.filter((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.type === "SphereGeometry");
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.4), new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, opacity: 0.55 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(-0.1, 0.05, 0);
    rig.group.add(shadow);
    rig.body.forEach((m) => (m.receiveShadow = true));
    let label: THREE.Sprite | null = null;
    if (!c.mine) {
      label = this.makeLabel(c.name, c.team.color);
      label.position.set(0, 2.3, 0);
      rig.group.add(label);
    }
    // The outer group carries heading; the inner one carries roll and pitch.
    const outer = new THREE.Group();
    outer.add(rig.group);
    if (c.mine) {
      rig.group.add(this.wheelMesh);
    }
    this.scene.add(outer);
    this.cars.set(c.id, { rig, group: outer, label, spin: 0, compound: c.compound, shadow, helmet, roll: 0, pitch: 0 });
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
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
    s.scale.set(0.2, 0.05, 1);
    s.renderOrder = 10;
    return s;
  }

  private setupPost(high: boolean) {
    if (!high) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
  }

  // -------------------------------------------------------------- guide

  /** The racing line, drawn on the road ahead of the player: green to go, yellow to lift, red to brake. */
  setGuide(plan: Plan | null) {
    if (this.guide) {
      this.scene.remove(this.guide.mesh);
      this.guide.mesh.geometry.dispose();
      this.guide = null;
    }
    if (!plan) return;
    const n = plan.n;
    const pos: number[] = [];
    const idx: number[] = [];
    const t = this.track;
    for (let k = 0; k <= n; k++) {
      const i = k % n;
      const j = (i + 1) % n;
      const dx = plan.x[j]! - plan.x[i]!;
      const dy = plan.y[j]! - plan.y[i]!;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      for (const o of [-0.55, 0.55]) pos.push(px(plan.x[i]! + nx * o), 0.045, pz(plan.y[i]! + ny * o));
    }
    for (let k = 0; k < n; k++) {
      const v = k * 2;
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
    void t;
    const colors = new Float32Array((n + 1) * 2 * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const attr = new THREE.BufferAttribute(colors, 4);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("color", attr);
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
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, fog: false }));
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    this.guide = { plan, mesh, colors, lit: 0, last: -1 };
  }

  get guidePlan(): Plan | null {
    return this.guide?.plan ?? null;
  }

  /** Colour the stretch of line ahead of the car for what the driver should be doing there. */
  updateGuide(s: number, speed: number, visible: boolean) {
    const gd = this.guide;
    if (!gd) return;
    gd.mesh.visible = visible;
    if (!visible) return;
    const plan = gd.plan;
    const n = plan.n;
    const ds = plan.ds;
    const here = Math.floor(s / ds);
    const ahead = 72;
    // Clear what was lit last time.
    if (gd.last >= 0) {
      for (let k = 0; k < ahead + 4; k++) {
        const i = (gd.last + k) % n;
        gd.colors.fill(0, i * 8, i * 8 + 8);
        if (i === n - 1) gd.colors.fill(0, n * 8, n * 8 + 8);
      }
    }
    for (let k = 0; k < ahead; k++) {
      const i = (here + k + 1) % n;
      const dist = (k + 1) * ds;
      const vp = plan.v[i]!;
      // Deceleration needed to be at the planned speed by there.
      const need = speed > vp ? (speed * speed - vp * vp) / (2 * Math.max(dist - 6, 4)) : 0;
      let r = 0.2;
      let g = 0.95;
      let b = 0.35;
      if (need > 7) {
        r = 1;
        g = 0.12;
        b = 0.12;
      } else if (need > 1.8) {
        const f = (need - 1.8) / 5.2;
        r = 0.2 + 0.8 * f + 0.2;
        g = 0.95 - 0.8 * f;
        b = 0.2 - 0.08 * f;
        if (f < 0.4) {
          r = 1;
          g = 0.85;
          b = 0.1;
        }
      }
      const fade = Math.min(1, dist / 14) * Math.max(0, 1 - dist / (ahead * ds));
      const a = 0.72 * fade;
      for (const o of [i * 8, i * 8 + 4]) {
        gd.colors[o] = r;
        gd.colors[o + 1] = g;
        gd.colors[o + 2] = b;
        gd.colors[o + 3] = a;
      }
      if (i === n - 1) {
        for (const o of [n * 8, n * 8 + 4]) {
          gd.colors[o] = r;
          gd.colors[o + 1] = g;
          gd.colors[o + 2] = b;
          gd.colors[o + 3] = a;
        }
      }
    }
    gd.last = here + 1;
    (gd.mesh.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  // ---------------------------------------------------------------- frame

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setCamera(mode: CameraMode) {
    this.mode = mode;
  }

  setLights(count: number) {
    this.world.lights.forEach((m, i) => (m.material as THREE.MeshBasicMaterial).color.set(i < count ? 0xff2a1a : 0x2e0808));
  }

  update(dt: number, cars: CarFrame[], focusId: string, env: EnvFrame) {
    if (this.disposed) return;
    this.time += dt;
    let focus: CarFrame | null = null;
    for (const f of cars) if (f.id === focusId) focus = f;
    const showHelmet = this.mode !== "cockpit";

    for (const f of cars) {
      const m = this.cars.get(f.id);
      if (!m) continue;
      m.group.position.set(px(f.x), 0, pz(f.y));
      m.group.rotation.y = f.psi;
      // Body roll with lateral load and pitch with braking and power.
      const speed = Math.hypot(f.u, f.v);
      const rollT = Math.max(-0.05, Math.min(0.05, (f.ay ?? 0) * 0.0016));
      const pitchT = Math.max(-0.04, Math.min(0.04, (f.ax ?? 0) * 0.0007));
      const k = Math.min(1, dt * 9);
      m.roll += (rollT - m.roll) * k;
      m.pitch += (pitchT - m.pitch) * k;
      m.rig.group.rotation.x = m.roll;
      m.rig.group.rotation.z = m.pitch;
      m.spin += (f.u / TYRE_RADIUS) * dt;
      for (const s of m.rig.spinners) s.rotation.z = -m.spin;
      for (const h of m.rig.fronts) h.rotation.y = f.delta;
      if (f.compound !== m.compound) {
        m.compound = f.compound;
        setCompound(m.rig, this.mats, f.compound);
      }
      m.rig.flap.rotation.z = f.drs ? 0.62 : 0;
      (m.rig.brakeLight.material as THREE.MeshBasicMaterial).color.set(f.brake > 0.1 || env.rain > 0.25 ? (f.brake > 0.1 ? 0xff2020 : 0x992020) : 0x3a0000);
      const glow = f.brake > 0.5 && speed > 40 ? Math.min(0.85, (f.brake - 0.4) * 0.9 * Math.min(1, speed / 80)) : 0;
      for (const g of m.rig.glows) (g.material as THREE.MeshBasicMaterial).opacity += (glow - (g.material as THREE.MeshBasicMaterial).opacity) * Math.min(1, dt * 8);
      if (f.id === focusId) for (const h of m.helmet) h.visible = showHelmet;
      if (m.label) {
        const d = Math.hypot(f.x - (focus?.x ?? f.x), f.y - (focus?.y ?? f.y));
        m.label.visible = !!focus && d > 14 && d < 140;
      }
      m.shadow.visible = !focus || Math.hypot(f.x - focus.x, f.y - focus.y) > 70;

      // ---- particles: tyre smoke, dust, spray
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

    for (let i = 0; i < this.N; i++) {
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

    this.applyEnvironment(env, dt);
    if (focus) {
      this.followCamera(dt, focus);
      this.focusPos.set(px(focus.x), 0, pz(focus.y));
      this.updateSun();
      this.speedBlur += (Math.min(1, Math.max(0, (Math.hypot(focus.u, focus.v) - 35) / 70)) - this.speedBlur) * Math.min(1, dt * 4);
    }
    const w = this.cars.get(focusId);
    this.wheelMesh.visible = this.mode === "cockpit" && !!w;
    if (focus) this.wheelMesh.rotation.x = -focus.delta * 2.4;
    if (this.rain.visible) this.updateRain(dt);
    this.clouds.rotation.y += dt * 0.0006;
    this.clouds.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.sky.position.set(this.camera.position.x, 0, this.camera.position.z);
    if (this.finish) {
      this.finish.uniforms.speed!.value = this.speedBlur * (this.mode === "top" ? 0 : 1);
      this.finish.uniforms.time!.value = this.time % 10;
    }
  }

  /** The shadow follows the focus car, snapped so it does not shimmer. */
  private updateSun() {
    const snap = (v: number) => Math.round(v / 2) * 2;
    const f = this.focusPos;
    this.sun.target.position.set(snap(f.x), 0, snap(f.z));
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.world.sunDir, 280);
    this.sun.target.updateMatrixWorld();
  }

  private applyEnvironment(env: EnvFrame, dt: number) {
    void dt;
    const cloud = Math.min(1, env.cloud);
    const rain = Math.min(1, env.rain);
    const u = this.sky.material.uniforms;
    u.turbidity!.value = 4.2 + cloud * 14 + rain * 8;
    u.rayleigh!.value = 1.5 - cloud * 0.9 - rain * 0.4;
    u.mieCoefficient!.value = 0.004 + cloud * 0.02;
    const dry = new THREE.Color(this.style === "desert" ? 0xc9dcec : 0xbcd3e8);
    const grey = new THREE.Color(0x8d98a3);
    const dark = new THREE.Color(0x4b535d);
    const fog = dry.clone().lerp(grey, Math.min(1, cloud * 0.85)).lerp(dark, rain * 0.8);
    const f = this.scene.fog as THREE.Fog;
    f.color.copy(fog);
    f.near = 480 - rain * 380;
    f.far = 4200 - rain * 3200 - cloud * 700;
    this.sun.intensity = (this.style === "desert" ? 2.7 : 3.6) * (1 - cloud * 0.7) + 0.2;
    this.hemi.intensity = 0.55 + cloud * 0.35;
    this.scene.environmentIntensity = 0.95 * (1 - cloud * 0.45);
    const cm = this.clouds.material as THREE.MeshBasicMaterial;
    cm.opacity = 0.3 + cloud * 0.7;
    cm.color.setScalar(1 - rain * 0.55);
    const am = this.world.asphaltMat;
    am.roughness = 0.92 - env.wetness * 0.62;
    am.metalness = env.wetness * 0.2;
    am.color.setScalar(1 - env.wetness * 0.3);
    this.rain.visible = rain > 0.03;
    (this.rain.material as THREE.LineBasicMaterial).opacity = 0.15 + rain * 0.5;
    this.renderer.toneMappingExposure = 0.64 - rain * 0.12;
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
      this.camYaw += dy * Math.min(1, dt * (this.mode === "cockpit" ? 60 : 4.5));
    }
    const yaw = this.camYaw;
    const fx = Math.cos(yaw);
    const fz = -Math.sin(yaw);
    const target = new THREE.Vector3();
    const look = new THREE.Vector3();
    let fov = 62;
    // The horizon leans into corners a little.
    const rollT = this.mode === "top" ? 0 : Math.max(-0.05, Math.min(0.05, -(f.ay ?? 0) * 0.0012));
    this.roll += (rollT - this.roll) * Math.min(1, dt * 4);
    if (this.mode === "chase") {
      target.set(x - fx * 8.2, 2.6 + Math.min(0.6, speed * 0.003), z - fz * 8.2);
      look.set(x + fx * 16, 0.95, z + fz * 16);
      fov = 60 + Math.min(20, speed * 0.075);
    } else if (this.mode === "close") {
      target.set(x - fx * 4.9, 1.45, z - fz * 4.9);
      look.set(x + fx * 14, 0.8, z + fz * 14);
      fov = 66 + Math.min(20, speed * 0.075);
    } else if (this.mode === "cockpit") {
      const cp = Math.cos(f.psi);
      const sp = Math.sin(f.psi);
      target.set(x + cp * 0.42, 0.86, z - sp * 0.42);
      // Head turns into the corner.
      const a = f.psi + Math.max(-0.5, Math.min(0.5, f.delta * 0.9));
      look.set(x + Math.cos(a) * 30, 0.82, z - Math.sin(a) * 30);
      fov = 84 + Math.min(14, speed * 0.05);
    } else {
      target.set(x - fx * 6, 80, z - fz * 6);
      look.set(x + fx * 10, 0, z + fz * 10);
      fov = 52;
    }
    if (this.mode === "cockpit") this.camPos.copy(target);
    else this.camPos.lerp(target, Math.min(1, dt * 12));
    this.shake = Math.max(this.shake - dt * 3, f.impact);
    const rumble = this.mode === "cockpit" || this.mode === "close" ? Math.min(0.02, speed * 0.00008) : 0;
    const shakeAmt = this.shake * 0.6 + rumble + (f.offTrack ? Math.min(0.12, speed * 0.002) : 0);
    this.camera.position.copy(this.camPos);
    if (shakeAmt > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * shakeAmt;
    }
    this.camera.up.set(Math.sin(this.roll), Math.cos(this.roll), 0);
    this.camera.lookAt(look);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }
  }

  render() {
    if (this.disposed) return;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
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
    this.skyScene.clear();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
