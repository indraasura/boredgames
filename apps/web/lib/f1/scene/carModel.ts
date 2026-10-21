import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { COMPOUNDS, type Compound, type Team } from "@boredgames/f1";
import { carbonTexture, numberTexture } from "./textures";

/**
 * A Formula 1 car built from smooth lofted sections rather than boxes: nose, monocoque, engine cover,
 * sidepods, wings, halo, suspension, and wheels with real tyre profiles. Origin on the ground below the
 * centre of gravity, x forward, y up.
 */

export const TYRE_RADIUS = 0.355;
const FRONT_AXLE = 1.96;
const REAR_AXLE = -1.64;
const HUB_Z = 0.8;

interface Station {
  x: number;
  y0: number;
  y1: number;
  hw: number;
  cz?: number;
  /** Superellipse exponent: 2 is an ellipse, higher is boxier. */
  p?: number;
}

type ColorFn = (x: number, y: number, z: number, lower: number) => THREE.Color;

const sgnPow = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;

/** Smooth tube through cross-sections, closed at both ends. `lower` is 0 at the top of a ring and 1 at the bottom. */
function loft(stations: Station[], segs: number, color: ColorFn, endColor?: THREE.Color): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const ringStart: number[] = [];
  for (const st of stations) {
    ringStart.push(pos.length / 3);
    const p = st.p ?? 2.6;
    const cz = st.cz ?? 0;
    const yc = (st.y0 + st.y1) / 2;
    const hh = (st.y1 - st.y0) / 2;
    for (let k = 0; k < segs; k++) {
      const th = (k / segs) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const z = cz + st.hw * sgnPow(c, 2 / p);
      const y = yc + hh * sgnPow(s, 2 / p);
      const lower = Math.max(0, -s);
      const clr = color(st.x, y, z, lower);
      pos.push(st.x, y, z);
      col.push(clr.r, clr.g, clr.b);
    }
  }
  for (let r = 0; r < stations.length - 1; r++) {
    const a = ringStart[r]!;
    const b = ringStart[r + 1]!;
    for (let k = 0; k < segs; k++) {
      const k2 = (k + 1) % segs;
      idx.push(a + k, b + k, a + k2, a + k2, b + k, b + k2);
    }
  }
  // End caps.
  const cap = (ring: number, flip: boolean) => {
    const st = stations[ring]!;
    const base = ringStart[ring]!;
    const centre = pos.length / 3;
    const cz = st.cz ?? 0;
    const c = endColor ?? color(st.x, (st.y0 + st.y1) / 2, cz, 0);
    pos.push(st.x, (st.y0 + st.y1) / 2, cz);
    col.push(c.r, c.g, c.b);
    for (let k = 0; k < segs; k++) {
      const k2 = (k + 1) % segs;
      if (flip) idx.push(centre, base + k2, base + k);
      else idx.push(centre, base + k, base + k2);
    }
  };
  cap(0, false);
  cap(stations.length - 1, true);

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Make sure the surface faces outwards: compare face normals with the direction away from the spine.
  const nrm = g.attributes.normal!;
  let facing = 0;
  const mid = stations[Math.floor(stations.length / 2)]!;
  for (let k = 0; k < segs; k += 3) {
    const i = ringStart[Math.floor(stations.length / 2)]! + k;
    const dz = g.attributes.position!.getZ(i) - (mid.cz ?? 0);
    const dy = g.attributes.position!.getY(i) - (mid.y0 + mid.y1) / 2;
    facing += nrm.getZ(i) * dz + nrm.getY(i) * dy;
  }
  if (facing < 0) {
    const ix = g.index!.array as Uint32Array | Uint16Array;
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1]!;
      ix[i + 1] = ix[i + 2]!;
      ix[i + 2] = t;
    }
    g.computeVertexNormals();
  }
  return g;
}

