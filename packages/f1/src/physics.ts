import { CAR, COMPOUNDS, wetGrip, type Compound, type Tuned } from "./car";

/**
 * A four-wheel, three-degrees-of-freedom car (forward speed, sideways speed, yaw) in SI units.
 *
 * Each tyre has its own load, slip angle, temperature and wear. Load comes from static weight,
 * aerodynamic downforce, and braking, acceleration and cornering load transfer. Lateral force
 * follows a saturating curve of slip angle, scaled by friction, and the combined force at each
 * tyre is limited by the friction circle, so braking and cornering (or traction and cornering)
 * share the same grip. The engine, gearbox, electric boost, drag, DRS and fuel mass are modelled
 * as they are in the real car, at real-car magnitudes.
 */

export const G = 9.81;
/** Fixed physics step, seconds. */
export const DT = 1 / 120;

export interface Env {
  /** Air density, kg/m³. */
  rho: number;
  /** 0 dry .. 1 flooded. */
  wetness: number;
  /** °C. */
  trackTemp: number;
}

export interface Input {
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  /** -1..1, positive turns left. */
  steer: number;
  drs: boolean;
  /** Steering help: limits the lock to what the tyres can use and corrects slides. */
  steerAssist: boolean;
  /** Traction control: keeps some grip in reserve when you get on the power. */
  tractionControl: boolean;
}

export const NO_INPUT: Input = { throttle: 0, brake: 0, steer: 0, drs: false, steerAssist: false, tractionControl: false };

export interface CarState {
  x: number;
  y: number;
  /** Heading, radians, 0 = +x. */
  psi: number;
  /** Forward and sideways speed in the car frame, m/s. */
  u: number;
  v: number;
  /** Yaw rate, rad/s. */
  r: number;
  /** Front wheel steering angle, radians. */
  delta: number;
  gear: number;
  rpm: number;
  shift: number;
  /** FL, FR, RL, RR. */
  temp: number[];
  wear: number[];
  /** Smoothed tyre slip angle, radians. */
  alpha: number[];
  compound: Compound;
  fuel: number;
  /** Battery energy, joules. */
  ers: number;
  drs: boolean;
  /** Last accelerations in the car frame, m/s². */
  ax: number;
  ay: number;
  /** 0..1+ how much of the available front/rear grip is being used. */
  gripFront: number;
  gripRear: number;
  /** Throttle actually applied after traction control. */
  throttle: number;
  brake: number;
  /** Downforce, N, for sound and display. */
  downforce: number;
  /** Total slip power this step, W, for sound and smoke. */
  slipPower: number;
}

export const ERS_CAPACITY = 4e6;

export function newCar(x: number, y: number, psi: number, compound: Compound, fuel: number, tyreTemp = 72): CarState {
  return {
    x,
    y,
    psi,
    u: 0,
    v: 0,
    r: 0,
    delta: 0,
    gear: 1,
    rpm: CAR.idle,
    shift: 0,
    temp: [tyreTemp, tyreTemp, tyreTemp, tyreTemp],
    wear: [0, 0, 0, 0],
    alpha: [0, 0, 0, 0],
    compound,
    fuel,
    ers: ERS_CAPACITY,
    drs: false,
    ax: 0,
    ay: 0,
    gripFront: 0,
    gripRear: 0,
    throttle: 0,
    brake: 0,
    downforce: 0,
    slipPower: 0,
  };
}

/** Engine power as a share of its peak, by rpm. */
function powerShape(rpm: number): number {
  const x = rpm < 10600 ? (rpm - 10600) / 6500 : (rpm - 10600) / 3200;
  return Math.min(1, Math.max(0.35, 1 - x * x));
}

/** Electric boost, W, tapering away above about 290 km/h as the rules require. */
function ersPower(speed: number): number {
  const fade = Math.min(1, Math.max(0, (96 - speed) / 16));
  return CAR.ersPower * fade;
}

