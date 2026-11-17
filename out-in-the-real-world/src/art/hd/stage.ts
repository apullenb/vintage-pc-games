// The HD stage: composes a scene (HD painting, or an upscaled pixel painting for
// scenes not repainted yet), HD people, atmosphere and night lighting into a
// 576x324 canvas, and returns the post-processing parameters for it.
import type { SceneArt } from '../../content/types.ts';
import type { ArtId, Look, NpcId, PathId } from '../../engine/types.ts';
import { isOutdoor, type TimeOfDay, type Weather } from '../atmos.ts';
import { CAST, castFor, playerPerson, type Outfit } from '../people.ts';
import { NIGHT_GRADE, sceneSpec, type SceneSpec } from '../scenes.ts';
import type { Light } from '../px.ts';
import { atmosAirHD, atmosGroundHD } from './atmosHD.ts';
import { blit, cachedHD, canvas, glowHD, H, hexOf, HH, HW, rgba, S, W, type Ctx, type RGB } from './kit.ts';
import { drawPersonHD } from './person.ts';
import { fxFor, type FxParams } from './postfx.ts';
import { HD_SCENES } from './scenes/index.ts';
import type { HDSpec } from './scenes/types.ts';

export type { HDSpec };

export interface StageDef {
  player: number;
  npc: number;
  floor: number;
  hd: boolean; // true when the scene has an HD painting
  paint: (x: Ctx, t: number) => void; // background (logical-scaled ctx)
  front: (x: Ctx, t: number) => void; // foreground + night lighting
  fog: number;
  fogColor: string;
  horizon: number;
  bloom: number;
  windows?: [number, number, number, number][];
}

// ---------- night lighting ----------
let lightMap: HTMLCanvasElement | null = null;
const LMW = 96;
const LMH = 54;
// Multiply the frame by an ambient tint plus smooth pools of light (the HD take on
// px.grade), then add a glow where lights run hotter than white.
export function lightHD(x: Ctx, ambient: RGB, lights: Light[]): void {
  if (!lightMap) lightMap = canvas(LMW, LMH);
  const lx = lightMap.getContext('2d');
  if (!lx) return;
  lx.setTransform(LMW / W, 0, 0, LMH / H, 0, 0);
  lx.globalCompositeOperation = 'source-over';
  lx.fillStyle = hexOf(ambient[0] * 255, ambient[1] * 255, ambient[2] * 255);
  lx.fillRect(0, 0, W, H);
  lx.globalCompositeOperation = 'lighter';
  for (const L of lights) {
    const add = L.c.map((v, i) => Math.max(0, Math.min(1, v) - ambient[i]) * 255);
    if (add[0] + add[1] + add[2] < 1) continue;
    const col = (a: number): string => `rgba(${add[0].toFixed(0)},${add[1].toFixed(0)},${add[2].toFixed(0)},${a})`;
    lx.save();
    lx.translate(L.x, L.y);
    lx.scale(1, (L.ry ?? L.r) / L.r);
    const g = lx.createRadialGradient(0, 0, 0, 0, 0, L.r);
    g.addColorStop(0, col(1));
    g.addColorStop(0.3, col(0.66));
    g.addColorStop(0.62, col(0.26));
    g.addColorStop(1, col(0));
    lx.fillStyle = g;
    lx.fillRect(-L.r, -L.r, L.r * 2, L.r * 2);
    lx.restore();
  }
  x.save();
  x.globalCompositeOperation = 'multiply';
  x.imageSmoothingEnabled = true;
  x.drawImage(lightMap, 0, 0, W, H);
  x.restore();
  for (const L of lights) {
    const hot = Math.max(...L.c) - 1;
    if (hot <= 0) continue;
    const m = Math.max(...L.c);
    glowHD(x, L.x, L.y, L.r * 0.75, hexOf((L.c[0] / m) * 255, (L.c[1] / m) * 255, (L.c[2] / m) * 255), Math.min(0.3, hot * 1.3), (L.ry ?? L.r) * 0.75);
  }
}

