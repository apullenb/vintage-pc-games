// The title screen: the town at golden hour from the hill above it, with parallax
// layers drifting at different speeds, the player and Rae on the overlook.
import type { Look } from '../engine/types.ts';
import { CAST, drawPerson, playerPerson } from './people.ts';
import { bayer, cached, disc, glow, grad, H, hash, mix, rect, shade, stipple, W, type Ctx } from './px.ts';

const LW = W * 2; // wide layers wrap for scrolling

function sky(x: Ctx): void {
  grad(x, 0, 0, W, 70, ['#2a1f58', '#5a3478', '#a8487a', '#e8745a', '#f8b060', '#ffe08a']);
  // the low sun with stepped halos
  glow(x, 132, 58, 46, 30, '#ffd27a', 0.9);
  glow(x, 132, 58, 26, 18, '#fff0b0', 0.9);
  disc(x, 132, 58, 9, '#fff4c8');
  disc(x, 131, 57, 6, '#fffbe8');
  // a few early stars at the top
  for (let i = 0; i < 18; i++) {
    const sx = Math.floor(hash(i * 7 + 3) * W);
    const sy = Math.floor(hash(i * 13 + 1) * 16);
    rect(x, sx, sy, 1, 1, i % 3 ? 'rgba(255,240,255,0.55)' : '#fff6ff');
  }
}

// Far hills: soft purple ridge lines (wide, wraps)
function hills(x: Ctx): void {
  for (let i = 0; i < LW; i++) {
    const h1 = 10 + Math.sin(i / 23) * 4 + Math.sin(i / 9 + 1) * 1.5 + hash(Math.floor(i / 6)) * 1.2;
    rect(x, i, Math.round(60 - h1), 1, 50, '#9a5a8a');
    const h2 = 6 + Math.sin(i / 17 + 2) * 3 + Math.sin(i / 5) * 0.8;
    rect(x, i, Math.round(66 - h2), 1, 44, '#7a4878');
  }
  stipple(x, 0, 44, LW, 6, '#c07a90', 0.25);
}

// The skyline: lit windows and rooftops catching the last light (wide, wraps)
function skyline(x: Ctx): void {
  let i = 0;
  let k = 0;
  while (i < LW) {
    const w = 8 + Math.floor(hash(k * 3 + 1) * 12);
    const h = 10 + Math.floor(hash(k * 5 + 2) * 22) + (k % 7 === 3 ? 14 : 0);
    const top = 72 - h;
    const base = k % 3 === 0 ? '#4a2c5a' : k % 3 === 1 ? '#3e2850' : '#553262';
    rect(x, i, top, w, h + 40, base);
    rect(x, i, top, 1, h, shade(base, 1.35)); // sunlit edge
    rect(x, i, top, w, 1, mix(base, '#ffb070', 0.5));
    if (k % 7 === 3) {
      rect(x, i + Math.floor(w / 2), top - 6, 1, 6, base); // antenna
      rect(x, i + Math.floor(w / 2), top - 7, 1, 1, '#ff5a4a');
    }
    if (k % 5 === 1) {
      // water tower
      rect(x, i + 2, top - 5, 5, 4, '#5a3a5a');
      rect(x, i + 2, top - 6, 5, 1, '#7a4a6a');
    }
    for (let wy = top + 3; wy < 70; wy += 4)
      for (let wx = i + 2; wx < i + w - 2; wx += 3) if (hash(wx * 31 + wy * 7) < 0.42) rect(x, wx, wy, 1, 2, hash(wx + wy) < 0.5 ? '#ffd88a' : '#ffb85a');
    i += w + (hash(k * 11) < 0.3 ? 2 : 0);
    k++;
  }
}

