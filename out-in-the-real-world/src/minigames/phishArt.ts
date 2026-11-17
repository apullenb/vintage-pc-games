// Phishing Invaders art: the phone-screen battlefield (wallpaper with drifting bokeh, status bar,
// inbox dock), message cards by channel, the chain-letter boss, your spam-shield turret, bolts and links.
import { bayer, cached, INK, mix, rect, shade, type Ctx } from '../art/px.ts';
import type { Channel, Msg } from './phishData.ts';
import { ptext, ptw } from './thriftPhishFx.ts';

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

// ---------- the battlefield ----------
function wallpaper(): HTMLCanvasElement {
  return cached('ph-wall', PW, PH, (g) => {
    const stops = ['#120c2a', '#1c1442', '#2a1a5a', '#3a1e6a', '#4a2270', '#5a2a6a'];
    for (let j = 0; j < PH; j++) {
      const f = (j / (PH - 1)) * (stops.length - 1);
      const k = Math.min(stops.length - 2, Math.floor(f));
      const fr = f - k;
      for (let i = 0; i < PW; i++) {
        g.fillStyle = fr > bayer(i, j) ? stops[k + 1] : stops[k];
        g.fillRect(i, j, 1, 1);
      }
    }
    // a faint hex/grid pattern like a lock-screen wallpaper
    g.fillStyle = 'rgba(160,140,255,0.06)';
    for (let j = 12; j < PH; j += 12) for (let i = (j / 12) % 2 ? 6 : 0; i < PW; i += 12) g.fillRect(i, j, 1, 1);
  });
}

const BOKEH = Array.from({ length: 34 }, (_, i) => ({ x: (i * 53) % PW, y: (i * 97) % PH, z: (i % 3) + 1, c: ['#7a5ad8', '#d85aa8', '#5a8ad8', '#e8a85a'][i % 4] }));

export function drawField(x: Ctx, t: number, rm: boolean, tilt: number): void {
  x.drawImage(wallpaper(), 0, 0);
  // drifting bokeh at three depths (parallax with the ship's movement too)
  for (const b of BOKEH) {
    const sp = b.z * 4;
    const yy = (b.y + (rm ? 0 : t * sp)) % (PH + 10);
    const xx = (b.x - tilt * b.z * 3 + PW) % PW;
    x.globalAlpha = 0.12 + b.z * 0.06;
    if (b.z === 3) {
      rect(x, xx - 1, yy, 3, 1, b.c);
      rect(x, xx, yy - 1, 1, 3, b.c);
    } else rect(x, xx, yy, b.z, b.z, b.c);
  }
  x.globalAlpha = 1;
}

export function drawStatusBar(x: Ctx, clock: string, unread: number, battery: number): void {
  rect(x, 0, 0, PW, 9, '#08060f');
  ptext(x, clock, 4, 2, '#ffffff');
  // unread badge
  const u = `${unread} UNREAD`;
  const uw = ptw(u) + 6;
  rect(x, PW / 2 - uw / 2, 1, uw, 7, '#c0392b');
  ptext(x, u, PW / 2 - uw / 2 + 3, 2, '#ffffff');
  // signal bars
  for (let i = 0; i < 4; i++) rect(x, PW - 34 + i * 2, 6 - i, 1, i + 1, '#ffffff');
  // battery
  rect(x, PW - 22, 2, 15, 5, '#ffffff');
  rect(x, PW - 7, 3, 1, 3, '#ffffff');
  rect(x, PW - 21, 3, 13, 3, '#08060f');
  const bw = Math.max(1, Math.round(13 * battery));
  rect(x, PW - 21, 3, bw, 3, battery > 0.5 ? '#7cf08a' : battery > 0.25 ? '#f2b632' : '#ff5a4a');
}

// The inbox dock: saved real messages pile up as little app chips.
export function drawDock(x: Ctx, saved: Channel[], alarm: number, t: number): void {
  const y = DOCK_Y + 4;
  rect(x, 0, y, PW, PH - y, 'rgba(10,6,24,0.75)');
  rect(x, 0, y, PW, 1, alarm > 0 && Math.floor(t * 16) % 2 ? '#ff4a3a' : '#7a6ad8');
  rect(x, 0, y + 1, PW, 1, 'rgba(122,106,216,0.35)');
  ptext(x, 'INBOX', 4, y + 6, '#c8c0e8');
  saved.forEach((ch, i) => {
    const cx = 28 + i * 9;
    if (cx > PW - 10) return;
    rect(x, cx - 1, y + 4, 9, 9, INK);
    rect(x, cx, y + 5, 7, 7, CH[ch].c);
    rect(x, cx, y + 5, 7, 1, mix(CH[ch].c, '#ffffff', 0.4));
    rect(x, cx + 2, y + 7, 3, 3, '#ffffff');
  });
  // home bar
  rect(x, PW / 2 - 18, PH - 4, 36, 2, '#c8c0e8');
}

