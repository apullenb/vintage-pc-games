// Thrift Hunt art: three hand-shaded settings (thrift store, flea market, garage-sale street),
// their props, the living deals (googly eyes, scurrying legs) and the junk (stains, bugs, flies),
// walking shoppers, the tag gun, reticle and price-tag projectile. Everything is drawn in world space.
import type { Person } from '../art/people.ts';
import { bayer, cached, dither, INK, mix, rect, shade, stipple, type Ctx } from '../art/px.ts';
import { FLOOR_Y, WH, WW, type Defect, type ItemDef, type MapDef, type Prop, type Shape } from './thriftData.ts';
import { centered, outlined, ptext, ptw, stext } from './thriftPhishFx.ts';
import { ball, ell, layer, lin, pool, rad, rgba, sbox, shadow as softShadow, smoothUp } from './hd2Kit.tsx';
import { person } from './hd2Person.ts';
const shadow2 = softShadow;

const hash = (n: number): number => {
  let t = (n + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Shaded block: highlight on top/left, shadow bottom/right, ink outline.
function blk(x: Ctx, px: number, py: number, w: number, h: number, c: string, outline = true): void {
  if (outline) rect(x, px - 1, py - 1, w + 2, h + 2, INK);
  rect(x, px, py, w, h, c);
  rect(x, px, py, w, 1, shade(c, 1.25));
  rect(x, px, py + 1, 1, h - 1, shade(c, 1.1));
  rect(x, px, py + h - 1, w, 1, shade(c, 0.7));
  rect(x, px + w - 1, py + 1, 1, h - 1, shade(c, 0.8));
}
function shadowBlob(x: Ctx, cx: number, cy: number, w: number, h = 3, a = 0.3): void {
  softShadow(x, cx, cy, w / 2 + 1.5, h * 0.75 + 0.8, a * 1.4);
}

const CLOTH = ['#e0503c', '#3f7fd8', '#3caa6a', '#f2b632', '#9a5ad0', '#ef7fae', '#2fb5b0', '#eeeae0', '#5a4a3a', '#c86a3a', '#6a7ab8', '#d8c8a0'];

// ---------- backdrops ----------
export function drawSky(x: Ctx, m: MapDef, camX: number, t: number): void {
  if (m.theme === 'thrift') return;
  const sky = cached(`th-sky`, 240, 40, (g) => {
    const st = ['#6ab0f0', '#7cc0f4', '#94d0f6', '#b4e0f8', '#d4ecf4'];
    for (let j = 0; j < 40; j++) {
      const f = (j / 39) * (st.length - 1);
      const k = Math.floor(f);
      for (let i = 0; i < 240; i++) {
        const c = f - k > bayer(i, j) ? st[Math.min(st.length - 1, k + 1)] : st[k];
        g.fillStyle = c;
        g.fillRect(i, j, 1, 1);
      }
    }
  });
  x.drawImage(sky, 0, 0);
  // drifting clouds (slow parallax)
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 83 + t * (3 + i) - camX * 0.2) % 300) - 30;
    const cy = 5 + (i % 2) * 7;
    rect(x, cx, cy + 2, 22, 4, '#ffffff');
    rect(x, cx + 4, cy, 12, 3, '#ffffff');
    rect(x, cx + 2, cy + 5, 18, 1, '#dceaf4');
  }
  // far layer: hills and trees (medium parallax)
  const far = cached(`th-far-${m.theme}`, 300, 40, (g) => {
    for (let i = 0; i < 300; i++) {
      const h = 10 + Math.round(Math.sin(i * 0.05) * 3 + Math.sin(i * 0.13 + 1) * 2);
      rect(g, i, 40 - h - 6, 1, h + 6, '#5a9a7a');
      const h2 = 6 + Math.round(Math.abs(Math.sin(i * 0.31)) * 5 + hash(i) * 2);
      rect(g, i, 40 - h2, 1, h2, '#3e7a5a');
    }
    for (let i = 0; i < 300; i += 3) if (hash(i * 7) < 0.4) rect(g, i, 40 - 10 - hash(i) * 6, 1, 1, '#6aae86');
  });
  x.drawImage(far, -Math.round(camX * 0.5) - 10, 0);
}

// The static world layer (floor, walls, houses). Cached per map.
export function worldLayer(m: MapDef, key: string): HTMLCanvasElement {
  return cached(`th-world-${key}`, WW, WH, (g) => {
    if (m.theme === 'thrift') thriftRoom(g, m);
    else if (m.theme === 'flea') fleaLot(g, m);
    else yardStreet(g, m);
  });
}
// The same world, Scale2x-smoothed once so it draws back texture-filtered on the HD canvas.
const WORLD_HD = new Map<string, HTMLCanvasElement>();
export function worldLayerHd(m: MapDef, key: string): HTMLCanvasElement {
  let c = WORLD_HD.get(key);
  if (!c) {
    c = document.createElement('canvas');
    smoothUp(worldLayer(m, key), c);
    WORLD_HD.set(key, c);
  }
  return c;
}

// Smooth HD lighting, cached per map: thrift = dim, cool corners and warm pools under the ceiling
// lights; outdoors = soft sun from the upper left. Drawn in two passes: shade (multiply-ish), light (add).
export function lightLayerHd(m: MapDef, key: string): { shade: HTMLCanvasElement; light: HTMLCanvasElement } {
  const thrift = m.theme === 'thrift';
  const lamps: [number, number][] = thrift ? [[56, 70], [136, 60], [216, 70], [76, 136], [196, 136]] : [];
  const shadeL = layer(`th-shade-hd-${key}`, WW, WH, (g) => {
    const dark = thrift ? '#140c28' : '#1a2840';
    g.save();
    g.translate(WW / 2, WH / 2);
    g.scale(1, WH / WW);
    g.fillStyle = rad(g, 0, 0, WW * 0.3, WW * 0.75, [rgba(dark, thrift ? 0.12 : 0), rgba(dark, thrift ? 0.35 : 0.12), rgba(dark, thrift ? 0.6 : 0.35)]);
    g.fillRect(-WW, -WW, WW * 2, WW * 2);
    g.restore();
    if (!thrift) {
      g.fillStyle = lin(g, 0, 0, WW, WH, ['rgba(26,40,64,0)', 'rgba(26,40,64,0)', 'rgba(26,40,64,0.18)']);
      g.fillRect(0, 0, WW, WH);
    }
    // the lamps punch holes in the gloom
    g.globalCompositeOperation = 'destination-out';
    for (const [lx, ly] of lamps) {
      g.save();
      g.translate(lx, ly);
      g.scale(1.4, 1);
      g.fillStyle = rad(g, 0, 0, 0, 62, ['rgba(0,0,0,0.9)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0)']);
      g.fillRect(-62, -62, 124, 124);
      g.restore();
    }
  });
  const lightL = layer(`th-light-hd-${key}`, WW, WH, (g) => {
    const warm = thrift ? '#ffd890' : '#fff0c0';
    if (!thrift) {
      g.fillStyle = rad(g, -20, -30, 10, WW * 0.9, [rgba(warm, 0.3), rgba(warm, 0.1), rgba(warm, 0)]);
      g.fillRect(0, 0, WW, WH);
    }
    for (const [lx, ly] of lamps) {
      g.save();
      g.translate(lx, ly);
      g.scale(1.4, 1);
      g.fillStyle = rad(g, 0, 0, 0, 58, [rgba(warm, 0.3), rgba(warm, 0.12), rgba(warm, 0)]);
      g.fillRect(-58, -58, 116, 116);
      g.restore();
    }
  });
  return { shade: shadeL, light: lightL };
}

