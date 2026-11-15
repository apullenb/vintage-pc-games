// Tiny WebAudio chiptune blips. No sample files.
export type Sfx = 'click' | 'select' | 'coin' | 'spend' | 'bad' | 'good' | 'page' | 'star' | 'week' | 'type' | 'fanfare';

let ac: AudioContext | null = null;
let out: GainNode | null = null;
let muted = false;
const last = new Map<Sfx, number>();

export function setMuted(m: boolean): void {
  muted = m;
  if (ac && out) out.gain.setValueAtTime(m ? 0 : 0.22, ac.currentTime);
}

export function unlockAudio(): void {
  if (!ac) {
    try {
      ac = new AudioContext();
      out = ac.createGain();
      out.gain.value = muted ? 0 : 0.22;
      out.connect(ac.destination);
    } catch {
      ac = null;
      return;
    }
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
}

function tone(type: OscillatorType, f0: number, f1: number, at: number, dur: number, vol: number): void {
  if (!ac || !out) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, at);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g);
  g.connect(out);
  o.start(at);
  o.stop(at + dur + 0.02);
}

export function sfx(k: Sfx): void {
  if (!ac || muted) return;
  const now = ac.currentTime;
  if (now - (last.get(k) ?? -1) < 0.04) return;
  last.set(k, now);
  const n = (i: number) => 440 * Math.pow(2, (i - 9) / 12);
  switch (k) {
    case 'type':
      tone('square', 900 + Math.random() * 200, 900, now, 0.015, 0.03);
      break;
    case 'click':
      tone('square', 660, 660, now, 0.04, 0.12);
      break;
    case 'select':
      tone('square', 520, 780, now, 0.06, 0.12);
      break;
    case 'page':
      tone('triangle', 300, 600, now, 0.08, 0.15);
      break;
    case 'coin':
      tone('square', n(23), n(23), now, 0.06, 0.14);
      tone('square', n(28), n(28), now + 0.06, 0.14, 0.14);
      break;
    case 'spend':
      tone('square', n(16), n(11), now, 0.12, 0.1);
      break;
    case 'bad':
      tone('sawtooth', 220, 110, now, 0.25, 0.12);
      break;
    case 'good':
      [0, 4, 7].forEach((s, i) => tone('square', n(12 + s), n(12 + s), now + i * 0.07, 0.1, 0.12));
      break;
    case 'star':
      [0, 4, 7, 12].forEach((s, i) => tone('triangle', n(19 + s), n(19 + s), now + i * 0.06, 0.12, 0.18));
      break;
    case 'week':
      tone('triangle', n(7), n(7), now, 0.08, 0.14);
      tone('triangle', n(12), n(12), now + 0.09, 0.12, 0.14);
      break;
    case 'fanfare':
      [0, 4, 7, 12, 7, 12].forEach((s, i) => tone('square', n(12 + s), n(12 + s), now + i * 0.11, 0.16, 0.13));
      break;
  }
}
