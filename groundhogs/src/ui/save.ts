// Progress + settings in localStorage; every access guarded (private mode, quota, disabled storage).
import type { LevelDef } from '../types';

const KEY = 'groundhogs.save.v1';

interface SaveData {
  best: Record<string, number>; // level id -> best saved %, present only once won
  muted: boolean;
}

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<SaveData>;
      const best: Record<string, number> = {};
      if (d.best && typeof d.best === 'object') {
        for (const [k, v] of Object.entries(d.best)) if (typeof v === 'number') best[k] = v;
      }
      return { best, muted: d.muted === true };
    }
  } catch {
    // ignore corrupt / unavailable storage
  }
  return { best: {}, muted: false };
}

const data = load();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage unavailable; progress lives for this session only
  }
}

export function bestPct(id: string): number | undefined {
  return data.best[id];
}

export function isCompleted(id: string): boolean {
  return data.best[id] !== undefined;
}

export function isUnlocked(levels: readonly LevelDef[], index: number): boolean {
  if (index <= 0) return true;
  return isCompleted(levels[index].id) || isCompleted(levels[index - 1].id);
}

export function recordWin(id: string, savedPct: number): void {
  data.best[id] = Math.max(data.best[id] ?? 0, savedPct);
  persist();
}

export function getMuted(): boolean {
  return data.muted;
}

export function setMuted(m: boolean): void {
  data.muted = m;
  persist();
}