function thriftRoom(g: Ctx, m: MapDef): void {
  // floor: worn linoleum checker with grout and scuffs
  for (let j = FLOOR_Y; j < WH; j += 8)
    for (let i = 0; i < WW; i += 8) {
      const odd = ((i + j) / 8) & 1;
      const c = odd ? '#d8ccb0' : '#c2b496';
      rect(g, i, j, 8, 8, c);
      rect(g, i, j, 8, 1, shade(c, 1.08));
      rect(g, i, j + 7, 8, 1, shade(c, 0.9));
    }
  for (let k = 0; k < 140; k++) {
    const sx = hash(k * 3) * WW;
    const sy = FLOOR_Y + hash(k * 5) * (WH - FLOOR_Y);
    rect(g, sx, sy, 1 + Math.round(hash(k) * 2), 1, 'rgba(90,70,50,0.25)');
  }
  // back wall: wallpaper, wainscot, shelves of knickknacks, sign
  rect(g, 0, 0, WW, FLOOR_Y, '#6e8e86');
  for (let i = 0; i < WW; i += 6) rect(g, i, 0, 2, FLOOR_Y - 10, '#648078');
  for (let i = 3; i < WW; i += 12) for (let j = 4; j < FLOOR_Y - 12; j += 8) rect(g, i, j, 1, 1, '#8aaaa0');
  rect(g, 0, FLOOR_Y - 10, WW, 10, '#7a4e30');
  rect(g, 0, FLOOR_Y - 10, WW, 1, '#9a6a44');
  for (let i = 0; i < WW; i += 14) rect(g, i, FLOOR_Y - 9, 1, 9, '#5e3a24');
  rect(g, 0, FLOOR_Y - 1, WW, 1, '#3a2418');
  // wall shelves
  for (const sx of [8, 196]) {
    rect(g, sx, 16, 68, 2, '#8a5a3a');
    rect(g, sx, 18, 68, 1, '#4a2e1c');
    for (let k = 0; k < 9; k++) {
      const c = CLOTH[(k * 5 + sx) % CLOTH.length];
      const h = 3 + Math.round(hash(k + sx) * 5);
      const w = 3 + Math.round(hash(k * 3 + sx) * 3);
      blk(g, sx + 2 + k * 7.4, 16 - h, w, h, c, false);
      rect(g, sx + 2 + k * 7.4, 16 - h, 1, h, shade(c, 1.2));
    }
  }
  // the sign
  const name = m.name;
  const sw = ptw(name) + 12;
  const sx = Math.round(WW / 2 - sw / 2);
  rect(g, sx - 1, 3, sw + 2, 13, INK);
  rect(g, sx, 4, sw, 11, '#f2b632');
  rect(g, sx, 4, sw, 1, '#ffe08a');
  rect(g, sx, 14, sw, 1, '#b07a1a');
  ptext(g, name, sx + 6, 7, '#5a2a10');
  // a door at the bottom (where you came in)
  rect(g, WW / 2 - 16, WH - 3, 32, 3, '#8ab8d0');
}

function fleaLot(g: Ctx, m: MapDef): void {
  // grass verge + chain-link fence along the top
  rect(g, 0, 0, WW, FLOOR_Y, 'rgba(0,0,0,0)');
  g.clearRect(0, 0, WW, FLOOR_Y);
  rect(g, 0, FLOOR_Y - 12, WW, 12, '#5aa04a');
  for (let i = 0; i < WW; i += 2) if (hash(i) < 0.6) rect(g, i, FLOOR_Y - 12 - Math.round(hash(i * 3) * 2), 1, 2, '#6ab85a');
  for (let i = 0; i < WW; i += 4) for (let j = FLOOR_Y - 22; j < FLOOR_Y - 6; j += 4) {
    rect(g, i, j, 1, 1, '#a8b0b8');
    rect(g, i + 2, j + 2, 1, 1, '#a8b0b8');
  }
  rect(g, 0, FLOOR_Y - 23, WW, 1, '#c8d0d8');
  for (let i = 4; i < WW; i += 32) rect(g, i, FLOOR_Y - 24, 2, 18, '#8a929a');
  // banner
  const sw = ptw(m.name) + 14;
  const sx = Math.round(WW / 2 - sw / 2);
  rect(g, sx - 1, 6, sw + 2, 12, INK);
  rect(g, sx, 7, sw, 10, '#e0503c');
  rect(g, sx, 7, sw, 1, '#ff8a6a');
  for (let i = 0; i < sw; i += 6) rect(g, sx + i, 16, 3, 2, '#e0503c');
  ptext(g, m.name, sx + 7, 9, '#fff3c4');
  // asphalt
  for (let j = FLOOR_Y; j < WH; j++)
    for (let i = 0; i < WW; i++) {
      const n = hash(i * 977 + j * 131);
      g.fillStyle = n < 0.12 ? '#55555e' : n > 0.92 ? '#3a3a42' : '#48484f';
      g.fillRect(i, j, 1, 1);
    }
  // faded parking lines and oil stains
  for (let i = 18; i < WW; i += 40) {
    stipple(g, i, FLOOR_Y + 4, 2, 40, '#d8d0b0', 0.7);
    stipple(g, i, WH - 44, 2, 40, '#d8d0b0', 0.7);
  }
  for (let k = 0; k < 6; k++) {
    const ox = hash(k * 11) * WW;
    const oy = FLOOR_Y + 10 + hash(k * 13) * (WH - FLOOR_Y - 20);
    stipple(g, ox, oy, 12, 5, '#2e2e36', 0.5);
  }
  rect(g, 0, FLOOR_Y, WW, 1, '#6a6a72');
}

