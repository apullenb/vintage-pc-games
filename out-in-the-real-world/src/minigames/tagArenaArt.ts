// Laser Tag art: the blacklight arena (UV carpet, back wall with the neon sign, 3/4-view barriers,
// glowing pillars and padded bunkers), power-ups, the glow flag and capture pad, the reticle, and
// the light map. "draw" functions paint the lit scene; "emit" functions paint the glowing layer
// that sits on top of the light pass (with bodies cut out of it so depth still reads).
import { cached, hash, INK, mix, rect, rgbOf, shade, text, textWidth, type Ctx, type RGB } from '../art/px.ts';
import { FIELD, type Arena, type Ob, type PowerKind } from './tagArena.ts';
import { LightMap, VH, VW, type Lamp } from './tagFx.ts';

export function lampC(hex: string, s = 1, base = 0.5): RGB {
  const [r, g, b] = rgbOf(hex);
  return [base + (r / 255) * s, base + (g / 255) * s, base + (b / 255) * s];
}

const NEON = ['#ff4fd8', '#4fd8ff', '#7cf08a', '#ffd84f', '#ff8a3c', '#b48cff'];

// ---------- static background ----------
export function arenaBg(a: Arena, idx: number): HTMLCanvasElement {
  return cached(`tagarena|${idx}`, VW, VH, (x) => {
    const [base, grid] = a.floor;
    // floor: carpet with dithered texture and a faint tile grid
    rect(x, 0, 0, VW, VH, base);
    for (let j = 0; j < VH; j++)
      for (let i = 0; i < VW; i++) {
        const h = hash(i * 7919 + j * 104729 + idx * 31);
        if (h < 0.12) rect(x, i, j, 1, 1, shade(base, 0.86));
        else if (h > 0.94) rect(x, i, j, 1, 1, shade(base, 1.1));
      }
    for (let gx = FIELD.x0; gx < FIELD.x1; gx += 16) rect(x, gx, 18, 1, VH - 18, grid);
    for (let gy = FIELD.y0 + 2; gy < VH; gy += 16) rect(x, 0, gy, VW, 1, grid);
    // scuffed lanes where everyone runs
    for (let k = 0; k < 40; k++) {
      const px = FIELD.x0 + hash(k * 13 + idx) * (FIELD.x1 - FIELD.x0);
      const py = FIELD.y0 + hash(k * 17 + idx * 5) * (FIELD.y1 - FIELD.y0);
      rect(x, px, py, 3 + Math.floor(hash(k) * 4), 1, shade(base, 0.9));
    }
    // back wall (3/4 view): panels, seams, baseboard
    rect(x, 0, 0, VW, 18, '#2c2650');
    for (let i = 0; i < VW; i += 24) {
      rect(x, i, 2, 1, 14, '#211c3e');
      rect(x, i + 1, 2, 1, 14, '#3a3366');
    }
    rect(x, 0, 0, VW, 2, '#18142c');
    rect(x, 0, 15, VW, 1, '#3e3870');
    rect(x, 0, 16, VW, 2, '#141028');
    rect(x, 0, 18, VW, 3, 'rgba(8,4,20,0.5)'); // shadow cast on the floor
    // side walls and front ledge
    rect(x, 0, 0, FIELD.x0 - 2, VH, '#221d40');
    rect(x, FIELD.x0 - 3, 18, 1, VH, '#3a3366');
    rect(x, FIELD.x1 + 2, 0, VW - FIELD.x1 - 2, VH, '#221d40');
    rect(x, FIELD.x1 + 2, 18, 1, VH, '#141028');
    rect(x, 0, FIELD.y1 + 3, VW, VH - FIELD.y1 - 3, '#2a2450');
    rect(x, 0, FIELD.y1 + 3, VW, 1, '#463e7c');
    rect(x, 0, VH - 1, VW, 1, '#141028');
    // spawn pads painted on the floor
    for (const [sx, sy] of a.spawns) {
      rect(x, sx - 6, sy - 2, 12, 5, shade(base, 0.82));
      rect(x, sx - 5, sy - 1, 10, 3, shade(base, 0.92));
    }
  });
}

