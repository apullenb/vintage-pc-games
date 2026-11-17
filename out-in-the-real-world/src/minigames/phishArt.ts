// Phishing Invaders art: the phone-screen battlefield (wallpaper with drifting bokeh, status bar,
// inbox dock), message cards by channel, the chain-letter boss, your spam-shield turret, bolts and links.
import { cached, INK, mix, rect, shade, type Ctx } from '../art/px.ts';
import type { Channel, Msg } from './phishData.ts';
import { ptext, ptw, stext } from './thriftPhishFx.ts';
import { ball, blit, cyl, glare, layer, lin, pool, rad, rgba, rr, sbox, shadow, tint, vfill } from './hd2Kit.tsx';

export const PW = 180;
export const PH = 240;
export const DOCK_Y = 216; // cards that reach this line "land" in your inbox
export const SHIP_Y = 204;
export const CARD_W = 72;
export const CARD_H = 24;
export const MINI_W = 60;
export const MINI_H = 13;

const CH: Record<Channel, { c: string; label: string }> = {
  sms: { c: '#2f9a5a', label: 'TEXT' },
  email: { c: '#3f6fd0', label: 'EMAIL' },
  dm: { c: '#9a4ac0', label: 'DM' },
  app: { c: '#2a8a9a', label: 'APP' },
};

function roundBox(g: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  rect(g, x + 1, y, w - 2, h, c);
  rect(g, x, y + 1, w, h - 2, c);
}

function icon(g: Ctx, ch: Channel, x: number, y: number): void {
  const W = '#ffffff';
  if (ch === 'sms') {
    rect(g, x, y, 6, 4, W);
    rect(g, x + 1, y + 4, 1, 1, W);
    rect(g, x + 1, y + 1, 1, 1, CH.sms.c);
    rect(g, x + 3, y + 1, 1, 1, CH.sms.c);
  } else if (ch === 'email') {
    rect(g, x, y, 6, 5, W);
    rect(g, x + 1, y + 1, 1, 1, CH.email.c);
    rect(g, x + 4, y + 1, 1, 1, CH.email.c);
    rect(g, x + 2, y + 2, 2, 1, CH.email.c);
  } else if (ch === 'dm') {
    rect(g, x, y + 1, 2, 2, W);
    rect(g, x + 3, y + 1, 2, 2, W);
    rect(g, x + 1, y + 2, 3, 2, W);
    rect(g, x + 2, y + 4, 1, 1, W);
  } else {
    // a little bank / building
    rect(g, x, y, 6, 1, W);
    rect(g, x, y + 1, 1, 3, W);
    rect(g, x + 2, y + 1, 1, 3, W);
    rect(g, x + 4, y + 1, 1, 3, W);
    rect(g, x, y + 4, 6, 1, W);
  }
}

// A message card. hl = the red-flag line to highlight (-1: none). tone = 'norm' | 'red' | 'green'.
export function cardSprite(m: Msg, hl = -1, tone: 'norm' | 'red' | 'green' = 'norm'): HTMLCanvasElement {
  return cached(`ph-card|${m.from}|${m.l1}|${hl}|${tone}`, CARD_W + 2, CARD_H + 2, (g) => {
    const head = tone === 'red' ? '#c0392b' : tone === 'green' ? '#2f9a5a' : CH[m.ch].c;
    const body = tone === 'red' ? '#ffe0d8' : tone === 'green' ? '#e0f8e4' : '#fbf6ea';
    // drop shadow + outline
    roundBox(g, 1, 1, CARD_W + 1, CARD_H + 1, 'rgba(8,4,20,0.5)');
    roundBox(g, 0, 0, CARD_W, CARD_H, INK);
    roundBox(g, 1, 1, CARD_W - 2, CARD_H - 2, body);
    rect(g, 1, 1, CARD_W - 2, 8, head);
    rect(g, 2, 1, CARD_W - 4, 1, mix(head, '#ffffff', 0.35));
    rect(g, 1, 8, CARD_W - 2, 1, shade(head, 0.7));
    icon(g, m.ch, 3, 2);
    ptext(g, m.from, 11, 2, '#ffffff');
    rect(g, 2, CARD_H - 2, CARD_W - 4, 1, shade(body, 0.88));
    const ink = '#2a2238';
    ptext(g, m.l1, 3, 10, hl === 1 ? '#c0392b' : ink);
    ptext(g, m.l2, 3, 16, hl === 2 ? '#c0392b' : ink);
    if (hl >= 0) {
      const y = hl === 0 ? 7 : hl === 1 ? 15 : 21;
      const w = ptw(hl === 0 ? m.from : hl === 1 ? m.l1 : m.l2);
      const x0 = hl === 0 ? 11 : 3;
      for (let i = 0; i < w; i += 2) rect(g, x0 + i, y, 1, 1, hl === 0 ? '#ffe27a' : '#c0392b');
    }
  });
}

