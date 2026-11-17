// Dialogue portraits: 48x48 shaded busts built from the same Person data as the
// little sprites, so the player's chosen look (and outfit) carries over.
// Everything is painted per pixel into a buffer: sphere-lit skin and hair with
// ordered dithering, a sel-out outline, and a few expressions plus talk frames.
import { HAIRS, type Person } from './people.ts';
import { bayer, hash, mix, rgbOf, shade } from './px.ts';

export const PW = 48;
export const PH = 48;
export type Expr = 'neutral' | 'happy' | 'worried' | 'annoyed' | 'surprised';
export interface PortraitFrame {
  expr: Expr;
  mouth: 0 | 1 | 2; // 0 closed, 1 half open, 2 open
  blink: boolean;
  look: -1 | 0 | 1; // gaze direction
}

const OUT = '#1c1424';
const CX = 24; // head center (pixel centers sit at i + 0.5)
const TOP = 7;
const CHIN = 34;
const RECEDING = 20;
const SLICK = 21;

// Light comes from the upper left, slightly in front.
const LX = -0.55;
const LY = -0.62;
const LZ = 0.56;

function headHW(j: number): number {
  const t = (j + 0.5 - TOP) / (CHIN - TOP);
  if (t < 0 || t > 1) return -1;
  if (t < 0.5) return 11 * Math.sqrt(Math.max(0, 1 - ((0.5 - t) / 0.5) ** 2 * 0.92));
  return 11 - 6 * ((t - 0.5) / 0.5) ** 1.7;
}
const dxOf = (i: number): number => i + 0.5 - CX;
function inHead(i: number, j: number, pad = 0): boolean {
  if (j < TOP - pad || j > CHIN + pad * 0.3) return false;
  const hw = j < TOP ? 11 * Math.sqrt(Math.max(0, 1 - ((TOP - j) / Math.max(0.5, pad)) ** 2)) * 0.5 : headHW(Math.min(j, CHIN - 1));
  return Math.abs(dxOf(i)) < hw + pad;
}

// Lambert term on an ellipsoid, 0..1.
function sphere(i: number, j: number, cx: number, cy: number, rx: number, ry: number): number {
  const nx = (i + 0.5 - cx) / rx;
  const ny = (j + 0.5 - cy) / ry;
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return Math.max(0, Math.min(1, nx * LX + ny * LY + nz * LZ + 0.18));
}
// Pick one of four tones with an ordered dither between neighbors.
function tone(base: string, lum: number, i: number, j: number, lo = 0.64, dz = 0.6): string {
  const v = lum * 3 + (bayer(i, j) - 0.5) * dz;
  const k = Math.max(0, Math.min(3, Math.round(v)));
  return k === 0 ? shade(base, lo) : k === 1 ? shade(base, 0.82) : k === 2 ? base : shade(base, 1.13);
}

// Layers in the buffer, used for edge shading.
const NONE = 0;
const SKIN = 1;
const HAIR = 2;
const CLOTH = 3;
const MISC = 4;

class Buf {
  c: (string | null)[] = new Array(PW * PH).fill(null);
  l = new Uint8Array(PW * PH);
  set(i: number, j: number, col: string, layer = MISC): void {
    if (i < 0 || j < 0 || i >= PW || j >= PH) return;
    this.c[j * PW + i] = col;
    this.l[j * PW + i] = layer;
  }
  get(i: number, j: number): string | null {
    if (i < 0 || j < 0 || i >= PW || j >= PH) return null;
    return this.c[j * PW + i];
  }
  layer(i: number, j: number): number {
    if (i < 0 || j < 0 || i >= PW || j >= PH) return NONE;
    return this.l[j * PW + i];
  }
  rect(x: number, y: number, w: number, h: number, col: string, layer = MISC): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, col, layer);
  }
  fill(mask: (i: number, j: number) => boolean, col: (i: number, j: number) => string, layer: number): void {
    for (let j = 0; j < PH; j++) for (let i = 0; i < PW; i++) if (mask(i, j)) this.set(i, j, col(i, j), layer);
  }
}

