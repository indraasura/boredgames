/** Tiny synthesised effects (no sound files). One context per page, started by the first click or key. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  private get c() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        const len = this.ctx.sampleRate * 0.5;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number) {
    const c = this.c;
    if (!c || this.muted) return;
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

  private hiss(dur: number, vol: number, freq: number) {
    const c = this.c;
    if (!c || !this.noise || this.muted) return;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    s.connect(f).connect(g).connect(c.destination);
    s.start();
    s.stop(c.currentTime + dur);
  }

  play(kind: string, power = 1) {
    switch (kind) {
      case "hit":
        this.tone("square", 220 + Math.random() * 80, 60, 0.12, 0.08 * power);
        this.hiss(0.1, 0.12 * power, 2500);
        break;
      case "break":
        this.hiss(0.35, 0.3, 700);
        this.tone("sawtooth", 160, 40, 0.3, 0.12);
        break;
      case "wall":
        this.tone("sine", 90, 40, 0.15, 0.2 * power);
        break;
      case "swing":
        this.hiss(0.18, 0.15, 900);
        break;
      case "boost":
        this.hiss(0.5, 0.2, 400);
        break;
      case "beep":
        this.tone("square", 660, 660, 0.12, 0.1);
        break;
      case "go":
        this.tone("square", 990, 990, 0.35, 0.12);
        break;
      case "bell":
        this.tone("triangle", 880, 880, 1.0, 0.2);
        this.tone("triangle", 1320, 1320, 0.8, 0.1);
        break;
    }
  }

  close() {
    void this.ctx?.close();
    this.ctx = null;
  }
}