function yardStreet(g: Ctx, m: MapDef): void {
  g.clearRect(0, 0, WW, WH);
  // houses along the top: siding, roofs, windows, open garages full of stuff
  const houses = [
    { x: -6, w: 96, c: '#e8d8b0', roof: '#7a4a3a' },
    { x: 92, w: 88, c: '#a8c8d8', roof: '#4a4a5a' },
    { x: 182, w: 96, c: '#e8b8a8', roof: '#5a3a3a' },
  ];
  for (const [k, h] of houses.entries()) {
    rect(g, h.x, 8, h.w, FLOOR_Y - 8, h.c);
    for (let j = 10; j < FLOOR_Y; j += 3) rect(g, h.x, j, h.w, 1, shade(h.c, 0.9));
    rect(g, h.x - 2, 4, h.w + 4, 5, h.roof);
    rect(g, h.x - 2, 4, h.w + 4, 1, shade(h.roof, 1.3));
    rect(g, h.x - 2, 9, h.w + 4, 1, shade(h.roof, 0.6));
    // garage, door rolled up
    const gx = h.x + (k === 1 ? 8 : h.w - 44);
    rect(g, gx - 1, 13, 38, FLOOR_Y - 13, INK);
    rect(g, gx, 14, 36, FLOOR_Y - 14, '#2a2234');
    rect(g, gx, 14, 36, 3, '#d8d8e0');
    rect(g, gx, 16, 36, 1, '#9a9aa8');
    for (let b = 0; b < 4; b++) blk(g, gx + 3 + b * 8, FLOOR_Y - 6 - (b % 2) * 3, 7, 6 + (b % 2) * 3, '#c8a070', false);
    // windows with curtains
    const wx = k === 1 ? h.x + 54 : h.x + 10;
    for (const ox of [0, 16]) {
      rect(g, wx + ox - 1, 13, 12, 10, INK);
      rect(g, wx + ox, 14, 10, 8, '#8ac8e8');
      rect(g, wx + ox, 14, 10, 2, '#c8e8f8');
      rect(g, wx + ox, 14, 2, 8, '#f2e8d8');
      rect(g, wx + ox + 8, 14, 2, 8, '#f2e8d8');
    }
  }
  // lawn with tufts, driveways
  for (let j = FLOOR_Y; j < WH - 26; j++)
    for (let i = 0; i < WW; i++) {
      const n = hash(i * 613 + j * 389);
      g.fillStyle = n < 0.1 ? '#6ab85a' : n > 0.9 ? '#468a3a' : (i + j) % 7 === 0 ? '#5aa850' : '#55a046';
      g.fillRect(i, j, 1, 1);
    }
  for (let k = 0; k < 60; k++) {
    const tx = hash(k * 17) * WW;
    const ty = FLOOR_Y + 4 + hash(k * 19) * (WH - FLOOR_Y - 34);
    rect(g, tx, ty, 1, 2, '#7ac86a');
    rect(g, tx + 2, ty + 1, 1, 1, '#7ac86a');
  }
  for (const h of houses) {
    const dx = h.x + (h === houses[1] ? 8 : h.w - 44);
    rect(g, dx, FLOOR_Y, 36, WH - 26 - FLOOR_Y, '#b8b0a0');
    for (let j = FLOOR_Y + 10; j < WH - 26; j += 12) rect(g, dx, j, 36, 1, '#9a9284');
    stipple(g, dx, FLOOR_Y, 36, WH - 26 - FLOOR_Y, '#a8a092', 0.18);
  }
  // sidewalk and curb, a slice of street
  rect(g, 0, WH - 26, WW, 14, '#cfc8b8');
  for (let i = 0; i < WW; i += 16) rect(g, i, WH - 26, 1, 14, '#a8a090');
  rect(g, 0, WH - 26, WW, 1, '#e8e0d0');
  rect(g, 0, WH - 12, WW, 2, '#8a8478');
  for (let j = WH - 10; j < WH; j++) for (let i = 0; i < WW; i++) {
    g.fillStyle = hash(i * 31 + j * 7) < 0.15 ? '#5a5a62' : '#4a4a52';
    g.fillRect(i, j, 1, 1);
  }
  // name on a lawn sign painted on the curb
  ptext(g, m.name, 6, WH - 21, '#7a7264');
}

// Foreground parallax: hanging sale signs indoors, a string of bunting flags outdoors.
// offX is the camera x scaled up, so this layer slides faster than the floor.
export function drawForeground(x: Ctx, m: MapDef, offX: number, t: number, vw: number): void {
  const span = WW * 1.4;
  if (m.theme === 'thrift') {
    const signs = ['50% OFF', 'SALE', '$1 BIN', 'AS IS', 'SALE'];
    signs.forEach((sg, i) => {
      const sx = Math.round(((i * 97 + 40 - offX) % span + span) % span - 30);
      if (sx < -40 || sx > vw + 10) return;
      const sway = Math.round(Math.sin(t * 1.4 + i) * 1.5);
      const w = ptw(sg) + 8;
      rect(x, sx + w / 2, 0, 1, 20, '#3a3040');
      rect(x, sx - 1 + sway, 19, w + 2, 11, INK);
      rect(x, sx + sway, 20, w, 9, i % 2 ? '#e0503c' : '#f2b632');
      rect(x, sx + sway, 20, w, 1, i % 2 ? '#ff8a6a' : '#ffe08a');
      ptext(x, sg, sx + 4 + sway, 22, i % 2 ? '#fff3c4' : '#5a2a10');
    });
    return;
  }
  // bunting: a sagging string with triangle flags
  const colors = ['#e0503c', '#f2b632', '#3f7fd8', '#3caa6a', '#ef7fae'];
  for (let k = 0; k < 2; k++) {
    const base = k * 140 + 30;
    const sx0 = ((base - offX) % span + span) % span - 60;
    for (let i = 0; i <= 120; i += 2) {
      const px = sx0 + i;
      if (px < -2 || px > vw + 2) continue;
      const sag = Math.round(20 + Math.sin((i / 120) * Math.PI) * 8);
      rect(x, px, sag, 2, 1, '#3a3040');
      if (i % 10 === 4) {
        const c = colors[(i / 10 + k) % colors.length | 0];
        const flap = Math.round(Math.sin(t * 4 + i) * 1);
        rect(x, px - 3, sag + 1, 7, 1, INK);
        for (let j = 0; j < 5; j++) rect(x, px - 2 + Math.floor(j / 2) + flap * (j > 2 ? 1 : 0), sag + 1 + j, 5 - Math.floor(j / 2) * 2, 1, j === 0 ? mix(c, '#ffffff', 0.4) : c);
      }
    }
  }
}

// ---------- props ----------
export function propBox(p: Prop): { x: number; y: number; w: number; h: number } {
  const foot = p.y + p.h;
  if (p.kind === 'tree') return { x: p.x - 10, y: foot - p.tall, w: p.w + 20, h: p.tall };
  if (p.kind === 'umbrella') return { x: p.x - 12, y: foot - p.tall, w: p.w + 24, h: p.tall };
  if (p.kind === 'sign') return { x: p.x - 8, y: foot - p.tall, w: p.w + 16, h: p.tall };
  return { x: p.x, y: foot - p.tall, w: p.w, h: p.tall };
}

export function propShadow(x: Ctx, p: Prop, outdoor: boolean): void {
  const foot = p.y + p.h;
  if (outdoor) {
    // sun from the upper left: soft shadows fall down-right
    const w = p.kind === 'tree' || p.kind === 'umbrella' ? 26 : p.w;
    const cx = p.x + p.w / 2;
    softShadow(x, cx + 3.5, foot + 1, w / 2 + 2, 3.2, 0.4, '#10082a');
  } else shadowBlob(x, p.x + p.w / 2, foot, p.w + 4, 3, 0.26);
}