const WHEEL_X = (a: number, b: number) => [a, a, -b, -b];
const WHEEL_Y = (hw: number) => [hw, -hw, hw, -hw];

/** Full lock of the front wheels, radians (about 24 degrees, as on the real cars). */
export const MAX_STEER = 0.42;

/** Wheel steering lock, radians, as a function of speed. */
export function steerLimit(speed: number, assist: boolean, ayLimit: number, L: number): number {
  if (!assist) return MAX_STEER;
  const peakSlip = 0.085;
  return Math.min(MAX_STEER, peakSlip + (L * ayLimit) / Math.max(speed * speed, 100));
}

/** Engine map: pedal progression in the low gears, and torque caps for first, second and third. */
const TQ_CURVE = 1.6;
const TQ_G1 = 0.7;
const TQ_G2 = 0.82;
const TQ_G3 = 0.92;
/** Rear side grip left at full wheelspin, and how fast it goes. */
const SPIN_MIN = 0.82;
const SPIN_K = 0.3;
/**
 * The rear tyres are a third wider than the fronts (405 mm against 305 mm), so the rear has more grip. That is
 * what makes the car settle into gentle understeer at the limit instead of swapping ends.
 */
const FRONT_GRIP = 0.96;
const REAR_GRIP = 1.08;
const B_STIFF = 17;
const C_SHAPE = 1.5;
const RELAX = 0.35;
const HEAT_SCALE = 0.042;
const CT = 2500;
const WEAR_SCALE = 1.7e-5;
/** Tyres brake with a little less grip than they corner with. */
const BRAKE_MU = 0.7;
/** ...and put the power down with a little less than they brake with. */
const DRIVE_MU = 0.82;

export interface StepOut {
  /** Total traction/brake force at the road, for debugging. */
  fx: number;
}

/**
 * Advance one car by dt. `surface` is the grip multiplier under each wheel (1 on asphalt) and
 * `drag` is extra rolling resistance in units of the car's weight (0 on asphalt, large in gravel).
 */
