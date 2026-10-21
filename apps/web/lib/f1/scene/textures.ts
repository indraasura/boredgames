import * as THREE from "three";

/** Procedural textures, drawn once on a canvas: no image files to ship, and they tile cleanly. */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise on a size x size lattice, 0..1. */
function valueNoise(size: number, cells: number, seed: number): Float32Array {
  const r = rng(seed);
  const lat = new Float32Array(cells * cells);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  const out = new Float32Array(size * size);
  const at = (x: number, y: number) => lat[(((y % cells) + cells) % cells) * cells + (((x % cells) + cells) % cells)]!;
  const sm = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = sm(fx - x0);
      const ty = sm(fy - y0);
      const a = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
      const b = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
      out[y * size + x] = a * (1 - ty) + b * ty;
    }
  }
  return out;
}

/** Fractal noise from a few octaves, 0..1. */
function fbm(size: number, seed: number, base = 4, octaves = 4): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(size, base * 2 ** o, seed + o * 101);
    for (let i = 0; i < out.length; i++) out[i]! += n[i]! * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i]! /= total;
  return out;
}

function make(size: number, w: number, h: number, draw: (g: CanvasRenderingContext2D, img: ImageData) => void, color = true): THREE.CanvasTexture {
  void size;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  draw(g, img);
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tint(img: ImageData, size: number, f: (x: number, y: number) => [number, number, number]) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = f(x, y);
      const o = (y * size + x) * 4;
      img.data[o] = Math.max(0, Math.min(255, r));
      img.data[o + 1] = Math.max(0, Math.min(255, g));
      img.data[o + 2] = Math.max(0, Math.min(255, b));
      img.data[o + 3] = 255;
    }
  }
}

export function asphaltTexture(): THREE.CanvasTexture {
  const S = 512;
  const low = fbm(S, 11, 3, 4);
  const mid = fbm(S, 23, 24, 2);
  const r = rng(5);
  return make(S, S, S, (_g, img) => {
    tint(img, S, (x, y) => {
      const i = y * S + x;
      const grain = (r() - 0.5) * 20;
      const speck = r() > 0.985 ? 28 : 0;
      const v = 66 + (low[i]! - 0.5) * 22 + (mid[i]! - 0.5) * 14 + grain + speck;
      return [v, v + 1, v + 4];
    });
  });
}

export function grassTexture(): THREE.CanvasTexture {
  const S = 512;
  const low = fbm(S, 31, 4, 4);
  const blades = fbm(S, 47, 64, 2);
  const r = rng(9);
  return make(S, S, S, (_g, img) => {
    tint(img, S, (x, y) => {
      const i = y * S + x;
      const v = 0.72 + (low[i]! - 0.5) * 0.5 + (blades[i]! - 0.5) * 0.5 + (r() - 0.5) * 0.18;
      return [88 * v, 138 * v, 62 * v];
    });
  });
}

export function sandTexture(): THREE.CanvasTexture {
  const S = 512;
  const low = fbm(S, 61, 5, 4);
  const r = rng(13);
  return make(S, S, S, (_g, img) => {
    tint(img, S, (x, y) => {
      const i = y * S + x;
      const v = 0.82 + (low[i]! - 0.5) * 0.4 + (r() - 0.5) * 0.14;
      return [190 * v, 166 * v, 126 * v];
    });
  });
}

export function gravelTexture(): THREE.CanvasTexture {
  const S = 256;
  const low = fbm(S, 71, 6, 3);
  const r = rng(17);
  return make(S, S, S, (_g, img) => {
    tint(img, S, (x, y) => {
      const i = y * S + x;
      const stone = r() > 0.5 ? 1 : 0.78;
      const v = (0.78 + (low[i]! - 0.5) * 0.3) * stone + (r() - 0.5) * 0.16;
      return [200 * v, 188 * v, 160 * v];
    });
  });
}

/** Concrete wall panels with joints and stains. */
export function concreteTexture(): THREE.CanvasTexture {
  const S = 256;
  const low = fbm(S, 83, 4, 4);
  const r = rng(19);
  return make(S, S, S, (_g, img) => {
    tint(img, S, (x, y) => {
      const i = y * S + x;
      let v = 0.86 + (low[i]! - 0.5) * 0.28 + (r() - 0.5) * 0.06;
      if (x % 128 < 2) v *= 0.7;
      if (y > S - 6) v *= 0.8;
      return [190 * v, 192 * v, 194 * v];
    });
  });
}

/** Carbon-fibre twill. */
export function carbonTexture(): THREE.CanvasTexture {
  const S = 128;
  return make(S, S, S, (_g, img) => {
    tint(img, S, (x, y) => {
      const cell = 8;
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      const wx = (x % cell) / cell;
      const wy = (y % cell) / cell;
      const diag = (cx + cy) % 2 === 0;
      const t = diag ? wx : wy;
      const v = 18 + 20 * Math.sin(t * Math.PI) * (diag ? 1 : 0.7) + ((cx * 7 + cy * 13) % 5);
      return [v, v + 1, v + 3];
    });
  });
}