export function drawProp(x: Ctx, p: Prop, t: number): void {
  const foot = p.y + p.h;
  const L = p.x;
  const R = p.x + p.w;
  const cx = Math.round(p.x + p.w / 2);
  const top = foot - p.tall;
  const seed = Math.floor(p.hue * 1000);
  switch (p.kind) {
    case 'rack': {
      // chrome posts and bar, garments hanging
      const n = Math.floor((p.w - 6) / 4);
      for (let i = 0; i < n; i++) {
        const c = CLOTH[(seed + i * 7) % CLOTH.length];
        const gx = L + 3 + i * 4;
        const len = 11 + ((seed + i) % 3) * 2;
        rect(x, gx - 1, top + 3, 6, len + 1, INK);
        rect(x, gx, top + 3, 4, len, c);
        rect(x, gx, top + 3, 1, len, shade(c, 1.2));
        rect(x, gx + 3, top + 3, 1, len, shade(c, 0.72));
        rect(x, gx, top + 3 + len - 1, 4, 1, shade(c, 0.62));
        rect(x, gx + 1, top + 1, 1, 2, '#c8ccd8');
      }
      rect(x, L, top - 1, p.w, 3, INK);
      rect(x, L, top, p.w, 1, '#dce0ec');
      for (const px of [L, R - 2]) {
        rect(x, px - 1, top - 1, 4, p.tall + 1, INK);
        rect(x, px, top, 2, p.tall - 1, '#b8bcc8');
        rect(x, px, top, 1, p.tall - 1, '#eef0f8');
        rect(x, px - 3, foot - 2, 8, 2, '#6a6e7a');
      }
      break;
    }
    case 'roundrack': {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const c = CLOTH[(seed + i * 5) % CLOTH.length];
        const gx = L + 1 + i * 3.5;
        const len = 12 + (i % 2) * 2;
        rect(x, gx - 1, top + 4, 6, len + 1, INK);
        rect(x, gx, top + 4, 4, len, c);
        rect(x, gx, top + 4, 1, len, shade(c, 1.2));
        rect(x, gx + 3, top + 4, 1, len, shade(c, 0.7));
      }
      rect(x, L - 1, top + 1, p.w + 2, 4, INK);
      rect(x, L, top + 2, p.w, 2, '#c8ccd8');
      rect(x, L + 2, top + 2, p.w - 4, 1, '#eef0f8');
      rect(x, cx - 1, top + 4, 2, p.tall - 4, '#9a9eaa');
      rect(x, cx - 6, foot - 2, 12, 2, '#5a5e6a');
      break;
    }
    case 'shelf': {
      blk(x, L, top, p.w, p.tall, '#8a5a36');
      for (let s = 0; s < 3; s++) {
        const sy = top + 3 + s * 9;
        rect(x, L + 2, sy, p.w - 4, 7, '#4a2e1c');
        rect(x, L + 2, sy + 7, p.w - 4, 1, '#b07a4a');
        let ix = L + 3;
        let k = 0;
        while (ix < R - 5) {
          const c = CLOTH[(seed + s * 3 + k * 5) % CLOTH.length];
          const w = 2 + ((seed + k + s) % 3);
          const h = 3 + ((seed * 3 + k + s) % 4);
          rect(x, ix, sy + 7 - h, w, h, c);
          rect(x, ix, sy + 7 - h, 1, h, shade(c, 1.25));
          ix += w + 1;
          k++;
        }
      }
      break;
    }
    case 'bin':
    case 'crates':
    case 'boxes': {
      if (p.kind === 'boxes') {
        blk(x, L, top + 5, p.w, p.tall - 5, '#c8a070');
        blk(x, L + 3, top, p.w - 8, 6, '#d8b080');
        rect(x, cx - 1, top + 5, 2, p.tall - 5, '#e8d0a0');
        ptext(x, 'FREE', L + 2, foot - 6, '#5a3a1a');
      } else {
        // heap of goods poking out of the top
        for (let k = 0; k < 6; k++) {
          const c = CLOTH[(seed + k * 3) % CLOTH.length];
          const hx = L + 2 + k * ((p.w - 6) / 6);
          const hy = top + 1 + (k % 2) * 2;
          rect(x, hx - 1, hy - 1, 7, 6, INK);
          rect(x, hx, hy, 5, 5, c);
          rect(x, hx, hy, 5, 1, shade(c, 1.25));
        }
        blk(x, L, top + 4, p.w, p.tall - 4, p.kind === 'bin' ? '#9a6a3c' : '#b08a52');
        for (let j = top + 7; j < foot - 1; j += 3) rect(x, L + 1, j, p.w - 2, 1, p.kind === 'bin' ? '#7a4e2a' : '#8a6a3a');
        if (p.kind === 'bin') {
          rect(x, cx - 6, top + 6, 12, 5, '#fffaf0');
          ptext(x, '$2', cx - 3, top + 6, '#c0392b');
        }
      }
      break;
    }
    case 'mannequins': {
      for (const [ox, c] of [[0, CLOTH[seed % CLOTH.length]], [10, CLOTH[(seed + 5) % CLOTH.length]]] as [number, string][]) {
        const mx = L + ox;
        rect(x, mx + 3, top, 3, 3, '#e8dcc8');
        rect(x, mx - 1, top + 2, 10, 15, INK);
        rect(x, mx, top + 3, 8, 13, c);
        rect(x, mx, top + 3, 2, 13, shade(c, 1.2));
        rect(x, mx + 6, top + 3, 2, 13, shade(c, 0.75));
        rect(x, mx + 3, top + 16, 2, p.tall - 18, '#6a5a4a');
        rect(x, mx + 1, foot - 2, 6, 2, '#4a3a2a');
      }
      break;
    }
    case 'counter': {
      blk(x, L, top + 4, p.w, p.tall - 4, '#a8704a');
      rect(x, L, top + 4, p.w, 2, '#e8dcc0');
      for (let i = L + 4; i < R - 2; i += 8) rect(x, i, top + 8, 1, p.tall - 9, '#7a4e30');
      // register
      blk(x, R - 16, top - 4, 12, 8, '#3a3a4a');
      rect(x, R - 14, top - 3, 8, 3, '#7cf08a');
      rect(x, R - 14, top - 3, 8, 1, '#c8ffd0');
      break;
    }
    case 'tent': {
      // table with cloth under a striped canopy
      blk(x, L + 2, foot - 10, p.w - 4, 10, '#e8e0d0');
      for (let i = L + 4; i < R - 4; i += 6) rect(x, i, foot - 9, 3, 8, p.hue > 0.5 ? '#3f7fd8' : '#e0503c');
      for (let k = 0; k < 5; k++) {
        const c = CLOTH[(seed + k * 4) % CLOTH.length];
        blk(x, L + 6 + k * 8, foot - 15, 5, 4, c, true);
      }
      for (const px of [L, R - 2]) rect(x, px, top + 8, 2, p.tall - 8, '#8a8a94');
      const a = p.hue > 0.5 ? '#3f7fd8' : '#e0503c';
      const b = '#f4eedd';
      rect(x, L - 4, top - 1, p.w + 8, 11, INK);
      for (let i = 0; i < p.w + 6; i++) {
        const c = Math.floor(i / 6) % 2 ? a : b;
        rect(x, L - 3 + i, top, 1, 8, c);
        if (i % 6 < 3) rect(x, L - 3 + i, top + 8, 1, 1, c);
      }
      rect(x, L - 3, top, p.w + 6, 1, '#ffffff');
      stipple(x, L - 3, top + 5, p.w + 6, 3, 'rgba(20,10,40,0.25)', 0.5);
      break;
    }
    case 'stall':
    case 'ftable': {
      const cloth = p.kind === 'stall' ? (p.hue > 0.5 ? '#3caa6a' : '#9a5ad0') : null;
      // wares on top
      for (let k = 0; k < 5; k++) {
        const c = CLOTH[(seed + k * 7) % CLOTH.length];
        const wx = L + 3 + k * ((p.w - 8) / 5);
        const wh = 3 + ((seed + k) % 3) * 2;
        blk(x, wx, foot - p.tall - wh + 3, 5, wh, c);
      }
      if (cloth) {
        blk(x, L, foot - p.tall + 3, p.w, p.tall - 3, cloth);
        for (let i = L + 2; i < R - 1; i += 4) rect(x, i, foot - 3, 2, 2, shade(cloth, 0.7));
        dither(x, L + 1, foot - p.tall + 6, p.w - 2, 1, shade(cloth, 1.15), cloth);
      } else {
        rect(x, L - 1, foot - p.tall + 2, p.w + 2, 4, INK);
        rect(x, L, foot - p.tall + 3, p.w, 2, '#d8d0c0');
        rect(x, L, foot - p.tall + 3, p.w, 1, '#f4ecdc');
        for (const lx of [L + 2, R - 3]) rect(x, lx, foot - p.tall + 5, 1, p.tall - 5, '#6a6a72');
      }
      break;
    }
    case 'umbrella': {
      blk(x, L - 2, foot - 9, p.w + 4, 3, '#e8e0d0');
      rect(x, cx, top + 6, 1, p.tall - 6, '#d8d8e0');
      const a = p.hue > 0.5 ? '#f2b632' : '#2fb5b0';
      for (let j = 0; j < 8; j++) {
        const hw = 6 + j * 2;
        rect(x, cx - hw - 1, top + j, hw * 2 + 3, 1, INK);
        for (let i = -hw; i <= hw; i++) rect(x, cx + i, top + j, 1, 1, Math.floor((i + 40) / 5) % 2 ? a : '#f4eedd');
      }
      rect(x, cx - 21, top + 8, 43, 1, INK);
      break;
    }
    case 'tree': {
      rect(x, cx - 3, top + 22, 6, p.tall - 22, INK);
      rect(x, cx - 2, top + 22, 4, p.tall - 22, '#7a5232');
      rect(x, cx - 2, top + 22, 1, p.tall - 22, '#9a6a42');
      const sway = Math.round(Math.sin(t * 1.3 + p.hue * 6) * 1);
      const blobs: [number, number, number][] = [[0, 12, 15], [-9, 16, 9], [9, 15, 10], [0, 4, 10], [-5, 7, 8], [6, 6, 8]];
      for (const [bx, by, r] of blobs) disc2(x, cx + bx + sway, top + by, r + 1, INK);
      for (const [bx, by, r] of blobs) disc2(x, cx + bx + sway, top + by, r, '#3e8a3e');
      for (const [bx, by, r] of blobs) disc2(x, cx + bx + sway - 2, top + by - 2, r - 3, '#4ea84a');
      for (const [bx, by, r] of blobs) disc2(x, cx + bx + sway - 3, top + by - 4, Math.max(1, r - 7), '#6ac85e');
      stipple(x, cx - 16 + sway, top + 16, 32, 10, '#2e6a2e', 0.4);
      break;
    }
    case 'car': {
      const c = p.hue > 0.66 ? '#c83a3a' : p.hue > 0.33 ? '#3a6ad0' : '#e8e4d8';
      rect(x, L - 1, top + 5, p.w + 2, p.tall - 7, INK);
      rect(x, L, top + 6, p.w, p.tall - 9, c);
      rect(x, L, top + 6, p.w, 1, shade(c, 1.3));
      rect(x, L, foot - 6, p.w, 2, shade(c, 0.7));
      rect(x, L + 12, top - 1, p.w - 26, 8, INK);
      rect(x, L + 13, top, p.w - 28, 7, c);
      rect(x, L + 15, top + 1, 12, 5, '#8ac8e8');
      rect(x, L + 29, top + 1, 12, 5, '#8ac8e8');
      rect(x, L + 15, top + 1, 12, 1, '#d8f0f8');
      rect(x, L + 29, top + 1, 12, 1, '#d8f0f8');
      for (const wx of [L + 6, R - 14]) {
        rect(x, wx - 1, foot - 6, 10, 6, INK);
        rect(x, wx, foot - 5, 8, 4, '#2a2a33');
        rect(x, wx + 2, foot - 4, 4, 2, '#9a9aa8');
      }
      rect(x, R - 3, top + 9, 2, 2, '#fff3c4');
      rect(x, L + 1, top + 9, 2, 2, '#e05050');
      break;
    }
    case 'sign': {
      rect(x, cx, top + 10, 1, p.tall - 10, '#7a5232');
      blk(x, cx - 12, top, 24, 11, '#f4eedd');
      ptext(x, 'YARD', cx - 7, top + 1, '#c0392b');
      ptext(x, 'SALE', cx - 7, top + 6, '#c0392b');
      break;
    }
  }
}
function disc2(x: Ctx, cx: number, cy: number, r: number, c: string): void {
  x.fillStyle = c;
  for (let j = -r; j <= r; j++) {
    const hw = Math.floor(Math.sqrt(r * r - j * j + r * 0.8));
    x.fillRect(Math.round(cx - hw), Math.round(cy + j), hw * 2 + 1, 1);
  }
}