// UV-reactive carpet confetti and the neon sign: drawn on the glow layer.
export function arenaGlow(a: Arena, idx: number): HTMLCanvasElement {
  return cached(`tagarenaglow|${idx}`, VW, VH, (x) => {
    for (let k = 0; k < 110; k++) {
      const px = Math.round(FIELD.x0 + hash(k * 31 + idx * 7) * (FIELD.x1 - FIELD.x0));
      const py = Math.round(20 + hash(k * 47 + idx * 3) * (VH - 22));
      const c = NEON[Math.floor(hash(k * 11) * NEON.length)];
      x.globalAlpha = 0.28;
      const s = Math.floor(hash(k * 5 + 1) * 4);
      if (s === 0) rect(x, px, py, 2, 1, c);
      else if (s === 1) {
        rect(x, px, py, 1, 1, c);
        rect(x, px + 1, py + 1, 1, 1, c);
        rect(x, px + 2, py, 1, 1, c);
      } else if (s === 2) {
        rect(x, px, py, 1, 2, c);
        rect(x, px + 1, py + 2, 2, 1, c);
      } else rect(x, px, py, 1, 1, c);
    }
    x.globalAlpha = 1;
    // neon strips along the back wall and ledge
    rect(x, 0, 3, VW, 1, '#ff4fd8');
    rect(x, 0, FIELD.y1 + 3, VW, 1, '#4fd8ff');
    // arena name sign
    const name = a.name;
    const w = textWidth(name);
    rect(x, Math.round(VW / 2 - w / 2) - 4, 6, w + 8, 9, '#0c0818');
    rect(x, Math.round(VW / 2 - w / 2) - 4, 6, w + 8, 1, '#ffd84f');
    rect(x, Math.round(VW / 2 - w / 2) - 4, 14, w + 8, 1, '#ffd84f');
    text(x, name, Math.round(VW / 2 - w / 2), 8, '#ffe98a');
    // little wall stars
    for (const sx of [24, 60, 196, 232]) {
      const c = NEON[(sx / 4) % NEON.length];
      rect(x, sx, 8, 1, 5, c);
      rect(x, sx - 2, 10, 5, 1, c);
    }
  });
}

export function buildLights(a: Arena): LightMap {
  const lamps: Lamp[] = [];
  for (const l of a.lamps) lamps.push({ x: l.x, y: l.y, r: 86, ry: 64, c: lampC(l.c, 0.95, 0.45) });
  for (const o of a.obs) {
    if (o.kind === 'pillar') lamps.push({ x: o.x + o.w / 2, y: o.y + o.h / 2 - 4, r: 28, ry: 22, c: lampC(o.c, 1.3, 0.5) });
    else lamps.push({ x: o.x + o.w / 2, y: o.y + o.h / 2, r: Math.max(o.w, o.h) / 2 + 14, ry: Math.min(o.w, o.h) / 2 + 10, c: lampC(o.c, 0.7, 0.45) });
  }
  lamps.push({ x: VW / 2, y: 4, r: 140, ry: 22, c: [0.8, 0.55, 1.0] }); // back-wall wash
  return new LightMap([0.44, 0.4, 0.6], lamps);
}