function flat(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const n = g.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

function slab(w: number, h: number, d: number, x: number, y: number, z: number, c: THREE.Color, rz = 0, ry = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return flat(g, c);
}

/** Strip the extra attributes so geometries can be merged. */
function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) if (!["position", "normal", "color"].includes(name)) out.deleteAttribute(name);
  return out;
}

/** A thin tube between two points. */
function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, c: THREE.Color): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 6);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return flat(g, c);
}

// ---------------------------------------------------------------------- materials

export interface CarMaterials {
  paint: THREE.MeshPhysicalMaterial;
  carbon: THREE.MeshPhysicalMaterial;
  tyre: THREE.MeshStandardMaterial;
  rim: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  visor: THREE.MeshPhysicalMaterial;
  rings: Map<Compound, THREE.MeshBasicMaterial>;
}

export function makeCarMaterials(): CarMaterials {
  const carbonMap = carbonTexture();
  carbonMap.repeat.set(2, 2);
  return {
    paint: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.1, clearcoat: 0.35, clearcoatRoughness: 0.1, envMapIntensity: 0.4 }),
    carbon: new THREE.MeshPhysicalMaterial({ vertexColors: true, map: carbonMap, roughness: 0.42, metalness: 0.55, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 1.0 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x0f0f11, roughness: 0.93, metalness: 0 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x2b2e34, roughness: 0.4, metalness: 0.85, emissive: 0x000000 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.9 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x07080a, roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2 }),
    rings: new Map(),
  };
}

function ringMat(m: CarMaterials, c: Compound): THREE.MeshBasicMaterial {
  let r = m.rings.get(c);
  if (!r) {
    r = new THREE.MeshBasicMaterial({ color: COMPOUNDS[c].color });
    m.rings.set(c, r);
  }
  return r;
}

// ---------------------------------------------------------------------- body

/** The painted and carbon parts of a team's car, built once per team. */
export interface CarGeometry {
  paint: THREE.BufferGeometry;
  carbon: THREE.BufferGeometry;
  /** Rear wing flap, pivoting about its own leading edge at the origin. */
  flap: THREE.BufferGeometry;
}