// ---------- items ----------
const DIM: Record<Shape, [number, number]> = {
  futon: [22, 11],
  bed: [24, 13],
  mattress: [22, 8],
  table: [20, 12],
  smalltable: [16, 11],
  couch: [24, 13],
  armchair: [15, 13],
  chairs: [18, 13],
  chair: [9, 13],
  lamp: [8, 20],
  bookcase: [13, 18],
  rug: [20, 7],
  mirror: [9, 16],
  coat: [13, 17],
  puffer: [14, 14],
  blazer: [13, 15],
  shirt: [13, 12],
  pants: [9, 15],
  boots: [12, 9],
  scarf: [14, 8],
  sweater: [14, 12],
};
export const itemDim = (s: Shape): [number, number] => DIM[s];
export function itemBox(def: ItemDef, fx: number, fy: number): { x: number; y: number; w: number; h: number } {
  const [w, h] = DIM[def.shape];
  return { x: fx - w / 2 - 2, y: fy - h - 3, w: w + 4, h: h + 4 };
}

export interface ItemPose {
  moving: boolean;
  phase: number; // walk cycle
  face: -1 | 1;
  alarm: number; // > 0: just spotted you ("!")
  t: number;
  alive: boolean; // deals have eyes and legs; junk just sits there
  seed: number;
}