export function stepCar(c: CarState, t: Tuned, input: Input, env: Env, surface: readonly number[], drag: number, dt: number) {
  const m = t.mass0 + Math.max(0, c.fuel);
  const iz = m * CAR.gyration2;
  const L = t.a + t.b;
  const hw = CAR.trackWidth / 2;
  const px = WHEEL_X(t.a, t.b);
  const py = WHEEL_Y(hw);
  const V = Math.hypot(c.u, c.v);

  // ---- aero
  c.drs = input.drs && input.brake < 0.05;
  const q = 0.5 * env.rho * V * V;
  const dfF = q * t.clAf;
  const dfR = q * t.clAr * (c.drs ? t.drsDown : 1);
  const dragF = q * t.cdA * (c.drs ? t.drsDrag : 1);
  c.downforce = dfF + dfR;

  // ---- vertical load per wheel
  const dLong = (m * c.ax * CAR.cgHeight) / L;
  const FzF = (m * G * t.b) / L + dfF - dLong;
  const FzR = (m * G * t.a) / L + dfR + dLong;
  const dLat = (m * c.ay * CAR.cgHeight) / CAR.trackWidth;
  const tF = dLat * t.rollFront;
  const tR = dLat * (1 - t.rollFront);
  const Fz = [FzF / 2 - tF, FzF / 2 + tF, FzR / 2 - tR, FzR / 2 + tR];
  for (const [i, j, total] of [[0, 1, FzF], [2, 3, FzR]] as const) {
    if (Fz[i]! < 150) {
      Fz[i] = 150;
      Fz[j] = Math.max(150, total - 150);
    } else if (Fz[j]! < 150) {
      Fz[j] = 150;
      Fz[i] = Math.max(150, total - 150);
    }
  }

  // ---- steering
  const comp = COMPOUNDS[c.compound];
  const muEst = comp.mu * wetGrip(comp, env.wetness);
  const ayLimit = (muEst * (m * G + c.downforce)) / m;
  let target = input.steer * steerLimit(V, input.steerAssist, ayLimit, L);
  if (input.steerAssist && V > 8) {
    // Gently steer into a slide.
    const betaRear = Math.atan2(c.v - t.b * c.r, Math.max(c.u, 5));
    target -= Math.max(-0.12, Math.min(0.12, betaRear * 0.7));
  }
  target = Math.max(-MAX_STEER, Math.min(MAX_STEER, target));
  const maxStep = 2.4 * dt;
  c.delta += Math.max(-maxStep, Math.min(maxStep, target - c.delta));
  const cd = Math.cos(c.delta);
  const sd = Math.sin(c.delta);

  // ---- lateral force and friction limit per wheel (pass 1)
  const mu = [0, 0, 0, 0];
  const Fy = [0, 0, 0, 0];
  const Fmax = [0, 0, 0, 0];
  const slipLat = [0, 0, 0, 0];
  const wetF = wetGrip(comp, env.wetness);
  for (let i = 0; i < 4; i++) {
    const front = i < 2;
    const vwx = c.u - c.r * py[i]!;
    const vwy = c.v + c.r * px[i]!;
    const vl = front ? vwx * cd + vwy * sd : vwx;
    const vc = front ? -vwx * sd + vwy * cd : vwy;
    const alphaRaw = Math.atan2(vc, Math.max(Math.abs(vl), 2));
    const k = Math.min(1, (dt * Math.max(V, 4)) / RELAX);
    c.alpha[i] = c.alpha[i]! + (alphaRaw - c.alpha[i]!) * k;
    const tempX = (c.temp[i]! - comp.optTemp) / comp.tempWindow;
    const tempF = Math.max(0.6, 1 - 0.25 * tempX * tempX);
    const w = c.wear[i]!;
    const wearF = 1 - 0.22 * w - 3 * Math.max(0, w - 0.75) ** 2;
    const load = Math.min(1.3, Math.max(0.6, 1 - 0.16 * (Fz[i]! / 4500 - 1)));
    mu[i] = comp.mu * (front ? FRONT_GRIP : REAR_GRIP) * tempF * wearF * wetF * t.camberGrip * t.pressureGrip * load * (surface[i] ?? 1);
    Fmax[i] = mu[i]! * Fz[i]!;
    Fy[i] = -Fmax[i]! * Math.sin(C_SHAPE * Math.atan(B_STIFF * c.alpha[i]!));
    slipLat[i] = vc;
  }

  // ---- engine and gearbox
  const ratio = t.gears[c.gear - 1]!;
  const wheelRpm = (Math.max(c.u, 0) / CAR.wheelRadius) * ratio * (60 / (2 * Math.PI));
  let rpm = wheelRpm;
  if (c.gear === 1 && c.u < 24) rpm = Math.max(rpm, 6200 + 2600 * input.throttle);
  rpm = Math.min(CAR.redline, Math.max(CAR.idle, rpm));
  c.rpm = rpm;
  if (c.shift > 0) c.shift -= dt;
  else {
    if (rpm > CAR.redline - 250 && c.gear < 8) {
      c.gear++;
      c.shift = 0.03;
    } else if (c.gear > 1) {
      const down = (rpm * t.gears[c.gear - 2]!) / ratio;
      if (rpm < 7000 && down < CAR.redline - 900) {
        c.gear--;
        c.shift = 0.02;
      }
    }
  }
  const omega = (rpm * 2 * Math.PI) / 60;
  let throttle = input.throttle;
  let drive = 0;
  const speed = Math.max(c.u, 0);
  if (throttle > 0.01 && c.shift <= 0) {
    // Engine map: the pedal is progressive, and the low gears are torque-limited, as on the real cars, so a
    // stab of throttle out of a slow corner does not light up the rears.
    const curve = Math.pow(throttle, c.gear <= 3 ? TQ_CURVE : 1.15);
    const gearCap = c.gear === 1 ? TQ_G1 : c.gear === 2 ? TQ_G2 : c.gear === 3 ? TQ_G3 : 1;
    const iceT = ((CAR.icePower * powerShape(rpm) * t.power) / omega) * curve * gearCap;
    let ersT = 0;
    if (c.ers > 0 && throttle > 0.6) {
      const p = ersPower(speed);
      ersT = Math.min(220, p / omega);
      c.ers = Math.max(0, c.ers - p * dt);
    }
    drive = ((iceT + ersT) * ratio * CAR.drivetrainEff) / CAR.wheelRadius;
  } else if (throttle <= 0.01) {
    // Engine braking, plus harvesting.
    drive = ((-(70 + rpm * 0.012) * ratio * CAR.drivetrainEff) / CAR.wheelRadius) * Math.min(1, speed / 5);
    if (speed > 10 && c.ers < ERS_CAPACITY) c.ers = Math.min(ERS_CAPACITY, c.ers + 60e3 * dt);
  }
  if (input.brake > 0.05 && speed > 5 && c.ers < ERS_CAPACITY) c.ers = Math.min(ERS_CAPACITY, c.ers + 260e3 * input.brake * dt);

  // ---- longitudinal demand per wheel and the friction circle (pass 2)
  const brakeTotal = input.brake * 70000 * Math.min(1, speed / 0.8);
  const brakeFront = brakeTotal * t.brakeBias;
  const brakeRear = brakeTotal * (1 - t.brakeBias);
  const avail = (i: number) => Math.sqrt(Math.max(0, Fmax[i]! * Fmax[i]! - Fy[i]! * Fy[i]!));
  const Fx = [-brakeFront / 2, -brakeFront / 2, -brakeRear / 2, -brakeRear / 2];

  // Brakes never ask for more than the tyre has left after cornering.
  for (let i = 0; i < 4; i++) {
    const a = avail(i);
    const bf = i < 2 ? brakeFront / 2 : brakeRear / 2;
    Fx[i] = -Math.min(bf, a * BRAKE_MU);
  }
  // Drive goes to the rear axle through the differential.
  let wheelSpinScale = 1;
  if (drive > 0) {
    const aL = avail(2) * DRIVE_MU;
    const aR = avail(3) * DRIVE_MU;
    const demand = drive;
    const openEach = Math.min(demand / 2, aL, aR);
    const open = openEach * 2;
    const locked = Math.min(demand, aL + aR);
    const lockF = 0.15 + 0.8 * t.diff;
    const total = open + (locked - open) * lockF;
    const share = aL + aR > 0 ? aL / (aL + aR) : 0.5;
    const left = total * (0.5 + (share - 0.5) * lockF);
    let fl = left;
    let fr = total - left;
    if (input.tractionControl) {
      fl = Math.min(fl, 0.88 * Fmax[2]!);
      fr = Math.min(fr, 0.88 * Fmax[3]!);
      throttle = Math.min(throttle, total > 0 ? (fl + fr) / demand : throttle);
    }
    // Without traction control, asking for more than the tyre has left costs lateral grip too.
    const over = demand - (fl + fr);
    // Spinning the rears costs some side grip, progressively, so a slide on the power can be caught.
    if (!input.tractionControl && over > 0) wheelSpinScale = Math.max(SPIN_MIN, 1 - (over / (demand + 1)) * SPIN_K);
    Fx[2] = Fx[2]! + fl;
    Fx[3] = Fx[3]! + fr;
  } else if (drive < 0) {
    Fx[2] = Fx[2]! + drive / 2;
    Fx[3] = Fx[3]! + drive / 2;
  }
  c.throttle = throttle;
  c.brake = input.brake;

  // ---- combine, rotate into the car frame, sum
  let sumFx = 0;
  let sumFy = 0;
  let sumMz = 0;
  let gripF = 0;
  let gripR = 0;
  let slipPower = 0;
  for (let i = 0; i < 4; i++) {
    const front = i < 2;
    let fx = Fx[i]!;
    let fy = Fy[i]!;
    if (!front) fy *= wheelSpinScale;
    const mag = Math.hypot(fx, fy);
    const limit = Fmax[i]!;
    if (mag > limit && mag > 0) {
      const s = limit / mag;
      fx *= s;
      fy *= s;
    }
    const util = limit > 0 ? Math.hypot(fx, fy) / limit : 0;
    if (front) gripF = Math.max(gripF, util);
    else gripR = Math.max(gripR, util);

    // Heat and wear from the sliding of the contact patch.
    const slipLon = (Math.abs(fx) / (limit + 1)) * 0.12 * Math.max(V, 5);
    const Q = Math.abs(fy) * Math.abs(slipLat[i]!) + Math.abs(fx) * slipLon;
    slipPower += Q;
    const wetCool = 1 + 4 * env.wetness;
    const cool = (12 + 0.35 * V) * wetCool;
    const roll = V * Fz[i]! * 0.0045;
    c.temp[i] = c.temp[i]! + ((Q * HEAT_SCALE * t.pressureHeat + roll - cool * (c.temp[i]! - env.trackTemp)) / CT) * dt;
    const overheat = 1 + Math.max(0, (c.temp[i]! - comp.optTemp - comp.tempWindow * 0.6) / 30) ** 2;
    c.wear[i] = Math.min(1, c.wear[i]! + WEAR_SCALE * comp.wear * t.camberWear * overheat * (Q / 1000) * dt);

    const bx = front ? fx * cd - fy * sd : fx;
    const by = front ? fx * sd + fy * cd : fy;
    sumFx += bx;
    sumFy += by;
    sumMz += px[i]! * by - py[i]! * bx;
  }
  c.gripFront = gripF;
  c.gripRear = gripR;
  c.slipPower = slipPower;

  // ---- resistance
  const dir = V > 0.1 ? 1 / V : 0;
  const rolling = (0.011 + drag) * (m * G + c.downforce);
  sumFx -= (dragF + rolling) * c.u * dir;
  sumFy -= (dragF * 0.4 + rolling) * c.v * dir;

  // ---- integrate
  const ax = sumFx / m;
  const ay = sumFy / m;
  c.ax = ax;
  c.ay = ay;
  c.u += (ax + c.r * c.v) * dt;
  c.v += (ay - c.r * c.u) * dt;
  c.r += (sumMz / iz) * dt;
  if (V < 3) {
    // The slip-angle model is vague at a standstill; settle sideways motion and spin gently.
    const k = (1 - V / 3) * 12 * dt;
    c.v -= c.v * Math.min(1, k);
    c.r -= c.r * Math.min(1, k);
  }
  if (c.u < -1) c.u = -1;
  const cp = Math.cos(c.psi);
  const sp = Math.sin(c.psi);
  c.x += (c.u * cp - c.v * sp) * dt;
  c.y += (c.u * sp + c.v * cp) * dt;
  c.psi += c.r * dt;

  // ---- fuel
  c.fuel = Math.max(0, c.fuel - CAR.fuelFlow * throttle * (rpm / CAR.redline) * dt);
}

/** World position of one wheel, for the renderer. 0 FL, 1 FR, 2 RL, 3 RR. */
export function wheelWorld(c: CarState, t: Tuned, i: number): { x: number; y: number } {
  const px = WHEEL_X(t.a, t.b)[i]!;
  const py = WHEEL_Y(CAR.trackWidth / 2)[i]!;
  const cp = Math.cos(c.psi);
  const sp = Math.sin(c.psi);
  return { x: c.x + px * cp - py * sp, y: c.y + px * sp + py * cp };
}

export const kmh = (ms: number) => ms * 3.6;
