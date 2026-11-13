// Dev-only visual harness for art.ts (open /art-preview.html).
import * as art from './art.ts';
import {
  BOUNCE_VX, BOUNCE_VY, DIRT, EMPTY, GRAVITY, MOUND, NAP_RX, NAP_RY, NAP_TICKS, PLANK, ROCK, SKILLS, TICK_RATE, VIEW_H, VIEW_W,
  type DirtyRect, type GHState, type Groundhog, type Hazard, type Material, type TerrainAPI, type Theme,
} from './types.ts';

class FakeTerrain implements TerrainAPI {
  width: number;
  height: number;
  mask: Uint8Array;
  dirty: DirtyRect[] = [];
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.mask = new Uint8Array(w * h);
  }
  get(x: number, y: number): Material {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return EMPTY;
    return this.mask[y * this.width + x] as Material;
  }
  isSolid(x: number, y: number): boolean { return this.get(x, y) !== EMPTY; }
  takeDirty(): DirtyRect[] { const d = this.dirty; this.dirty = []; return d; }
  fill(test: (x: number, y: number) => boolean, m: number): void {
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) if (test(x, y)) this.mask[y * this.width + x] = m;
  }
  carve(cx: number, cy: number, r: number): void {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && this.get(x, y) !== ROCK && x >= 0 && y >= 0 && x < this.width && y < this.height) this.mask[y * this.width + x] = EMPTY;
    this.dirty.push({ x: cx - r, y: cy - r, w: r * 2 + 1, h: r * 2 + 1 });
  }
  // engine-like napper mound: fills EMPTY within the half-ellipse above the feet row
  mound(cx: number, fy: number, on: boolean): void {
    for (let y = fy - NAP_RY; y <= fy; y++)
      for (let x = cx - NAP_RX; x <= cx + NAP_RX; x++) {
        const dx = (x - cx) / (NAP_RX + 0.5), dy = (fy - y) / (NAP_RY + 0.5);
        if (dx * dx + dy * dy > 1 || x < 0 || x >= this.width) continue;
        const i = y * this.width + x;
        if (on && this.mask[i] === EMPTY) this.mask[i] = MOUND;
        else if (!on && this.mask[i] === MOUND) this.mask[i] = EMPTY;
      }
    this.dirty.push({ x: cx - NAP_RX, y: fy - NAP_RY, w: NAP_RX * 2 + 1, h: NAP_RY + 1 });
  }
  feet(x: number): number {
    for (let y = 10; y < this.height; y++) if (this.isSolid(x, y)) return y - 1;
    return this.height - 1;
  }
  plank(x: number, y: number): void {
    for (let i = 0; i < 6; i++) if (this.get(x + i, y) === EMPTY && x + i < this.width) this.mask[y * this.width + x + i] = PLANK;
    this.dirty.push({ x, y, w: 6, h: 1 });
  }
}

function makeScene(w: number): { t: FakeTerrain; hazards: Hazard[] } {
  const t = new FakeTerrain(w, VIEW_H);
  const ground = (x: number) => 170 + Math.round(Math.sin(x / 40) * 8);
  t.fill((x, y) => y >= ground(x), DIRT);
  t.fill((x, y) => (x - 120) ** 2 / 900 + (y - 150) ** 2 / 400 < 1, DIRT); // hill
  t.fill((x, y) => x >= 250 && x < 290 && y >= 120 && y < 175, ROCK); // rock pillar
  t.fill((x, y) => x >= 330 && x < 380 && y >= 160, EMPTY); // pit
  t.fill((x, y) => x >= 330 && x < 380 && y >= 215, DIRT);
  t.fill((x, y) => x >= 60 && x < 200 && y >= 60 && y < 72, DIRT); // floating ledge
  t.fill((x, y) => x >= 400 && x < 440 && y >= 100 && y < 108, ROCK);
  t.fill((x, y) => x >= 0 && x < w && y < 6, DIRT); // ceiling strip
  t.mound(44, t.feet(44), true); // napper mound sample
  t.mound(100, 59, true); // on the ledge
  return {
    t,
    hazards: [
      { kind: 'water', x: 330, y: 200, w: 50, h: 15 },
      { kind: 'thorns', x: 200, y: 168, w: 30, h: 8 },
    ],
  };
}