// Draws an item standing on (fx, fy).
export function drawItem(x: Ctx, def: ItemDef, fx: number, fy: number, pose: ItemPose): void {
  const [w, h] = DIM[def.shape];
  const f = Math.floor(pose.phase) % 4;
  const bob = pose.alive && pose.moving && (f === 1 || f === 3) ? -1 : 0;
  const L = Math.round(fx - w / 2);
  const B = Math.round(fy) + bob - (pose.alive ? 2 : 0); // living things stand on little legs
  const T = B - h;
  shadowBlob(x, fx, fy, w + 2, 3, 0.3);
  // scurrying legs
  if (pose.alive) {
    const legs = w > 16 ? 4 : 2;
    for (let i = 0; i < legs; i++) {
      const lx = L + 2 + Math.round((i * (w - 5)) / Math.max(1, legs - 1));
      const step = pose.moving ? ((f + i) % 2 ? 1 : -1) : 0;
      rect(x, lx - 1 + step, B - 1, 3, 4, INK);
      rect(x, lx + step, B, 1, 2, '#3a2a2a');
    }
  }
  const c = def.color;
  const tr = def.trim ?? shade(c, 0.6);
  const legDef = def.defects?.includes('leg');
  switch (def.shape) {
    case 'futon':
      blk(x, L, T + 3, w, h - 5, c);
      blk(x, L, T, w, 5, shade(c, 1.1));
      rect(x, L + 2, T + 7, w - 4, 1, shade(c, 0.8));
      rect(x, L, B - 2, w, 2, tr);
      rect(x, L + 1, B, 2, 1, tr);
      rect(x, L + w - 3, B, 2, 1, tr);
      break;
    case 'bed':
      blk(x, L, T, 4, h, tr);
      blk(x, L + 3, T + 5, w - 3, h - 6, '#f4f0e6');
      blk(x, L + 9, T + 4, w - 9, h - 5, c);
      rect(x, L + 9, T + 7, w - 9, 1, shade(c, 1.2));
      blk(x, L + 4, T + 5, 5, 3, '#ffffff');
      rect(x, L + 3, B - 1, w - 3, 1, tr);
      break;
    case 'mattress':
      blk(x, L, T, w, h, c);
      for (let i = L + 3; i < L + w - 2; i += 4) rect(x, i, T + 2, 1, 1, shade(c, 0.8));
      for (let i = L + 1; i < L + w - 2; i += 4) rect(x, i, T + 5, 1, 1, shade(c, 0.8));
      rect(x, L, T + h - 2, w, 1, shade(c, 0.78));
      break;
    case 'table':
    case 'smalltable': {
      const legC = def.shape === 'table' ? shade(c, 0.7) : tr;
      blk(x, L, T, w, 4, c);
      if (def.shape === 'table') for (let i = L + 2; i < L + w - 2; i += 5) rect(x, i, T + 1, 3, 1, shade(c, 1.15));
      rect(x, L + 1, T + 4, w - 2, 1, shade(c, 0.55));
      rect(x, L + 1, T + 5, 2, h - 5, legC);
      if (!legDef) rect(x, L + w - 3, T + 5, 2, h - 5, legC);
      else rect(x, L + w - 3, T + 5, 2, h - 9, legC);
      rect(x, L + 4, T + 5, 1, h - 7, shade(legC, 0.7));
      rect(x, L + w - 5, T + 5, 1, h - 7, shade(legC, 0.7));
      break;
    }
    case 'couch':
      blk(x, L + 2, T, w - 4, 6, shade(c, 0.9));
      blk(x, L + 2, T + 5, w - 4, h - 7, c);
      rect(x, L + Math.round(w / 2), T + 6, 1, h - 9, shade(c, 0.7));
      blk(x, L, T + 3, 3, h - 5, shade(c, 1.05));
      blk(x, L + w - 3, T + 3, 3, h - 5, shade(c, 0.95));
      rect(x, L + 1, B - 2, 2, 2, '#4a3020');
      rect(x, L + w - 3, B - 2, 2, 2, '#4a3020');
      break;
    case 'armchair':
      blk(x, L + 2, T, w - 4, 7, shade(c, 0.9));
      blk(x, L + 2, T + 6, w - 4, h - 8, c);
      blk(x, L, T + 4, 3, h - 6, shade(c, 1.05));
      blk(x, L + w - 3, T + 4, 3, h - 6, shade(c, 0.95));
      rect(x, L + 3, B - 2, 1, 2, '#4a3020');
      rect(x, L + w - 4, B - 2, 1, 2, '#4a3020');
      break;
    case 'chairs':
    case 'chair': {
      const n = def.shape === 'chairs' ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const cx0 = L + k * 9;
        blk(x, cx0 + 1, T, 7, 6, c);
        rect(x, cx0 + 2, T + 2, 5, 1, shade(c, 0.75));
        blk(x, cx0, T + 7, 9, 2, shade(c, 1.1));
        rect(x, cx0, T + 9, 1, h - 9, shade(c, 0.6));
        if (!(legDef && k === n - 1)) rect(x, cx0 + 8, T + 9, 1, h - 9, shade(c, 0.6));
        else rect(x, cx0 + 8, T + 9, 1, 2, shade(c, 0.6));
      }
      break;
    }
    case 'lamp': {
      const glowOn = def.kind !== 'junk';
      if (glowOn) {
        x.fillStyle = 'rgba(255,230,140,0.18)';
        x.fillRect(L - 3, T + 6, w + 6, 6);
      }
      rect(x, L + w / 2 - 1, T + 6, 1, h - 7, tr);
      rect(x, L + 1, B - 1, w - 2, 1, tr);
      x.fillStyle = INK;
      x.fillRect(L, T - 1, w, 8);
      rect(x, L + 1, T, w - 2, 6, c);
      rect(x, L + 1, T, w - 2, 1, shade(c, 1.25));
      rect(x, L + w - 2, T + 1, 1, 5, shade(c, 0.75));
      break;
    }
    case 'bookcase': {
      blk(x, L, T, w, h, c);
      for (let s = 0; s < 3; s++) {
        const sy = T + 2 + s * 5;
        rect(x, L + 1, sy, w - 2, 4, shade(c, 0.5));
        for (let k = 0; k < 4; k++) {
          const bc = CLOTH[(k * 3 + s * 5 + pose.seed) % CLOTH.length];
          rect(x, L + 2 + k * 2.5, sy + 1, 2, 3, bc);
        }
      }
      break;
    }
    case 'rug':
      blk(x, L, T + 1, w, h - 1, c);
      for (let i = L + 2; i < L + w - 3; i += 3) rect(x, i, T + 2, 1, h - 3, tr);
      blk(x, L + w - 5, T, 5, h, shade(c, 0.85));
      rect(x, L + w - 3, T + 2, 1, 2, shade(c, 0.6));
      break;
    case 'mirror':
      blk(x, L + 1, T, w - 2, h - 3, c);
      rect(x, L + 2, T + 1, w - 4, h - 5, '#a8d8f0');
      rect(x, L + 3, T + 2, 1, h - 8, '#ffffff');
      rect(x, L + 5, T + 3, 1, 3, '#e8f8ff');
      rect(x, L + 2, B - 2, w - 4, 2, shade(c, 0.7));
      break;
    case 'coat':
    case 'blazer':
    case 'shirt':
    case 'sweater':
    case 'puffer': {
      // hanger hook
      rect(x, L + w / 2, T - 2, 1, 2, '#9aa0b0');
      rect(x, L + w / 2 - 3, T, 7, 1, '#9aa0b0');
      const sl = pose.alive && pose.moving ? (f % 2 ? 1 : -1) : 0; // flapping sleeves
      const body = def.shape === 'shirt' || def.shape === 'sweater' ? h - 1 : h;
      blk(x, L + 3, T + 1, w - 6, body - 1, c);
      blk(x, L, T + 2 + Math.max(0, sl), 3, body - 5, shade(c, 1.05));
      blk(x, L + w - 3, T + 2 + Math.max(0, -sl), 3, body - 5, shade(c, 0.9));
      if (def.shape === 'puffer') for (let j = T + 4; j < T + body - 1; j += 3) rect(x, L + 3, j, w - 6, 1, shade(c, 0.75));
      if (def.shape === 'sweater') for (let i = L + 4; i < L + w - 4; i += 2) rect(x, i, T + 3, 1, body - 5, shade(c, 0.85));
      if (def.shape === 'coat' || def.shape === 'blazer') {
        rect(x, L + w / 2 - 2, T + 1, 1, 6, tr);
        rect(x, L + w / 2 + 1, T + 1, 1, 6, tr);
        rect(x, L + w / 2, T + 2, 1, body - 3, shade(c, 0.7));
        for (let j = T + 6; j < T + body - 2; j += 4) rect(x, L + w / 2 + 1, j, 1, 1, '#f2d27a');
      }
      if (def.shape === 'shirt') {
        rect(x, L + w / 2 - 1, T + 1, 3, 2, '#ffffff');
        for (let j = T + 4; j < T + body - 1; j += 3) rect(x, L + w / 2, j, 1, 1, shade(c, 0.6));
      }
      break;
    }
    case 'pants': {
      rect(x, L + w / 2, T - 2, 1, 2, '#9aa0b0');
      rect(x, L + 1, T, w - 2, 1, '#9aa0b0');
      const st = pose.alive && pose.moving ? (f % 2 ? 1 : 0) : 0;
      blk(x, L, T + 1, w, 4, c);
      blk(x, L, T + 5, 4, h - 6 - st, c);
      blk(x, L + w - 4, T + 5, 4, h - 6 - (1 - st) * (pose.alive && pose.moving ? 1 : 0), shade(c, 0.88));
      rect(x, L + 1, T + 2, w - 2, 1, shade(c, 0.7));
      break;
    }
    case 'boots':
      for (const ox of [0, 6]) {
        blk(x, L + ox, T, 4, h - 2, c);
        blk(x, L + ox, B - 3, 6, 3, shade(c, 0.8));
        rect(x, L + ox + 1, T + 2, 2, 1, '#e8d8a8');
      }
      break;
    case 'scarf':
      blk(x, L, T, w, 4, c);
      for (let i = L + 1; i < L + w; i += 3) rect(x, i, T + 1, 1, 2, def.trim ?? '#ffffff');
      blk(x, L + w - 5, T + 3, 4, h - 3, shade(c, 0.9));
      for (let i = 0; i < 4; i++) rect(x, L + w - 5 + i, B, 1, 1, c);
      break;
  }
  // defects: the tells that something is junk
  if (def.defects) for (const d of def.defects) drawDefect(x, d, L, T, w, h, pose.t, pose.seed);
  if (def.kind === 'junk') {
    // a fly buzzing around
    const a = pose.t * 7 + pose.seed;
    const fx2 = fx + Math.cos(a) * (w / 2 + 3);
    const fy2 = T - 2 + Math.sin(a * 1.7) * 3;
    rect(x, fx2, fy2, 1, 1, INK);
    if (Math.floor(pose.t * 20) % 2) rect(x, fx2 - 1, fy2 - 1, 1, 1, '#c8d8e8');
  }
  // eyes on the living deals
  if (pose.alive) {
    const ey = def.shape === 'lamp' || def.shape === 'mirror' || def.shape === 'bookcase' ? T + 7 : def.shape === 'rug' || def.shape === 'boots' || def.shape === 'scarf' ? T + 1 : T + 3;
    const ex = Math.round(fx) - 3;
    const blink = Math.floor(pose.t * 1.3 + pose.seed) % 6 === 0 && (pose.t * 1.3 + pose.seed) % 1 < 0.15;
    for (const ox of [0, 4]) {
      rect(x, ex + ox - 1, ey - 1, 4, 4, INK);
      if (blink) rect(x, ex + ox, ey + 1, 2, 1, '#ffffff');
      else {
        rect(x, ex + ox, ey, 2, 2, '#ffffff');
        rect(x, ex + ox + (pose.face > 0 ? 1 : 0), ey + (pose.alarm > 0 ? 0 : 1), 1, 1, INK);
      }
    }
    if (pose.alarm > 0) {
      // sweat drop + "!"
      outlined(x, '!', Math.round(fx) - 1, T - 10 - (Math.floor(pose.t * 10) % 2), '#ffe27a');
      rect(x, L + w, T + 1, 1, 2, '#a8d8ff');
    }
  }
}