// Near town: rooftops of houses and trees, warm side light (wide, wraps)
function town(x: Ctx): void {
  for (let i = 0; i < LW; i += 26) {
    const s = Math.floor(i / 26);
    const hx = i + Math.floor(hash(s * 3) * 6);
    const roof = s % 3 === 0 ? '#8a3a3a' : s % 3 === 1 ? '#5a4a6a' : '#7a5a3a';
    const wall = s % 2 ? '#c88a6a' : '#b8a08a';
    rect(x, hx, 76, 16, 10, wall);
    rect(x, hx, 76, 2, 10, shade(wall, 1.15));
    for (let r = 0; r < 6; r++) rect(x, hx - 1 + r, 76 - r, 18 - r * 2, 1, r === 5 ? shade(roof, 1.25) : roof);
    rect(x, hx + 4, 79, 3, 3, '#ffd88a');
    rect(x, hx + 10, 79, 3, 3, hash(s) < 0.5 ? '#ffd88a' : '#5a4a6a');
    // tree
    const tx = hx + 20;
    rect(x, tx + 2, 78, 1, 6, '#4a3020');
    disc(x, tx + 2, 75, 4, '#3a6a3a');
    rect(x, tx - 1, 72, 3, 2, '#6a9a4a');
  }
  rect(x, 0, 85, LW, 30, '#4a6a3a');
}

function hill(x: Ctx): void {
  // the grassy overlook in front, lit gold from the right
  for (let i = 0; i < W; i++) {
    const top = Math.round(88 + Math.sin(i / 30) * 2.5 - (i > 100 ? (i - 100) * 0.04 : 0));
    for (let j = top; j < H; j++) {
      const lit = 0.55 - (j - top) / 40 + (i - 60) / 400;
      x.fillStyle = lit > bayer(i, j) ? '#8ab04a' : lit + 0.3 > bayer(i, j) ? '#5a8a3a' : '#3e6a32';
      x.fillRect(i, j, 1, 1);
    }
    rect(x, i, top, 1, 1, '#d8e07a');
  }
  // a little picket fence on the left and a mailbox-ish signpost
  for (let fx = 4; fx < 46; fx += 5) {
    rect(x, fx, 80, 2, 10, '#f2e6d0');
    rect(x, fx, 80, 1, 10, '#fff8e8');
    rect(x, fx, 79, 2, 1, '#c8b8a0');
  }
  rect(x, 2, 83, 46, 1, '#d8c8b0');
  rect(x, 2, 87, 46, 1, '#d8c8b0');
  // the bench people sit on when they're figuring their life out
  rect(x, 150, 86, 26, 2, '#8a5a34');
  rect(x, 150, 86, 26, 1, '#b07a4a');
  rect(x, 150, 82, 26, 2, '#8a5a34');
  rect(x, 152, 88, 2, 5, '#5a3a20');
  rect(x, 172, 88, 2, 5, '#5a3a20');
  stipple(x, 148, 93, 30, 2, 'rgba(30,20,40,0.6)', 0.5);
}

function cloudBand(x: Ctx, t: number): void {
  for (let i = 0; i < 5; i++) {
    const w = 18 + Math.floor(hash(i * 7) * 22);
    const sp = 1.2 + hash(i * 3) * 1.4;
    const span = W + w + 20;
    const cx = Math.round(-w + ((hash(i) * span + t * sp) % span));
    const cy = 12 + Math.floor(hash(i * 5) * 26);
    const c = cy < 24 ? '#c86a8a' : '#f2a07a';
    rect(x, cx, cy + 2, w, 2, c);
    rect(x, cx + 3, cy, Math.round(w * 0.5), 2, mix(c, '#ffe0b0', 0.4));
    rect(x, cx + 1, cy + 4, w - 2, 1, shade(c, 0.85));
  }
}