// launched: ticks >= 100 => falling frames (vy > 0)
const gh = (state: GHState, t: number, dir: 1 | -1 = 1, alarm = -1): Groundhog => ({
  id: 7, x: 0, y: 0, dir, state, stateTicks: t % 100, isClimber: false, isGlider: false, fallDist: 0, work: 0, alarmTicks: alarm,
  vx: 0, vy: t >= 100 ? 1 : -1,
});

const ROWS: [GHState, number[]][] = [
  ['walking', [0, 3, 6, 9]],
  ['falling', [0, 3]],
  ['gliding', [0, 4, 6, 18]],
  ['climbing', [0, 2, 4, 6]],
  ['hoisting', [0, 2, 4, 6]],
  ['sentry', [0, 8]],
  ['planking', [0, 2, 4, 6]],
  ['shrugging', [0, 3, 6]],
  ['tunneling', [0, 2, 4, 6]],
  ['burrowing', [0, 2, 4, 6]],
  ['scraping', [0, 3, 6, 9]],
  ['splatting', [0, 2, 4, 8]],
  ['drowning', [0, 4, 8, 16, 24]],
  ['exiting', [0, 3, 8, 10, 12, 16]],
  ['poofing', [0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 15, 20]],
  ['planting', [0, 3, 6, 7, 9, 11]],
  ['launched', [0, 3, 100, 103]],
  ['napping', [0, 2, 5, 8, 12, 14, 16, 18, 19]],
];
const ANIM_LEN: Partial<Record<GHState, number>> = { splatting: 20, drowning: 30, exiting: 20, poofing: 18, hoisting: 10, shrugging: 12, planting: 12, napping: NAP_TICKS };

const root = document.getElementById('root')!;
const CW = 24, CH = 30, FEET = 25;
const S = 4;

