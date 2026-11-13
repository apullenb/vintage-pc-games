// Floating ledges per kind/theme (cached), plus ladder/vine/arc connectors.
import type { MoveKind, PlatformKind, Theme } from '../types.ts';
import { bayer, Buf, dramp, fbm, hash2, hex, hexes, mix, shade, type RGB } from './px.ts';

// Rock ramp per theme: outline, dark, mid, light, rim.
const ROCK: Record<Theme, string[]> = {
  launchpad: ['#1c1428', '#4a4058', '#6e6680', '#9a92aa', '#d0c8dc'],
  moon: ['#16161e', '#44444f', '#6c6c7a', '#9a9aa8', '#d4d4de'],
  asteroids: ['#120e18', '#3a3040', '#5e5058', '#8a7a78', '#c8b4a0'],
  mars: ['#2a0c0a', '#6a2a1c', '#9a4428', '#c86a3e', '#f0a070'],
  icemoon: ['#0c1430', '#2c3e6a', '#4a6498', '#7a98c8', '#c8dcf4'],
  jungle: ['#120a24', '#3a2458', '#5a3a7a', '#7a5a9a', '#a888c8'],
  station: ['#10141e', '#3a4258', '#56607a', '#7a86a0', '#b8c4dc'],
  gasgiant: ['#24142e', '#5a3a5e', '#8a5a78', '#c08890', '#f0c8b8'],
  factory: ['#0e0c14', '#2e2a38', '#4a4456', '#6c6478', '#a49cb0'],
  comet: ['#0a0e1a', '#2a3450', '#4a5a80', '#7a98c0', '#dceeff'],
  blackhole: ['#050408', '#1e1824', '#342838', '#5a3a40', '#ff9a50'],
  nova: ['#0e0306', '#2a0c18', '#4a1420', '#7a2a28', '#ffb070'],
};
// Moss ramp per theme: dark, mid, light.
const MOSS: Partial<Record<Theme, string[]>> = {
  jungle: ['#136a5e', '#2fb39a', '#8affd8'],
  mars: ['#5a6a2a', '#8aa03a', '#c8e070'],
  icemoon: ['#1a6a7a', '#3ab0b8', '#a0f0f0'],
  nova: ['#8a2a3a', '#d04a5a', '#ffa0a0'],
  blackhole: ['#3a1a5a', '#6a3a9a', '#b08ae0'],
};
const MOSS_DEF = ['#2a6a3a', '#4aa04a', '#a8e070'];
const METAL: Partial<Record<Theme, { base: string; acc: string; acc2: string }>> = {
  factory: { base: '#5a5468', acc: '#ffc93a', acc2: '#1a1620' },
  station: { base: '#8a96b0', acc: '#3ad0c0', acc2: '#1a6a70' },
  launchpad: { base: '#7a7290', acc: '#ff8a2b', acc2: '#8a3a14' },
};

const cache = new Map<string, { c: HTMLCanvasElement; ox: number; oy: number }>();