// ---------- hair shapes ----------
// Back hair sits behind the head and shoulders; front hair frames the face.
function backHair(style: number): ((i: number, j: number) => boolean) | null {
  switch (style) {
    case 1: // long: falls past the shoulders
      return (i, j) => j >= 10 && j <= 46 && Math.abs(dxOf(i)) < 13.5 - Math.max(0, j - 40) * 0.4 && (j < 30 || Math.abs(dxOf(i)) > 7);
    case 3: // curly: a full cloud of curls
      return (i, j) => {
        const a = Math.atan2(j - 18, dxOf(i));
        const r = 15 + Math.sin(a * 7) * 1.2;
        return j <= 33 && Math.hypot(dxOf(i), (j - 18) * 1.05) < r;
      };
    case 5: // ponytail out the back, swinging to the right
      return (i, j) => {
        const cx = 36 + Math.sin((j - 10) / 7) * 1.5;
        return j >= 9 && j <= 36 && Math.abs(i + 0.5 - cx) < 3.2 - Math.max(0, j - 28) * 0.25;
      };
    case 6: // afro
      return (i, j) => {
        const a = Math.atan2(j - 16, dxOf(i));
        const r = 18 + Math.sin(a * 9) * 0.8;
        return j <= 30 && Math.hypot(dxOf(i), (j - 16) * 1.12) < r;
      };
    case 7: // braids: two long plaits
      return (i, j) => j >= 14 && j <= 46 && (Math.abs(dxOf(i) + 12.5) < 2.6 || Math.abs(dxOf(i) - 12.5) < 2.6);
    case 8: // bob: cut flat at the chin
      return (i, j) => j >= 10 && j <= 33 && Math.abs(dxOf(i)) < 14;
    default:
      return null;
  }
}

function frontHair(style: number): (i: number, j: number) => boolean {
  const adx = (i: number): number => Math.abs(dxOf(i));
  switch (style) {
    case 0: // short, a little tousled
      return (i, j) => inHead(i, j, 1.6) && (j < 13 + ((i * 7) % 3 === 0 ? 1 : 0) + (adx(i) > 6 ? 1 : 0) || (adx(i) > 9.6 && j < 22));
    case 1: // long with a side part
      return (i, j) => inHead(i, j, 1.6) && (j < 13 + Math.max(0, Math.floor((i - 22) / 3)) * (i > 22 ? 1 : 0) || (adx(i) > 8.6 && j < 33));
    case 2: // bun: swept back
      return (i, j) => (inHead(i, j, 1.2) && (j < 12 || (adx(i) > 10 && j < 20))) || Math.hypot(dxOf(i), j - 4.5) < 5.2;
    case 3: // curly
      return (i, j) => inHead(i, j, 2.2) && (j < 13 + ((i * 5 + 1) % 4 < 2 ? 1 : 0) || (adx(i) > 9.2 && j < 27));
    case 4: // buzz: close to the scalp
      return (i, j) => inHead(i, j, 0.8) && (j < 11 || (adx(i) > 9.8 && j < 19));
    case 5: // ponytail: pulled back
      return (i, j) => inHead(i, j, 1.2) && (j < 12 || (adx(i) > 10 && j < 20));
    case 6: // afro: hairline only, the volume is behind
      return (i, j) => inHead(i, j, 1.4) && (j < 12 || (adx(i) > 10 && j < 21));
    case 7: // braids: center part, pulled tight
      return (i, j) => inHead(i, j, 1.2) && (j < 12 || (adx(i) > 9.8 && j < 18));
    case 8: // bob: blunt bangs
      return (i, j) => inHead(i, j, 1.8) && (j < 16 || (adx(i) > 8.4 && j < 33));
    case RECEDING:
      return (i, j) => inHead(i, j, 1.2) && adx(i) > 9 && j >= 13 && j < 23;
    case SLICK:
      return (i, j) => inHead(i, j, 1.2) && (j < 12 + (i > 19 && i < 30 ? Math.round((i - 19) / 4) : 0) || (adx(i) > 10 && j < 19));
    default:
      return (i, j) => inHead(i, j, 1.4) && j < 13;
  }
}