// ---------- obstacles (3/4 view) ----------
export function drawOb(x: Ctx, o: Ob): void {
  const H = o.hgt;
  const top = o.y - H;
  const bottom = o.y + o.h;
  // shadow on the floor
  x.fillStyle = 'rgba(6,2,16,0.45)';
  x.fillRect(o.x + 2, bottom, o.w, 3);
  x.fillRect(o.x + o.w, o.y - 2, 3, o.h + 5);
  if (o.kind === 'pillar') {
    // cylinder: shaded front, glowing cap
    const body = '#3a3460';
    for (let i = 0; i < o.w; i++) {
      const f = i / (o.w - 1);
      const c = f < 0.25 ? shade(body, 1.35) : f < 0.55 ? body : f < 0.85 ? shade(body, 0.75) : shade(body, 0.55);
      rect(x, o.x + i, top + o.h / 2, 1, bottom - (top + o.h / 2), c);
    }
    rect(x, o.x + 1, top, o.w - 2, o.h, '#4a447a');
    rect(x, o.x, top + 1, o.w, o.h - 2, '#4a447a');
    rect(x, o.x + 2, top + 1, o.w - 4, o.h - 2, '#2a2448');
    // outline
    rect(x, o.x - 1, top + 2, 1, bottom - top - 3, INK);
    rect(x, o.x + o.w, top + 2, 1, bottom - top - 3, INK);
    rect(x, o.x + 1, top - 1, o.w - 2, 1, INK);
    rect(x, o.x + 1, bottom, o.w - 2, 1, INK);
    return;
  }
  const topC = o.kind === 'wall' ? '#5a5290' : '#6a4a7a';
  const faceC = o.kind === 'wall' ? '#342e5e' : '#4a2e5a';
  // top face
  rect(x, o.x, top, o.w, o.h, topC);
  rect(x, o.x, top, o.w, 1, shade(topC, 1.25));
  rect(x, o.x, top, 1, o.h, shade(topC, 1.12));
  if (o.kind === 'crate') {
    // padded bunker: quilted top
    for (let i = 3; i < o.w - 1; i += 4) rect(x, o.x + i, top + 2, 1, o.h - 4, shade(topC, 0.82));
    rect(x, o.x + 1, top + Math.floor(o.h / 2), o.w - 2, 1, shade(topC, 0.82));
  } else {
    for (let i = 2; i < o.w - 2; i += 6) rect(x, o.x + i, top + 1, 2, 1, shade(topC, 1.15));
  }
  // front face with vertical ribs
  const fy = o.y + o.h - H;
  rect(x, o.x, fy, o.w, H, faceC);
  for (let i = 2; i < o.w; i += 5) rect(x, o.x + i, fy + 2, 1, H - 3, shade(faceC, 0.78));
  rect(x, o.x, fy, o.w, 1, shade(faceC, 1.3));
  rect(x, o.x, bottom - 1, o.w, 1, shade(faceC, 0.6));
  if (o.kind === 'crate') {
    rect(x, o.x + 2, fy + 3, o.w - 4, 2, '#e8d040');
    for (let i = 3; i < o.w - 3; i += 4) rect(x, o.x + i, fy + 3, 2, 2, INK);
  }
  // outline
  rect(x, o.x - 1, top - 1, o.w + 2, 1, INK);
  rect(x, o.x - 1, bottom, o.w + 2, 1, INK);
  rect(x, o.x - 1, top, 1, bottom - top, INK);
  rect(x, o.x + o.w, top, 1, bottom - top, INK);
}

// The glowing bits of an obstacle; first knocks out the glow layer behind its silhouette.
export function emitOb(e: Ctx, o: Ob, t: number): void {
  const top = o.y - o.hgt;
  e.globalCompositeOperation = 'destination-out';
  e.fillStyle = '#000';
  e.fillRect(o.x - 1, top - 1, o.w + 2, o.y + o.h - top + 2);
  e.globalCompositeOperation = 'source-over';
  const c = o.c;
  const pulse = 0.75 + 0.25 * Math.sin(t * 3 + o.x * 0.1);
  if (o.kind === 'pillar') {
    const fy = top + o.h / 2;
    const span = o.y + o.h - fy;
    for (let k = 0; k < 3; k++) {
      const by = Math.round(fy + 3 + ((k * span) / 3 + t * 6) % span);
      if (by >= o.y + o.h - 1) continue;
      e.globalAlpha = pulse;
      rect(e, o.x, by, o.w, 1, c);
      e.globalAlpha = 1;
      rect(e, o.x + 1, by, 2, 1, mix(c, '#ffffff', 0.6));
    }
    // glowing cap ring
    rect(e, o.x + 2, top, o.w - 4, 1, c);
    rect(e, o.x + 1, top + 1, 1, o.h - 2, c);
    rect(e, o.x + o.w - 2, top + 1, 1, o.h - 2, shade(c, 0.7));
    rect(e, o.x + 2, top + o.h - 1, o.w - 4, 1, shade(c, 0.8));
    e.globalAlpha = 0.5 * pulse;
    rect(e, o.x + 3, top + 2, o.w - 6, o.h - 4, c);
    e.globalAlpha = 1;
    return;
  }
  // neon trim along the top edge of the front face and the top outline
  const fy = o.y + o.h - o.hgt;
  e.globalAlpha = 0.9;
  rect(e, o.x, fy, o.w, 1, c);
  e.globalAlpha = 0.45;
  rect(e, o.x, top, o.w, 1, c);
  e.globalAlpha = 1;
  // a running light chasing along the trim
  const run = Math.floor((t * 30 + o.y) % (o.w + 8)) - 4;
  if (run >= 0 && run < o.w) rect(e, o.x + run, fy, 3, 1, '#ffffff');
  if (o.kind === 'wall') {
    e.globalAlpha = 0.6;
    for (let i = 4; i < o.w - 2; i += 9) rect(e, o.x + i, fy + 3, 2, 2, c);
    e.globalAlpha = 1;
  }
}