// Your spam-shield turret. lean: -1..1 while moving; flash: just fired.
export function drawShip(x: Ctx, sx: number, t: number, lean: number, flash: number, stun: number, rm: boolean): void {
  const cx = Math.round(sx);
  const y = SHIP_Y;
  const blink = stun > 0 && Math.floor(t * 20) % 2 === 0;
  // soft glow on the dock under the turret
  x.fillStyle = 'rgba(47,181,176,0.16)';
  x.fillRect(cx - 12, y + 9, 25, 3);
  x.fillRect(cx - 8, y + 12, 17, 2);
  // thruster glow
  if (!blink) {
    const fl = rm ? 1 : 1 + (Math.floor(t * 30) % 2);
    rect(x, cx - 2, y + 11, 5, fl + 1, '#ff9a3a');
    rect(x, cx - 1, y + 11, 3, fl + 2, '#ffe27a');
  }
  const L = Math.round(lean);
  const body = stun > 0 ? '#8a8a9a' : '#2fb5b0';
  // outline then fill: a shield shape with a cannon on top
  const rows: [number, number][] = [
    [-7, 15],
    [-7, 15],
    [-7, 15],
    [-7, 15],
    [-6, 13],
    [-5, 11],
    [-4, 9],
    [-2, 5],
  ];
  rows.forEach(([ox, w], j) => rect(x, cx + ox - 1 + (j < 3 ? L : 0), y + 2 + j, w + 2, 1, INK));
  rect(x, cx - 6 + L, y + 1, 13, 1, INK);
  rect(x, cx - 2 + L, y + 10, 5, 1, INK);
  rows.forEach(([ox, w], j) => {
    rect(x, cx + ox + (j < 3 ? L : 0), y + 2 + j, w, 1, j === 0 ? mix(body, '#ffffff', 0.5) : body);
    rect(x, cx + ox + (j < 3 ? L : 0), y + 2 + j, 1, 1, mix(body, '#ffffff', 0.3));
    rect(x, cx + ox + w - 1 + (j < 3 ? L : 0), y + 2 + j, 1, 1, shade(body, 0.65));
  });
  // lock emblem
  rect(x, cx - 2 + L, y + 3, 5, 4, '#fff3c4');
  rect(x, cx - 1 + L, y + 2, 3, 1, '#fff3c4');
  rect(x, cx + L, y + 4, 1, 2, INK);
  // cannon
  const cy = y - 4 + (flash > 0 ? 1 : 0);
  rect(x, cx - 2 + L, cy - 1, 5, 6, INK);
  rect(x, cx - 1 + L, cy, 3, 4, '#e8e8f0');
  rect(x, cx - 1 + L, cy, 1, 4, '#ffffff');
  if (flash > 0) {
    rect(x, cx - 2 + L, cy - 4, 5, 3, '#fff3c4');
    rect(x, cx - 1 + L, cy - 6, 3, 2, '#ffffff');
  }
}

// Glass glare across the phone screen: two faint diagonal bands.
export function drawGlare(x: Ctx): void {
  const g = cached('ph-glare', PW, PH, (c) => {
    for (let j = 0; j < PH; j++) {
      const a = Math.round(PW * 0.55 - j * 0.6);
      c.fillStyle = 'rgba(255,255,255,0.045)';
      c.fillRect(a, j, 26, 1);
      c.fillStyle = 'rgba(255,255,255,0.03)';
      c.fillRect(a + 34, j, 8, 1);
    }
  });
  x.drawImage(g, 0, 0);
}

export function drawBolt(x: Ctx, bx: number, by: number): void {
  rect(x, bx - 1, by - 1, 4, 8, 'rgba(255,240,160,0.35)');
  rect(x, bx, by, 2, 6, '#ffe27a');
  rect(x, bx, by, 2, 2, '#ffffff');
}

// A falling phishing link: a little chain.
export function drawLink(x: Ctx, lx: number, ly: number, t: number): void {
  const px = Math.round(lx);
  const py = Math.round(ly);
  const glow = Math.floor(t * 10) % 2;
  if (glow) rect(x, px - 5, py - 3, 11, 7, 'rgba(255,74,58,0.25)');
  for (const [ox, c] of [[-4, '#ff7a5a'], [0, '#ffd0c0']] as [number, string][]) {
    rect(x, px + ox - 1, py - 2, 7, 5, INK);
    rect(x, px + ox, py - 1, 5, 3, c);
    rect(x, px + ox + 1, py, 3, 1, INK);
  }
}
