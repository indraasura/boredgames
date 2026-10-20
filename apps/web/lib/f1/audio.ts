/** Engine, tyre and weather sound, all synthesised in the browser. */

interface Voice {
  osc: OscillatorNode[];
  gain: GainNode;
  filter: BiquadFilterNode;
  pan: StereoPannerNode;
}

export interface EngineState {
  rpm: number;
  throttle: number;
}

export interface OtherCar extends EngineState {
  /** Metres, and which side: -1 left .. 1 right. */
  distance: number;
  side: number;
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export class F1Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private player!: Voice;
  private others: Voice[] = [];
  private squeal!: { gain: GainNode; filter: BiquadFilterNode };
  private wind!: { gain: GainNode; filter: BiquadFilterNode };
  private rain!: { gain: GainNode };
  private rumble!: { gain: GainNode };
  private muted = false;
  private noise!: AudioBuffer;
  private volume = 0.8;

  /** Browsers only allow sound after a click or key press: call this from one. */
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
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.noise = noiseBuffer(ctx);
    this.player = this.voice(0.5);
    for (let i = 0; i < 3; i++) this.others.push(this.voice(0.2));
    this.squeal = this.noiseChain("bandpass", 1500, 5);
    this.wind = this.noiseChain("lowpass", 500, 0.7);
    const rainChain = this.noiseChain("highpass", 3000, 0.5);
    this.rain = { gain: rainChain.gain };
    const rum = this.noiseChain("lowpass", 90, 1);
    this.rumble = { gain: rum.gain };
  }

  private voice(level: number): Voice {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1500;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    const osc: OscillatorNode[] = [];
    for (const [type, mult, vol] of [["sawtooth", 1, 0.5], ["square", 0.5, 0.35], ["sawtooth", 2.01, 0.2]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = vol * level;
      o.connect(g);
      g.connect(filter);
      o.start();
      (o as OscillatorNode & { mult?: number }).mult = mult;
      osc.push(o);
    }
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(this.master);
    return { osc, gain, filter, pan };
  }

  private noiseChain(type: BiquadFilterType, freq: number, q: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    return { gain, filter };
  }

  private tuneVoice(v: Voice, s: EngineState, level: number, distance = 0, side = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    // Three firing pulses per turn, so the note is rpm / 20.
    const f = s.rpm / 20;
    for (const o of v.osc) {
      const mult = (o as OscillatorNode & { mult?: number }).mult ?? 1;
      o.frequency.setTargetAtTime(f * mult, t, 0.03);
    }
    v.filter.frequency.setTargetAtTime(700 + s.throttle * 3200 + s.rpm * 0.12, t, 0.05);
    const near = 1 / (1 + distance / 18);
    v.gain.gain.setTargetAtTime(level * (0.25 + 0.75 * s.throttle) * (0.5 + 0.5 * Math.min(1, s.rpm / 12000)) * near, t, 0.05);
    v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, side)), t, 0.05);
  }

  update(player: EngineState & { speed: number; slip: number; offTrack: boolean; rain: number }, others: OtherCar[]) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    this.tuneVoice(this.player, player, 0.55);
    this.others.forEach((v, i) => {
      const o = others[i];
      if (o) this.tuneVoice(v, o, 0.5, o.distance, o.side);
      else v.gain.gain.setTargetAtTime(0, t, 0.1);
    });
    this.squeal.gain.gain.setTargetAtTime(Math.max(0, player.slip - 0.6) * 0.5, t, 0.04);
    this.squeal.filter.frequency.setTargetAtTime(1100 + player.slip * 700, t, 0.1);
    this.wind.gain.gain.setTargetAtTime(Math.min(1, player.speed / 90) ** 2 * 0.22, t, 0.1);
    this.wind.filter.frequency.setTargetAtTime(300 + player.speed * 6, t, 0.1);
    this.rain.gain.gain.setTargetAtTime(player.rain * 0.06, t, 0.5);
    this.rumble.gain.gain.setTargetAtTime(player.offTrack ? Math.min(1, player.speed / 30) * 0.5 : 0, t, 0.08);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  beep(kind: "light" | "green" | "lap" | "best" | "pit" | "warn") {
    switch (kind) {
      case "light":
        this.tone(660, 0.22, "square", 0.12);
        break;
      case "green":
        this.tone(1320, 0.5, "square", 0.14);
        break;
      case "lap":
        this.tone(880, 0.12, "sine", 0.16);
        break;
      case "best":
        this.tone(880, 0.12, "sine", 0.16);
        setTimeout(() => this.tone(1175, 0.2, "sine", 0.16), 110);
        break;
      case "pit":
        this.tone(520, 0.1, "triangle", 0.14);
        setTimeout(() => this.tone(520, 0.1, "triangle", 0.14), 140);
        break;
      case "warn":
        this.tone(300, 0.25, "sawtooth", 0.1);
        break;
    }
  }

  impact(strength: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 600 + strength * 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(1, 0.3 + strength) * 0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.4);
    this.tone(70, 0.3, "sine", 0.4 * strength);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  get isMuted() {
    return this.muted;
  }

  silence() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const v of [this.player, ...this.others]) v.gain.gain.setTargetAtTime(0, t, 0.05);
    for (const n of [this.squeal, this.wind, this.rain, this.rumble]) n.gain.gain.setTargetAtTime(0, t, 0.05);
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }
}