// ---------- expressions ----------
function drawEyes(b: Buf, p: Person, f: PortraitFrame): void {
  const lid = mix(OUT, shade(p.skin, 0.4), 0.3);
  const iris = '#2a1c18';
  const white = '#f6f2ec';
  const look = f.look;
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 17 : 27; // 4 px wide
    const y0 = 20;
    if (f.blink) {
      b.rect(x0, y0 + 1, 4, 1, lid);
      b.set(side < 0 ? x0 : x0 + 3, y0 + 2, lid);
      continue;
    }
    if (f.expr === 'happy' && f.mouth === 0) {
      // smiling eyes: closed crescents
      b.rect(x0 + 1, y0, 2, 1, lid);
      b.set(x0, y0 + 1, lid);
      b.set(x0 + 3, y0 + 1, lid);
      continue;
    }
    const wide = f.expr === 'surprised' || f.expr === 'worried';
    const half = f.expr === 'annoyed';
    const top = wide ? y0 - 1 : y0;
    b.rect(x0, top, 4, 1, lid); // upper lid + lashes
    if (side < 0) b.set(x0 - 1, top + 1, lid);
    else b.set(x0 + 4, top + 1, lid);
    const rows = half ? 1 : wide ? 3 : 2;
    for (let r = 0; r < rows; r++) b.rect(x0, top + 1 + r, 4, 1, white);
    if (half) b.rect(x0, top + 1, 4, 1, lid);
    const ix = x0 + 1 + look;
    const iy = half ? top + 2 : top + 1 + (wide ? 1 : 0);
    b.rect(ix, iy, 2, half ? 1 : 2, iris);
    if (half) b.rect(x0, top + 2, 4, 1, white), b.rect(ix, top + 2, 2, 1, iris);
    if (!half) b.set(ix, iy, '#ffffff'); // glint
    if (wide && f.expr === 'surprised') b.rect(ix, iy, 2, 1, iris), b.set(ix + (look > 0 ? 1 : 0), iy, '#ffffff');
  }
}

function drawBrows(b: Buf, p: Person, f: PortraitFrame): void {
  const light = p.hair === HAIRS[3] || p.hair === HAIRS[6];
  const c = p.style === RECEDING && p.hair === HAIRS[6] ? '#8a8a96' : shade(p.hair, light ? 0.62 : 0.78);
  const e = f.expr;
  for (const side of [-1, 1]) {
    // positions listed for the left brow (outer -> inner), mirrored for the right
    let pts: [number, number][];
    if (e === 'happy' || e === 'surprised') pts = [[16, 17], [17, 16], [18, 16], [19, 16], [20, 17]];
    else if (e === 'worried') pts = [[16, 18], [17, 18], [18, 17], [19, 17], [20, 16]];
    else if (e === 'annoyed') pts = [[16, 16], [17, 17], [18, 17], [19, 18], [20, 18]];
    else pts = [[16, 18], [17, 17], [18, 17], [19, 17], [20, 17]];
    if (e === 'surprised') pts = pts.map(([x, y]) => [x, y - 1]);
    for (const [x, y] of pts) {
      const xx = side < 0 ? x : 47 - x;
      b.set(xx, y, c);
      if (p.brows) b.set(xx, y + 1, shade(c, 0.85));
    }
  }
}

function drawMouth(b: Buf, p: Person, f: PortraitFrame): void {
  const dark = mix('#4a1418', shade(p.skin, 0.4), 0.35);
  const lip = mix(shade(p.skin, 0.86), '#c0485a', 0.32);
  const teeth = '#f6f2ec';
  const tongue = '#d0606a';
  const m = f.mouth;
  const e = f.expr;
  if (m === 0) {
    if (e === 'happy') {
      b.set(20, 29, dark);
      b.set(27, 29, dark);
      b.rect(21, 30, 6, 1, dark);
      b.rect(22, 31, 4, 1, lip);
    } else if (e === 'worried') {
      b.rect(22, 30, 4, 1, dark);
      b.set(21, 31, dark);
      b.set(26, 31, dark);
      b.set(23, 29, shade(p.skin, 0.9));
    } else if (e === 'annoyed') {
      b.rect(21, 30, 5, 1, dark);
      b.set(26, 31, dark);
      b.set(20, 29, shade(p.skin, 0.84));
    } else if (e === 'surprised') {
      b.rect(23, 29, 2, 3, dark);
      b.set(22, 30, dark);
      b.set(25, 30, dark);
    } else {
      b.rect(22, 30, 4, 1, dark);
      b.rect(22, 31, 4, 1, lip);
    }
    return;
  }
  if (m === 1) {
    b.rect(22, 30, 4, 2, dark);
    if (e === 'happy') b.rect(22, 30, 4, 1, teeth), b.set(21, 29, dark), b.set(26, 29, dark);
    b.rect(23, 31, 2, 1, tongue);
    b.rect(22, 32, 4, 1, lip);
    return;
  }
  b.rect(21, 30, 6, 1, dark);
  b.rect(22, 30, 4, 1, teeth);
  b.rect(21, 31, 6, 1, dark);
  b.rect(22, 32, 4, 1, dark);
  b.rect(23, 32, 2, 1, tongue);
  b.rect(22, 33, 4, 1, lip);
  if (e === 'happy') b.set(20, 29, dark), b.set(27, 29, dark);
}