function drawDefect(x: Ctx, d: Defect, L: number, T: number, w: number, h: number, t: number, seed: number): void {
  switch (d) {
    case 'stains':
      for (let k = 0; k < 3; k++) {
        const sx = L + 2 + hash(seed + k) * (w - 6);
        const sy = T + 2 + hash(seed * 3 + k) * (h - 6);
        rect(x, sx, sy, 3, 2, '#8a6a2a');
        rect(x, sx + 1, sy + 2, 2, 1, '#a88a3a');
      }
      break;
    case 'bugs':
      for (let k = 0; k < 4; k++) {
        const a = t * 2 + k * 1.7 + seed;
        rect(x, L + 3 + ((Math.sin(a) + 1) / 2) * (w - 6), T + 2 + ((Math.cos(a * 1.3) + 1) / 2) * (h - 5), 1, 1, '#3a0e0e');
      }
      break;
    case 'crack':
      for (let k = 0; k < 5; k++) rect(x, L + w / 2 - 2 + (k % 2), T + 1 + k * 2, 1, 2, INK);
      break;
    case 'mold':
      stipple(x, L + 1, T + 1, Math.min(8, w - 2), Math.min(6, h - 2), '#6a9a3a', 0.6);
      break;
    case 'holes': {
      for (let k = 0; k < 3; k++) rect(x, L + 3 + hash(seed + k * 7) * (w - 6), T + 3 + hash(seed + k * 11) * (h - 6), 2, 1, INK);
      // a moth
      const a = t * 4 + seed;
      const mx = L + w / 2 + Math.cos(a) * 7;
      const my = T - 3 + Math.sin(a * 2) * 2;
      rect(x, mx, my, 1, 1, '#d8d0c0');
      if (Math.floor(t * 16) % 2) {
        rect(x, mx - 1, my - 1, 1, 1, '#f4eedd');
        rect(x, mx + 1, my - 1, 1, 1, '#f4eedd');
      }
      break;
    }
    case 'stink':
      for (let k = 0; k < 2; k++) {
        const sx = L + 3 + k * (w - 7);
        for (let j = 0; j < 6; j++) rect(x, sx + Math.round(Math.sin(t * 5 + j * 0.9 + k) * 1.2), T - 3 - j - ((t * 6) % 2), 1, 1, '#9ac83a');
      }
      break;
    case 'leg':
      break;
  }
}