function grass(x: Ctx, t: number): void {
  for (let i = 0; i < 40; i++) {
    const gx = Math.floor(hash(i * 17) * W);
    const gy = 92 + Math.floor(hash(i * 5) * 14);
    const sway = Math.round(Math.sin(t * 2 + gx * 0.2) * 1);
    rect(x, gx + sway, gy - 2, 1, 2, '#a8c85a');
    rect(x, gx, gy, 1, 1, '#6a9a3a');
  }
  // pollen and fireflies catching the light
  for (let i = 0; i < 12; i++) {
    const px = (hash(i * 9) * W + t * (3 + hash(i) * 4) + Math.sin(t + i) * 6) % W;
    const py = 50 + hash(i * 4) * 50 + Math.sin(t * 1.3 + i * 2) * 4;
    const on = Math.floor(t * 3 + i * 1.7) % 4 !== 0;
    if (on) rect(x, Math.round(px), Math.round(py), 1, 1, i % 3 ? 'rgba(255,240,170,0.85)' : '#fffbe0');
  }
}

function birds(x: Ctx, t: number): void {
  for (let k = 0; k < 4; k++) {
    const period = 16 + k * 3;
    const ph = ((t + k * 4.3) % period) / period;
    const bx = W + 6 - ph * (W + 20);
    const by = 22 + k * 5 + Math.sin(t * 1.5 + k) * 2;
    const up = Math.floor(t * 7 + k) % 2 === 0;
    x.fillStyle = '#3a2440';
    x.fillRect(Math.round(bx), Math.round(by), 1, 1);
    x.fillRect(Math.round(bx) - 1, Math.round(by) + (up ? -1 : 0), 1, 1);
    x.fillRect(Math.round(bx) + 1, Math.round(by) + (up ? -1 : 0), 1, 1);
  }
}

export function paintTitle(x: Ctx, t: number, look: Look, still = false): void {
  const tt = still ? 0 : t;
  x.drawImage(cached('title:sky', W, 70, sky), 0, 0);
  rect(x, 0, 70, W, H - 70, '#ffe08a');
  cloudBand(x, tt);
  const layer = (name: string, f: (c: Ctx) => void, speed: number): void => {
    const c = cached(`title:${name}`, LW, H, f);
    const off = Math.floor(tt * speed) % LW;
    x.drawImage(c, -off, 0);
    x.drawImage(c, LW - off, 0);
  };
  layer('hills', hills, 0.6);
  layer('skyline', skyline, 1.6);
  layer('town', town, 3.2);
  // haze between layers
  x.save();
  x.globalCompositeOperation = 'screen';
  x.fillStyle = 'rgba(255,170,110,0.14)';
  x.fillRect(0, 60, W, 30);
  x.restore();
  x.drawImage(cached('title:hill', W, H, hill), 0, 0);
  birds(x, tt);
  // the player and Rae, long shadows stretching left away from the sun
  const frame = Math.floor(tt * 1.5) % 2;
  const blink = Math.floor(tt * 8) % 41 === 0;
  x.fillStyle = 'rgba(40,30,60,0.35)';
  for (const px of [70, 96]) for (let k = 0; k < 18; k++) x.fillRect(Math.round(px + 3 - k * 1.2), 98 + Math.floor(k / 6), 6, 1);
  drawPerson(x, playerPerson(look), 70, 68, frame, false, { face: 1, blink, shadow: false });
  const wave = Math.floor(tt / 2.5) % 3 === 1;
  drawPerson(x, CAST.rae.p, 96, 68, (frame + 1) % 2, wave && Math.floor(tt * 5) % 2 === 0, { face: -1, blink: Math.floor(tt * 8) % 47 === 9, shadow: false, gesture: wave ? (Math.floor(tt * 3) % 2 ? 1 : 2) : 0 });
  // warm rim light over everything from the sun side
  x.save();
  x.globalCompositeOperation = 'screen';
  const g = x.createLinearGradient(W, 0, 0, H);
  g.addColorStop(0, 'rgba(255,190,110,0.22)');
  g.addColorStop(1, 'rgba(255,190,110,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.restore();
  grass(x, tt);
}
