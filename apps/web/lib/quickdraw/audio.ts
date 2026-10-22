/**
 * Every sound in Quick Draw is made here with Web Audio: wind, a whistled theme, the call, gunshots with a
 * canyon echo. Nothing is downloaded.
 */

export type Sfx = "call" | "shot" | "ricochet" | "dud" | "crow" | "bottle" | "bell" | "spurs" | "win" | "lose" | "tick" | "click" | "cash";

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private echo!: ConvolverNode;
  private noise!: AudioBuffer;
  private wind: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private tension: { nodes: OscillatorNode[]; bus: GainNode } | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  sfxOn = true;
  musicOn = true;

  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!C) return;
      const ctx = new C();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.55;
      this.musicBus.connect(this.master);
      // White noise for wind, dust and gunpowder.
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // A long, dark echo off the canyon walls.
      const ir = ctx.createBuffer(2, ctx.sampleRate * 2.6, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const ch = ir.getChannelData(c);
        for (let i = 0; i < ch.length; i++) {
          const t = i / ctx.sampleRate;
          // Slap-back echoes a third of a second apart, and a diffuse tail.
          const slap = [0.32, 0.68, 1.1].reduce((acc, e, k) => acc + (Math.abs(t - e - c * 0.02) < 0.012 ? 0.5 / (k + 1) : 0), 0);
          ch[i] = ((Math.random() * 2 - 1) * 0.35 + slap * (Math.random() * 2 - 1)) * Math.exp(-t * 2.4);
        }
      }
      this.echo = ctx.createConvolver();
      this.echo.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.55;
      this.echo.connect(wet);
      wet.connect(this.master);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private get ok() {
    return !!this.ctx && this.ctx.state === "running";
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    if (this.ctx) this.sfxBus.gain.value = on ? 1 : 0;
  }
  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.ctx) this.musicBus.gain.value = on ? 0.55 : 0;
  }

  // ------------------------------------------------------------ building blocks

  private tone(bus: AudioNode, f: number, t: number, dur: number, o: { type?: OscillatorType; gain?: number; attack?: number; vibrato?: number; glide?: number; lowpass?: number; echo?: number } = {}) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(f, t);
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t + dur);
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 5.5;
      lg.gain.value = f * o.vibrato;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.1);
    }
    const g = ctx.createGain();
    const peak = o.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = osc;
    if (o.lowpass) {
      const f2 = ctx.createBiquadFilter();
      f2.type = "lowpass";
      f2.frequency.value = o.lowpass;
      osc.connect(f2);
      node = f2;
    }
    node.connect(g);
    g.connect(bus);
    if (o.echo) {
      const e = ctx.createGain();
      e.gain.value = o.echo;
      g.connect(e);
      e.connect(this.echo);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private burst(bus: AudioNode, t: number, dur: number, o: { type?: BiquadFilterType; freq?: number; q?: number; gain?: number; echo?: number; sweep?: number } = {}) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? "bandpass";
    f.frequency.setValueAtTime(o.freq ?? 1200, t);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain ?? 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    if (o.echo) {
      const e = ctx.createGain();
      e.gain.value = o.echo;
      g.connect(e);
      e.connect(this.echo);
    }
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private bellAt(t: number, f: number, gain = 0.15, dur = 2.5) {
    this.tone(this.sfxBus, f, t, dur, { gain, echo: 0.4 });
    this.tone(this.sfxBus, f * 2.76, t, dur * 0.5, { gain: gain * 0.35 });
    this.tone(this.sfxBus, f * 5.4, t, dur * 0.25, { gain: gain * 0.15 });
  }

  /** A plucked string (Karplus-Strong-ish, faked with a filtered saw). */
  private pluck(t: number, n: number, gain = 0.12, dur = 1.2, bus: AudioNode = this.musicBus) {
    const f = midi(n);
    this.tone(bus, f, t, dur, { type: "sawtooth", gain, attack: 0.004, lowpass: 1600, echo: 0.25 });
    this.tone(bus, f * 2, t, dur * 0.4, { type: "triangle", gain: gain * 0.4, attack: 0.003 });
  }

  /** A lonely whistle with vibrato. */
  private whistle(t: number, n: number, dur: number, gain = 0.07, bus: AudioNode = this.musicBus) {
    this.tone(bus, midi(n), t, dur, { gain, attack: 0.06, vibrato: 0.012, echo: 0.5 });
  }

  // ---------------------------------------------------------------- effects

  sfx(kind: Sfx) {
    if (!this.ok) return;
    const t = this.ctx!.currentTime + 0.005;
    const bus = this.sfxBus;
    switch (kind) {
      case "click":
        this.burst(bus, t, 0.03, { type: "highpass", freq: 3500, gain: 0.15 });
        break;
      case "tick":
        this.burst(bus, t, 0.025, { type: "bandpass", freq: 2600, q: 8, gain: 0.25 });
        break;
      case "call":
        // A whip crack and a struck bell: impossible to miss.
        this.burst(bus, t, 0.05, { type: "highpass", freq: 2000, gain: 0.9, echo: 0.3 });
        this.burst(bus, t + 0.02, 0.12, { type: "bandpass", freq: 3200, q: 2, gain: 0.5 });
        this.bellAt(t, 880, 0.18, 1.2);
        break;
      case "shot":
        this.burst(bus, t, 0.09, { type: "lowpass", freq: 6000, gain: 1.2, echo: 0.9 });
        this.burst(bus, t, 0.5, { type: "lowpass", freq: 900, sweep: 120, gain: 0.8, echo: 0.6 });
        this.tone(bus, 150, t, 0.35, { gain: 0.8, glide: 40 });
        break;
      case "ricochet":
        this.tone(bus, 3200, t + 0.05, 0.6, { gain: 0.08, glide: 700, echo: 0.4 });
        this.burst(bus, t + 0.05, 0.4, { type: "bandpass", freq: 3000, sweep: 800, q: 12, gain: 0.15 });
        break;
      case "dud":
        // A shot into the dirt.
        this.burst(bus, t, 0.08, { type: "lowpass", freq: 3000, gain: 0.8, echo: 0.6 });
        this.burst(bus, t + 0.04, 0.5, { type: "lowpass", freq: 400, gain: 0.5 });
        this.tone(bus, 220, t + 0.25, 0.7, { type: "triangle", gain: 0.12, glide: 110 });
        break;
      case "crow":
        for (const d of [0, 0.32]) {
          this.tone(bus, 520, t + d, 0.22, { type: "sawtooth", gain: 0.09, glide: 380, lowpass: 1800, echo: 0.3 });
          this.burst(bus, t + d, 0.2, { type: "bandpass", freq: 1300, q: 5, gain: 0.12 });
        }
        break;
      case "bottle":
        for (let i = 0; i < 9; i++) this.tone(bus, 2400 + Math.random() * 3600, t + i * 0.018, 0.25 + Math.random() * 0.3, { gain: 0.05 });
        this.burst(bus, t, 0.3, { type: "highpass", freq: 4000, gain: 0.4 });
        break;
      case "bell":
        this.bellAt(t, 392, 0.16, 3);
        break;
      case "spurs":
        for (let i = 0; i < 4; i++) {
          const d = i * 0.35 + (i % 2) * 0.05;
          this.tone(bus, 4200 + (i % 2) * 400, t + d, 0.18, { gain: 0.04 });
          this.tone(bus, 5600, t + d + 0.03, 0.12, { gain: 0.025 });
          this.burst(bus, t + d, 0.06, { type: "lowpass", freq: 500, gain: 0.2 });
        }
        break;
      case "cash":
        for (let i = 0; i < 6; i++) this.tone(bus, 2200 + i * 280, t + i * 0.05, 0.25, { gain: 0.06 });
        this.bellAt(t + 0.3, 1568, 0.08, 1);
        break;
      case "win":
        // A mariachi-ish trumpet flourish.
        [[64, 68, 71], [66, 69, 73], [68, 71, 76]].forEach((ch, i) =>
          ch.forEach((n) => this.tone(bus, midi(n), t + i * 0.16, i === 2 ? 1.3 : 0.18, { type: "sawtooth", gain: 0.06, attack: 0.02, lowpass: 2600, vibrato: i === 2 ? 0.01 : 0, echo: 0.3 })),
        );
        break;
      case "lose":
        [69, 67, 64, 62].forEach((n, i) => this.whistle(t + i * 0.32, n, i === 3 ? 1.6 : 0.34, 0.09));
        break;
    }
  }

  // ----------------------------------------------------------------- music

  /** Wind across the street, always there. */
  startWind() {
    if (!this.ok || this.wind) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 500;
    f.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 0.13;
    lg.gain.value = 300;
    lfo.connect(lg);
    lg.connect(f.frequency);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.1, ctx.currentTime, 2);
    src.connect(f);
    f.connect(gain);
    gain.connect(this.sfxBus);
    src.start();
    lfo.start();
    this.wind = { src, gain };
  }

  stopAll() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.stopTension(true);
    if (this.wind && this.ctx) {
      this.wind.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      const w = this.wind;
      setTimeout(() => w.src.stop(), 1500);
      this.wind = null;
    }
  }

  /** The standoff: a whistled phrase over a plucked bass, then a low drone that tightens until the call. */
  standoff(ms: number) {
    if (!this.ok) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.05;
    // Everything for this standoff goes through one gain, so a foul can silence it all at once.
    const bus = ctx.createGain();
    bus.connect(this.musicBus);
    // The famous-sounding (but our own) phrase in A minor.
    const phrase: [number, number, number][] = [
      [0, 69, 0.35],
      [0.38, 74, 0.35],
      [0.76, 69, 0.35],
      [1.14, 74, 0.35],
      [1.52, 69, 1.3],
    ];
    if (ms > 2600) phrase.forEach(([d, n, len]) => this.whistle(t + d, n, len, 0.07, bus));
    // Bass plucks under it, then a heartbeat until the call.
    const beats = Math.floor(ms / 760);
    for (let i = 0; i < beats; i++) {
      const at = t + i * 0.76;
      if (i < 4) this.pluck(at, i % 2 ? 40 : 45, 0.1, 0.9, bus);
      else this.drum(at, 0.06 + Math.min(0.2, i * 0.015), bus);
    }
    // A drone that swells and climbs a little.
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.06, t + ms / 1000);
    gain.connect(bus);
    const nodes: OscillatorNode[] = [];
    for (const n of [33, 40, 45.1]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(midi(n), t);
      o.frequency.linearRampToValueAtTime(midi(n + 1), t + ms / 1000);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(300, t);
      lp.frequency.linearRampToValueAtTime(900, t + ms / 1000);
      o.connect(lp);
      lp.connect(gain);
      o.start(t);
      nodes.push(o);
    }
    this.tension = { nodes, bus };
  }

  private drum(t: number, gain: number, bus: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + 0.35);
  }

  /** Cut the music at the call (or a foul): silence is louder. */
  stopTension(now = false) {
    if (!this.ctx || !this.tension) return;
    const { nodes, bus } = this.tension;
    const t = this.ctx.currentTime;
    bus.gain.setTargetAtTime(0, t, now ? 0.01 : 0.04);
    nodes.forEach((o) => o.stop(t + 0.4));
    this.tension = null;
    setTimeout(() => bus.disconnect(), 600);
  }

  /** A few bars for the poster screens. */
  theme() {
    if (!this.ok) return;
    const t = this.ctx!.currentTime + 0.1;
    const melody: [number, number, number][] = [
      [0, 64, 0.4],
      [0.45, 69, 0.4],
      [0.9, 71, 0.4],
      [1.35, 72, 0.9],
      [2.4, 71, 0.4],
      [2.85, 69, 1.4],
    ];
    melody.forEach(([d, n, len]) => this.whistle(t + d, n, len, 0.06));
    [45, 52, 45, 52, 45, 52, 45, 52].forEach((n, i) => this.pluck(t + i * 0.45, n, 0.07, 0.8));
  }
}

export const audio = new Audio();
