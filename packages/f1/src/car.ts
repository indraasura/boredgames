/** Everything that describes a car before it turns a wheel: teams, tyre compounds, setup sliders. */

export type Compound = "soft" | "medium" | "hard" | "inter" | "wet";

export interface CompoundDef {
  id: Compound;
  name: string;
  color: string;
  /** Peak friction coefficient on a dry, clean track at the right temperature. */
  mu: number;
  /** Best operating temperature, °C, and the width of the window it works in. */
  optTemp: number;
  tempWindow: number;
  /** Relative wear speed. */
  wear: number;
  /** Track wetness (0 dry .. 1 flooded) at which grip is best, how good it is there, and how fast it falls off either side. */
  wetBest: number;
  wetPeak: number;
  wetSpread: number;
}

export const COMPOUNDS: Record<Compound, CompoundDef> = {
  soft: { id: "soft", name: "Soft", color: "#E8002D", mu: 2.38, optTemp: 98, tempWindow: 32, wear: 1.55, wetBest: 0, wetPeak: 1, wetSpread: 0.16 },
  medium: { id: "medium", name: "Medium", color: "#FFD12E", mu: 2.26, optTemp: 100, tempWindow: 36, wear: 1.0, wetBest: 0, wetPeak: 1, wetSpread: 0.16 },
  hard: { id: "hard", name: "Hard", color: "#F0F0F0", mu: 2.14, optTemp: 104, tempWindow: 40, wear: 0.66, wetBest: 0, wetPeak: 1, wetSpread: 0.16 },
  inter: { id: "inter", name: "Intermediate", color: "#43B02A", mu: 1.8, optTemp: 78, tempWindow: 44, wear: 1.25, wetBest: 0.38, wetPeak: 0.9, wetSpread: 0.5 },
  wet: { id: "wet", name: "Full wet", color: "#0067AD", mu: 1.66, optTemp: 70, tempWindow: 48, wear: 0.9, wetBest: 0.78, wetPeak: 0.8, wetSpread: 0.55 },
};

export const COMPOUND_LIST: readonly Compound[] = ["soft", "medium", "hard", "inter", "wet"];

/** How much of a compound's dry grip is left on a track this wet. */
export function wetGrip(c: CompoundDef, wetness: number): number {
  if (c.wetBest === 0) {
    // Slicks lose grip fast as soon as there is water.
    return 1 / (1 + 3.2 * Math.pow(wetness, 0.8));
  }
  const x = (wetness - c.wetBest) / c.wetSpread;
  const g = c.wetPeak * (1 - 0.55 * x * x);
  return Math.max(0.28, g);
}

export interface Setup {
  /** All 0..1, 0.5 is the middle. */
  frontWing: number;
  rearWing: number;
  /** Share of braking on the front axle, 0.5..0.68. */
  brakeBias: number;
  /** How hard the rear wheels are locked together on throttle. */
  diff: number;
  /** Spring stiffness. Stiffer front = more understeer, stiffer rear = more oversteer. */
  springFront: number;
  springRear: number;
  /** Negative wheel lean. More grip in corners, more tyre wear, a little less braking grip. */
  camber: number;
  /** Tyre pressure. Low = more grip but hotter, high = cooler and longer lasting. */
  pressure: number;
  /** Final drive. 0 = short, quick acceleration. 1 = long, higher top speed. */
  gearing: number;
}

export const DEFAULT_SETUP: Setup = {
  frontWing: 0.5,
  rearWing: 0.5,
  brakeBias: 0.575,
  diff: 0.5,
  springFront: 0.5,
  springRear: 0.5,
  camber: 0.5,
  pressure: 0.5,
  gearing: 0.5,
};

export interface SetupField {
  key: keyof Setup;
  label: string;
  low: string;
  high: string;
  /** Format the slider value for display. */
  format(v: number): string;
}