// ---------- the bust ----------
function paint(p: Person, f: PortraitFrame): Buf {
  const b = new Buf();
  const hairC = p.hair;
  const hairLit = (i: number, j: number): string => {
    const lum = sphere(i, j, CX - 1, 17, 17, 18);
    let c = tone(hairC, lum, i, j, 0.58);
    // strand texture: diagonal sheen bands on the lit side
    if (lum > 0.62 && (i * 2 + j) % 5 === 0) c = shade(hairC, 1.32);
    else if ((i + j * 3) % 7 === 0 && lum < 0.7) c = shade(hairC, 0.74);
    return c;
  };
  const style = p.style;

  // back hair
  const bh = backHair(style);
  if (bh) b.fill(bh, hairLit, HAIR);
  if (style === 7) {
    // braid segments and beads
    for (let j = 14; j <= 46; j++)
      for (const cx of [CX - 12.5, CX + 12.5])
        for (let i = Math.floor(cx - 3); i <= Math.ceil(cx + 3); i++) {
          if (b.layer(i, j) !== HAIR) continue;
          const seg = (j + (i < CX ? 0 : 1)) % 4;
          if (seg === 0) b.set(i, j, shade(hairC, 0.66), HAIR);
          if (j === 43 || j === 44) b.set(i, j, j === 43 ? '#f2b632' : '#c99a18', MISC);
        }
  }

  // shoulders & torso
  const shirt = p.hood ?? p.shirt;
  const torsoHW = (j: number): number => (j < 36 ? -1 : 9 + 12.5 * Math.min(1, (j - 35.5) / 6) ** 0.55);
  b.fill(
    (i, j) => Math.abs(dxOf(i)) < torsoHW(j),
    (i, j) => {
      const hw = torsoHW(j);
      const nx = dxOf(i) / (hw + 2);
      const lum = Math.max(0, Math.min(1, -nx * 0.7 + 0.45 + (j < 40 ? 0.1 : 0)));
      let c = tone(shirt, lum, i, j, 0.66);
      if (p.plaid && !p.hood && ((i % 5 === 0) || (j % 5 === 2))) c = tone(p.plaid, lum, i, j);
      return c;
    },
    CLOTH,
  );

  // neck with a shadow under the jaw
  b.fill(
    (i, j) => j >= 30 && j <= 40 && Math.abs(dxOf(i)) < 5.2 - (j > 37 ? (j - 37) * -0.6 : 0),
    (i, j) => (j < 34 ? shade(p.skin, 0.64) : j < 36 ? shade(p.skin, 0.76) : tone(p.skin, dxOf(i) < 0 ? 0.62 : 0.3, i, j)),
    SKIN,
  );
  // collar / neckline
  if (p.hood) {
    b.fill(
      (i, j) => j >= 34 && j <= 40 && Math.abs(dxOf(i)) < 9.5 && Math.abs(dxOf(i)) > 3.6 + (j - 34) * 0.1,
      (i, j) => tone(shade(p.hood!, 0.9), dxOf(i) < 0 ? 0.6 : 0.25, i, j),
      CLOTH,
    );
    b.rect(18, 38, 9 + 3, 1, shade(p.hood, 0.7), CLOTH);
    b.rect(21, 39, 1, 5, '#f2efe6');
    b.rect(26, 39, 1, 5, '#f2efe6');
  } else if (p.coat) {
    // open coat with lapels over the shirt
    b.fill(
      (i, j) => Math.abs(dxOf(i)) < torsoHW(j) && Math.abs(dxOf(i)) > 4.2 + Math.max(0, (j - 37) * 0.25),
      (i, j) => {
        const lum = Math.max(0, Math.min(1, -dxOf(i) / 22 + 0.48));
        const lapel = Math.abs(Math.abs(dxOf(i)) - (4.6 + (j - 37) * 0.25)) < 1.1;
        return lapel ? shade(p.coat!, dxOf(i) < 0 ? 1.18 : 0.86) : tone(p.coat!, lum, i, j, 0.66);
      },
      CLOTH,
    );
    b.rect(20, 36, 8, 1, shade(p.shirt, 1.1), CLOTH);
  } else {
    b.fill(
      (i, j) => (j === 36 || j === 37) && Math.abs(dxOf(i)) < 6.2 - (j - 36) && Math.abs(dxOf(i)) > 4.4 - (j - 36) * 2,
      () => shade(shirt, 0.74),
      CLOTH,
    );
  }
  if (p.scarf) {
    b.fill(
      (i, j) => j >= 33 && j <= 39 && Math.abs(dxOf(i)) < 8.5,
      (i, j) => ((i + j) % 3 === 0 ? shade(p.scarf!, 0.82) : tone(p.scarf!, dxOf(i) < 0 ? 0.7 : 0.35, i, j)),
      CLOTH,
    );
    b.rect(26, 39, 3, 7, shade(p.scarf, 0.86), CLOTH);
  }
  if (p.vest) {
    b.fill(
      (i, j) => j >= 37 && Math.abs(dxOf(i)) < torsoHW(j) - 1 && Math.abs(dxOf(i)) > 5.5,
      (i, j) => tone(p.vest!, dxOf(i) < 0 ? 0.72 : 0.4, i, j),
      CLOTH,
    );
    b.fill(
      (i, j) => (j === 43 || j === 44) && Math.abs(dxOf(i)) < torsoHW(j) - 1 && Math.abs(dxOf(i)) > 5.5,
      () => '#e8ecf4',
      MISC,
    );
  }
  if (p.apron) {
    b.fill(
      (i, j) => j >= 41 && Math.abs(dxOf(i)) < 8.5,
      (i, j) => tone(p.apron!, dxOf(i) < 0 ? 0.7 : 0.4, i, j),
      CLOTH,
    );
    for (let j = 36; j < 41; j++) {
      b.set(15 + Math.floor((j - 36) * 0.4), j, p.apron, CLOTH);
      b.set(32 - Math.floor((j - 36) * 0.4), j, shade(p.apron, 0.8), CLOTH);
    }
    b.rect(16, 41, 16, 1, shade(p.apron, 1.15), CLOTH);
  }
  if (p.tie) {
    b.rect(22, 37, 4, 2, shade(p.tie, 0.8));
    b.fill((i, j) => j >= 39 && j <= 47 && Math.abs(dxOf(i)) < 1.6 + (j - 39) * 0.12, (i, j) => tone(p.tie!, dxOf(i) < 0 ? 0.7 : 0.35, i, j), MISC);
  }
  if (p.bowtie) {
    b.rect(19, 37, 4, 3, p.bowtie);
    b.rect(25, 37, 4, 3, shade(p.bowtie, 0.82));
    b.rect(22, 37, 3, 3, shade(p.bowtie, 0.65));
  }
  if (p.necklace) for (let i = 18; i <= 29; i++) b.set(i, 37 + Math.round(((i - 23.5) / 6) ** 2 * -2 + 2), p.necklace);
  if (p.lanyard) {
    for (let j = 36; j <= 44; j++) {
      b.set(18 + Math.floor((j - 36) * 0.45), j, p.lanyard);
      b.set(29 - Math.floor((j - 36) * 0.45), j, shade(p.lanyard, 0.8));
    }
    b.rect(21, 45, 6, 3, '#f2efe6');
    b.rect(22, 46, 4, 1, '#6a8ac8');
  }
  if (p.stethoscope) {
    for (let i = 16; i <= 31; i++) b.set(i, 36 + Math.round(((i - 23.5) / 8) ** 2 * -3 + 3), '#5a6470');
    b.rect(30, 39, 1, 5, '#5a6470');
    b.rect(29, 44, 3, 2, '#c8d0d8');
  }
  if (p.badge) {
    const police = p.hat === 'police';
    b.rect(31, 41, 6, 3, police ? '#f2c230' : '#f4f0e4');
    b.rect(32, 42, 4, 1, police ? '#c99a18' : '#8a8aa0');
  }
  if (p.headphones) {
    b.rect(12, 34, 5, 6, p.headphones);
    b.rect(31, 34, 5, 6, shade(p.headphones, 0.8));
    b.rect(13, 35, 2, 2, shade(p.headphones, 1.25));
    b.rect(17, 39, 14, 1, '#2a2a33');
  }

  // ears
  for (const side of [-1, 1]) {
    const ex = side < 0 ? 11 : 35;
    b.fill(
      (i, j) => j >= 19 && j <= 26 && Math.abs(i + 0.5 - (ex + 1)) < (j === 19 || j === 26 ? 1 : 1.6),
      (i, j) => (Math.abs(i + 0.5 - (ex + 1)) < 0.6 && j > 20 && j < 25 ? shade(p.skin, 0.7) : tone(p.skin, side < 0 ? 0.62 : 0.3, i, j)),
      SKIN,
    );
  }

  // face
  b.fill(
    (i, j) => inHead(i, j),
    (i, j) => {
      let lum = sphere(i, j, CX - 0.5, 19, 12.5, 16);
      if (j > 27 && dxOf(i) > 2) lum -= 0.08; // jaw shadow side
      return tone(p.skin, lum, i, j, 0.7, 0.5);
    },
    SKIN,
  );
  // nose: a lit ridge, a shadow side, nostrils
  b.set(23, 23, shade(p.skin, 1.08), SKIN);
  b.set(23, 24, shade(p.skin, 1.08), SKIN);
  b.set(25, 24, shade(p.skin, 0.82), SKIN);
  b.set(25, 25, shade(p.skin, 0.78), SKIN);
  b.rect(23, 26, 3, 1, shade(p.skin, 0.72), SKIN);
  b.set(22, 26, shade(p.skin, 0.86), SKIN);
  // cheeks
  const blush = f.expr === 'happy' ? 0.55 : f.expr === 'worried' ? 0.12 : 0.22;
  for (const cx0 of [16, 28])
    for (let j = 25; j <= 26; j++)
      for (let i = cx0; i < cx0 + 4; i++) if (blush > bayer(i, j)) b.set(i, j, mix(b.get(i, j) ?? p.skin, '#f07a7a', 0.45), SKIN);

  if (p.beard) {
    const bc = p.hair === HAIRS[6] ? '#cfcfd8' : shade(p.hair, 1.05);
    b.fill(
      (i, j) => inHead(i, j, 0.6) && ((j >= 27 && !(j >= 29 && j <= 31 && Math.abs(dxOf(i)) < 3.5)) || (Math.abs(dxOf(i)) > 8.2 && j >= 22)),
      (i, j) => tone(bc, sphere(i, j, CX, 26, 13, 12), i, j, 0.62),
      HAIR,
    );
  }
  if (p.mustache || p.beard) {
    const mc = p.hair === HAIRS[6] ? '#cfcfd8' : shade(p.hair, p.beard ? 0.9 : 1.05);
    b.rect(20, 28, 8, 1, mc, HAIR);
    b.rect(21, 29, 6, 1, shade(mc, 0.82), HAIR);
  }

  drawEyes(b, p, f);
  drawBrows(b, p, f);
  drawMouth(b, p, f);

  // front hair (hats push it down)
  if (!(p.hat === 'police' || p.hat === 'hard' || p.hat === 'beanie') || style === 1 || style === 8 || style === 7) {
    const fh = frontHair(style);
    const before = new Uint8Array(b.l);
    b.fill(fh, hairLit, HAIR);
    if (style === 4) {
      // buzz: stubble lets the scalp show through
      for (let j = 0; j < 22; j++) for (let i = 0; i < PW; i++) if (b.layer(i, j) === HAIR && before[j * PW + i] === SKIN && bayer(i, j) < 0.35) b.set(i, j, shade(p.skin, 0.88), SKIN);
    }
    if (style === 7) b.rect(23, TOP - 1, 2, 5, shade(p.skin, 0.8), SKIN); // center part
    if (style === RECEDING) {
      b.set(19, 9, shade(p.skin, 1.2), SKIN);
      b.rect(20, 10, 3, 1, shade(p.skin, 1.16), SKIN);
    }
  }

  // hats
  const hc = p.hatColor;
  if (p.hat === 'cap') {
    const c = hc ?? '#c0392b';
    b.fill((i, j) => inHead(i, j, 2) && j < 14, (i, j) => tone(c, sphere(i, j, CX - 1, 12, 14, 9), i, j), MISC);
    b.fill((i, j) => j >= 13 && j <= 15 && i >= 7 && i <= 33 - (j - 13) && !(j === 15 && i < 9), (_i, j) => (j === 13 ? shade(c, 1.1) : shade(c, 0.68 - (j - 14) * 0.08)), MISC);
    b.rect(23, 2, 2, 1, shade(c, 0.8));
  } else if (p.hat === 'police') {
    b.fill((i, j) => j >= 2 && j <= 12 && Math.abs(dxOf(i)) < 13 - Math.max(0, 6 - j) * 0.6, (i, j) => tone('#1f2a52', sphere(i, j, CX - 2, 6, 16, 9), i, j), MISC);
    b.rect(11, 11, 26, 2, '#111833');
    b.fill((i, j) => j >= 13 && j <= 14 && Math.abs(dxOf(i)) < 12 - (j - 13) * 2, (i, j) => (i < 18 && j === 13 ? '#4a5a8a' : '#0c1024'), MISC);
    b.rect(22, 5, 4, 4, '#f2c230');
    b.set(22, 5, '#fff2a0');
    b.rect(23, 8, 2, 1, '#c99a18');
  } else if (p.hat === 'hard') {
    const c = hc ?? '#f2c230';
    b.fill((i, j) => j >= 1 && j <= 13 && Math.hypot(dxOf(i) / 13, (j - 13) / 12) < 1, (i, j) => tone(c, sphere(i, j, CX - 2, 10, 14, 11), i, j), MISC);
    b.rect(23, 2, 2, 11, shade(c, 0.86));
    b.set(23, 2, shade(c, 1.15));
    b.rect(7, 13, 34, 2, shade(c, 0.9));
    b.rect(7, 13, 34, 1, shade(c, 1.12));
    b.rect(8, 15, 32, 1, shade(c, 0.6));
  } else if (p.hat === 'beanie') {
    const c = hc ?? '#3f7fd8';
    b.fill((i, j) => inHead(i, j, 2.2) && j < 15, (i, j) => (j >= 11 ? ((i % 2) ? shade(c, 0.78) : shade(c, 0.92)) : tone(c, sphere(i, j, CX - 1, 10, 14, 9), i, j)), MISC);
    b.fill((i, j) => Math.hypot(dxOf(i), j - 2.5) < 3.2, (i, j) => tone('#f2efe6', sphere(i, j, CX, 2.5, 3.2, 3.2), i, j), MISC);
  }
  if (p.headset) {
    for (let j = 6; j <= 20; j++) b.set(Math.round(10 + Math.max(0, 14 - j) * 0.25), j, '#2a2a33');
    for (let i = 11; i <= 36; i++) {
      const j = Math.round(5 - Math.sin(((i - 10) / 27) * Math.PI) * 2);
      if (b.layer(i, j) !== MISC) b.set(i, j, '#2a2a33');
    }
    b.rect(9, 19, 4, 7, '#2a2a33');
    b.rect(10, 20, 2, 2, '#5a5a6a');
    for (let k = 0; k < 8; k++) b.set(12 + k, 26 + Math.round(k * 0.55), '#3a3a44');
    b.rect(19, 30, 2, 2, '#2a2a33');
  }
  if (p.earrings && style !== 1 && style !== 8) {
    b.set(11, 27, p.earrings);
    b.set(36, 27, shade(p.earrings, 0.8));
    b.set(11, 28, p.earrings);
    b.set(36, 28, shade(p.earrings, 0.8));
  }
  if (p.glasses) {
    const g = '#2e2a3a';
    for (const x0 of [15, 26]) {
      for (let i = x0; i < x0 + 7; i++) {
        b.set(i, 19, g);
        b.set(i, 23, g);
      }
      for (let j = 19; j <= 23; j++) {
        b.set(x0, j, g);
        b.set(x0 + 6, j, g);
      }
      b.set(x0 + 1, 20, '#ffffff');
      b.set(x0 + 2, 20, mix('#ffffff', p.skin, 0.4));
    }
    b.rect(22, 20, 4, 1, g);
    b.set(13, 20, g);
    b.set(14, 20, g);
    b.set(33, 20, g);
    b.set(34, 20, g);
  }

  // edge shading: hair casts a shadow on the forehead; hair rim gets a dark edge
  for (let j = 1; j < PH; j++)
    for (let i = 0; i < PW; i++) {
      if (b.layer(i, j) === SKIN && b.layer(i, j - 1) === HAIR && j < 30) b.set(i, j, shade(b.get(i, j) ?? p.skin, 0.84), SKIN);
    }
  // sel-out: outline the silhouette, slightly lighter where light hits (upper left)
  const out = new Buf();
  out.c = b.c.slice();
  out.l = new Uint8Array(b.l);
  for (let j = 0; j < PH; j++)
    for (let i = 0; i < PW; i++) {
      if (b.get(i, j)) continue;
      const n = b.get(i - 1, j) || b.get(i + 1, j) || b.get(i, j - 1) || b.get(i, j + 1);
      if (n) out.set(i, j, OUT, MISC);
    }
  // internal contour where cloth meets skin (jaw over neck, collar)
  for (let j = 1; j < PH; j++)
    for (let i = 0; i < PW; i++) {
      if (b.layer(i, j) === SKIN && j > 30 && b.layer(i, j - 1) === SKIN && !inHead(i, j) && inHead(i, j - 1)) out.set(i, j, shade(p.skin, 0.55), SKIN);
      if (b.layer(i, j) === CLOTH && b.layer(i, j - 1) === SKIN) out.set(i, j, shade(b.get(i, j) ?? shirt, 0.6), CLOTH);
    }
  return out;
}

