/** Synthesised gym sounds: a crowd murmur, punches, the bell. Nothing is downloaded. */
export class BoxingSfx {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private crowdGain: GainNode | null = null;

  private get c() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        const len = this.ctx.sampleRate * 2;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
          last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // brownish noise
          d[i] = last * 3.5;
        }
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Start the murmur of the crowd. */
  crowd() {
    const c = this.c;
    if (!c || !this.noise || this.crowdGain) return;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 650;
    f.Q.value = 0.4;
    const g = (this.crowdGain = c.createGain());
    g.gain.value = 0.22;
    s.connect(f).connect(g).connect(c.destination);
    s.start();
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number) {
    const c = this.c;
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur);
  }

  private burst(dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = "lowpass") {
    const c = this.c;
    if (!c || !this.noise) return;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    s.connect(f).connect(g).connect(c.destination);
    s.start(0, Math.random());
    s.stop(c.currentTime + dur);
  }

  /** The crowd roars for a moment. */
  private roar(amount: number) {
    const c = this.ctx;
    if (!c || !this.crowdGain) return;
    const g = this.crowdGain.gain;
    g.cancelScheduledValues(c.currentTime);
    g.setValueAtTime(g.value, c.currentTime);
    g.linearRampToValueAtTime(0.22 + amount * 0.3, c.currentTime + 0.1);
    g.linearRampToValueAtTime(0.22, c.currentTime + 1.6);
  }

  play(kind: string, power = 1) {
    switch (kind) {
      case "hit":
        this.burst(0.16, 0.9 * power + 0.3, 420, 1.2);
        this.tone("sine", 140, 45, 0.16, 0.45 * power + 0.15);
        this.roar(power);
        break;
      case "hurt":
        this.burst(0.2, 1.1 * power + 0.3, 300, 1);
        this.tone("sine", 110, 35, 0.22, 0.6 * power + 0.2);
        this.roar(power * 0.7);
        break;
      case "block":
        this.burst(0.09, 0.5, 700, 1.4);
        this.tone("sine", 190, 90, 0.08, 0.2);
        break;
      case "whoosh":
        this.burst(0.18, 0.18 * power + 0.05, 1800, 0.8, "bandpass");
        break;
      case "thud":
        this.burst(0.5, 1.2, 220, 1);
        this.tone("sine", 70, 28, 0.5, 0.7);
        this.roar(1);
        break;
      case "beep":
        this.tone("square", 520, 520, 0.1, 0.06);
        break;
      case "bell":
        for (const [f, v] of [[1180, 0.2], [1770, 0.12], [2360, 0.08]] as const) this.tone("triangle", f, f * 0.99, 1.6, v);
        this.roar(0.6);
        break;
    }
  }

  /** A slow low pulse for when you are hurt. */
  heartbeat() {
    this.tone("sine", 60, 40, 0.18, 0.5);
    setTimeout(() => this.tone("sine", 55, 38, 0.16, 0.35), 180);
  }

  close() {
    void this.ctx?.close();
    this.ctx = null;
    this.crowdGain = null;
  }
}