export function buildCarGeometry(team: Team): CarGeometry {
  const main = new THREE.Color(team.color).multiplyScalar(0.82);
  const accent = new THREE.Color(team.accent);
  const carbon = new THREE.Color("#17191d");
  const dark = new THREE.Color("#08090b");
  const white = new THREE.Color("#f2f2f2");
  const paint: THREE.BufferGeometry[] = [];
  const cf: THREE.BufferGeometry[] = [];
  const P = (g: THREE.BufferGeometry) => paint.push(plain(g));
  const C = (g: THREE.BufferGeometry) => cf.push(plain(g));

  // Livery: body colour on top, carbon underneath, a stripe down the nose and engine cover.
  const bodyColor: ColorFn = (x, _y, z, lower) => {
    if (lower > 0.55) return carbon;
    if (Math.abs(z) < 0.045 && x > -2.2 && x < 3.1) return accent;
    if (x > 2.85) return white;
    return main;
  };
  const podColor: ColorFn = (x, _y, _z, lower) => {
    if (lower > 0.45) return carbon;
    if (x > 0.78) return dark;
    if (x < -0.3 && x > -0.7) return accent;
    return main;
  };

  // Nose, monocoque and engine cover in one smooth piece.
  P(
    loft(
      [
        { x: 3.1, y0: 0.18, y1: 0.25, hw: 0.04, p: 2.4 },
        { x: 2.75, y0: 0.16, y1: 0.29, hw: 0.075, p: 2.5 },
        { x: 2.25, y0: 0.15, y1: 0.35, hw: 0.12, p: 2.6 },
        { x: 1.7, y0: 0.14, y1: 0.43, hw: 0.19, p: 2.8 },
        { x: 1.2, y0: 0.13, y1: 0.53, hw: 0.25, p: 3 },
        { x: 0.8, y0: 0.12, y1: 0.58, hw: 0.29, p: 3.2 },
        { x: 0.35, y0: 0.12, y1: 0.58, hw: 0.3, p: 3.2 },
        { x: -0.1, y0: 0.12, y1: 0.66, hw: 0.28, p: 3 },
        { x: -0.7, y0: 0.13, y1: 0.7, hw: 0.25, p: 2.8 },
        { x: -1.3, y0: 0.14, y1: 0.6, hw: 0.2, p: 2.6 },
        { x: -1.95, y0: 0.17, y1: 0.48, hw: 0.14, p: 2.4 },
        { x: -2.5, y0: 0.22, y1: 0.4, hw: 0.08, p: 2.2 },
      ],
      28,
      bodyColor,
    ),
  );

  // Sidepods with their dark inlets and a narrow "coke bottle" tail.
  for (const side of [1, -1]) {
    P(
      loft(
        [
          { x: 0.98, y0: 0.14, y1: 0.5, hw: 0.14, cz: 0.4 * side, p: 3.2 },
          { x: 0.55, y0: 0.13, y1: 0.54, hw: 0.21, cz: 0.5 * side, p: 3 },
          { x: -0.15, y0: 0.13, y1: 0.48, hw: 0.24, cz: 0.55 * side, p: 2.8 },
          { x: -0.85, y0: 0.13, y1: 0.4, hw: 0.2, cz: 0.5 * side, p: 2.7 },
          { x: -1.45, y0: 0.14, y1: 0.32, hw: 0.14, cz: 0.38 * side, p: 2.5 },
          { x: -2.0, y0: 0.16, y1: 0.27, hw: 0.08, cz: 0.25 * side, p: 2.3 },
        ],
        24,
        podColor,
        dark,
      ),
    );
    // Mirror stalk and glass.
    C(strut(new THREE.Vector3(0.9, 0.55, 0.27 * side), new THREE.Vector3(0.95, 0.66, 0.4 * side), 0.012, carbon));
    P(slab(0.07, 0.045, 0.1, 0.97, 0.66, 0.43 * side, dark));
    // Bargeboards: thin vertical plates ahead of the sidepod.
    C(slab(0.55, 0.22, 0.015, 1.05, 0.25, 0.62 * side, carbon, 0, 0.05 * side));
    C(slab(0.42, 0.16, 0.015, 0.85, 0.22, 0.74 * side, carbon, 0, 0.18 * side));
    // Exhaust.
    C(strut(new THREE.Vector3(-2.25, 0.42, 0.04 * side), new THREE.Vector3(-2.55, 0.46, 0.04 * side), 0.045, dark));
  }

  // Airbox over the driver's head and the shark fin behind it.
  P(
    loft(
      [
        { x: -0.02, y0: 0.68, y1: 0.78, hw: 0.1, p: 2.6 },
        { x: -0.2, y0: 0.66, y1: 1.0, hw: 0.17, p: 2.6 },
        { x: -0.7, y0: 0.66, y1: 0.94, hw: 0.13, p: 2.4 },
        { x: -1.2, y0: 0.62, y1: 0.8, hw: 0.07, p: 2.2 },
      ],
      20,
      (_x, y, _z, lower) => (lower > 0.5 ? carbon : y > 0.8 ? main : main),
      dark,
    ),
  );
  const fin = new THREE.Shape();
  fin.moveTo(-0.7, 0.64);
  fin.lineTo(-1.15, 0.84);
  fin.lineTo(-2.3, 0.5);
  fin.lineTo(-2.3, 0.4);
  fin.lineTo(-0.7, 0.6);
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.025, bevelEnabled: false });
  finGeo.translate(0, 0, -0.0125);
  P(flat(finGeo, accent));

  // Floor, diffuser and the beam wing.
  C(slab(4.2, 0.045, 1.5, -0.3, 0.09, 0, carbon));
  C(slab(0.9, 0.03, 1.16, -2.15, 0.2, 0, carbon, 0.2));
  C(slab(0.5, 0.025, 0.95, -2.34, 0.34, 0, carbon, -0.06));
  for (const side of [1, -1]) {
    C(slab(0.9, 0.12, 0.015, -2.05, 0.17, 0.57 * side, carbon));
    C(slab(0.5, 0.1, 0.012, -0.5, 0.15, 0.76 * side, carbon));
  }

  // Front wing: main plane, two flaps, nose pylon and big endplates.
  C(slab(0.5, 0.028, 1.98, 3.12, 0.085, 0, carbon, 0.04));
  P(slab(0.34, 0.022, 1.86, 3.0, 0.15, 0, accent, -0.18));
  P(slab(0.26, 0.02, 1.7, 2.93, 0.205, 0, main, -0.3));
  for (const side of [1, -1]) {
    P(slab(0.62, 0.3, 0.022, 3.06, 0.2, 0.99 * side, accent));
    C(slab(0.62, 0.035, 0.12, 3.06, 0.055, 0.96 * side, carbon));
    C(slab(0.4, 0.1, 0.014, 2.85, 0.14, 0.62 * side, carbon));
  }
  C(slab(0.55, 0.11, 0.03, 2.82, 0.2, 0, carbon));

  // Rear wing: main plane, endplates, pillar, and the DRS flap as its own piece.
  C(slab(0.36, 0.03, 1.06, -2.45, 0.93, 0, carbon, -0.1));
  C(slab(0.12, 0.45, 0.07, -2.28, 0.68, 0, carbon));
  for (const side of [1, -1]) {
    P(slab(0.78, 0.6, 0.024, -2.46, 0.74, 0.54 * side, main));
    P(slab(0.4, 0.14, 0.026, -2.46, 0.55, 0.54 * side, accent));
  }
  // Rear light panel and crash structure.
  P(slab(0.04, 0.1, 0.24, -2.63, 0.48, 0, new THREE.Color("#2a0000")));

  // Halo and the helmet's surroundings.
  const haloCol = carbon;
  for (const side of [1, -1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.18, 0.6, 0.29 * side),
      new THREE.Vector3(0.45, 0.78, 0.27 * side),
      new THREE.Vector3(0.82, 0.82, 0.14 * side),
      new THREE.Vector3(1.0, 0.72, 0.0),
    ]);
    C(flat(new THREE.TubeGeometry(curve, 14, 0.024, 6, false), haloCol));
  }
  C(strut(new THREE.Vector3(1.04, 0.56, 0), new THREE.Vector3(0.95, 0.77, 0), 0.026, haloCol));
  // Headrest and cockpit rim.
  C(slab(0.2, 0.2, 0.34, 0.08, 0.7, 0, dark));
  const rim = new THREE.TorusGeometry(0.27, 0.025, 6, 20);
  rim.rotateX(Math.PI / 2);
  rim.scale(1.35, 1, 0.9);
  rim.translate(0.55, 0.6, 0);
  C(flat(rim, dark));

  // Rear wing flap: its own geometry, hinged at the front edge.
  const flap = slab(0.3, 0.025, 1.0, -0.15, 0, 0, accent);

  const merge = (parts: THREE.BufferGeometry[]) => {
    const m = mergeGeometries(parts, false)!;
    m.computeVertexNormals();
    return m;
  };
  return { paint: merge(paint), carbon: merge(cf), flap: plain(flap) };
}

