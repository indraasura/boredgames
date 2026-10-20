/**
 * All sound is synthesised with the Web Audio API, so the game ships no audio files.
 * `sfx()` plays short effects; `startMusic()` runs a small generative band whose scale,
 * tempo and instruments change with each map's theme.
 */

export type SfxName =
  | "click"
  | "choice"
  | "pick"
  | "tick"
  | "spinStop"
  | "hop"
  | "land"
  | "coins"
  | "payday"
  | "good"
  | "bad"
  | "card"
  | "baby"
  | "wedding"
  | "house"
  | "buy"
  | "sell"
  | "marketUp"
  | "marketDown"
  | "loan"
  | "focus"
  | "dream"
  | "fanfare"
  | "retire"
  | "yourTurn"
  | "error";

export type MusicMood = "island" | "alpine" | "city" | "desert" | "menu";

export interface AudioPrefs {
  sfx: boolean;
  music: boolean;
}

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Mood {
  bpm: number;
  root: number;
  scale: number[];
  /** [semitones above the root, quality] per bar. */
  chords: [number, "maj" | "min"][];
  lead: OscillatorType;
  leadLen: number;
  leadChance: number;
  pad: OscillatorType;
  bass: boolean;
  arp: boolean;
  perc: "none" | "soft" | "club" | "drum";
}