// ---------- power-ups, flag, pad ----------
export function drawPower(e: Ctx, kind: PowerKind, x: number, y: number, t: number, c: string): void {
  const bob = Math.round(Math.sin(t * 5) * 1.5);
  const px = Math.round(x);
  const py = Math.round(y) - 9 + bob;
  // pedestal ring on the floor
  e.globalAlpha = 0.5 + 0.3 * Math.sin(t * 6);
  rect(e, px - 4, Math.round(y), 9, 1, c);
  rect(e, px - 3, Math.round(y) + 1, 7, 1, shade(c, 0.6));
  e.globalAlpha = 1;
  // capsule
  rect(e, px - 4, py - 4, 9, 9, INK);
  rect(e, px - 3, py - 3, 7, 7, shade(c, 0.45));
  rect(e, px - 3, py - 3, 7, 1, shade(c, 0.8));
  const W2 = '#ffffff';
  if (kind === 'rapid') {
    // double chevron
    for (const ox of [-2, 1]) {
      rect(e, px + ox, py - 2, 1, 1, W2);
      rect(e, px + ox + 1, py - 1, 1, 1, W2);
      rect(e, px + ox + 2, py, 1, 1, W2);
      rect(e, px + ox + 1, py + 1, 1, 1, W2);
      rect(e, px + ox, py + 2, 1, 1, W2);
    }
  } else if (kind === 'shield') {
    rect(e, px - 2, py - 2, 5, 1, W2);
    rect(e, px - 2, py - 2, 1, 3, W2);
    rect(e, px + 2, py - 2, 1, 3, W2);
    rect(e, px - 1, py + 1, 1, 1, W2);
    rect(e, px + 1, py + 1, 1, 1, W2);
    rect(e, px, py + 2, 1, 1, W2);
    rect(e, px - 1, py - 1, 3, 2, c);
  } else {
    // lightning bolt
    rect(e, px, py - 3, 2, 1, W2);
    rect(e, px - 1, py - 2, 2, 1, W2);
    rect(e, px - 2, py - 1, 4, 1, W2);
    rect(e, px, py, 2, 1, W2);
    rect(e, px - 1, py + 1, 2, 1, W2);
    rect(e, px - 2, py + 2, 2, 1, W2);
  }
  // sparkle
  const s = Math.floor(t * 4) % 4;
  if (s === 0) rect(e, px + 3, py - 4, 1, 1, W2);
}

export function drawFlag(x: Ctx, fx: number, fy: number, t: number, held: boolean): void {
  const px = Math.round(fx) + (held ? 4 : 0);
  const py = Math.round(fy) - (held ? 6 : 0);
  const wave = Math.floor(t * 8) % 3;
  rect(x, px, py - 18, 1, 18, '#e8e8f0');
  rect(x, px - 1, py - 19, 3, 1, '#ffffff');
  const cs = ['#fff8a0', '#ffe04f', '#ffb820'];
  for (let i = 0; i < 8; i++) {
    const h = 7 - Math.floor(i * 0.8);
    const off = (i + wave) % 3 === 0 ? 1 : 0;
    rect(x, px + 1 + i, py - 18 + Math.floor(i * 0.4) + off, 1, h, cs[Math.floor(i / 3) % 3]);
  }
  if (!held) {
    x.globalAlpha = 0.5 + 0.3 * Math.sin(t * 6);
    rect(x, px - 5, py, 11, 1, '#ffe04f');
    x.globalAlpha = 1;
  }
}