/** Fluffy clouds on transparent: the alpha carries the shape. */
export function cloudTexture(): THREE.CanvasTexture {
  const S = 512;
  const n = fbm(S, 97, 3, 5);
  const t = make(
    S,
    S,
    S,
    (_g, img) => {
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const i = y * S + x;
          const d = Math.max(0, (n[i]! - 0.5) * 3.4);
          const a = Math.min(1, d);
          const o = i * 4;
          const shade = 255 - a * 38;
          img.data[o] = shade;
          img.data[o + 1] = shade + 2;
          img.data[o + 2] = 255;
          img.data[o + 3] = a * 235;
        }
      }
    },
    true,
  );
  return t;
}

/** Fictional sponsors for the boards along the track. Never a real brand. */
export const SPONSORS: { name: string; bg: string; fg: string }[] = [
  { name: "VELOCITY", bg: "#d6001c", fg: "#ffffff" },
  { name: "NOVA OIL", bg: "#ffd100", fg: "#10131a" },
  { name: "HELIOS", bg: "#ff7a00", fg: "#ffffff" },
  { name: "ARCTIC", bg: "#0a74da", fg: "#ffffff" },
  { name: "TURBINE", bg: "#10131a", fg: "#e8e8e8" },
  { name: "QUANTA", bg: "#19a463", fg: "#ffffff" },
  { name: "ORBIT", bg: "#6a2fd0", fg: "#ffffff" },
  { name: "MERIDIAN", bg: "#f2f2f2", fg: "#c4001a" },
];

/** All the boards on one strip, each 256 x 64, in SPONSORS order. */
export function sponsorTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 64;
  const c = document.createElement("canvas");
  c.width = w * SPONSORS.length;
  c.height = h;
  const g = c.getContext("2d")!;
  SPONSORS.forEach((s, i) => {
    g.fillStyle = s.bg;
    g.fillRect(i * w, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.14)";
    g.fillRect(i * w, 0, w, 6);
    g.fillStyle = s.fg;
    g.font = "900 38px 'Arial Black', Impact, system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(s.name, i * w + w / 2, h / 2 + 3, w - 24);
    g.fillRect(i * w + 10, h - 9, w - 20, 3);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A crowd: bright dots of clothing on shadow. */
export function crowdTexture(): THREE.CanvasTexture {
  const S = 256;
  const r = rng(29);
  const palette = [[220, 40, 40], [240, 240, 240], [40, 90, 200], [250, 200, 40], [30, 30, 36], [60, 170, 90], [230, 120, 40], [170, 60, 190]];
  return make(S, S, S, (_g, img) => {
    tint(img, S, (x, y) => {
      const row = Math.floor(y / 6);
      const fx = x % 6;
      const fy = y % 6;
      const rr = rng(row * 997 + Math.floor(x / 6) * 31 + 3)();
      const col = palette[Math.floor(rr * palette.length)]!;
      const inside = (fx - 3) ** 2 + (fy - 3.4) ** 2 < 7;
      const k = inside ? 0.85 + r() * 0.3 : 0.16;
      return [col[0]! * k, col[1]! * k, col[2]! * k];
    });
  });
}

/** Windows on a facade: a grid of glass over concrete. */
export function facadeTexture(): THREE.CanvasTexture {
  const S = 256;
  const r = rng(37);
  const cells: number[] = [];
  for (let i = 0; i < 64; i++) cells.push(r());
  return make(S, S, S, (_g, img) => {
    tint(img, S, (x, y) => {
      const cw = 32;
      const ch = 32;
      const fx = x % cw;
      const fy = y % ch;
      const cx = Math.floor(x / cw);
      const cy = Math.floor(y / ch);
      const win = fx > 5 && fx < cw - 5 && fy > 6 && fy < ch - 5;
      if (!win) return [150, 153, 158];
      const lit = cells[(cy * 8 + cx) % 64]!;
      const sky = 0.55 + 0.45 * (1 - fy / ch);
      if (lit > 0.9) return [236, 214, 150];
      return [58 + 44 * sky, 70 + 50 * sky, 86 + 58 * sky];
    });
  });
}

/** A soft round blob for particles. */
export function puffTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The start line and grid boxes. */
export function checkerTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 32;
  const g = c.getContext("2d")!;
  for (let yy = 0; yy < 4; yy++)
    for (let xx = 0; xx < 32; xx++) {
      g.fillStyle = (xx + yy) % 2 === 0 ? "#f4f4f4" : "#16161a";
      g.fillRect(xx * 4, yy * 8, 4, 8);
    }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Livery number plate: a rounded square with the race number. */
export function numberTexture(num: number, fg: string, bg: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(8, 8, 112, 112, 22);
  g.fill();
  g.fillStyle = fg;
  g.font = "900 78px 'Arial Black', Impact, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(num), 64, 70, 100);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