// ---------- building scene defs ----------
function buildHD(key: string, s: HDSpec): StageDef {
  const layer = (name: string, f: (x: Ctx) => void): HTMLCanvasElement => cachedHD(`hd:${key}:${name}`, f);
  return {
    player: s.player,
    npc: s.npc,
    floor: s.floor,
    hd: true,
    windows: s.windows,
    fog: s.fog ?? 0.08,
    fogColor: s.fogColor ?? '#d8d4e4',
    horizon: s.horizon ?? s.floor - 20,
    bloom: s.bloom ?? 1,
    paint: (x, t) => {
      blit(x, layer('bg', s.bg));
      s.anim?.(x, t);
      if (s.mid) blit(x, layer('mid', s.mid));
      s.anim2?.(x, t);
    },
    front: (x, t) => {
      if (s.fg) blit(x, layer('fg', s.fg));
      s.fgAnim?.(x, t);
      if (s.lights) lightHD(x, s.ambient ?? NIGHT_GRADE.ambient, [NIGHT_GRADE.fill, ...s.lights(t)]);
    },
  };
}

// Soften pixel art before upscaling: blend each pixel with its 3x3 neighborhood so
// dither patterns melt into smooth ramps (the bilinear "N64 texture" feel).
function melt(src: HTMLCanvasElement, k = 0.5): HTMLCanvasElement {
  const c = canvas(src.width, src.height);
  const x = c.getContext('2d');
  const sx = src.getContext('2d');
  if (!x || !sx) return src;
  const w = src.width;
  const h = src.height;
  const a = sx.getImageData(0, 0, w, h);
  const b = x.createImageData(w, h);
  const d = a.data;
  const o = b.data;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const n = (j * w + i) * 4;
      if (d[n + 3] === 0) continue;
      for (let ch = 0; ch < 4; ch++) {
        let sum = 0;
        let wt = 0;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const ii = Math.min(w - 1, Math.max(0, i + di));
            const jj = Math.min(h - 1, Math.max(0, j + dj));
            const m = (jj * w + ii) * 4;
            if (d[m + 3] === 0) continue;
            const ww = (di === 0 ? 2 : 1) * (dj === 0 ? 2 : 1);
            sum += d[m + ch] * ww;
            wt += ww;
          }
        o[n + ch] = ch === 3 ? d[n + 3] : d[n + ch] * (1 - k) + (sum / wt) * k;
      }
    }
  x.putImageData(b, 0, 0);
  return c;
}

const LOW = new Map<string, HTMLCanvasElement>();
function lowLayer(key: string, f: (x: Ctx) => void, soft: boolean): HTMLCanvasElement {
  let c = LOW.get(key);
  if (!c) {
    c = canvas(W, H);
    const x = c.getContext('2d');
    if (x) {
      x.imageSmoothingEnabled = false;
      f(x);
    }
    if (soft) c = melt(c);
    LOW.set(key, c);
  }
  return c;
}

function buildFallback(key: string, s: SceneSpec): StageDef {
  const low = canvas(W, H);
  const lowF = canvas(W, H);
  const lx = low.getContext('2d') as Ctx;
  const fx = lowF.getContext('2d') as Ctx;
  lx.imageSmoothingEnabled = false;
  fx.imageSmoothingEnabled = false;
  const up = (x: Ctx, c: HTMLCanvasElement): void => {
    x.save();
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(c, 0, 0, W, H);
    x.restore();
  };
  const out = isOutdoor(key.split(':')[0] as SceneArt);
  return {
    player: s.player,
    npc: s.npc,
    floor: s.floor,
    hd: false,
    fog: out ? 0.12 : 0.07,
    fogColor: out ? '#d4dcf0' : '#d8d4e4',
    horizon: s.floor - 24,
    bloom: 1,
    paint: (x, t) => {
      lx.drawImage(lowLayer(`${key}:bg`, s.bg, true), 0, 0);
      s.anim?.(lx, t);
      if (s.mid) lx.drawImage(lowLayer(`${key}:mid`, s.mid, true), 0, 0);
      s.anim2?.(lx, t);
      up(x, low);
    },
    front: (x, t) => {
      if (s.fg || s.fgAnim) {
        fx.clearRect(0, 0, W, H);
        if (s.fg) fx.drawImage(lowLayer(`${key}:fg`, s.fg, false), 0, 0);
        s.fgAnim?.(fx, t);
        up(x, lowF);
      }
      if (s.lights) lightHD(x, s.ambient ?? NIGHT_GRADE.ambient, [NIGHT_GRADE.fill, ...s.lights(t)]);
    },
  };
}