export function drawPad(e: Ctx, px: number, py: number, t: number, hot: boolean): void {
  const c = hot ? '#b8ffb0' : '#7cf08a';
  const r = 11;
  e.globalAlpha = 0.3 + 0.15 * Math.sin(t * 5);
  for (let j = -5; j <= 5; j++) {
    const hw = Math.round(10 * Math.sqrt(1 - (j / 6) ** 2));
    rect(e, px - hw, py + j, hw * 2, 1, '#7cf08a');
  }
  e.globalAlpha = 1;
  for (let a = 0; a < 28; a++) {
    if ((a + Math.floor(t * 8)) % 4 === 0) continue;
    const ang = (a / 28) * Math.PI * 2;
    rect(e, Math.round(px + Math.cos(ang) * r), Math.round(py + Math.sin(ang) * r * 0.55), 1, 1, c);
  }
  // "PAD" lettering and a bouncing arrow
  const k = Math.floor(t * 3) % 2;
  text(e, 'PAD', px - 5, py - 2, hot ? '#ffffff' : '#c8ffc0');
  if (hot) {
    rect(e, px - 2, py - 16 - k, 5, 1, c);
    rect(e, px - 1, py - 15 - k, 3, 1, c);
    rect(e, px, py - 14 - k, 1, 1, c);
  }
}

// Floor chevrons from the carrier toward the pad.
export function drawGuide(e: Ctx, x0: number, y0: number, x1: number, y1: number, t: number): void {
  const d = Math.hypot(x1 - x0, y1 - y0);
  if (d < 20) return;
  const ux = (x1 - x0) / d;
  const uy = (y1 - y0) / d;
  const off = (t * 30) % 12;
  for (let s = 12 + off; s < Math.min(d - 10, 60); s += 12) {
    const cx = x0 + ux * s;
    const cy = y0 + 2 + uy * s * 0.9;
    e.globalAlpha = 1 - s / 70;
    for (const k of [-2, -1, 0, 1, 2]) {
      const bx = cx - ux * Math.abs(k) + -uy * k;
      const by = cy - uy * Math.abs(k) + ux * k;
      rect(e, Math.round(bx), Math.round(by), 1, 1, '#7cf08a');
    }
  }
  e.globalAlpha = 1;
}

// ---------- reticle ----------
export function drawReticle(x: Ctx, rx: number, ry: number, c: string, hot: boolean, kick: number): void {
  const px = Math.round(rx);
  const py = Math.round(ry);
  const g = 2 + Math.round(kick * 2);
  const col = hot ? '#ff6a5a' : c;
  for (const [dx, dy, w, h] of [
    [-g - 3, 0, 3, 1],
    [g + 1, 0, 3, 1],
    [0, -g - 3, 1, 3],
    [0, g + 1, 1, 3],
  ]) {
    rect(x, px + dx - 1, py + dy - 1, w + 2, h + 2, INK);
  }
  for (const [dx, dy, w, h] of [
    [-g - 3, 0, 3, 1],
    [g + 1, 0, 3, 1],
    [0, -g - 3, 1, 3],
    [0, g + 1, 1, 3],
  ])
    rect(x, px + dx, py + dy, w, h, col);
  rect(x, px, py, 1, 1, '#ffffff');
  if (hot) {
    rect(x, px - g - 3, py - g - 3, 2, 1, col);
    rect(x, px - g - 3, py - g - 3, 1, 2, col);
    rect(x, px + g + 2, py - g - 3, 2, 1, col);
    rect(x, px + g + 3, py - g - 3, 1, 2, col);
    rect(x, px - g - 3, py + g + 3, 2, 1, col);
    rect(x, px - g - 3, py + g + 2, 1, 2, col);
    rect(x, px + g + 2, py + g + 3, 2, 1, col);
    rect(x, px + g + 3, py + g + 2, 1, 2, col);
  }
}

// A laser bolt: a bright core with a coloured streak and a fading trail.
export function drawBolt(e: Ctx, bx: number, by: number, vx: number, vy: number, c: string): void {
  const sp = Math.hypot(vx, vy) || 1;
  const ux = vx / sp;
  const uy = vy / sp;
  const len = sp > 200 ? 9 : 6;
  for (let i = len; i >= 0; i--) {
    const px = Math.round(bx - ux * i);
    const py = Math.round(by - uy * i);
    e.globalAlpha = 1 - i / (len + 2);
    rect(e, px, py, 1, 1, i < 2 ? '#ffffff' : c);
    if (i < len - 2) rect(e, px, py + 1, 1, 1, shade(c, 0.7));
  }
  e.globalAlpha = 1;
  rect(e, Math.round(bx) - 1, Math.round(by), 3, 1, mix(c, '#ffffff', 0.6));
}
