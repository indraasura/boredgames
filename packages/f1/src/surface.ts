import { CAR, type Tuned } from "./car";
import type { CarState } from "./physics";
import type { Nearest, Track } from "./track";

/** How far past the road edge the barrier stands. */
export const WALL = 11;

export interface Surface {
  /** Grip multiplier under FL, FR, RL, RR. */
  grip: number[];
  /** Extra rolling resistance, in units of weight. */
  drag: number;
  /** The car's centre is past the barrier. */
  wall: boolean;
  /** Any wheel is beyond the white line. */
  offTrack: boolean;
}

/** What each wheel is driving on, from its distance from the centre line. */
/**
 * `lane` is the offset of the pit lane from the centre line at this point of the lap, or null away from the pits:
 * the lane and its entry and exit roads are asphalt.
 */
export function surfaceFor(t: Track, c: CarState, k: Tuned, near: Nearest, wetness: number, lane: number | null = null): Surface {
  const i = near.i;
  const nx = t.nx[i]!;
  const ny = t.ny[i]!;
  const cp = Math.cos(c.psi);
  const sp = Math.sin(c.psi);
  const hw = CAR.trackWidth / 2;
  const px = [k.a, k.a, -k.b, -k.b];
  const py = [hw, -hw, hw, -hw];
  const half = t.width / 2;
  const grip = [1, 1, 1, 1];
  let drag = 0;
  let off = false;
  for (let w = 0; w < 4; w++) {
    const wx = px[w]! * cp - py[w]! * sp;
    const wy = px[w]! * sp + py[w]! * cp;
    const signed = near.d + wx * nx + wy * ny;
    const d = Math.abs(signed);
    let g = 1;
    if (lane !== null && Math.abs(signed - lane) < 4.2) {
      grip[w] = 1;
      continue;
    }
    let dr = 0;
    if (d > half + 1.2) {
      off = true;
      if (d < half + 7) {
        g = 0.55;
        dr = 0.06;
      } else {
        g = 0.4;
        dr = 0.5;
      }
      g *= 1 - 0.35 * wetness;
    } else if (d > half) {
      g = 0.96;
    }
    grip[w] = g;
    drag += dr / 4;
  }
  return { grip, drag, wall: Math.abs(near.d) > half + WALL, offTrack: off };
}