// Price tag hanging off a corner of an item.
export function drawPriceTag(x: Ctx, s: string, px: number, py: number, junk: boolean): void {
  const w = ptw(s) + 4;
  x.strokeStyle = '#9a9aa8';
  x.lineWidth = 0.5;
  x.beginPath();
  x.moveTo(px - 3, py + 3);
  x.quadraticCurveTo(px - 1.5, py + 1.5, px, py + 2.5);
  x.stroke();
  shadow2(x, px + w / 2 + 1, py + 8, w * 0.55, 1.4, 0.3);
  sbox(x, px - 1, py - 1, w + 2, 9, junk ? '#f4e8c8' : '#fffaf0', { r: 1.6, gloss: 0.4, lw: 0.6 });
  ball(x, px + 1.2, py + 1.4, 0.6, '#9a9aa8', 0.6, 0.5);
  stext(x, s, px + 2, py + 1, junk ? '#8a5a2a' : '#c0392b', null);
}

// ---------- people ----------
// Upper body from drawPerson, legs from a walk cycle. (x, y) is the sprite's top-left; feet at y + 30.
export function drawWalker(x: Ctx, p: Person, px: number, py: number, moving: boolean, phase: number, face: -1 | 1, stunned = false): void {
  const f = ((Math.floor(phase) % 4) + 4) % 4;
  person(x, p, px, py, 0, false, { face, walk: moving ? f : undefined, blink: stunned });
  if (stunned) {
    // little stars circling the head
    for (let k = 0; k < 3; k++) {
      const a = phase * 0.8 + (k * Math.PI * 2) / 3;
      const sx = px + 7 + Math.cos(a) * 7;
      const sy = py - 2 + Math.sin(a) * 2;
      pool(x, sx, sy, 2.5, 2.5, '#ffe27a', 0.8);
      ball(x, sx, sy, 0.7, '#fff3a0', 0.7, 0.8);
    }
  }
}
// The pricing gun in the player's hand, pointing along (dx, dy).
export function drawGun(x: Ctx, hx: number, hy: number, dx: number, dy: number, kick: number): void {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bx = hx - ux * kick + 0.5;
  const by = hy - uy * kick + 0.5;
  x.save();
  x.lineCap = 'round';
  x.lineWidth = 3.2;
  x.strokeStyle = 'rgba(28,20,36,0.9)';
  x.beginPath();
  x.moveTo(bx, by);
  x.lineTo(bx + ux * 6, by + uy * 6);
  x.stroke();
  x.lineWidth = 2.2;
  x.strokeStyle = lin(x, bx - uy, by + ux, bx + uy, by - ux, ['#a8480e', '#ff9a3e', '#e8781e']);
  x.stroke();
  x.lineWidth = 0.6;
  x.strokeStyle = 'rgba(255,240,200,0.8)';
  x.beginPath();
  x.moveTo(bx + ux * 1 - uy * 0.5, by + uy * 1 + ux * 0.5);
  x.lineTo(bx + ux * 5 - uy * 0.5, by + uy * 5 + ux * 0.5);
  x.stroke();
  x.restore();
  sbox(x, bx - 1.2, by + 0.5, 2.2, 3.2, '#3a3a4a', { r: 0.8, gloss: 0.4, lw: 0.4 });
  pool(x, bx + ux * 6.5, by + uy * 6.5, 2.5, 2.5, '#fff3c4', 0.8);
}

// The tag flying through the air: a white tag that tumbles.
export function drawTagShot(x: Ctx, sx: number, sy: number, spin: number): void {
  pool(x, sx, sy, 5, 5, '#fff8e0', 0.35);
  x.save();
  x.translate(sx, sy);
  x.rotate(spin * 2.1);
  sbox(x, -3, -2, 6, 4, '#fffaf0', { r: 1, gloss: 0.5, lw: 0.6 });
  ball(x, -1.8, 0, 0.6, '#c0392b', 0.6, 0.4);
  x.restore();
}

// Reticle: corner brackets that snap in and turn gold over a find.
export function drawReticle(x: Ctx, rx: number, ry: number, t: number, locked: boolean, cooling: number, far = false): void {
  const px = rx + 0.5;
  const py = ry + 0.5;
  const g = locked ? 4 : 6 + Math.sin(t * 8);
  const c = far ? '#9a8aa8' : locked ? '#ffe27a' : '#ffffff';
  if (locked) pool(x, px, py, 9, 9, '#ffe27a', 0.3);
  const corners = (): void => {
    x.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = px + sx * g;
      const cy = py + sy * g;
      x.moveTo(cx, cy - sy * 2.6);
      x.lineTo(cx, cy);
      x.lineTo(cx - sx * 2.6, cy);
    }
  };
  x.save();
  x.lineCap = 'round';
  x.lineJoin = 'round';
  corners();
  x.lineWidth = 2.2;
  x.strokeStyle = 'rgba(28,20,36,0.85)';
  x.stroke();
  x.lineWidth = 0.9;
  x.strokeStyle = c;
  x.stroke();
  x.restore();
  ell(x, px, py, 1.3, 1.3);
  x.fillStyle = 'rgba(28,20,36,0.85)';
  x.fill();
  ell(x, px, py, 0.65, 0.65);
  x.fillStyle = cooling > 0 ? '#ff7a5a' : c;
  x.fill();
}

// Inspect card over the thing under your reticle.
export function drawTooltip(x: Ctx, cx: number, by: number, l1: string, l2: string, l2c: string, vw: number): void {
  const w = Math.max(ptw(l1), ptw(l2)) + 8;
  const h = 17;
  const px = Math.max(2, Math.min(vw - w - 2, Math.round(cx - w / 2)));
  const py = Math.max(21, Math.round(by - h - 3));
  shadow2(x, px + w / 2 + 2, py + h + 2, w * 0.55, 3, 0.4);
  x.globalAlpha = 0.94;
  sbox(x, px - 1, py - 1, w + 2, h + 2, '#2a1e44', { r: 2.5, gloss: 0.2, lw: 0.7 });
  x.globalAlpha = 1;
  stext(x, l1, px + 4, py + 3, '#fff3c4', null);
  stext(x, l2, px + 4, py + 10, l2c, null);
}

export function drawWeightBar(x: Ctx, px: number, py: number, w: number, frac: number, warn: boolean): void {
  sbox(x, px - 1, py - 1, w + 2, 5, '#3a2e4a', { r: 2.5, gloss: 0.1, lw: 0.6 });
  const fw = w * Math.min(1, frac);
  const c = frac > 0.85 ? '#ff7a5a' : frac > 0.6 ? '#f2b632' : '#7cf08a';
  if (fw > 0.5) sbox(x, px, py, Math.max(3, fw), 3, warn ? '#ff4a3a' : c, { r: 1.5, gloss: 0.6, outline: null });
}

export { centered };