function build(kind: PlatformKind, theme: Theme, w: number): { c: HTMLCanvasElement; ox: number; oy: number } {
  const seed = (w * 131 + kind.length * 17 + theme.length * 7) | 0;
  const PAD = 4, TOP = 6;
  const depthMax = Math.min(26, 10 + Math.round(w * 0.3));
  const b = new Buf(w + PAD * 2, TOP + depthMax + 12);
  const R = hexes(...ROCK[theme]);
  const X0 = PAD, Y0 = TOP; // surface row
  // underside profile: slab then tapered, ragged keel
  const depth: number[] = [];
  for (let i = 0; i < w; i++) {
    const u = (i + 0.5) / w;
    const taper = 1 - Math.abs(u * 2 - 1) ** 1.6;
    const rag = (fbm(i, 0, 5, seed, 2) - 0.5) * 6;
    depth.push(Math.max(4, Math.round(4 + taper * (depthMax - 4) + rag * taper)));
  }

  if (kind === 'metal') {
    const M = METAL[theme] ?? { base: '#8088a0', acc: '#ff8a2b', acc2: '#8a3a14' };
    const base = hex(M.base), acc = hex(M.acc), acc2 = hex(M.acc2), out = R[0];
    const deck = 5;
    for (let i = 0; i < w; i++)
      for (let j = 0; j < deck; j++) {
        let c = j === 0 ? mix(base, hex('#ffffff'), 0.45) : j === 1 ? mix(base, hex('#ffffff'), 0.15) : j === deck - 1 ? shade(base, 0.55) : base;
        if (j >= 2 && j <= 3 && ((i + j * 2) >> 2) % 2 === 0) c = j === 2 ? acc : acc2;
        if (j >= 2 && j <= 3 && ((i + j * 2) >> 2) % 2 === 1) c = shade(base, 0.35);
        if (j === 1 && (i === 2 || i === w - 3)) c = shade(base, 0.5);
        b.set(X0 + i, Y0 + j, c);
      }
    // V-truss underneath + thruster pod
    const tH = Math.min(12, 4 + Math.round(w * 0.18));
    const half = Math.max(3, Math.round(w * 0.3));
    for (let k = 0; k < tH; k++) {
      const off = Math.round((half * k) / tH);
      b.set(X0 + off + 1, Y0 + deck + k, shade(base, 0.6));
      b.set(X0 + w - 2 - off, Y0 + deck + k, shade(base, 0.6));
      if (k === tH >> 1 || k === 0) for (let i = off + 1; i < w - 1 - off; i++) b.set(X0 + i, Y0 + deck + k, shade(base, 0.45));
    }
    const cx = X0 + Math.floor(w / 2);
    for (let i = -2; i <= 1; i++) for (let k = 0; k < 3; k++) b.set(cx + i, Y0 + deck + tH + k, k === 2 ? shade(base, 0.4) : base);
    b.set(cx - 1, Y0 + deck + tH + 3, hex('#8ff0ff')); b.set(cx, Y0 + deck + tH + 3, hex('#8ff0ff'));
    b.glow(cx - 0.5, Y0 + deck + tH + 4, 4, hex('#8ff0ff'), 0.6);
    outline(b, out);
    for (let i = 3; i < w - 3; i += 8) b.set(X0 + i, Y0 + 1, hex('#ffffff'));
    return { c: b.canvas(), ox: X0, oy: Y0 };
  }

  const isIce = kind === 'ice', isCrystal = kind === 'crystal', isMoss = kind === 'moss';
  const body: RGB[] = isIce ? hexes('#2c4a80', '#5a86c0', '#9cc8f0', '#d8f0ff') : [R[1], R[2], R[3], R[4]];
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < depth[i]; j++) {
      const x = X0 + i, y = Y0 + j;
      const v = j / depth[i];
      let l = 0.75 - v * 0.75 + (fbm(x, y, 4, seed + 1, 2) - 0.5) * 0.35 - (i < 2 || i > w - 3 ? 0.15 : 0);
      if (j === 0) l = 1;
      else if (j === 1) l = 0.85;
      let c = dramp(body, l, x, y);
      if (isIce && (i + j * 2) % 11 === 0 && j > 1 && j < depth[i] - 2) c = hex('#ffffff');
      if (!isIce && j > 2 && hash2(x, y, seed) < 0.015) c = R[0];
      b.set(x, y, c);
    }
  }
  if (isIce) {
    // icicles
    for (let i = 2; i < w - 2; i += 3 + Math.floor(hash2(i, 1, seed) * 4)) {
      const L = 2 + Math.floor(hash2(i, 2, seed) * 6);
      for (let k = 0; k < L; k++) b.set(X0 + i, Y0 + depth[i] + k, k < L - 2 ? hex('#9cc8f0') : hex('#e8f8ff'));
    }
    for (let i = 0; i < w; i++) b.set(X0 + i, Y0, hex('#ffffff'));
  }
  if (isCrystal) {
    const CR = hexes('#3a1a6a', '#7a3ad0', '#c08aff', '#f4e0ff');
    const shard = (x: number, y: number, h: number, dir: number, lean: number) => {
      for (let k = 0; k < h; k++) {
        const half = Math.max(0, Math.round(((h - k) / h) * 2));
        for (let q = -half; q <= half; q++) b.set(x + q + Math.round(lean * k), y + dir * k, CR[q < 0 ? 3 : q === 0 ? 2 : 1]);
      }
    };
    for (let i = 3; i < w - 3; i += 5 + Math.floor(hash2(i, 3, seed) * 6)) shard(X0 + i, Y0 + depth[i] - 2, 4 + Math.floor(hash2(i, 4, seed) * 7), 1, (hash2(i, 5, seed) - 0.5) * 0.6);
    shard(X0 + 1, Y0 + 3, 5, -1, -0.5);
    shard(X0 + w - 2, Y0 + 3, 6, -1, 0.5);
    for (let i = 0; i < w; i++) b.set(X0 + i, Y0, i % 6 < 3 ? hex('#f4e0ff') : hex('#c08aff'));
  }
  if (isMoss) {
    const MS = hexes(...(MOSS[theme] ?? MOSS_DEF));
    for (let i = 0; i < w; i++) {
      const drip = 2 + Math.round(fbm(i, 9, 3, seed, 2) * 3) + (hash2(i, 7, seed) < 0.15 ? 3 : 0);
      for (let k = 0; k < drip; k++) b.set(X0 + i, Y0 + k, k === 0 ? MS[2] : k < drip - 1 ? MS[1] : MS[0]);
      if (hash2(i, 8, seed) < 0.3) b.set(X0 + i, Y0 - 1, MS[1]);
      if (hash2(i, 9, seed) < 0.1) { b.set(X0 + i, Y0 - 2, MS[2]); b.set(X0 + i, Y0 - 1, MS[1]); }
    }
    // hanging roots
    for (let i = 3; i < w - 3; i += 4 + Math.floor(hash2(i, 10, seed) * 6)) {
      const L = 3 + Math.floor(hash2(i, 11, seed) * 7);
      for (let k = 0; k < L; k++) b.set(X0 + i + (k > L / 2 ? 1 : 0), Y0 + depth[i] + k, k === L - 1 ? MS[2] : MS[0]);
    }
  }
  outline(b, isIce ? hex('#14244a') : R[0]);
  // top highlight specks
  if (!isMoss && !isCrystal && !isIce) for (let i = 1; i < w - 1; i++) if (bayer(i, 0) < 0.3) b.set(X0 + i, Y0, R[4]);
  return { c: b.canvas(), ox: X0, oy: Y0 };
}