const HOMES = new Set<SceneArt>(['bedroom', 'dorm', 'apartment', 'loft', 'house']);
const DEFS = new Map<string, StageDef>();
export function stageDef(id: SceneArt, opts: { night?: boolean; path?: PathId | null } = {}): StageDef {
  const night = !!opts.night && HOMES.has(id);
  const key = `${id}${night ? ':night' : ''}`;
  let d = DEFS.get(key);
  if (!d) {
    const f = HD_SCENES[id];
    d = f ? buildHD(key, f({ night })) : buildFallback(key, sceneSpec(id as ArtId, { night }));
    DEFS.set(key, d);
  }
  return d;
}
export const hasHD = (id: SceneArt): boolean => !!HD_SCENES[id];

// ---------- one frame ----------
export interface StageState {
  art: SceneArt;
  look: Look;
  speaker: NpcId | null;
  talking: boolean;
  hidePlayer: boolean;
  path: PathId | null;
  night: boolean; // home scene painted at night
  tod: TimeOfDay;
  weather: Weather;
  outfit?: Outfit;
  kP: number; // player walk-in progress 0..1
  kN: number; // speaker walk-in progress 0..1
  still: boolean;
}

// The leads read a touch larger than the old 30px sprites, for chunky presence.
const PEOPLE_SCALE = 1.16;
const ease = (k: number): number => 1 - (1 - k) * (1 - k);

// Draws the full scene into x (an HD canvas context, any transform) and returns the post-fx params.
export function renderStage(x: CanvasRenderingContext2D, s: StageState, t: number): FxParams {
  const def = stageDef(s.art, { night: s.night, path: s.path });
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'source-over';
  x.fillStyle = '#0b0814';
  x.fillRect(0, 0, x.canvas.width, x.canvas.height);
  x.setTransform(S, 0, 0, S, 0, 0);
  x.imageSmoothingEnabled = true;
  x.globalCompositeOperation = 'source-over';
  x.globalAlpha = 1;
  def.paint(x, t);
  // depth haze over the background, before the people
  if (def.fog > 0) {
    const c = def.fogColor;
    const g = x.createLinearGradient(0, 0, 0, H);
    const hz = Math.max(0.05, Math.min(0.95, def.horizon / H));
    g.addColorStop(0, rgba(c, def.fog * 0.6));
    g.addColorStop(hz, rgba(c, def.fog));
    g.addColorStop(Math.min(1, hz + 0.25), rgba(c, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  }
  const atm = { art: s.art, tod: s.tod, weather: s.weather, floor: def.floor, night: s.night, windows: def.windows, horizon: def.horizon };
  atmosGroundHD(x, atm);
  const npc = s.speaker && CAST[s.speaker] ? castFor(s.speaker, s.path).p : null;
  if (!s.hidePlayer) {
    const px = def.player - (1 - ease(s.kP)) * (def.player + 14);
    drawPersonHD(x, playerPerson(s.look, s.outfit), px, def.floor, {
      t,
      blink: t % 3.7 < 0.12,
      face: s.kP < 1 || npc ? 1 : 0,
      walk: s.kP < 1 ? t * 1.7 : undefined,
      scale: PEOPLE_SCALE,
    });
  }
  if (npc) {
    const nx = def.npc + (1 - ease(s.kN)) * (W - def.npc + 16);
    const speaking = s.talking && s.kN >= 1;
    drawPersonHD(x, npc, nx, def.floor, {
      t: t + 1.3,
      talk: speaking && Math.floor(t * 6) % 2 === 0,
      blink: (t + 1.7) % 4.3 < 0.12,
      face: -1,
      walk: s.kN < 1 ? t * 1.7 + 0.5 : undefined,
      gesture: speaking ? [0, 1, 1, 0, 2, 2, 0, 0][Math.floor(t * 1.6) % 8] : 0,
      scale: PEOPLE_SCALE,
    });
  }
  def.front(x, t);
  atmosAirHD(x, s.still ? 0 : t, atm);
  x.setTransform(1, 0, 0, 1, 0, 0);
  return fxFor(s.tod, { night: s.night || s.tod === 'night', fog: 0.035, fogColor: def.fogColor, horizon: def.horizon / H, bloom: def.bloom });
}

export const STAGE_W = HW;
export const STAGE_H = HH;