export function miniSprite(s: string, hit = false): HTMLCanvasElement {
  return cached(`ph-mini|${s}|${hit}`, MINI_W + 2, MINI_H + 2, (g) => {
    roundBox(g, 1, 1, MINI_W + 1, MINI_H + 1, 'rgba(8,4,20,0.5)');
    roundBox(g, 0, 0, MINI_W, MINI_H, INK);
    roundBox(g, 1, 1, MINI_W - 2, MINI_H - 2, hit ? '#ffffff' : '#f2b632');
    rect(g, 2, 1, MINI_W - 4, 1, '#fff3c4');
    rect(g, 1, MINI_H - 3, MINI_W - 2, 1, '#c88a1a');
    // little star
    rect(g, 3, 5, 3, 1, '#c0392b');
    rect(g, 4, 4, 1, 3, '#c0392b');
    ptext(g, s, 8, 4, '#5a1a10');
  });
}

export const BOSS_W = 140;
export const BOSS_H = 44;
export function bossSprite(frame: number, dmg: number): HTMLCanvasElement {
  const f = frame % 2;
  const crack = Math.min(4, Math.floor(dmg * 5));
  return cached(`ph-boss|${f}|${crack}`, BOSS_W + 2, BOSS_H + 2, (g) => {
    const edge = f ? '#ff4a3a' : '#ffe27a';
    roundBox(g, 1, 2, BOSS_W + 1, BOSS_H, 'rgba(8,4,20,0.55)');
    roundBox(g, 0, 0, BOSS_W, BOSS_H, INK);
    roundBox(g, 1, 1, BOSS_W - 2, BOSS_H - 2, edge);
    roundBox(g, 3, 3, BOSS_W - 6, BOSS_H - 6, '#fff8e8');
    rect(g, 3, 3, BOSS_W - 6, 10, '#f2b632');
    rect(g, 3, 3, BOSS_W - 6, 1, '#fff3c4');
    rect(g, 3, 12, BOSS_W - 6, 1, '#b07a1a');
    // flashing dollar "eyes"
    for (const ex of [8, BOSS_W - 15]) {
      rect(g, ex - 1, 4, 9, 8, INK);
      rect(g, ex, 5, 7, 6, f ? '#ffffff' : '#c0392b');
      ptext(g, '$', ex + 2, 5, f ? '#c0392b' : '#ffffff');
    }
    const head = 'PRIZE NOTIFICATION';
    ptext(g, head, Math.round(BOSS_W / 2 - ptw(head) / 2), 6, '#5a1a10');
    const lines = ['CONGRATULATIONS!!!', "YOU'VE BEEN CHOSEN", 'FWD:FWD:FWD:FWD:'];
    lines.forEach((l, i) => ptext(g, l, Math.round(BOSS_W / 2 - ptw(l) / 2), 16 + i * 7, i === 2 ? '#c0392b' : '#2a2238'));
    // sparkles in the corners
    for (const [sx, sy] of [[5, 16], [BOSS_W - 8, 16], [5, BOSS_H - 9], [BOSS_W - 8, BOSS_H - 9]]) {
      rect(g, sx + 1, sy, 1, 3, f ? '#f2b632' : '#ff7a5a');
      rect(g, sx, sy + 1, 3, 1, f ? '#f2b632' : '#ff7a5a');
    }
    // cracks as it takes damage
    const cracks = [
      [30, 13, 1],
      [100, 13, -1],
      [62, 13, 1],
      [118, 20, -1],
    ];
    for (let k = 0; k < crack; k++) {
      const [cx, cy, d] = cracks[k];
      let x = cx;
      for (let y = cy; y < BOSS_H - 4; y += 2) {
        rect(g, x, y, 1, 2, INK);
        x += ((y >> 1) % 2 ? 1 : -1) * d;
      }
    }
  });
}

