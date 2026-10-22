// Synthesised sound: no audio files, everything is built from oscillators and noise with Web Audio.
// Browsers only allow audio after a user gesture, so the context starts on the first key, click or pad press.

type WhistleKind = 'short' | 'long' | 'end';

export class Sound {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private crowdGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private excitement = 0;
  private roar = 0;

  constructor() {
    try { this.muted = localStorage.getItem('tbg-muted') === '1'; } catch { /* storage unavailable */ }
    const start = () => this.start();
    addEventListener('keydown', start);
    addEventListener('pointerdown', start);
  }

  /** Creates or resumes the audio context; safe to call repeatedly (e.g. on gamepad input). */
  start(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);
    this.noise = this.makeNoise(4);
    this.startCrowd();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    try { localStorage.setItem('tbg-muted', this.muted ? '1' : '0'); } catch { /* storage unavailable */ }
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /** A boot on the ball: a low thump plus a short scuff of noise, louder for harder strikes. */
  kick(power: number): void {
    const ctx = this.ctx, out = this.master;
    if (!ctx || !out) return;
    const t = ctx.currentTime, vol = 0.25 + 0.55 * power;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.frequency.setValueAtTime(140 + 60 * power, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g).connect(out);
    osc.start(t); osc.stop(t + 0.18);
    this.noiseBurst(t, 0.05, 1800, vol * 0.5);
  }

  /** Ball against the woodwork. */
  post(): void {
    const ctx = this.ctx, out = this.master;
    if (!ctx || !out) return;
    const t = ctx.currentTime;
    for (const [f, v] of [[880, 0.3], [1320, 0.15], [2093, 0.08]] as const) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + 0.65);
    }
    this.roar = Math.max(this.roar, 0.6);
  }

  /** Referee's pea whistle: a high tone with a fast trill. */
  whistle(kind: WhistleKind): void {
    const ctx = this.ctx, out = this.master;
    if (!ctx || !out) return;
    const blasts = kind === 'end' ? [[0, 0.35], [0.5, 0.35], [1.0, 0.9]] : kind === 'long' ? [[0, 0.8]] : [[0, 0.22]];
    for (const [at, len] of blasts) {
      const t = ctx.currentTime + at;
      const o = ctx.createOscillator(), trill = ctx.createOscillator(), depth = ctx.createGain(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = 2900;
      trill.frequency.value = 28;
      depth.gain.value = 140;
      trill.connect(depth).connect(o.frequency);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.02);
      g.gain.setValueAtTime(0.12, t + len - 0.04);
      g.gain.linearRampToValueAtTime(0, t + len);
      o.connect(g).connect(out);
      o.start(t); trill.start(t); o.stop(t + len + 0.05); trill.stop(t + len + 0.05);
    }
  }

  goal(): void { this.roar = 1; }

  /** 0..1, how dangerous the play looks; the crowd follows it. Call every frame. */
  setExcitement(e: number, dt: number): void {
    this.excitement += (e - this.excitement) * Math.min(1, dt * 1.5);
    this.roar = Math.max(0, this.roar - dt * 0.18);
    if (this.ctx && this.crowdGain) {
      const level = 0.06 + 0.12 * this.excitement + 0.35 * this.roar;
      this.crowdGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.1);
    }
  }

  private startCrowd(): void {
    const ctx = this.ctx!, out = this.master!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass'; band.frequency.value = 650; band.Q.value = 0.6;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass'; low.frequency.value = 2200;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.06;
    src.connect(band).connect(low).connect(this.crowdGain).connect(out);
    src.start();
  }

  private noiseBurst(t: number, len: number, freq: number, vol: number): void {
    const ctx = this.ctx!, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise;
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 3, len + 0.02);
  }

  /** Pink-ish noise (white noise through a one-pole filter), which reads as a crowd rather than hiss. */
  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!, buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { last = 0.97 * last + 0.03 * (Math.random() * 2 - 1); d[i] = last * 6; }
    return buf;
  }
}
