// Dev-only visual harness for art.ts (open /art-preview.html).
import { drawConnector, drawEscape, drawHero, drawPlatform, drawThreat, heart, renderBackground, worldIcon } from './art.ts';
import { VIEW_H, VIEW_W, type HeroPose, type MoveKind, type PlatformKind, type Theme, type ThreatKind } from './types.ts';

const THEMES: Theme[] = ['launchpad', 'moon', 'asteroids', 'mars', 'icemoon', 'jungle', 'station', 'gasgiant', 'factory', 'comet', 'blackhole', 'nova'];

const root = document.getElementById('root')!;
const pauseEl = document.getElementById('pause') as HTMLInputElement;
const secEl = document.getElementById('sec') as HTMLSelectElement;
const Q = new URLSearchParams(location.search);
const SEC = Q.get('sec') ?? 'all';
const Z = Number(Q.get('z') ?? 0); // scale override
const FROZEN = Q.get('t');
secEl.value = SEC;
secEl.onchange = () => { Q.set('sec', secEl.value); location.search = Q.toString(); };
const want = (s: string) => SEC === 'all' || SEC === s;

type Painter = (ctx: CanvasRenderingContext2D, t: number) => void;
const painters: { ctx: CanvasRenderingContext2D; paint: Painter; bg: string }[] = [];

function section(title: string, w: number, h: number, scale: number, paint: Painter, bg = '#2a2740'): void {
  const hd = document.createElement('h2');
  hd.textContent = title;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  if (Z) scale = Z;
  c.style.width = `${w * scale}px`; c.style.height = `${h * scale}px`;
  root.append(hd, c);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  painters.push({ ctx, paint, bg });
}

const POSES: HeroPose[] = ['idle', 'run', 'jump', 'jet', 'climb', 'float', 'hurt', 'scared', 'cheer', 'board', 'faint'];
const FRAME_T: Record<HeroPose, number[]> = {
  idle: [0, 0.7, 2.8, 3.0],
  run: [0, 1 / 13, 2 / 13, 3 / 13, 4 / 13, 5 / 13],
  jump: [0.03, 0.1, 0.3, 0.6],
  jet: [0, 0.05, 0.1],
  climb: [0, 0.125, 0.25, 0.375],
  float: [0, 0.6, 1.2, 1.8, 2.4],
  hurt: [0, 0.08],
  scared: [0, 0.04],
  cheer: [0.05, 0.2, 0.33],
  board: [0.1, 0.25, 1.0],
  faint: [0.1, 0.45, 1.0],
};

// Every pose frame at 4x, plus live animation column.
if (want('hero')) section('hero: live (left) + frames', 40 * 8, POSES.length * 34, 4, (ctx, t) => {
  POSES.forEach((p, i) => {
    const y = i * 34 + 30;
    ctx.fillStyle = '#4b4566';
    ctx.fillRect(0, y, 40 * 8, 1);
    drawHero(ctx, p, t % 3, 20, y, 1, p === 'hurt' && Math.floor(t * 8) % 2 === 0);
    FRAME_T[p].forEach((ft, k) => drawHero(ctx, p, ft, 60 + k * 36, y, 1, false));
    drawHero(ctx, p, t % 3, 300, y, -1, false);
  });
});
if (want('hero')) section('hero 1x on dark / light', 200, 40, 1, (ctx, t) => {
  POSES.forEach((p, i) => drawHero(ctx, p, t % 3, 10 + i * 17, 32, 1, false));
}, '#0b0a14');
if (want('hero')) section('hero 1x on light', 200, 40, 1, (ctx, t) => {
  POSES.forEach((p, i) => drawHero(ctx, p, t % 3, 10 + i * 17, 32, 1, false));
}, '#f2b37a');