const MOODS: Record<MusicMood, Mood> = {
  island: {
    bpm: 100,
    root: 60,
    scale: [0, 2, 4, 7, 9],
    chords: [[0, "maj"], [5, "maj"], [9, "min"], [7, "maj"]],
    lead: "triangle",
    leadLen: 0.35,
    leadChance: 0.55,
    pad: "sine",
    bass: true,
    arp: true,
    perc: "soft",
  },
  alpine: {
    bpm: 74,
    root: 62,
    scale: [0, 2, 4, 6, 7, 9, 11],
    chords: [[0, "maj"], [7, "maj"], [9, "min"], [5, "maj"]],
    lead: "sine",
    leadLen: 1.1,
    leadChance: 0.4,
    pad: "triangle",
    bass: true,
    arp: false,
    perc: "none",
  },
  city: {
    bpm: 112,
    root: 57,
    scale: [0, 3, 5, 7, 10],
    chords: [[0, "min"], [8, "maj"], [3, "maj"], [10, "maj"]],
    lead: "square",
    leadLen: 0.18,
    leadChance: 0.5,
    pad: "sawtooth",
    bass: true,
    arp: true,
    perc: "club",
  },
  desert: {
    bpm: 90,
    root: 62,
    scale: [0, 1, 4, 5, 7, 8, 10],
    chords: [[0, "maj"], [1, "maj"], [0, "maj"], [10, "maj"]],
    lead: "triangle",
    leadLen: 0.4,
    leadChance: 0.5,
    pad: "sawtooth",
    bass: true,
    arp: false,
    perc: "drum",
  },
  menu: {
    bpm: 84,
    root: 60,
    scale: [0, 2, 4, 7, 9],
    chords: [[0, "maj"], [9, "min"], [5, "maj"], [7, "maj"]],
    lead: "sine",
    leadLen: 0.7,
    leadChance: 0.4,
    pad: "sine",
    bass: false,
    arp: true,
    perc: "none",
  },
};

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  /** Seconds the note takes to fade out after `dur`. */
  release?: number;
  slideTo?: number;
  detune?: number;
  lowpass?: number;
  bus?: GainNode;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise: AudioBuffer | null = null;
  private prefsValue: AudioPrefs = { sfx: true, music: true };
  private listeners = new Set<() => void>();

  private mood: MusicMood | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
  private melodyPos = 2;
  private lastHidden = false;

  constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (!this.ctx) return;
        if (document.hidden) {
          this.lastHidden = true;
          void this.ctx.suspend();
        } else if (this.lastHidden) {
          this.lastHidden = false;
          void this.ctx.resume();
        }
      });
    }
  }

  // ---------------------------------------------------------------- prefs

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getPrefs = (): AudioPrefs => this.prefsValue;

  setPrefs(patch: Partial<AudioPrefs>) {
    this.prefsValue = { ...this.prefsValue, ...patch };
    if (this.ctx) this.musicBus.gain.setTargetAtTime(this.prefsValue.music ? 0.5 : 0, this.ctx.currentTime, 0.1);
    this.listeners.forEach((fn) => fn());
  }

  /** Must be called from a user gesture (a click) at least once. */
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.8;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.prefsValue.music ? 0.5 : 0;
      this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (this.mood && !this.timer) this.runMusic();
  }

  // ----------------------------------------------------------- primitives

  private tone(freq: number, t0: number, dur: number, o: ToneOpts = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const peak = o.gain ?? 0.2;
    const attack = o.attack ?? 0.006;
    const release = o.release ?? 0.08;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.setValueAtTime(peak, t0 + Math.max(attack, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + release);
    let node: AudioNode = osc;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.lowpass;
      osc.connect(f);
      node = f;
    }
    node.connect(g).connect(o.bus ?? this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + release + 0.05);
  }

  private hiss(t0: number, dur: number, o: { gain?: number; type?: BiquadFilterType; freq?: number; q?: number; sweepTo?: number; bus?: GainNode } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? "bandpass";
    f.frequency.setValueAtTime(o.freq ?? 2000, t0);
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t0 + dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const peak = o.gain ?? 0.15;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(o.bus ?? this.sfxBus);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  // ------------------------------------------------------------------ sfx

  sfx(name: SfxName, arg = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.prefsValue.sfx || ctx.state !== "running") return;
    const t = ctx.currentTime + 0.01;
    const bell = (f: number, at: number, dur = 0.5, gain = 0.14) => {
      this.tone(f, at, dur * 0.2, { type: "sine", gain, release: dur });
      this.tone(f * 2.01, at, dur * 0.1, { type: "sine", gain: gain * 0.35, release: dur * 0.6 });
    };
    const run = (notes: number[], step: number, o: ToneOpts, len = 0.09) =>
      notes.forEach((n, i) => this.tone(midi(n), t + i * step, len, o));

    switch (name) {
      case "click":
        this.tone(900, t, 0.025, { type: "triangle", gain: 0.12, release: 0.04 });
        break;
      case "pick":
        this.tone(660, t, 0.05, { type: "triangle", gain: 0.16, release: 0.06 });
        this.tone(990, t + 0.05, 0.08, { type: "triangle", gain: 0.14, release: 0.1 });
        break;
      case "choice":
        this.tone(520, t, 0.07, { type: "sine", gain: 0.16, slideTo: 880, release: 0.1 });
        break;
      case "tick":
        this.tone(1500 + arg * 40, t, 0.012, { type: "square", gain: 0.05, release: 0.02, lowpass: 3500 });
        break;
      case "spinStop":
        this.tone(170, t, 0.12, { type: "sine", gain: 0.3, slideTo: 70, release: 0.1 });
        bell(988, t + 0.02, 0.5, 0.12);
        break;
      case "hop":
        this.tone(380 + arg * 38, t, 0.07, { type: "sine", gain: 0.13, slideTo: 560 + arg * 38, release: 0.06 });
        break;
      case "land":
        this.tone(130, t, 0.1, { type: "sine", gain: 0.22, slideTo: 60, release: 0.08 });
        break;
      case "coins":
        run([84, 88, 91, 96, 100], 0.055, { type: "triangle", gain: 0.1, release: 0.14 }, 0.05);
        break;
      case "payday":
        bell(1318, t, 0.7, 0.16);
        bell(1760, t + 0.09, 0.8, 0.12);
        run([84, 88, 91, 96, 100, 103], 0.05, { type: "triangle", gain: 0.08, release: 0.12 }, 0.04);
        break;
      case "good":
        run([72, 76, 79, 84], 0.085, { type: "triangle", gain: 0.15, release: 0.16 });
        break;
      case "bad":
        this.tone(midi(64), t, 0.14, { type: "square", gain: 0.08, lowpass: 900, release: 0.08 });
        this.tone(midi(59), t + 0.14, 0.2, { type: "square", gain: 0.08, lowpass: 700, release: 0.15 });
        break;
      case "card":
        this.hiss(t, 0.22, { gain: 0.1, freq: 600, sweepTo: 4200, q: 1.5 });
        break;
      case "baby":
        run([76, 79, 84, 79, 83], 0.16, { type: "sine", gain: 0.13, release: 0.3 }, 0.12);
        break;
      case "wedding":
        [72, 76, 79, 84].forEach((n, i) => bell(midi(n), t + i * 0.13, 1.4, 0.12));
        break;
      case "house":
        this.tone(160, t, 0.1, { type: "sine", gain: 0.25, slideTo: 80, release: 0.1 });
        [91, 96, 100, 103].forEach((n, i) => bell(midi(n), t + 0.1 + i * 0.06, 0.4, 0.08));
        break;
      case "buy":
        this.hiss(t, 0.03, { gain: 0.15, type: "highpass", freq: 3000 });
        bell(2093, t + 0.03, 0.55, 0.14);
        bell(2637, t + 0.12, 0.65, 0.1);
        break;
      case "sell":
        bell(2637, t, 0.4, 0.1);
        bell(1568, t + 0.09, 0.5, 0.12);
        break;
      case "marketUp":
        run([67, 71, 74, 79, 83], 0.07, { type: "sawtooth", gain: 0.06, lowpass: 2200, release: 0.14 });
        break;
      case "marketDown":
        run([79, 74, 70, 65, 58], 0.09, { type: "sawtooth", gain: 0.06, lowpass: 1400, release: 0.16 });
        break;
      case "loan":
        this.tone(95, t, 0.18, { type: "sawtooth", gain: 0.14, lowpass: 400, release: 0.12 });
        this.tone(88, t + 0.1, 0.2, { type: "sawtooth", gain: 0.12, lowpass: 360, release: 0.15 });
        break;
      case "focus":
        this.tone(1568, t, 0.12, { type: "sine", gain: 0.09, release: 0.25, detune: 8 });
        this.tone(2093, t + 0.07, 0.12, { type: "sine", gain: 0.07, release: 0.3 });
        break;
      case "dream":
        run([79, 83, 86, 91, 95], 0.06, { type: "sine", gain: 0.1, release: 0.3 }, 0.1);
        break;
      case "fanfare":
        [60, 64, 67, 72].forEach((n, i) => this.tone(midi(n), t + i * 0.13, 0.16, { type: "sawtooth", gain: 0.08, lowpass: 2400, release: 0.1 }));
        [60, 64, 67, 72, 76].forEach((n) => this.tone(midi(n), t + 0.6, 0.7, { type: "sawtooth", gain: 0.055, lowpass: 2000, release: 0.5 }));
        break;
      case "retire":
        [67, 72, 76].forEach((n, i) => bell(midi(n), t + i * 0.2, 1.4, 0.11));
        break;
      case "yourTurn":
        bell(880, t, 0.35, 0.08);
        bell(1175, t + 0.1, 0.45, 0.08);
        break;
      case "error":
        this.tone(140, t, 0.12, { type: "square", gain: 0.08, lowpass: 600, release: 0.06 });
        break;
    }
  }

  /** The tick-tick-tick of a wheel slowing down. */
  wheel(ms: number) {
    if (!this.ctx || !this.prefsValue.sfx) return;
    let at = 0;
    let gap = 38;
    let i = 0;
    while (at < ms - 60) {
      const when = at;
      const idx = i++ % 6;
      setTimeout(() => this.sfx("tick", idx), when);
      at += gap;
      gap *= 1.075;
    }
  }

  // ---------------------------------------------------------------- music

  startMusic(mood: MusicMood) {
    if (this.mood === mood && this.timer) return;
    this.stopMusic();
    this.mood = mood;
    this.step = 0;
    this.melodyPos = 2;
    if (this.ctx && this.ctx.state === "running") this.runMusic();
  }

  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.mood = null;
  }

  private runMusic() {
    const ctx = this.ctx;
    if (!ctx || !this.mood || this.timer) return;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => {
      if (!this.ctx || !this.mood) return;
      if (this.ctx.state !== "running") {
        this.nextTime = this.ctx.currentTime + 0.1;
        return;
      }
      while (this.nextTime < this.ctx.currentTime + 0.25) {
        this.playStep(MOODS[this.mood], this.nextTime, this.step);
        this.nextTime += 60 / MOODS[this.mood].bpm / 4;
        this.step++;
      }
    }, 60);
  }

  private playStep(m: Mood, t: number, step: number) {
    const bar = Math.floor(step / 16) % m.chords.length;
    const s16 = step % 16;
    const [offset, quality] = m.chords[bar]!;
    const base = m.root + offset;
    const third = quality === "maj" ? 4 : 3;
    const tones = [base, base + third, base + 7];
    const bus = this.musicBus;
    const beat = 60 / m.bpm;

    // Pad: one soft chord per bar.
    if (s16 === 0) {
      tones.forEach((n, i) =>
        this.tone(midi(n - 12), t, beat * 3.6, {
          type: m.pad,
          gain: m.pad === "sawtooth" ? 0.018 : 0.04,
          attack: beat * 0.8,
          release: beat * 1.2,
          detune: (i - 1) * 6,
          lowpass: 900,
          bus,
        }),
      );
    }
    // Bass.
    if (m.bass && (s16 === 0 || s16 === 8 || (m.perc === "club" && (s16 === 6 || s16 === 14)))) {
      this.tone(midi(base - 24), t, beat * 0.9, {
        type: m.perc === "club" ? "sawtooth" : "triangle",
        gain: m.perc === "club" ? 0.07 : 0.11,
        lowpass: 420,
        release: 0.1,
        bus,
      });
    }
    // Arpeggio.
    if (m.arp && s16 % 2 === 0) {
      const n = tones[(s16 / 2) % 3]! + 12 + (s16 % 8 === 4 ? 12 : 0);
      this.tone(midi(n), t, 0.09, { type: m.lead === "square" ? "square" : "triangle", gain: 0.045, lowpass: 2600, release: 0.12, bus });
    }
    // Melody: a gentle random walk over the scale.
    if (s16 % 2 === 0 && Math.random() < m.leadChance && (s16 !== 0 || Math.random() < 0.6)) {
      this.melodyPos = Math.max(0, Math.min(m.scale.length * 2 - 1, this.melodyPos + Math.round((Math.random() - 0.5) * 4)));
      const oct = Math.floor(this.melodyPos / m.scale.length);
      const n = m.root + 12 + m.scale[this.melodyPos % m.scale.length]! + oct * 12 + (offset === 0 ? 0 : 0);
      this.tone(midi(n), t, m.leadLen * beat, { type: m.lead, gain: m.lead === "square" ? 0.03 : 0.07, lowpass: 3200, release: m.leadLen * beat * 0.8, bus });
    }
    // Percussion.
    if (m.perc === "club") {
      if (s16 % 8 === 0) this.tone(120, t, 0.12, { type: "sine", gain: 0.2, slideTo: 45, release: 0.08, bus });
      if (s16 % 4 === 2) this.hiss(t, 0.04, { gain: 0.05, type: "highpass", freq: 7000, bus });
    } else if (m.perc === "soft") {
      if (s16 % 8 === 4) this.hiss(t, 0.05, { gain: 0.035, type: "bandpass", freq: 4500, bus });
    } else if (m.perc === "drum") {
      if (s16 === 0 || s16 === 10) this.tone(140, t, 0.14, { type: "sine", gain: 0.18, slideTo: 70, release: 0.1, bus });
      if (s16 === 4 || s16 === 12 || s16 === 14) this.hiss(t, 0.06, { gain: 0.05, type: "bandpass", freq: 1800, q: 2, bus });
    }
  }
}

export const audio = new AudioEngine();