// ---------------------------------------------------------------------- wheels

const tyreGeoCache = new Map<number, THREE.BufferGeometry>();

/** A slick tyre with real sidewalls, axis along z. */
function tyreGeometry(width: number): THREE.BufferGeometry {
  let g = tyreGeoCache.get(width);
  if (g) return g;
  const w = width / 2;
  const pts: THREE.Vector2[] = [];
  const profile: [number, number][] = [
    [0.235, -w * 0.9],
    [0.265, -w * 1.0],
    [0.31, -w * 0.98],
    [0.338, -w * 0.9],
    [0.352, -w * 0.72],
    [TYRE_RADIUS, -w * 0.4],
    [TYRE_RADIUS, w * 0.4],
    [0.352, w * 0.72],
    [0.338, w * 0.9],
    [0.31, w * 0.98],
    [0.265, w * 1.0],
    [0.235, w * 0.9],
  ];
  for (const [r, y] of profile) pts.push(new THREE.Vector2(r, y));
  g = new THREE.LatheGeometry(pts, 36);
  g.rotateX(Math.PI / 2);
  tyreGeoCache.set(width, g);
  return g;
}

let coverGeo: THREE.BufferGeometry | null = null;
function wheelCoverGeometry(): THREE.BufferGeometry {
  if (coverGeo) return coverGeo;
  const parts: THREE.BufferGeometry[] = [];
  const disc = new THREE.CylinderGeometry(0.23, 0.23, 0.03, 28);
  disc.rotateX(Math.PI / 2);
  parts.push(plain(flat(disc, new THREE.Color("#2a2d33"))));
  const hub = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12);
  hub.rotateX(Math.PI / 2);
  parts.push(plain(flat(hub, new THREE.Color("#b8bcc4"))));
  // Slits that make the spin visible.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const s = new THREE.BoxGeometry(0.07, 0.025, 0.034);
    s.translate(0.16, 0, 0);
    s.rotateZ(a);
    parts.push(plain(flat(s, new THREE.Color("#07080a"))));
  }
  coverGeo = mergeGeometries(parts, false)!;
  coverGeo.computeVertexNormals();
  return coverGeo;
}

