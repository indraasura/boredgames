import type { Input } from "@boredgames/f1";

export type Action = "pit" | "tyre" | "camera" | "reset" | "pause" | "mute" | "box";

const KEYS: Record<string, "throttle" | "brake" | "left" | "right" | "drs" | undefined> = {
  ArrowUp: "throttle",
  w: "throttle",
  W: "throttle",
  ArrowDown: "brake",
  s: "brake",
  S: "brake",
  ArrowLeft: "left",
  a: "left",
  A: "left",
  ArrowRight: "right",
  d: "right",
  D: "right",
  " ": "drs",
  Shift: "drs",
};

const ACTIONS: Record<string, Action> = { p: "pit", P: "pit", t: "tyre", T: "tyre", c: "camera", C: "camera", r: "reset", R: "reset", Escape: "pause", m: "mute", M: "mute" };

/**
 * Keyboard, gamepad and touch turned into pedals and a steering wheel. Keys are smoothed so a tap is
 * a small movement and a hold is a full one, the way a thumbstick would be.
 */
export class Controls {
  private down = new Set<string>();
  private touch = { left: false, right: false, throttle: false, brake: false, drs: false };
  steer = 0;
  throttle = 0;
  brake = 0;
  drs = false;
  private actions: ((a: Action) => void) | null = null;
  private off: (() => void)[] = [];
  gamepad = false;

  constructor(private enabled: () => boolean) {
    const key = (e: KeyboardEvent, isDown: boolean) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = KEYS[e.key];
      if (k) {
        if (!this.enabled()) return;
        e.preventDefault();
        if (isDown) this.down.add(k);
        else this.down.delete(k);
        return;
      }
      const a = ACTIONS[e.key];
      if (a && isDown && !e.repeat) {
        if (a !== "pause") e.preventDefault();
        this.actions?.(a);
      }
    };
    const kd = (e: KeyboardEvent) => key(e, true);
    const ku = (e: KeyboardEvent) => key(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    const blur = () => this.down.clear();
    window.addEventListener("blur", blur);
    this.off.push(
      () => window.removeEventListener("keydown", kd),
      () => window.removeEventListener("keyup", ku),
      () => window.removeEventListener("blur", blur),
    );
  }

  onAction(fn: (a: Action) => void) {
    this.actions = fn;
  }

  setTouch(k: keyof typeof this.touch, v: boolean) {
    this.touch[k] = v;
  }

  /** Read the controls for one frame. `speed` makes the steering heavier at speed, like a real wheel. */
  read(dt: number, speed: number): Pick<Input, "throttle" | "brake" | "steer" | "drs"> {
    let tThrottle = 0;
    let tBrake = 0;
    let tSteer = 0;
    let analog = false;
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((p) => p && p.connected);
    this.gamepad = !!pad;
    let drs = this.down.has("drs") || this.touch.drs;
    if (pad) {
      const dz = (v: number) => (Math.abs(v) < 0.08 ? 0 : v);
      const ax = dz(pad.axes[0] ?? 0);
      const rt = pad.buttons[7]?.value ?? 0;
      const lt = pad.buttons[6]?.value ?? 0;
      if (Math.abs(ax) > 0 || rt > 0.02 || lt > 0.02) analog = true;
      if (analog) {
        tSteer = -ax;
        tThrottle = rt;
        tBrake = lt;
      }
      if (pad.buttons[0]?.pressed || pad.buttons[5]?.pressed) drs = true;
    }
    if (!analog) {
      const left = this.down.has("left") || this.touch.left;
      const right = this.down.has("right") || this.touch.right;
      tSteer = (left ? 1 : 0) - (right ? 1 : 0);
      tThrottle = this.down.has("throttle") || this.touch.throttle ? 1 : 0;
      tBrake = this.down.has("brake") || this.touch.brake ? 1 : 0;
    }
    const move = (v: number, target: number, up: number, down: number) => {
      const rate = target === 0 || Math.sign(target) !== Math.sign(v) ? down : up;
      const d = target - v;
      return Math.abs(d) <= rate * dt ? target : v + Math.sign(d) * rate * dt;
    };
    if (analog) {
      this.steer = tSteer;
      this.throttle = tThrottle;
      this.brake = tBrake;
    } else {
      // The wheel winds on more slowly at speed so a short tap is a small movement, and unwinds quickly.
      const wind = Math.max(1.4, 3.2 - speed * 0.022);
      this.steer = move(this.steer, tSteer, wind, 7);
      this.throttle = move(this.throttle, tThrottle, 4, 10);
      this.brake = move(this.brake, tBrake, 5, 10);
    }
    this.drs = drs;
    return { throttle: this.throttle, brake: this.brake, steer: this.steer, drs };
  }

  dispose() {
    this.off.forEach((f) => f());
    this.off = [];
  }
}
