/** War-camp sound, made in the browser: a drone and lute for music, drums, steel, horns, coin and bells for effects. */

export type Sfx = "click" | "coin" | "muster" | "march" | "clash" | "victory" | "defeat" | "seize" | "bell" | "alliance" | "betrayal" | "seal" | "turn" | "fanfare" | "reward" | "streak" | "crown";

const D_DORIAN = [62, 64, 65, 67, 69, 71, 72, 74, 76, 77];
const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class BannersAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private timer: ReturnType<typeof setInterval> | null = null;
  private next = 0;
  private step = 0;
  private drone: { stop(): void } | null = null;
  music = true;
  sfxOn = true;

  unlock() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(ctx.destination);
    // a small hall
    const verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.2;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    verb.connect(wet);
    wet.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.music ? 0.32 : 0;
    this.musicBus.connect(this.master);
    this.musicBus.connect(verb);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxOn ? 0.9 : 0;
    this.sfxBus.connect(this.master);
    this.sfxBus.connect(verb);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  setMusic(on: boolean) {
    this.music = on;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.2);
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  // ---------------------------------------------------------------- building blocks

  private tone(bus: AudioNode, freq: number, t: number, dur: number, o: { type?: OscillatorType; gain?: number; attack?: number; lowpass?: number; vibrato?: number } = {}) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "triangle";
    osc.frequency.setValueAtTime(freq, t);
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const lg = ctx.createGain();
      lg.gain.value = freq * o.vibrato;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.1);
    }
    const g = ctx.createGain();
    const a = o.attack ?? 0.01;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.gain ?? 0.2, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = osc;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.lowpass;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private burst(bus: AudioNode, t: number, dur: number, o: { type?: BiquadFilterType; freq?: number; q?: number; gain?: number } = {}) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? "bandpass";
    f.frequency.value = o.freq ?? 1200;
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain ?? 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private drum(t: number, low: boolean, gain = 0.5) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(low ? 90 : 180, t);
    osc.frequency.exponentialRampToValueAtTime(low ? 45 : 110, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (low ? 0.45 : 0.18));
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.5);
    this.burst(this.sfxBus, t, 0.06, { type: "lowpass", freq: 900, gain: gain * 0.4 });
  }

  private horn(t: number, notes: number[], dur: number, gain = 0.16) {
    notes.forEach((n, i) => {
      const f = midi(n);
      this.tone(this.sfxBus, f, t + i * 0.02, dur, { type: "sawtooth", gain, attack: 0.08, lowpass: 1400, vibrato: 0.006 });
      this.tone(this.sfxBus, f / 2, t + i * 0.02, dur, { type: "sawtooth", gain: gain * 0.5, attack: 0.1, lowpass: 700 });
    });
  }

  private bellAt(t: number, f: number, gain = 0.12, dur = 2.2) {
    this.tone(this.sfxBus, f, t, dur, { type: "sine", gain });
    this.tone(this.sfxBus, f * 2.76, t, dur * 0.5, { type: "sine", gain: gain * 0.35 });
    this.tone(this.sfxBus, f * 5.4, t, dur * 0.25, { type: "sine", gain: gain * 0.15 });
  }

  // ---------------------------------------------------------------- effects

  sfx(kind: Sfx) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime + 0.01;
    switch (kind) {
      case "click":
        this.burst(this.sfxBus, t, 0.04, { type: "highpass", freq: 3000, gain: 0.12 });
        break;
      case "coin":
        [0, 0.07, 0.15].forEach((d, i) => this.tone(this.sfxBus, 2400 + i * 300, t + d, 0.25, { type: "sine", gain: 0.08 }));
        break;
      case "muster":
        this.drum(t, true, 0.35);
        this.drum(t + 0.18, false, 0.25);
        break;
      case "march":
        for (let i = 0; i < 6; i++) this.drum(t + i * 0.16, i % 2 === 0, 0.22);
        break;
      case "clash":
        for (let i = 0; i < 5; i++) {
          const d = i * 0.11 + Math.random() * 0.05;
          this.burst(this.sfxBus, t + d, 0.18, { type: "bandpass", freq: 2600 + Math.random() * 1800, q: 6, gain: 0.35 });
          this.tone(this.sfxBus, 1800 + Math.random() * 900, t + d, 0.3, { type: "square", gain: 0.03, lowpass: 5000 });
        }
        this.drum(t, true, 0.4);
        break;
      case "victory":
        this.horn(t, [62, 69], 0.5);
        this.horn(t + 0.45, [62, 66, 69, 74], 1.2);
        break;
      case "defeat":
        this.horn(t, [57, 62], 0.6, 0.12);
        this.horn(t + 0.55, [53, 57], 1.2, 0.12);
        break;
      case "seize":
        this.drum(t, true, 0.4);
        this.horn(t + 0.05, [62, 69], 0.7, 0.12);
        break;
      case "bell":
        this.bellAt(t, 523, 0.12);
        break;
      case "alliance":
        this.bellAt(t, 587, 0.12);
        this.bellAt(t + 0.3, 880, 0.1);
        this.bellAt(t + 0.6, 1175, 0.08);
        break;
      case "betrayal":
        this.horn(t, [62, 63], 1.4, 0.14);
        this.bellAt(t + 0.1, 110, 0.35, 3);
        break;
      case "seal":
        this.drum(t, true, 0.5);
        this.burst(this.sfxBus, t, 0.12, { type: "lowpass", freq: 500, gain: 0.3 });
        break;
      case "turn":
        this.bellAt(t, 784, 0.07, 1.4);
        break;
      case "fanfare":
        [[62, 69], [64, 71], [66, 74], [62, 69, 74, 78]].forEach((ch, i) => this.horn(t + i * 0.32, ch, i === 3 ? 2 : 0.4, 0.13));
        for (let i = 0; i < 8; i++) this.drum(t + i * 0.16, i % 2 === 0, 0.3);
        break;
      case "reward":
        // A spill of coins, then a bright bell.
        for (let i = 0; i < 7; i++) this.tone(this.sfxBus, 2000 + i * 260 + Math.random() * 120, t + i * 0.05, 0.22, { type: "sine", gain: 0.07 });
        this.bellAt(t + 0.36, 1047, 0.09, 1.4);
        break;
      case "streak":
        this.horn(t, [62, 69], 0.25, 0.13);
        this.horn(t + 0.2, [66, 74], 0.25, 0.13);
        this.horn(t + 0.4, [69, 78, 81], 0.9, 0.14);
        this.drum(t, true, 0.45);
        this.drum(t + 0.4, true, 0.45);
        break;
      case "crown":
        this.bellAt(t, 587, 0.13);
        this.bellAt(t + 0.18, 880, 0.11);
        this.horn(t + 0.25, [62, 66, 69, 74], 1.4, 0.13);
        for (let i = 0; i < 4; i++) this.drum(t + i * 0.12, i % 2 === 0, 0.35);
        break;
    }
  }

  // ---------------------------------------------------------------- music

  startMusic() {
    if (!this.ctx || this.timer) return;
    const ctx = this.ctx;
    // A low drone on D and A that breathes slowly.
    const oscs: OscillatorNode[] = [];
    const dg = ctx.createGain();
    dg.gain.value = 0.0;
    dg.gain.setTargetAtTime(0.09, ctx.currentTime, 3);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 500;
    for (const [f, type] of [[midi(38), "sawtooth"], [midi(45), "sawtooth"], [midi(50), "triangle"]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      o.connect(lp);
      o.start();
      oscs.push(o);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 180;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start();
    lp.connect(dg);
    dg.connect(this.musicBus);
    this.drone = {
      stop: () => {
        dg.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
        setTimeout(() => [...oscs, lfo].forEach((o) => o.stop()), 2000);
      },
    };
    this.next = ctx.currentTime + 0.5;
    this.step = 0;
    // A lute plays a slow modal tune over it, with a frame drum every other bar.
    const beat = 0.75;
    const tick = () => {
      if (!this.ctx) return;
      while (this.next < this.ctx.currentTime + 1) {
        const t = this.next;
        const k = this.step % 16;
        if (k % 2 === 0 && Math.random() < 0.8) {
          const n = D_DORIAN[Math.floor(Math.abs(Math.sin(this.step * 1.7) * D_DORIAN.length)) % D_DORIAN.length]!;
          this.tone(this.musicBus, midi(n), t, 1.6, { type: "triangle", gain: 0.09 });
          this.tone(this.musicBus, midi(n) * 2, t, 0.5, { type: "sine", gain: 0.02 });
        }
        if (k === 0 || k === 8) {
          this.tone(this.musicBus, midi(50), t, 3, { type: "triangle", gain: 0.05 });
          this.tone(this.musicBus, midi(57), t, 3, { type: "triangle", gain: 0.04 });
        }
        if (Math.floor(this.step / 16) % 2 === 1 && (k === 0 || k === 6 || k === 8)) {
          const ctx2 = this.ctx;
          const o = ctx2.createOscillator();
          o.frequency.setValueAtTime(80, t);
          o.frequency.exponentialRampToValueAtTime(48, t + 0.3);
          const g = ctx2.createGain();
          g.gain.setValueAtTime(0.18, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
          o.connect(g);
          g.connect(this.musicBus);
          o.start(t);
          o.stop(t + 0.45);
        }
        this.next += beat / 2;
        this.step++;
      }
    };
    this.timer = setInterval(tick, 200);
  }

  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.drone?.stop();
    this.drone = null;
  }
}

export const audio = new BannersAudio();