function outline(b: Buf, c: RGB): void {
  const solid = (x: number, y: number) => b.alpha(x, y) > 0;
  const add: [number, number][] = [];
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) add.push([x, y]);
  for (const [x, y] of add) b.set(x, y, c);
}

// sx = platform centre, sy = walking surface row.
export function drawPlatform(ctx: CanvasRenderingContext2D, kind: PlatformKind, theme: Theme, sx: number, sy: number, w: number): void {
  if (kind === 'none') return;
  const W = Math.max(8, Math.round(w));
  const key = `${kind}|${theme}|${W}`;
  let p = cache.get(key);
  if (!p) { p = build(kind, theme, W); cache.set(key, p); }
  ctx.drawImage(p.c, Math.round(sx - W / 2) - p.ox, Math.round(sy) - p.oy);
}

// ---------- connectors ----------
const GUIDE: Partial<Record<Theme, string>> = { launchpad: '#fff2d0', mars: '#fff0d8', nova: '#fff0e0', gasgiant: '#fff4e8' };
const LADDER: Partial<Record<Theme, [string, string]>> = {
  jungle: ['#2fb39a', '#136a5e'],
  factory: ['#ffc93a', '#8a6a14'],
  station: ['#b8c4dc', '#56607a'],
  mars: ['#c8a088', '#6a3a2a'],
};

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, big: boolean, col: string): void {
  ctx.fillStyle = 'rgba(10,8,24,0.35)';
  ctx.fillRect(Math.round(x), Math.round(y) + 1, big ? 2 : 1, big ? 2 : 1);
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(x), Math.round(y), big ? 2 : 1, big ? 2 : 1);
}