// ---------- HD sprites (drawn at HD scale, same logical footprint as the pixel sprites) ----------
function hdIcon(g: Ctx, ch: Channel, x: number, y: number): void {
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  if (ch === 'sms') {
    rr(g, x, y, 6, 4.2, 1.4);
    g.fill();
    g.beginPath();
    g.moveTo(x + 1, y + 3.5);
    g.lineTo(x + 1, y + 5.4);
    g.lineTo(x + 2.8, y + 3.6);
    g.fill();
  } else if (ch === 'email') {
    rr(g, x, y + 0.3, 6, 4.4, 0.8);
    g.fill();
    g.lineWidth = 0.6;
    g.strokeStyle = CH.email.c;
    g.beginPath();
    g.moveTo(x + 0.6, y + 0.9);
    g.lineTo(x + 3, y + 2.9);
    g.lineTo(x + 5.4, y + 0.9);
    g.stroke();
  } else if (ch === 'dm') {
    g.beginPath();
    g.moveTo(x + 2.5, y + 5);
    g.bezierCurveTo(x - 1.2, y + 2.6, x + 0.6, y - 0.4, x + 2.5, y + 1.6);
    g.bezierCurveTo(x + 4.4, y - 0.4, x + 6.2, y + 2.6, x + 2.5, y + 5);
    g.fill();
  } else {
    g.beginPath();
    g.moveTo(x - 0.2, y + 1.4);
    g.lineTo(x + 3, y - 0.4);
    g.lineTo(x + 6.2, y + 1.4);
    g.closePath();
    g.fill();
    for (const cx of [0.4, 2.5, 4.6]) g.fillRect(x + cx, y + 1.6, 1, 2.6);
    g.fillRect(x - 0.2, y + 4.2, 6.4, 0.9);
  }
}

export function hdCardSprite(m: Msg, hl = -1, tone: 'norm' | 'red' | 'green' = 'norm'): HTMLCanvasElement {
  return layer(`ph-card-hd|${m.from}|${m.l1}|${hl}|${tone}`, CARD_W + 2, CARD_H + 2, (g) => {
    const head = tone === 'red' ? '#c0392b' : tone === 'green' ? '#2f9a5a' : CH[m.ch].c;
    const body = tone === 'red' ? '#ffe0d8' : tone === 'green' ? '#e0f8e4' : '#fbf6ea';
    // soft drop shadow, then the card
    shadow(g, CARD_W / 2 + 1.5, CARD_H / 2 + 1.5, CARD_W / 2 + 0.5, CARD_H / 2 + 0.5, 0.45, '#08041a');
    rr(g, 0.3, 0.3, CARD_W - 0.6, CARD_H - 0.6, 3);
    g.fillStyle = lin(g, 0, 0, 0, CARD_H, [tint(body, 1.04), body, tint(body, 0.9)]);
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = lin(g, 0, 0, 0, 8.6, [tint(head, 1.35), head, tint(head, 0.75)]);
    g.fillRect(0, 0, CARD_W, 8.6);
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.fillRect(0, 0, CARD_W, 3.2);
    g.restore();
    rr(g, 0.3, 0.3, CARD_W - 0.6, CARD_H - 0.6, 3);
    g.lineWidth = 0.7;
    g.strokeStyle = 'rgba(28,20,36,0.9)';
    g.stroke();
    hdIcon(g, m.ch, 3, 1.8);
    stext(g, m.from, 11, 2, '#ffffff', null);
    const ink = '#2a2238';
    stext(g, m.l1, 3, 10, hl === 1 ? '#c0392b' : ink, null);
    stext(g, m.l2, 3, 16, hl === 2 ? '#c0392b' : ink, null);
    if (hl >= 0) {
      const y = hl === 0 ? 7.6 : hl === 1 ? 15.6 : 21.6;
      const w = ptw(hl === 0 ? m.from : hl === 1 ? m.l1 : m.l2);
      const x0 = hl === 0 ? 11 : 3;
      g.save();
      g.lineCap = 'round';
      g.setLineDash([0.1, 1.6]);
      g.lineWidth = 0.9;
      g.strokeStyle = hl === 0 ? '#ffe27a' : '#c0392b';
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x0 + w, y);
      g.stroke();
      g.restore();
    }
    glare(g, 0.5, 0.5, CARD_W - 1, CARD_H - 1, 0.12);
  });
}

