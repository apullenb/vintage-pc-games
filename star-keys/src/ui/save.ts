// Progress + settings in localStorage; every access guarded (private mode, quota, disabled storage).

const KEY = 'star-keys.save.v1';

export interface WorldBest {
  stars: number; // 0..3
  wpm: number;
  acc: number; // 0..1
}

interface SaveData {
  worlds: Record<string, WorldBest>; // present once a world was escaped
  muted: boolean;
  keyboard: boolean; // on-screen keyboard visible
}

const num = (v: unknown, lo: number, hi: number): number => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);

function load(): SaveData {
  const d: SaveData = { worlds: {}, muted: false, keyboard: true };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<SaveData>;
    if (p.worlds && typeof p.worlds === 'object') {
      for (const [k, v] of Object.entries(p.worlds)) {
        if (!v || typeof v !== 'object') continue;
        d.worlds[k] = { stars: Math.round(num(v.stars, 0, 3)), wpm: num(v.wpm, 0, 999), acc: num(v.acc, 0, 1) };
      }
    }
    d.muted = p.muted === true;
    d.keyboard = p.keyboard !== false;
  } catch {
    // corrupt / unavailable storage
  }
  return d;
}

const data = load();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage unavailable; progress lives for this session only
  }
}

export function best(id: string): WorldBest | undefined {
  return data.worlds[id];
}

export interface NewBests {
  stars: boolean;
  wpm: boolean;
  acc: boolean;
}

// Records an escaped run; returns which bests improved.
export function recordWin(id: string, stars: number, wpm: number, acc: number): NewBests {
  const prev = data.worlds[id];
  const nb: NewBests = {
    stars: !prev || stars > prev.stars,
    wpm: !prev || wpm > prev.wpm,
    acc: !prev || acc > prev.acc,
  };
  data.worlds[id] = {
    stars: Math.max(prev?.stars ?? 0, stars),
    wpm: Math.max(prev?.wpm ?? 0, Math.round(wpm)),
    acc: Math.max(prev?.acc ?? 0, acc),
  };
  persist();
  return nb;
}

export function totalStars(): number {
  let n = 0;
  for (const w of Object.values(data.worlds)) n += w.stars;
  return n;
}

export function getMuted(): boolean {
  return data.muted;
}

export function setMuted(m: boolean): void {
  data.muted = m;
  persist();
}

export function getKeyboardVisible(): boolean {
  return data.keyboard;
}

export function setKeyboardVisible(v: boolean): void {
  data.keyboard = v;
  persist();
}