export function drawConnector(ctx: CanvasRenderingContext2D, move: MoveKind, theme: Theme, ax: number, ay: number, bx: number, by: number): void {
  if (move === 'run') return;
  if (move === 'climb') {
    const top = Math.min(ay, by), bot = Math.max(ay, by);
    const xt = ay < by ? ax : bx, xb = ay < by ? bx : ax;
    const len = bot - top;
    if (len < 2) return;
    const at = (y: number) => xt + ((xb - xt) * (y - top)) / len;
    if (theme === 'jungle') {
      // twisted vine with leaves
      for (let y = top - 4; y <= bot; y++) {
        const x = at(y) + Math.sin(y * 0.35) * 1.5;
        ctx.fillStyle = '#136a5e'; ctx.fillRect(Math.round(x) - 1, y, 3, 1);
        ctx.fillStyle = '#2fb39a'; ctx.fillRect(Math.round(x + Math.sin(y * 0.35 + 1.4)), y, 1, 1);
        if ((y - top) % 9 === 4) {
          const s = (y >> 3) & 1 ? 1 : -1;
          ctx.fillStyle = '#4ae0b0';
          ctx.fillRect(Math.round(x) + s * 2, y - 1, 2, 1); ctx.fillRect(Math.round(x) + s * 3, y, 2, 1);
          ctx.fillStyle = '#136a5e'; ctx.fillRect(Math.round(x) + s * 4, y + 1, 1, 1);
        }
      }
      return;
    }
    const [rail, dark] = LADDER[theme] ?? ['#c8c8d8', '#5a5a70'];
    for (let y = top - 6; y <= bot; y++) {
      const x = Math.round(at(y));
      ctx.fillStyle = dark; ctx.fillRect(x - 6, y, 2, 1); ctx.fillRect(x + 4, y, 2, 1);
      ctx.fillStyle = rail; ctx.fillRect(x - 6, y, 1, 1); ctx.fillRect(x + 4, y, 1, 1);
      if ((bot - y) % 5 === 2) { ctx.fillStyle = dark; ctx.fillRect(x - 5, y + 1, 10, 1); ctx.fillStyle = rail; ctx.fillRect(x - 5, y, 10, 1); }
    }
    return;
  }
  const col = GUIDE[theme] ?? '#cfe6ff';
  ctx.globalAlpha = 0.55;
  const dx = bx - ax, dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const n = Math.max(3, Math.round(dist / 7));
  const apex = move === 'jump' ? 18 + Math.abs(dx) * 0.15 : move === 'jet' ? 8 + Math.abs(dx) * 0.06 : 0;
  const lift = 10; // guide runs at chest height
  for (let i = 1; i < n; i++) {
    const u = i / n;
    let x = ax + dx * u, y = ay + dy * u - lift;
    if (move === 'float') y += Math.sin(u * Math.PI * 2) * 6;
    else y -= Math.sin(u * Math.PI) * apex;
    dot(ctx, x, y, i % 3 === 0, col);
  }
  // arrowhead near the target
  const u = (n - 0.5) / n;
  const hx = ax + dx * u, hy = ay + dy * u - lift - (move === 'float' ? 0 : Math.sin(u * Math.PI) * apex);
  const ang = Math.atan2(by - lift - hy, bx - hx);
  for (const s of [-1, 1]) {
    for (let k = 1; k <= 3; k++) dot(ctx, hx - Math.cos(ang + s * 0.7) * k, hy - Math.sin(ang + s * 0.7) * k, false, col);
  }
  ctx.globalAlpha = 1;
}