// ---------------------------------------------------------------------- the rig

export interface CarRig {
  group: THREE.Group;
  /** Front wheel holders: rotate about y to steer. */
  fronts: THREE.Group[];
  /** Everything that rolls with the wheel: rotate about z. */
  spinners: THREE.Group[];
  rings: THREE.Mesh[];
  flap: THREE.Group;
  brakeLight: THREE.Mesh;
  glows: THREE.Mesh[];
  body: THREE.Mesh[];
}

const bodyCache = new Map<string, CarGeometry>();

export function buildCar(team: Team, helmet: string, number: number, compound: Compound, mats: CarMaterials): CarRig {
  let geo = bodyCache.get(team.id);
  if (!geo) {
    geo = buildCarGeometry(team);
    bodyCache.set(team.id, geo);
  }
  const group = new THREE.Group();
  const body: THREE.Mesh[] = [];
  const paintMesh = new THREE.Mesh(geo.paint, mats.paint);
  const carbonMesh = new THREE.Mesh(geo.carbon, mats.carbon);
  paintMesh.castShadow = carbonMesh.castShadow = true;
  group.add(paintMesh, carbonMesh);
  body.push(paintMesh, carbonMesh);

  // DRS flap, hinged at its leading edge.
  const flap = new THREE.Group();
  flap.position.set(-2.4, 1.0, 0);
  const flapMesh = new THREE.Mesh(geo.flap, mats.paint);
  flapMesh.castShadow = true;
  flap.add(flapMesh);
  group.add(flap);

  // Driver: helmet, visor, shoulders.
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 14), new THREE.MeshPhysicalMaterial({ color: helmet, roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }));
  helm.position.set(0.38, 0.69, 0);
  helm.scale.set(1.12, 1, 0.95);
  helm.castShadow = true;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.139, 18, 10, -0.9, 1.8, 1.0, 0.65), mats.visor);
  visor.position.copy(helm.position);
  visor.scale.copy(helm.scale);
  visor.rotation.y = Math.PI / 2 - 0.08;
  group.add(helm, visor);

  // Number decals on the sidepods and nose.
  const dark = new THREE.Color(team.color).getHSL({ h: 0, s: 0, l: 0 }).l < 0.45;
  const numTex = numberTexture(number, dark ? "#101114" : "#f6f6f6", dark ? "#f6f6f6" : "#16181c");
  const decalMat = new THREE.MeshBasicMaterial({ map: numTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const side of [1, -1]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), decalMat);
    d.position.set(0.15, 0.36, 0.785 * side);
    d.rotation.y = side > 0 ? 0 : Math.PI;
    group.add(d);
  }
  const noseNum = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), decalMat);
  noseNum.rotation.x = -Math.PI / 2;
  noseNum.rotation.z = Math.PI / 2;
  noseNum.position.set(1.7, 0.436, 0);
  group.add(noseNum);

  // Suspension.
  const arm = new THREE.Color("#1a1c20");
  const arms: THREE.BufferGeometry[] = [];
  for (const [x, wd] of [[FRONT_AXLE, 0.4], [REAR_AXLE, 0.5]] as const) {
    for (const side of [1, -1]) {
      const hub = new THREE.Vector3(x, TYRE_RADIUS, side * (HUB_Z - wd / 2 + 0.05));
      const out = (dx: number, dy: number) => new THREE.Vector3(x + dx, dy, side * 0.22);
      arms.push(plain(strut(out(0.22, 0.2), hub, 0.011, arm)), plain(strut(out(-0.22, 0.22), hub, 0.011, arm)), plain(strut(out(0.0, 0.42), hub, 0.009, arm)));
    }
  }
  const armMesh = new THREE.Mesh(mergeGeometries(arms, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 }));
  group.add(armMesh);

  // Wheels.
  const fronts: THREE.Group[] = [];
  const spinners: THREE.Group[] = [];
  const rings: THREE.Mesh[] = [];
  const glows: THREE.Mesh[] = [];
  const spots: [number, number, number][] = [
    [FRONT_AXLE, HUB_Z, 0.4],
    [FRONT_AXLE, -HUB_Z, 0.4],
    [REAR_AXLE, HUB_Z + 0.02, 0.5],
    [REAR_AXLE, -(HUB_Z + 0.02), 0.5],
  ];
  spots.forEach(([x, z, wd], i) => {
    const holder = new THREE.Group();
    holder.position.set(x, TYRE_RADIUS, z);
    const spinner = new THREE.Group();
    const tyre = new THREE.Mesh(tyreGeometry(wd), mats.tyre);
    tyre.castShadow = true;
    spinner.add(tyre);
    const cover = new THREE.Mesh(wheelCoverGeometry(), mats.rim);
    cover.position.z = Math.sign(z) * (wd / 2 - 0.01);
    spinner.add(cover);
    // Compound-coloured marks on the sidewall: two arcs, so the roll is visible.
    for (let a = 0; a < 2; a++) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.011, 6, 12, 1.0), ringMat(mats, compound));
      arc.position.z = Math.sign(z) * (wd / 2 + 0.003);
      arc.rotation.z = a * Math.PI;
      spinner.add(arc);
      rings.push(arc);
    }
    holder.add(spinner);
    // Brake glow in the rim, bright under heavy braking.
    const glow = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.012, 6, 28), new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, opacity: 0, depthWrite: false }));
    glow.position.z = Math.sign(z) * (wd / 2 + 0.012);
    holder.add(glow);
    glows.push(glow);
    group.add(holder);
    spinners.push(spinner);
    if (i < 2) fronts.push(holder);
  });

  const brakeLight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.25), new THREE.MeshBasicMaterial({ color: 0x3a0000 }));
  brakeLight.position.set(-2.645, 0.48, 0);
  group.add(brakeLight);

  return { group, fronts, spinners, rings, flap, brakeLight, glows, body };
}

export function setCompound(rig: CarRig, mats: CarMaterials, compound: Compound) {
  for (const r of rig.rings) r.material = ringMat(mats, compound);
}