export const SETUP_FIELDS: readonly SetupField[] = [
  { key: "frontWing", label: "Front wing", low: "Less downforce", high: "More downforce", format: (v) => `${(8 + v * 24).toFixed(0)}°` },
  { key: "rearWing", label: "Rear wing", low: "Faster in a straight line", high: "More grip", format: (v) => `${(10 + v * 20).toFixed(0)}°` },
  { key: "brakeBias", label: "Brake bias", low: "Rearward", high: "Forward", format: (v) => `${(v * 100).toFixed(1)}% front` },
  { key: "diff", label: "Differential", low: "Open: easier on the throttle", high: "Locked: more traction", format: (v) => `${(v * 100).toFixed(0)}%` },
  { key: "springFront", label: "Front springs", low: "Soft: turns in sharper", high: "Stiff: more stable", format: (v) => `${(v * 100).toFixed(0)}%` },
  { key: "springRear", label: "Rear springs", low: "Soft: more traction", high: "Stiff: pointier", format: (v) => `${(v * 100).toFixed(0)}%` },
  { key: "camber", label: "Camber", low: "Less wear, less grip", high: "More grip, more wear", format: (v) => `−${(1.5 + v * 2.5).toFixed(1)}°` },
  { key: "pressure", label: "Tyre pressure", low: "More grip, runs hotter", high: "Cooler, lasts longer", format: (v) => `${(21 + v * 5).toFixed(1)} psi` },
  { key: "gearing", label: "Gearing", low: "Short: quicker off the line", high: "Long: higher top speed", format: (v) => `${(300 + v * 60).toFixed(0)} km/h top` },
];

export function clampSetup(s: Setup): Setup {
  const c = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : 0.5));
  return {
    frontWing: c(s.frontWing),
    rearWing: c(s.rearWing),
    brakeBias: c(s.brakeBias, 0.5, 0.68),
    diff: c(s.diff),
    springFront: c(s.springFront),
    springRear: c(s.springRear),
    camber: c(s.camber),
    pressure: c(s.pressure),
    gearing: c(s.gearing),
  };
}

export interface Team {
  id: string;
  name: string;
  color: string;
  accent: string;
  /** Multipliers on the baseline car. They are small: real teams differ by a few percent. */
  power: number;
  downforce: number;
  drag: number;
  /** Extra kg on top of the minimum weight. */
  mass: number;
  blurb: string;
}

/** Made-up teams, so nobody's livery or name is borrowed. */
export const TEAMS: readonly Team[] = [
  { id: "apex", name: "Apex Racing", color: "#E10600", accent: "#FFFFFF", power: 1.005, downforce: 1.0, drag: 1.0, mass: 2, blurb: "Balanced. No weak spot." },
  { id: "meridian", name: "Meridian GP", color: "#00A3E0", accent: "#FFD12E", power: 1.0, downforce: 1.03, drag: 1.02, mass: 1, blurb: "Strong in slow and medium corners." },
  { id: "volta", name: "Volta Works", color: "#FF8000", accent: "#101010", power: 1.01, downforce: 0.99, drag: 0.97, mass: 3, blurb: "Quick in a straight line." },
  { id: "northstar", name: "Northstar", color: "#0F8F5C", accent: "#D6F55B", power: 0.995, downforce: 1.02, drag: 0.99, mass: 0, blurb: "Light and agile." },
  { id: "silverline", name: "Silverline", color: "#C0C6CC", accent: "#00D2BE", power: 1.008, downforce: 1.01, drag: 1.0, mass: 2, blurb: "Smooth and kind to its tyres." },
  { id: "crimson", name: "Crimson Arrow", color: "#8B1D3B", accent: "#F2C14E", power: 1.0, downforce: 0.98, drag: 0.96, mass: 4, blurb: "Low drag, a little heavy." },
  { id: "tidal", name: "Tidal F1", color: "#1C3F94", accent: "#7FD4FF", power: 0.99, downforce: 1.04, drag: 1.03, mass: 2, blurb: "Loads of downforce." },
  { id: "ember", name: "Ember Motorsport", color: "#F26B3A", accent: "#2B2B2B", power: 0.995, downforce: 1.0, drag: 1.0, mass: 3, blurb: "A solid midfield car." },
  { id: "jade", name: "Jade Dragon", color: "#5FD068", accent: "#111111", power: 0.985, downforce: 1.0, drag: 0.99, mass: 3, blurb: "Reliable and predictable." },
  { id: "violet", name: "Violet Speed", color: "#7D3FC4", accent: "#FFFFFF", power: 0.98, downforce: 0.99, drag: 1.0, mass: 5, blurb: "The underdog." },
];