// ?sec=<index>&z=<scale> isolates one section; ?sheet=<perRow> packs all frames
const params = new URLSearchParams(location.search);
let secIdx = 0;
function addCanvas(label: string, w: number, h: number, scale: number): CanvasRenderingContext2D {
  const only = params.get('sheet') ? '99' : params.get('sec');
  const hidden = only !== null && Number(only) !== secIdx++ && label !== 'sheet';
  if (!hidden && params.get('z')) scale = Number(params.get('z'));
  const h2 = document.createElement('h2');
  h2.textContent = label;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.style.width = `${w * scale}px`;
  c.style.height = `${h * scale}px`;
  if (!hidden) root.append(h2, c);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

const spriteCtx = addCanvas('sprites: static frames | anim (dir 1, dir -1, highlighted+alarm) | on dark', CW * 13, CH * ROWS.length, S);
const iconCtx = addCanvas('skill icons', 20 * SKILLS.length + 4, 24, S);
const padCtx = addCanvas('bounce pad: ticksSinceBounce 0..9 | idle | live loop', 16 * 12 + 60, 40, S);
const doorCtx = addCanvas('entrance (open 0..1) + exit', 300, 64, 3);
const sceneCtx = addCanvas('scene (2x)', VIEW_W, VIEW_H, 2);
const allCtx = addCanvas('all themes (1x)', VIEW_W * 2, VIEW_H * 2, 1);

// ?sheet=<perRow>&z=<scale>&from=<i>[&alarm=<ticks>][&cw=<cellW>]: every static frame packed tightly
if (params.get('sheet')) {
  const per = Number(params.get('sheet'));
  const all: [GHState, number, number][] = [];
  ROWS.forEach(([st, ticks], si) => ticks.forEach((t) => all.push([st, t, si])));
  const list = all.slice(Number(params.get('from') ?? 0));
  const alarm = Number(params.get('alarm') ?? -1); // &alarm=<ticks> shows the countdown bubble
  const cw = Number(params.get('cw') ?? 15), ch = alarm >= 0 ? 36 : 24;
  const lines = Math.ceil(list.length / per);
  const sc = addCanvas('sheet', per * cw, lines * ch, Number(params.get('z') ?? 4));
  list.forEach(([st, t, si], i) => {
    const x = (i % per) * cw, y = Math.floor(i / per) * ch;
    sc.fillStyle = si % 2 ? '#8cc8f0' : '#9fd2f4';
    if (params.get('dark')) sc.fillStyle = si % 2 ? '#2a1d14' : '#33241a';
    sc.fillRect(x, y, cw, ch);
    sc.fillStyle = '#6a9a4a';
    sc.fillRect(x, y + ch - 3, cw, 1);
    art.drawGroundhog(sc, gh(st, t, 1, alarm), x + (cw >> 1), y + ch - 4, false);
  });
}

let theme: Theme = 'meadow';
let scene = makeScene(VIEW_W);
let view = art.createTerrainView(scene.t, theme);
let bg = art.renderBackground(theme, VIEW_W, VIEW_H);
const themeSel = document.getElementById('theme') as HTMLSelectElement;
themeSel.onchange = () => {
  theme = themeSel.value as Theme;
  scene = makeScene(VIEW_W);
  view = art.createTerrainView(scene.t, theme);
  bg = art.renderBackground(theme, VIEW_W, VIEW_H);
};

// static all-themes grid
(['meadow', 'dusk', 'winter', 'burrow'] as Theme[]).forEach((th, i) => {
  const s = makeScene(VIEW_W);
  const ox = (i % 2) * VIEW_W, oy = Math.floor(i / 2) * VIEW_H;
  allCtx.drawImage(art.renderBackground(th, VIEW_W, VIEW_H), ox, oy);
  allCtx.drawImage(art.createTerrainView(s.t, th).canvas, ox, oy);
  allCtx.save();
  allCtx.translate(ox, oy);
  for (const h of s.hazards) art.drawHazard(allCtx, h, 0, 0);
  art.drawEntrance(allCtx, 90, 30, 1, 0);
  art.drawExit(allCtx, 440, 175, 0);
  for (let k = 0; k < 6; k++) art.drawGroundhog(allCtx, gh('walking', k * 2), 20 + k * 30, 158 + Math.round(Math.sin((20 + k * 30) / 40) * -8) + 11, false);
  allCtx.restore();
});

let tick = 0;
const napY = scene.t.feet(300);
const pause = document.getElementById('pause') as HTMLInputElement;

function frame(): void {
  if (!pause.checked) tick++;
  // sprites
  spriteCtx.fillStyle = '#8cc8f0';
  spriteCtx.fillRect(0, 0, CW * 12, CH * ROWS.length);
  spriteCtx.fillStyle = '#211710';
  spriteCtx.fillRect(CW * 12, 0, CW, CH * ROWS.length);
  ROWS.forEach(([st, ticks], r) => {
    const y = r * CH + FEET;
    spriteCtx.fillStyle = '#6a9a4a';
    spriteCtx.fillRect(0, y + 1, CW * 13, 1);
    ticks.forEach((t, i) => art.drawGroundhog(spriteCtx, gh(st, t), i * CW + 12, y, false));
    const len = ANIM_LEN[st] ?? 1e9;
    const at = len < 1e9 ? tick % (len + 8) : tick;
    art.drawGroundhog(spriteCtx, gh(st, at), 8 * CW + 12, y, false);
    art.drawGroundhog(spriteCtx, gh(st, at, -1), 9 * CW + 12, y, false);
    art.drawGroundhog(spriteCtx, gh(st, at, 1, (3 * TICK_RATE - (tick % (3 * TICK_RATE)))), 10 * CW + 12, y, true);
    art.drawGroundhog(spriteCtx, gh(st, at), 12 * CW + 12, y, false);
  });

  // icons
  iconCtx.fillStyle = '#3a2f3f';
  iconCtx.fillRect(0, 0, iconCtx.canvas.width, 24);
  SKILLS.forEach((s, i) => {
    iconCtx.fillStyle = '#56485c';
    iconCtx.fillRect(2 + i * 20, 2, 18, 20);
    iconCtx.drawImage(art.skillIcon(s), 3 + i * 20, 4);
  });

  // pads
  padCtx.fillStyle = '#9fd2f4';
  padCtx.fillRect(0, 0, padCtx.canvas.width, 40);
  padCtx.fillStyle = '#6a9a4a';
  padCtx.fillRect(0, 35, padCtx.canvas.width, 5);
  for (let k = 0; k < 11; k++) art.drawBouncePad(padCtx, 8 + k * 16, 34, k === 10 ? tick : 0, k === 10 ? 999 : k);
  {
    const c = tick % 40, px0 = 16 * 11 + 30;
    const tsb = c >= 10 ? c - 10 : 999;
    art.drawBouncePad(padCtx, px0, 34, tick, tsb);
    if (c < 10) art.drawGroundhog(padCtx, gh('walking', tick), px0 - 12 + c, 34, false);
    else {
      const k = c - 10, y = 34 + BOUNCE_VY * k + (GRAVITY * k * k) / 2, vy = BOUNCE_VY + GRAVITY * k;
      if (y <= 34) art.drawGroundhog(padCtx, { ...gh('launched', k), vy }, px0 + BOUNCE_VX * k * 0.5, Math.max(-20, y), false);
    }
  }

  // doors
  doorCtx.fillStyle = '#8cc8f0';
  doorCtx.fillRect(0, 0, 300, 64);
  doorCtx.fillStyle = '#7a5233';
  doorCtx.fillRect(0, 58, 300, 6);
  [0, 0.25, 0.5, 0.75, 1].forEach((o, i) => art.drawEntrance(doorCtx, 20 + i * 36, 50, o, tick));
  art.drawEntrance(doorCtx, 200, 50, (Math.sin(tick / 10) + 1) / 2, tick);
  art.drawExit(doorCtx, 260, 57, tick);

  // scene
  if (tick % 12 === 0) {
    const x = 20 + ((tick / 12) * 7) % 440;
    scene.t.carve(x, 175, 4);
    scene.t.plank(60 + ((tick / 12) * 3) % 120, 150 - ((tick / 12) % 20));
  }
  view.update(scene.t.takeDirty());
  sceneCtx.drawImage(bg, 0, 0);
  sceneCtx.drawImage(view.canvas, 0, 0);
  for (const h of scene.hazards) art.drawHazard(sceneCtx, h, 0, tick);
  art.drawEntrance(sceneCtx, 90, 30, Math.min(1, tick / 40), tick);
  art.drawExit(sceneCtx, 440, 175, tick);
  const walkX = 20 + (tick % 100);
  art.drawGroundhog(sceneCtx, { ...gh('walking', tick), x: walkX }, walkX, 159, false);
  art.drawGroundhog(sceneCtx, gh('sentry', tick), 160, 59, true);
  art.drawGroundhog(sceneCtx, gh('climbing', tick), 245, 150, false);
  art.drawGroundhog(sceneCtx, gh('gliding', tick), 310, 60 + (tick % 80), false);
  art.drawGroundhog(sceneCtx, gh('burrowing', tick), 400, 177, false);
  art.drawGroundhog(sceneCtx, gh('drowning', tick % 30), 355, 200, false);

  // bouncer loop: walk onto pad at x=180, arc over
  {
    const padX = 180, padY = scene.t.feet(padX), c = tick % 70;
    const tsb = c >= 20 ? c - 20 : 999;
    art.drawBouncePad(sceneCtx, padX, padY, tick, tsb);
    if (c < 20) art.drawGroundhog(sceneCtx, gh('walking', tick), padX - 20 + c, scene.t.feet(padX - 20 + c), false);
    else {
      const k = c - 20, x = padX + BOUNCE_VX * k, y = padY + BOUNCE_VY * k + (GRAVITY * k * k) / 2;
      if (y <= scene.t.feet(Math.round(x))) art.drawGroundhog(sceneCtx, { ...gh('launched', k), vy: BOUNCE_VY + GRAVITY * k }, x, y, false);
      else art.drawGroundhog(sceneCtx, gh('walking', tick), x, scene.t.feet(Math.round(x)), false);
    }
  }
  // napper loop: curls up, becomes a mound, mound cleared later
  {
    const nx = 300, c = tick % 60;
    if (c === 0) scene.t.mound(nx, napY, false);
    if (c <= NAP_TICKS) art.drawGroundhog(sceneCtx, gh("napping", c), nx, napY, false);
    if (c === NAP_TICKS) scene.t.mound(nx, napY, true);
  }
}

setInterval(frame, 1000 / TICK_RATE);
frame();