// ---------- caching & blitting ----------
const FIG = new Map<string, HTMLCanvasElement>();
export function personKey(p: Person): string {
  return JSON.stringify(p);
}
export function portraitCanvas(p: Person, f: PortraitFrame, key = personKey(p)): HTMLCanvasElement {
  const k = `${key}|${f.expr}|${f.mouth}|${f.blink ? 1 : 0}|${f.look}`;
  let c = FIG.get(k);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = PW;
  c.height = PH;
  const x = c.getContext('2d');
  if (x) {
    const b = paint(p, f);
    const img = x.createImageData(PW, PH);
    for (let n = 0; n < PW * PH; n++) {
      const col = b.c[n];
      if (!col) continue;
      const [r, g, bl] = rgbOf(col);
      img.data[n * 4] = r;
      img.data[n * 4 + 1] = g;
      img.data[n * 4 + 2] = bl;
      img.data[n * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }
  if (FIG.size > 400) FIG.clear();
  FIG.set(k, c);
  return c;
}

// A dithered backdrop: light from the upper left, a soft floor of color, a few specks.
const BACK = new Map<string, HTMLCanvasElement>();
export function portraitBackdrop(color: string, seed = 1): HTMLCanvasElement {
  const k = `${color}|${seed}`;
  let c = BACK.get(k);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = PW;
  c.height = PH;
  const x = c.getContext('2d');
  if (x) {
    const hi = mix(color, '#fff6e0', 0.35);
    const lo = shade(color, 0.62);
    for (let j = 0; j < PH; j++)
      for (let i = 0; i < PW; i++) {
        const d = Math.hypot(i - 14, j - 10) / 52;
        const v = Math.min(1, d) * 2 + (bayer(i, j) - 0.5) * 0.9;
        const k2 = Math.max(0, Math.min(2, Math.round(v)));
        x.fillStyle = k2 === 0 ? hi : k2 === 1 ? color : lo;
        x.fillRect(i, j, 1, 1);
      }
    x.fillStyle = mix(color, '#ffffff', 0.55);
    for (let n = 0; n < 6; n++) x.fillRect(Math.floor(hash(seed * 31 + n) * PW), Math.floor(hash(seed * 17 + n * 3) * 26), 1, 1);
  }
  BACK.set(k, c);
  return c;
}
