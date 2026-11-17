// A tiny WebAudio synth for River Run and Lawn Gig: chiptune blips, filtered-noise splashes and
// thuds, and looping ambience (running water, a mower engine) whose level and pitch follow the game.
// Respects the player's mute setting (read when the game starts, like the other action games).
import { loadMeta } from '../ui/save.ts';

export const note = (semi: number): number => 440 * Math.pow(2, (semi - 9) / 12);

export class Chip {
  private ac: AudioContext | null = null;
  private out: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private loops: { stop: () => void }[] = [];
  private last = new Map<string, number>();
  muted = false;

  init(): void {
    this.muted = loadMeta().muted;
    if (this.muted) return;
    if (!this.ac) {
      try {
        this.ac = new AudioContext();
        this.out = this.ac.createGain();
        this.out.gain.value = 0.22;
        this.out.connect(this.ac.destination);
        const n = this.ac.sampleRate * 2;
        this.noiseBuf = this.ac.createBuffer(1, n, this.ac.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        this.ac = null;
      }
    }
    if (this.ac && this.ac.state === 'suspended') this.ac.resume().catch(() => {});
  }

  // Rate-limit a named sound (rapid repeats blur into mush).
  gate(key: string, gap: number): boolean {
    if (!this.ac) return false;
    const now = this.ac.currentTime;
    if (now - (this.last.get(key) ?? -9) < gap) return false;
    this.last.set(key, now);
    return true;
  }

  beep(f0: number, dur: number, type: OscillatorType = 'square', vol = 0.1, f1 = f0, delay = 0): void {
    const { ac, out } = this;
    if (!ac || !out || this.muted) return;
    const at = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(out);
    o.start(at);
    o.stop(at + dur + 0.03);
  }

  // Filtered noise burst: low cutoff = thud, high = splash/crash. sweep moves the cutoff over time.
  noise(dur: number, vol = 0.2, cutoff = 1800, delay = 0, sweep = cutoff, type: BiquadFilterType = 'lowpass'): void {
    const { ac, out, noiseBuf } = this;
    if (!ac || !out || !noiseBuf || this.muted) return;
    const at = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(cutoff, at);
    if (sweep !== cutoff) f.frequency.exponentialRampToValueAtTime(Math.max(30, sweep), at + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(at, Math.random() * 1.5);
    src.stop(at + dur + 0.05);
  }

  // Looping filtered noise (water, wind). Returns a handle to steer it.
  noiseLoop(cutoff: number, vol: number): { set: (cutoff: number, vol: number) => void; stop: () => void } {
    const { ac, out, noiseBuf } = this;
    const nop = { set: () => {}, stop: () => {} };
    if (!ac || !out || !noiseBuf || this.muted) return nop;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ac.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(vol, ac.currentTime, 0.4);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start();
    const h = {
      set: (c: number, v: number) => {
        f.frequency.setTargetAtTime(c, ac.currentTime, 0.15);
        g.gain.setTargetAtTime(Math.max(0.0001, v), ac.currentTime, 0.15);
      },
      stop: () => {
        try {
          g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.08);
          src.stop(ac.currentTime + 0.4);
        } catch {
          // already stopped
        }
      },
    };
    this.loops.push(h);
    return h;
  }

  // A buzzing two-oscillator engine (the mower). set(pitch Hz, level 0..1).
  engine(): { set: (hz: number, level: number) => void; stop: () => void } {
    const { ac, out } = this;
    const nop = { set: () => {}, stop: () => {} };
    if (!ac || !out || this.muted) return nop;
    const a = ac.createOscillator();
    const b = ac.createOscillator();
    a.type = 'sawtooth';
    b.type = 'square';
    a.frequency.value = 50;
    b.frequency.value = 25.5;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    f.Q.value = 3;
    const g = ac.createGain();
    g.gain.value = 0.0001;
    a.connect(f);
    b.connect(f);
    f.connect(g);
    g.connect(out);
    a.start();
    b.start();
    const h = {
      set: (hz: number, level: number) => {
        const t = ac.currentTime;
        a.frequency.setTargetAtTime(hz, t, 0.08);
        b.frequency.setTargetAtTime(hz / 2 + 0.7, t, 0.08);
        f.frequency.setTargetAtTime(260 + hz * 4, t, 0.1);
        g.gain.setTargetAtTime(Math.max(0.0001, level * 0.07), t, 0.1);
      },
      stop: () => {
        try {
          g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.05);
          a.stop(ac.currentTime + 0.3);
          b.stop(ac.currentTime + 0.3);
        } catch {
          // already stopped
        }
      },
    };
    this.loops.push(h);
    return h;
  }

  // A little voice: a few quick pitched blips, like someone shouting from a distance.
  babble(base: number, n = 3): void {
    for (let i = 0; i < n; i++) this.beep(note(base + [0, 4, 2, 7, 5][i % 5] + Math.floor(Math.random() * 3)), 0.045, 'square', 0.05, undefined, i * 0.06);
  }

  arp(semis: number[], step = 0.07, type: OscillatorType = 'square', vol = 0.09, len = 0.12): void {
    semis.forEach((s, i) => this.beep(note(s), len, type, vol, note(s), i * step));
  }

  stopAll(): void {
    for (const l of this.loops) l.stop();
    this.loops = [];
  }
}