export function hdMiniSprite(s: string, hit = false): HTMLCanvasElement {
  return layer(`ph-mini-hd|${s}|${hit}`, MINI_W + 2, MINI_H + 2, (g) => {
    shadow(g, MINI_W / 2 + 1.5, MINI_H / 2 + 1.5, MINI_W / 2, MINI_H / 2, 0.45, '#08041a');
    sbox(g, 0.3, 0.3, MINI_W - 0.6, MINI_H - 0.6, hit ? '#ffffff' : '#f2b632', { r: 4, gloss: 0.5, lw: 0.7 });
    g.fillStyle = '#c0392b';
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const r = k % 2 ? 1 : 2.2;
      g.lineTo(4.5 + Math.cos(a) * r, 5.6 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    stext(g, s, 8, 4, '#5a1a10', null);
  });
}

export function hdBossSprite(frame: number, dmg: number): HTMLCanvasElement {
  const f = frame % 2;
  const crack = Math.min(4, Math.floor(dmg * 5));
  return layer(`ph-boss-hd|${f}|${crack}`, BOSS_W + 2, BOSS_H + 2, (g) => {
    const edge = f ? '#ff4a3a' : '#ffe27a';
    shadow(g, BOSS_W / 2 + 1, BOSS_H / 2 + 2.5, BOSS_W / 2 + 1, BOSS_H / 2, 0.5, '#08041a');
    sbox(g, 0.3, 0.3, BOSS_W - 0.6, BOSS_H - 0.6, edge, { r: 4, gloss: 0.5, lw: 0.8 });
    rr(g, 3, 3, BOSS_W - 6, BOSS_H - 6, 2.5);
    g.fillStyle = lin(g, 0, 3, 0, BOSS_H - 3, ['#fffdf4', '#fff8e8', '#f0e4c8']);
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = lin(g, 0, 3, 0, 13, ['#ffd870', '#f2b632', '#c8901a']);
    g.fillRect(3, 3, BOSS_W - 6, 10);
    g.restore();
    for (const ex of [8, BOSS_W - 15]) {
      sbox(g, ex - 1, 4, 9, 8, f ? '#ffffff' : '#c0392b', { r: 2, gloss: 0.5, lw: 0.6 });
      stext(g, '$', ex + 2, 5, f ? '#c0392b' : '#ffffff', null);
    }
    const head = 'PRIZE NOTIFICATION';
    stext(g, head, BOSS_W / 2, 6, '#5a1a10', null, 'center');
    const lines = ['CONGRATULATIONS!!!', "YOU'VE BEEN CHOSEN", 'FWD:FWD:FWD:FWD:'];
    lines.forEach((l, i) => stext(g, l, BOSS_W / 2, 16 + i * 7, i === 2 ? '#c0392b' : '#2a2238', null, 'center'));
    for (const [sx, sy] of [[6, 17], [BOSS_W - 7, 17], [6, BOSS_H - 8], [BOSS_W - 7, BOSS_H - 8]]) {
      pool(g, sx, sy, 3, 3, f ? '#f2b632' : '#ff7a5a', 0.7);
      g.fillStyle = f ? '#f2b632' : '#ff7a5a';
      g.beginPath();
      g.moveTo(sx, sy - 2);
      g.quadraticCurveTo(sx, sy, sx + 2, sy);
      g.quadraticCurveTo(sx, sy, sx, sy + 2);
      g.quadraticCurveTo(sx, sy, sx - 2, sy);
      g.quadraticCurveTo(sx, sy, sx, sy - 2);
      g.fill();
    }
    const cracks = [
      [30, 13, 1],
      [100, 13, -1],
      [62, 13, 1],
      [118, 20, -1],
    ];
    g.lineWidth = 0.7;
    g.lineJoin = 'round';
    g.strokeStyle = '#1c1424';
    for (let k = 0; k < crack; k++) {
      const [cx, cy, d] = cracks[k];
      let x = cx;
      g.beginPath();
      g.moveTo(x, cy);
      for (let y = cy; y < BOSS_H - 4; y += 2) {
        x += ((y >> 1) % 2 ? 1 : -1) * d;
        g.lineTo(x, y + 2);
      }
      g.stroke();
    }
    glare(g, 1, 1, BOSS_W - 2, BOSS_H - 2, 0.12);
  });
}

// ---------- the battlefield ----------
function wallpaper(): HTMLCanvasElement {
  return layer('ph-wall-hd', PW, PH, (g) => {
    vfill(g, 0, 0, PW, PH, ['#0e0a24', '#1c1442', '#2a1a5a', '#3a1e6a', '#4a2270', '#5a2a6a']);
    // soft nebula glows, like a lock-screen wallpaper
    for (const [cx, cy, r, c] of [[40, 70, 70, '#6a4ad8'], [150, 150, 80, '#c84a98'], [70, 220, 60, '#4a6ad8']] as const) {
      g.fillStyle = rad(g, cx, cy, 0, r, [rgba(c, 0.22), rgba(c, 0.06), rgba(c, 0)]);
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    // a faint hex/grid pattern
    g.fillStyle = 'rgba(170,150,255,0.10)';
    for (let j = 12; j < PH; j += 12)
      for (let i = (j / 12) % 2 ? 6 : 0; i < PW; i += 12) {
        g.beginPath();
        g.arc(i + 0.5, j + 0.5, 0.45, 0, Math.PI * 2);
        g.fill();
      }
  });
}

const BOKEH = Array.from({ length: 34 }, (_, i) => ({ x: (i * 53) % PW, y: (i * 97) % PH, z: (i % 3) + 1, c: ['#7a5ad8', '#d85aa8', '#5a8ad8', '#e8a85a'][i % 4] }));

export function drawField(x: Ctx, t: number, rm: boolean, tilt: number): void {
  blit(x, wallpaper(), 0, 0, PW, PH);
  // drifting bokeh at three depths (parallax with the ship's movement too): real soft discs
  x.save();
  x.globalCompositeOperation = 'lighter';
  for (const b of BOKEH) {
    const sp = b.z * 4;
    const yy = (b.y + (rm ? 0 : t * sp)) % (PH + 10);
    const xx = (b.x - tilt * b.z * 3 + PW) % PW;
    const r = b.z === 3 ? 4.5 : b.z === 2 ? 2.6 : 1.4;
    const a = 0.1 + b.z * 0.06;
    x.fillStyle = rad(x, xx, yy, 0, r, [rgba(b.c, a), rgba(b.c, a * 0.7), rgba(b.c, 0)]);
    x.fillRect(xx - r, yy - r, r * 2, r * 2);
  }
  x.restore();
}

export function drawStatusBar(x: Ctx, clock: string, unread: number, battery: number): void {
  vfill(x, 0, 0, PW, 9, ['#000000', '#0c0818']);
  stext(x, clock, 4, 2, '#ffffff', null);
  // unread badge
  const u = `${unread} UNREAD`;
  const uw = ptw(u) + 6;
  pool(x, PW / 2, 4.5, uw * 0.7, 6, '#ff4a3a', 0.3);
  sbox(x, PW / 2 - uw / 2, 1, uw, 7, '#d0402b', { r: 3.5, gloss: 0.5, outline: null });
  stext(x, u, PW / 2 - uw / 2 + 3, 2, '#ffffff', null);
  // signal bars
  x.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) {
    rr(x, PW - 34 + i * 2, 6 - i, 1.2, i + 1, 0.4);
    x.fill();
  }
  // battery
  rr(x, PW - 22, 2, 15, 5, 1.2);
  x.lineWidth = 0.7;
  x.strokeStyle = '#ffffff';
  x.stroke();
  x.fillStyle = '#ffffff';
  x.fillRect(PW - 7, 3.4, 0.9, 2.2);
  const bw = Math.max(1, 12.6 * battery);
  sbox(x, PW - 21.2, 2.8, bw, 3.4, battery > 0.5 ? '#7cf08a' : battery > 0.25 ? '#f2b632' : '#ff5a4a', { r: 0.8, gloss: 0.5, outline: null });
}

// The inbox dock: saved real messages pile up as little app chips, on frosted glass.
export function drawDock(x: Ctx, saved: Channel[], alarm: number, t: number): void {
  const y = DOCK_Y + 4;
  vfill(x, 0, y, PW, PH - y, ['rgba(40,30,80,0.7)', 'rgba(10,6,24,0.88)']);
  const al = alarm > 0 && Math.floor(t * 16) % 2;
  const edge = al ? '#ff4a3a' : '#9a8af0';
  pool(x, PW / 2, y, PW * 0.6, 4, edge, al ? 0.6 : 0.3);
  x.fillStyle = lin(x, 0, 0, PW, 0, [rgba(edge, 0), rgba(edge, 1), rgba(edge, 0)]);
  x.fillRect(0, y, PW, 0.8);
  stext(x, 'INBOX', 4, y + 6, '#c8c0e8', null);
  saved.forEach((ch, i) => {
    const cx = 28 + i * 9;
    if (cx > PW - 10) return;
    sbox(x, cx - 1, y + 4, 9, 9, CH[ch].c, { r: 2.4, gloss: 0.5, lw: 0.6 });
    x.save();
    hdIcon(x, ch, cx + 0.5, y + 6);
    x.restore();
  });
  // home bar
  sbox(x, PW / 2 - 18, PH - 4, 36, 2, '#d8d0f0', { r: 1, gloss: 0.4, outline: null });
}

// Your spam-shield turret: a glossy shield with a lock emblem and a little cannon.
export function drawShip(x: Ctx, sx: number, t: number, lean: number, flash: number, stun: number, rm: boolean): void {
  const cx = sx + 0.5;
  const y = SHIP_Y;
  const blink = stun > 0 && Math.floor(t * 20) % 2 === 0;
  // soft glow on the dock under the turret
  pool(x, cx, y + 12, 16, 4, '#2fb5b0', 0.45);
  // thruster flame
  if (!blink) {
    const fl = rm ? 1 : 1 + Math.sin(t * 60) * 0.5 + 0.5;
    pool(x, cx, y + 13, 5, 5 + fl * 2, '#ff9a3a', 0.7);
    x.beginPath();
    x.moveTo(cx - 2.2, y + 10.5);
    x.quadraticCurveTo(cx, y + 15 + fl * 2, cx + 2.2, y + 10.5);
    x.closePath();
    x.fillStyle = lin(x, 0, y + 10, 0, y + 15 + fl * 2, ['#ffffff', '#ffe27a', '#ff7a2a']);
    x.fill();
  }
  const L = lean;
  const body = stun > 0 ? '#8a8a9a' : '#2fb5b0';
  // shield body
  x.beginPath();
  x.moveTo(cx - 7.5 + L, y + 1.5);
  x.lineTo(cx + 7.5 + L, y + 1.5);
  x.quadraticCurveTo(cx + 8 + L * 0.5, y + 6, cx + 3.5, y + 9);
  x.lineTo(cx, y + 10.6);
  x.lineTo(cx - 3.5, y + 9);
  x.quadraticCurveTo(cx - 8 + L * 0.5, y + 6, cx - 7.5 + L, y + 1.5);
  x.closePath();
  x.fillStyle = lin(x, cx - 8, y, cx + 8, y + 10, [tint(body, 1.5), tint(body, 1.1), body, tint(body, 0.5)]);
  x.fill();
  x.lineWidth = 0.8;
  x.strokeStyle = 'rgba(20,12,30,0.95)';
  x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.35)';
  x.fillRect(cx - 6 + L, y + 2, 12, 0.8);
  // lock emblem
  x.lineWidth = 0.8;
  x.strokeStyle = '#fff3c4';
  x.beginPath();
  x.arc(cx + L, y + 3.6, 1.4, Math.PI, 0);
  x.stroke();
  sbox(x, cx - 2.2 + L, y + 3.6, 4.4, 3.4, '#fff3c4', { r: 0.7, gloss: 0.4, outline: null });
  x.fillStyle = '#1c1424';
  x.fillRect(cx - 0.3 + L, y + 4.4, 0.6, 1.6);
  // cannon
  const cy = y - 4 + (flash > 0 ? 1 : 0);
  cyl(x, cx - 1.6 + L, cy, 3.2, 5, '#e8e8f0', { spec: 0.8 });
  x.lineWidth = 0.5;
  x.strokeStyle = 'rgba(20,12,30,0.9)';
  x.strokeRect(cx - 1.6 + L, cy, 3.2, 5);
  if (flash > 0) {
    pool(x, cx + L, cy - 3, 6, 6, '#fff3c4', 0.9);
    ball(x, cx + L, cy - 2.5, 1.6, '#ffffff', 2.2, 0);
  }
}