export const DRIVER_NAMES = [
  "A. Novak", "L. Moreau", "T. Ishida", "M. Costa", "R. Haddad", "J. Lindqvist", "S. Okafor", "D. Petrov", "E. Vargas", "N. Brandt",
  "K. Tanaka", "I. Rossi", "P. Duval", "H. Walsh", "C. Mendes", "F. Sorensen", "G. Abara", "V. Kovac", "O. Reyes", "B. Laurent",
];

/** Constants of the baseline car. */
export const CAR = {
  /** Minimum weight with driver, kg. */
  mass: 798,
  wheelbase: 3.6,
  /** Fraction of the weight on the front axle. */
  frontWeight: 0.455,
  trackWidth: 1.58,
  cgHeight: 0.27,
  /** Yaw inertia as m * k^2. */
  gyration2: 1.6,
  wheelRadius: 0.355,
  /** Peak power of the engine on its own, W, and of the electric motor. */
  icePower: 560e3,
  ersPower: 120e3,
  redline: 12000,
  idle: 5200,
  drivetrainEff: 0.93,
  /** Fuel flow at full throttle, kg/s. */
  fuelFlow: 100 / 3600,
  fuelPerLapTarget: 2.0,
  maxFuel: 110,
};

export interface Tuned {
  mass0: number;
  /** Distance from the centre of gravity to the front and rear axles. */
  a: number;
  b: number;
  iz: number;
  /** Aero: lift coefficient x area, front and rear, and drag area. */
  clAf: number;
  clAr: number;
  cdA: number;
  /** Rear wing open (DRS): fractions of rear downforce and drag that remain. */
  drsDown: number;
  drsDrag: number;
  power: number;
  /** Gear ratios including final drive. */
  gears: number[];
  /** Share of lateral load transfer taken by the front axle. */
  rollFront: number;
  brakeBias: number;
  diff: number;
  camberGrip: number;
  camberWear: number;
  pressureGrip: number;
  pressureHeat: number;
  brakeGripLoss: number;
}

/** Turn a team and a setup into the numbers the physics uses. */
export function tune(team: Team, setup: Setup): Tuned {
  const s = clampSetup(setup);
  const b = CAR.wheelbase * CAR.frontWeight;
  const a = CAR.wheelbase - b;
  const mass0 = CAR.mass + team.mass;
  const clAf = 2.2 * (0.7 + 0.6 * s.frontWing) * team.downforce;
  const clAr = 3.2 * (0.7 + 0.6 * s.rearWing) * team.downforce;
  const cdA = (0.4 + 0.1 * (clAf + clAr)) * team.drag;

  // Eight gears spread from first to top. Top gear tops out between 300 and 360 km/h at the redline.
  const topKmh = 300 + s.gearing * 60;
  const firstKmh = 82;
  const ratio = Math.pow(topKmh / firstKmh, 1 / 7);
  const omega = (CAR.redline * 2 * Math.PI) / 60;
  const gears: number[] = [];
  for (let g = 0; g < 8; g++) {
    const v = (firstKmh / 3.6) * Math.pow(ratio, g);
    gears.push((omega * CAR.wheelRadius) / v);
  }

  const springBias = (s.springFront - s.springRear) * 0.12;
  return {
    mass0,
    a,
    b,
    iz: mass0 * CAR.gyration2,
    clAf,
    clAr,
    cdA,
    drsDown: 0.7,
    drsDrag: 0.8,
    power: team.power,
    gears,
    rollFront: 0.52 + springBias,
    brakeBias: s.brakeBias,
    diff: s.diff,
    camberGrip: 0.97 + s.camber * 0.06,
    camberWear: 0.8 + s.camber * 0.45,
    pressureGrip: 1.025 - s.pressure * 0.05,
    pressureHeat: 1.15 - s.pressure * 0.3,
    brakeGripLoss: s.camber * 0.04,
  };
}

/** A made-up but sensible setup, scattered a little. `rand` is any 0..1 source. */
export function randomSetup(rand: () => number): Setup {
  const r = (mid: number, spread: number) => mid + (rand() - 0.5) * 2 * spread;
  return clampSetup({
    frontWing: r(0.5, 0.3),
    rearWing: r(0.5, 0.3),
    brakeBias: r(0.585, 0.04),
    diff: r(0.5, 0.25),
    springFront: r(0.5, 0.25),
    springRear: r(0.5, 0.25),
    camber: r(0.5, 0.25),
    pressure: r(0.5, 0.25),
    gearing: r(0.5, 0.25),
  });
}