// Worlds: composited parallax with a slow pan; ?theme= to pick one.
const WW = 1600;
const themeQ = Q.get('theme');
if (want('worlds'))
  for (const th of THEMES.filter((x) => !themeQ || x === themeQ)) {
    const layers = renderBackground(th, WW);
    section(`world: ${th} (${layers.map((l) => `${l.canvas.width}@${l.factor}`).join(', ')})`, VIEW_W, VIEW_H, 2, (ctx, t) => {
      const cam = ((Math.sin(t * 0.15) + 1) / 2) * (WW - VIEW_W);
      for (const l of layers) ctx.drawImage(l.canvas, -Math.round(cam * l.factor), 0);
      worldExtras(ctx, th, t, cam);
    });
  }

// Platforms: every kind x theme.
const KINDS: PlatformKind[] = ['rock', 'metal', 'ice', 'crystal', 'moss'];
if (want('platforms'))
  section('platforms (rows = themes)', 40 + KINDS.length * 70, THEMES.length * 40 + 10, 3, (ctx) => {
    THEMES.forEach((th, r) => {
      const sky = renderBackground(th, VIEW_W)[0].canvas;
      ctx.drawImage(sky, 0, 120, 4, 30, 0, r * 40, 40 + KINDS.length * 70, 40);
      KINDS.forEach((k, i) => drawPlatform(ctx, k, th, 60 + i * 70, r * 40 + 12, [24, 40, 32, 48, 36][i]));
    });
  });

// Threats over their world at closeness 0.3 (left) and 1 (right); ?kind= to pick one.
const TK: [ThreatKind, Theme, PlatformKind][] = [
  ['fuel-fire', 'launchpad', 'metal'], ['moonquake', 'moon', 'rock'], ['meteors', 'asteroids', 'rock'], ['dust-storm', 'mars', 'rock'],
  ['ice-crack', 'icemoon', 'ice'], ['slug', 'jungle', 'moss'], ['oxygen', 'station', 'metal'], ['lightning', 'gasgiant', 'crystal'],
  ['crusher', 'factory', 'metal'], ['comet-tail', 'comet', 'ice'], ['black-hole', 'blackhole', 'crystal'], ['supernova', 'nova', 'rock'],
];
const kindQ = Q.get('kind');
if (want('threats'))
  for (const [k, th, pk] of TK.filter((x) => !kindQ || x[0] === kindQ)) {
    const layers = renderBackground(th, VIEW_W);
    section(`threat: ${k}  (closeness 0.3 | 1.0)`, VIEW_W * 2 + 8, VIEW_H, 1, (ctx, t) => {
      for (const [ox, c] of [[0, 0.3], [VIEW_W + 8, 1]] as const) {
        ctx.save();
        ctx.beginPath(); ctx.rect(ox, 0, VIEW_W, VIEW_H); ctx.clip();
        ctx.translate(ox, 0);
        for (const l of layers) ctx.drawImage(l.canvas, 0, 0);
        const fy = 180, hero = c < 1 ? 290 : 238;
        drawPlatform(ctx, pk, th, 160, fy, 60);
        drawPlatform(ctx, pk, th, hero, fy, 40);
        drawThreat(ctx, k, c < 1 ? 220 : 232, fy, t, c);
        drawHero(ctx, c < 1 ? 'idle' : 'scared', t, hero, fy, 1, false);
        ctx.restore();
      }
    });
  }

// Escapes in each phase (launch shown live, looping 2.5s).
if (want('escapes'))
  section('escapes: idle | boarding | launch (live) — rocket, shuttle, portal', 480, 230, 2, (ctx, t) => {
    const bg = renderBackground('launchpad', VIEW_W)[0].canvas;
    ctx.drawImage(bg, 0, -40);
    (['rocket', 'shuttle', 'portal'] as const).forEach((k, r) => {
      const gy = 70 + r * 76;
      ctx.fillStyle = '#2a1d3a'; ctx.fillRect(0, gy, 480, 3);
      (['idle', 'boarding', 'launch'] as const).forEach((ph, i) => drawEscape(ctx, k, 80 + i * 150, gy, ph === 'launch' ? t % 2.5 : t, ph));
      drawHero(ctx, 'board', t % 2, 80 + 150 - 24, gy, 1, false);
    });
  });