// Glass over the phone screen: a soft screen glow at the edges and two diagonal reflections.
export function drawGlare(x: Ctx): void {
  const g = layer('ph-glare-hd', PW, PH, (c) => {
    c.save();
    c.beginPath();
    c.moveTo(PW * 0.55, 0);
    c.lineTo(PW * 0.55 + 26, 0);
    c.lineTo(PW * 0.55 + 26 - PH * 0.6, PH);
    c.lineTo(PW * 0.55 - PH * 0.6, PH);
    c.closePath();
    c.fillStyle = lin(c, PW * 0.55 - PH * 0.3, 0, PW * 0.55 - PH * 0.3 + 26, 0, ['rgba(255,255,255,0)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']);
    c.fill();
    c.beginPath();
    c.moveTo(PW * 0.55 + 34, 0);
    c.lineTo(PW * 0.55 + 42, 0);
    c.lineTo(PW * 0.55 + 42 - PH * 0.6, PH);
    c.lineTo(PW * 0.55 + 34 - PH * 0.6, PH);
    c.closePath();
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.fill();
    c.restore();
    // curved-glass edge sheen + inner vignette
    c.fillStyle = lin(c, 0, 0, 0, 30, ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']);
    c.fillRect(0, 0, PW, 30);
    c.save();
    c.translate(PW / 2, PH / 2);
    c.scale(1, PH / PW);
    c.fillStyle = rad(c, 0, 0, PW * 0.35, PW * 0.75, ['rgba(0,0,0,0)', 'rgba(6,2,16,0.18)', 'rgba(6,2,16,0.5)']);
    c.fillRect(-PW, -PW, PW * 2, PW * 2);
    c.restore();
  });
  blit(x, g, 0, 0, PW, PH);
}

export function drawBolt(x: Ctx, bx: number, by: number): void {
  pool(x, bx + 1, by + 3, 4, 7, '#fff0a0', 0.7);
  rr(x, bx, by, 2, 6, 1);
  x.fillStyle = lin(x, 0, by, 0, by + 6, ['#ffffff', '#ffe27a', '#ffb02a']);
  x.fill();
}

// A falling phishing link: a little glowing chain.
export function drawLink(x: Ctx, lx: number, ly: number, t: number): void {
  const px = lx;
  const py = ly;
  pool(x, px, py, 9, 6, '#ff4a3a', 0.25 + 0.15 * Math.sin(t * 20));
  x.save();
  x.lineWidth = 2.2;
  for (const [ox, c] of [[-2.5, '#ff7a5a'], [1.5, '#ffd0c0']] as [number, string][]) {
    rr(x, px + ox - 2.4, py - 1.6, 4.8, 3.2, 1.6);
    x.strokeStyle = 'rgba(28,20,36,0.9)';
    x.lineWidth = 2.2;
    x.stroke();
    x.strokeStyle = c;
    x.lineWidth = 1.1;
    x.stroke();
  }
  x.restore();
}