// HUD hearts + world badges at 1x and 3x.
if (want('icons'))
  section('icons: hearts + world badges', 12 * 36 + 40, 66, 2, (ctx) => {
    ctx.drawImage(heart(true), 4, 4); ctx.drawImage(heart(true), 15, 4); ctx.drawImage(heart(false), 26, 4);
    for (const [i, f] of [[0, true], [1, false]] as const) ctx.drawImage(heart(f), 0, 0, 9, 8, 40 + i * 30, 2, 27, 24);
    THEMES.forEach((th, i) => ctx.drawImage(worldIcon(th), 4 + i * 36, 30));
  }, '#0c0a1c');
if (want('icons'))
  section('world badges 3x', 6 * 100, 2 * 100, 1, (ctx) => {
    THEMES.forEach((th, i) => ctx.drawImage(worldIcon(th), 0, 0, 32, 32, 2 + (i % 6) * 100, 2 + Math.floor(i / 6) * 100, 96, 96));
  }, '#0c0a1c');

// Close-up of chosen poses: ?sec=zoom&poses=idle,run
if (SEC === 'zoom') {
  const ps = (Q.get('poses') ?? 'idle,run').split(',') as HeroPose[];
  section('zoom', 30 * 5, ps.length * 36, 5, (ctx) => {
    ps.forEach((p, i) => FRAME_T[p].slice(0, 5).forEach((ft, k) => drawHero(ctx, p, ft, 15 + k * 30, i * 36 + 32, 1, false)));
  });
}

// Sample path: one platform of each kind + every connector type.
function worldExtras(ctx: CanvasRenderingContext2D, th: Theme, t: number, cam: number): void {
  const pts: [number, number, PlatformKind, number, MoveKind][] = [
    [60, 200, 'rock', 40, 'run'], [150, 170, 'metal', 32, 'jump'], [230, 120, 'ice', 28, 'climb'], [320, 150, 'crystal', 36, 'jet'],
    [420, 130, 'moss', 44, 'float'], [520, 190, 'rock', 24, 'jump'], [620, 160, 'none', 24, 'jet'], [720, 150, 'metal', 60, 'run'],
  ];
  const off = -Math.round(cam * 0.4);
  pts.forEach(([x, y, k, w, m], i) => {
    if (i > 0) drawConnector(ctx, m, th, pts[i - 1][0] + off, pts[i - 1][1], x + off, y);
    drawPlatform(ctx, k, th, x + off, y, w);
  });
  drawHero(ctx, 'idle', t, 60 + off, 200, 1, false);
  drawHero(ctx, 'run', t, 150 + off, 170, 1, false);
  drawHero(ctx, 'climb', t, 230 + off, 140, 1, false);
}

let t0 = performance.now();
let tp = 0;
function loop(now: number): void {
  if (!pauseEl.checked) tp += (now - t0) / 1000;
  if (FROZEN) tp = Number(FROZEN);
  t0 = now;
  for (const p of painters) {
    p.ctx.fillStyle = p.bg;
    p.ctx.fillRect(0, 0, p.ctx.canvas.width, p.ctx.canvas.height);
    p.paint(p.ctx, tp);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Perf probe: ms per drawThreat call (window.__threatPerf()).
(window as unknown as Record<string, unknown>).__threatPerf = () => {
  const c = document.createElement('canvas');
  c.width = VIEW_W; c.height = VIEW_H;
  const ctx = c.getContext('2d')!;
  const out: Record<string, number> = {};
  for (const [k] of TK) {
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) drawThreat(ctx, k, 300, 180, i / 60, 0.8);
    out[k] = +((performance.now() - t0) / 30).toFixed(2);
  }
  return out;
};

// Perf probe: ms to build each world's layers at a given width (window.__bgPerf(3000)).
(window as unknown as Record<string, unknown>).__bgPerf = (w: number) => {
  const out: Record<string, number> = {};
  for (const th of THEMES) {
    const t0 = performance.now();
    renderBackground(th, w + 1);
    out[th] = Math.round(performance.now() - t0);
  }
  return out;
};
