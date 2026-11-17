// HD drawing helpers for mini-games rendered through an HD PixelCanvas (see kit.tsx).
// Everything takes logical coordinates (the canvas transform supplies the scale), so the same calls
// work at 1x too. Shapes are smooth (arcs, gradients), not pixel blocks: this is the "N64" layer.
type Ctx = CanvasRenderingContext2D;

// ---------- colour ----------
const RGB = new Map<string, [number, number, number]>();
export function rgbOf(c: string): [number, number, number] {
  let v = RGB.get(c);
  if (v) return v;
  let h = c.trim();
  if (h.startsWith('#')) {
    h = h.slice(1);
    if (h.length === 3) h = h.split('').map((k) => k + k).join('');
    const n = parseInt(h.slice(0, 6), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  } else {
    const m = h.match(/[\d.]+/g);
    v = m ? [Number(m[0]), Number(m[1]), Number(m[2])] : [128, 128, 128];
  }
  RGB.set(c, v);
  return v;
}
// k > 0 lightens toward white, k < 0 darkens toward black. Optional alpha.
export function tone(c: string, k: number, a = 1): string {
  const [r, g, b] = rgbOf(c);
  const f = (v: number) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return a >= 1 ? `rgb(${f(r)},${f(g)},${f(b)})` : `rgba(${f(r)},${f(g)},${f(b)},${a.toFixed(3)})`;
}
export function rgba(c: string, a: number): string {
  const [r, g, b] = rgbOf(c);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgbOf(a);
  const [r2, g2, b2] = rgbOf(b);
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
}

// ---------- offscreen layers ----------
// A canvas at `scale`x the logical size, with the transform already applied. Use for cached backdrops.
export function hdLayer(w: number, h: number, scale: number): { c: HTMLCanvasElement; x: Ctx } {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const x = c.getContext('2d')!;
  x.setTransform(scale, 0, 0, scale, 0, 0);
  return { c, x };
}

// Draw a low-res (logical-size) image with bilinear filtering: the soft "filtered texture" look.
export function softBlit(x: Ctx, img: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void {
  const p = x.imageSmoothingEnabled;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, dx, dy, dw, dh);
  x.imageSmoothingEnabled = p;
}

// ---------- shapes ----------
export function ellipse(x: Ctx, cx: number, cy: number, rx: number, ry: number, fill: string | CanvasGradient): void {
  x.fillStyle = fill;
  x.beginPath();
  x.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, Math.PI * 2);
  x.fill();
}

export function rrect(x: Ctx, px: number, py: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  x.beginPath();
  x.moveTo(px + rr, py);
  x.arcTo(px + w, py, px + w, py + h, rr);
  x.arcTo(px + w, py + h, px, py + h, rr);
  x.arcTo(px, py + h, px, py, rr);
  x.arcTo(px, py, px + w, py, rr);
  x.closePath();
}

// Soft contact shadow: a blurred dark ellipse (radial gradient), no hard edge.
export function softShadow(x: Ctx, cx: number, cy: number, rx: number, ry: number, a = 0.45, color = '10,8,20'): void {
  if (rx <= 0 || ry <= 0) return;
  x.save();
  x.translate(cx, cy);
  x.scale(1, ry / rx);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(${color},${a.toFixed(3)})`);
  g.addColorStop(0.55, `rgba(${color},${(a * 0.6).toFixed(3)})`);
  g.addColorStop(1, `rgba(${color},0)`);
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, 0, rx, 0, Math.PI * 2);
  x.fill();
  x.restore();
}

// Additive light glow (headlights, neon, sun). `squash` < 1 flattens it into a floor pool.
export function glow(x: Ctx, cx: number, cy: number, r: number, color: string, a = 0.5, squash = 1): void {
  if (r <= 0 || a <= 0) return;
  x.save();
  x.globalCompositeOperation = 'lighter';
  x.translate(cx, cy);
  if (squash !== 1) x.scale(1, squash);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(0.35, rgba(color, a * 0.45));
  g.addColorStop(1, rgba(color, 0));
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, 0, r, 0, Math.PI * 2);
  x.fill();
  x.restore();
}

// A lit sphere / blob: radial gradient with an off-centre highlight. lx,ly = light direction (-1..1).
export function sphere(x: Ctx, cx: number, cy: number, r: number, base: string, lx = -0.4, ly = -0.5, spec = 0.55): void {
  const g = x.createRadialGradient(cx + lx * r * 0.45, cy + ly * r * 0.45, r * 0.05, cx, cy, r * 1.05);
  g.addColorStop(0, tone(base, 0.45));
  g.addColorStop(0.45, base);
  g.addColorStop(1, tone(base, -0.55));
  x.fillStyle = g;
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fill();
  if (spec > 0) ellipse(x, cx + lx * r * 0.5, cy + ly * r * 0.55, r * 0.28, r * 0.18, `rgba(255,255,255,${spec.toFixed(3)})`);
}

// A rounded, Gouraud-ish shaded box (car bodies, crates, cabinets). Light from the top-left.
export function shadedBox(x: Ctx, px: number, py: number, w: number, h: number, r: number, base: string, opts: { vertical?: boolean; rim?: number; spec?: number } = {}): void {
  const vert = opts.vertical ?? false;
  const g = vert ? x.createLinearGradient(px, py, px, py + h) : x.createLinearGradient(px, py, px + w, py);
  g.addColorStop(0, tone(base, 0.28));
  g.addColorStop(0.3, tone(base, 0.08));
  g.addColorStop(0.7, base);
  g.addColorStop(1, tone(base, -0.42));
  rrect(x, px, py, w, h, r);
  x.fillStyle = g;
  x.fill();
  if ((opts.rim ?? 0.6) > 0) {
    x.strokeStyle = tone(base, -0.6, opts.rim ?? 0.6);
    x.lineWidth = 0.5;
    x.stroke();
  }
  if ((opts.spec ?? 0) > 0) {
    const s = x.createLinearGradient(px, py, px, py + h * 0.5);
    s.addColorStop(0, `rgba(255,255,255,${(opts.spec ?? 0).toFixed(3)})`);
    s.addColorStop(1, 'rgba(255,255,255,0)');
    rrect(x, px + w * 0.12, py + h * 0.06, w * 0.76, h * 0.4, r * 0.7);
    x.fillStyle = s;
    x.fill();
  }
}

// A 4-point specular glint.
export function sparkle(x: Ctx, cx: number, cy: number, size: number, a = 0.9, color = '#ffffff'): void {
  if (a <= 0) return;
  x.save();
  x.globalCompositeOperation = 'lighter';
  x.fillStyle = rgba(color, a);
  x.beginPath();
  x.moveTo(cx, cy - size);
  x.quadraticCurveTo(cx, cy, cx + size, cy);
  x.quadraticCurveTo(cx, cy, cx, cy + size);
  x.quadraticCurveTo(cx, cy, cx - size, cy);
  x.quadraticCurveTo(cx, cy, cx, cy - size);
  x.fill();
  x.restore();
  glow(x, cx, cy, size * 1.4, color, a * 0.35);
}

// Vertical gradient band (sky, fog, water depth).
export function vband(x: Ctx, px: number, py: number, w: number, h: number, stops: [number, string][]): void {
  const g = x.createLinearGradient(0, py, 0, py + h);
  for (const [o, c] of stops) g.addColorStop(o, c);
  x.fillStyle = g;
  x.fillRect(px, py, w, h);
}
export function hband(x: Ctx, px: number, py: number, w: number, h: number, stops: [number, string][]): void {
  const g = x.createLinearGradient(px, 0, px + w, 0);
  for (const [o, c] of stops) g.addColorStop(o, c);
  x.fillStyle = g;
  x.fillRect(px, py, w, h);
}

// ---------- surface grain ----------
// A tiling grey noise tile laid over a surface with 'overlay': adds texture (asphalt speckle, grass
// blades, carpet fibre) without shifting the average colour. Generated once; drawing it is one fill.
const GRAIN = new Map<string, HTMLCanvasElement>();
function grainTile(kind: 'fine' | 'blades' | 'fibre'): HTMLCanvasElement {
  let c = GRAIN.get(kind);
  if (c) return c;
  const S = 96;
  c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const x = c.getContext('2d')!;
  x.fillStyle = '#808080';
  x.fillRect(0, 0, S, S);
  let seed = kind === 'fine' ? 7 : kind === 'blades' ? 11 : 13;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const n = kind === 'fine' ? 1400 : 900;
  for (let i = 0; i < n; i++) {
    const v = Math.floor(rnd() * 110 + 73);
    x.fillStyle = `rgb(${v},${v},${v})`;
    const px = rnd() * S;
    const py = rnd() * S;
    if (kind === 'fine') x.fillRect(px, py, 1 + Math.floor(rnd() * 2), 1 + Math.floor(rnd() * 2));
    else if (kind === 'blades') {
      x.fillRect(px, py, 1, 2 + Math.floor(rnd() * 4));
    } else x.fillRect(px, py, 2 + Math.floor(rnd() * 3), 1);
  }
  // soften a touch so it reads as texture, not pixels
  const s = document.createElement('canvas');
  s.width = S;
  s.height = S;
  const sx = s.getContext('2d')!;
  sx.filter = 'blur(0.5px)';
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) sx.drawImage(c, dx, dy);
  GRAIN.set(kind, s);
  return s;
}
// Overlay grain on a rect. `scrollY` moves the texture with the world; `size` is the tile size in
// logical px (smaller = finer).
export function grain(x: Ctx, px: number, py: number, w: number, h: number, a = 0.35, kind: 'fine' | 'blades' | 'fibre' = 'fine', scrollX = 0, scrollY = 0, size = 32): void {
  const tile = grainTile(kind);
  const pat = x.createPattern(tile, 'repeat');
  if (!pat) return;
  const k = size / tile.width;
  pat.setTransform(new DOMMatrix([k, 0, 0, k, scrollX % size, scrollY % size]));
  x.save();
  x.globalCompositeOperation = 'overlay';
  x.globalAlpha = a;
  x.fillStyle = pat;
  x.fillRect(px, py, w, h);
  x.restore();
}

// ---------- light maps ----------
// Soft multiply lighting without per-pixel CPU work: an ambient fill plus additive light shapes on a
// small canvas, laid over the scene with 'multiply' (bilinear-scaled, so it is smooth). Values above 1
// can't come from multiply, so each light also gets an additive glow on the scene (see glow()).
export class LightMap {
  readonly c: HTMLCanvasElement;
  readonly x: Ctx;
  readonly w: number;
  readonly h: number;
  readonly res: number;
  constructor(w: number, h: number, res = 0.5) {
    this.w = w;
    this.h = h;
    this.res = res;
    this.c = document.createElement('canvas');
    this.c.width = Math.max(1, Math.round(w * res));
    this.c.height = Math.max(1, Math.round(h * res));
    this.x = this.c.getContext('2d')!;
  }
  begin(ambient: string): Ctx {
    const x = this.x;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    x.fillStyle = ambient;
    x.fillRect(0, 0, this.c.width, this.c.height);
    x.setTransform(this.res, 0, 0, this.res, 0, 0);
    x.globalCompositeOperation = 'lighter';
    return x;
  }
  // radial light (ry for an elliptical floor pool)
  light(cx: number, cy: number, r: number, color: string, a = 1, ry = r): void {
    const x = this.x;
    x.save();
    x.translate(cx, cy);
    x.scale(1, ry / r);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(0.5, rgba(color, a * 0.5));
    g.addColorStop(1, rgba(color, 0));
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, r, 0, Math.PI * 2);
    x.fill();
    x.restore();
  }
  // a cone (flashlight, headlight) from (cx,cy) toward angle `ang`, half-angle `spread`
  cone(cx: number, cy: number, ang: number, spread: number, len: number, color: string, a = 1): void {
    const x = this.x;
    x.save();
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, len);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(0.6, rgba(color, a * 0.55));
    g.addColorStop(1, rgba(color, 0));
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(cx, cy);
    x.arc(cx, cy, len, ang - spread, ang + spread);
    x.closePath();
    x.fill();
    x.restore();
  }
  // lay it over the scene (call with the scene's logical transform active)
  apply(scene: Ctx, px = 0, py = 0): void {
    scene.save();
    scene.globalCompositeOperation = 'multiply';
    scene.imageSmoothingEnabled = true;
    scene.drawImage(this.c, px, py, this.w, this.h);
    scene.restore();
  }
}

// ---------- pixel sprite -> rounded, lit HD sprite ----------
// Scale3x (edge-directed, so diagonals and curves come out round instead of stair-stepped), then a
// soft volume pass: light from the top-left, shade toward the bottom-right, and a faint rim light,
// all clipped to the sprite. Runs once per source sprite (cached), never per frame.
const HD_SPRITES = new WeakMap<CanvasImageSource, Map<string, HTMLCanvasElement>>();

function scale3x(src: HTMLCanvasElement): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const out = document.createElement('canvas');
  out.width = w * 3;
  out.height = h * 3;
  const sx = src.getContext('2d');
  const ox = out.getContext('2d');
  if (!sx || !ox || w === 0 || h === 0) return out;
  const I = new Uint32Array(sx.getImageData(0, 0, w, h).data.buffer);
  const od = ox.createImageData(w * 3, h * 3);
  const O = new Uint32Array(od.data.buffer);
  const at = (i: number, j: number): number => I[Math.min(h - 1, Math.max(0, j)) * w + Math.min(w - 1, Math.max(0, i))];
  const W3 = w * 3;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const A = at(i - 1, j - 1);
      const B = at(i, j - 1);
      const C = at(i + 1, j - 1);
      const D = at(i - 1, j);
      const E = at(i, j);
      const F = at(i + 1, j);
      const G = at(i - 1, j + 1);
      const H = at(i, j + 1);
      const Ii = at(i + 1, j + 1);
      let e0 = E, e1 = E, e2 = E, e3 = E, e5 = E, e6 = E, e7 = E, e8 = E;
      if (B !== H && D !== F) {
        e0 = D === B ? D : E;
        e1 = (D === B && E !== C) || (B === F && E !== A) ? B : E;
        e2 = B === F ? F : E;
        e3 = (D === B && E !== G) || (D === H && E !== A) ? D : E;
        e5 = (B === F && E !== Ii) || (H === F && E !== C) ? F : E;
        e6 = D === H ? D : E;
        e7 = (D === H && E !== Ii) || (H === F && E !== G) ? H : E;
        e8 = H === F ? F : E;
      }
      const o = j * 3 * W3 + i * 3;
      O[o] = e0;
      O[o + 1] = e1;
      O[o + 2] = e2;
      O[o + W3] = e3;
      O[o + W3 + 1] = E;
      O[o + W3 + 2] = e5;
      O[o + 2 * W3] = e6;
      O[o + 2 * W3 + 1] = e7;
      O[o + 2 * W3 + 2] = e8;
    }
  ox.putImageData(od, 0, 0);
  return out;
}

export interface HdSpriteOpts {
  light?: number; // 0..1 highlight strength (default 0.22)
  shadow?: number; // 0..1 core shadow strength (default 0.3)
  rim?: string | null; // rim light colour (bottom-right edge), null = none
  lx?: number; // light centre in sprite-relative 0..1 (default 0.3, 0.2)
  ly?: number;
}

// Returns a 3x sprite to draw with drawImage(img, x, y, src.width, src.height) under an HD transform.
export function hdSprite(src: HTMLCanvasElement, o: HdSpriteOpts = {}): HTMLCanvasElement {
  const key = `${o.light ?? ''}|${o.shadow ?? ''}|${o.rim ?? ''}|${o.lx ?? ''}|${o.ly ?? ''}`;
  let m = HD_SPRITES.get(src);
  if (!m) {
    m = new Map();
    HD_SPRITES.set(src, m);
  }
  let c = m.get(key);
  if (c) return c;
  c = scale3x(src);
  const x = c.getContext('2d');
  if (x) {
    const w = c.width;
    const h = c.height;
    const lx = (o.lx ?? 0.3) * w;
    const ly = (o.ly ?? 0.2) * h;
    const R = Math.hypot(w, h) * 0.75;
    x.globalCompositeOperation = 'source-atop';
    const g = x.createRadialGradient(lx, ly, 0, lx, ly, R);
    g.addColorStop(0, `rgba(255,250,235,${(o.light ?? 0.22).toFixed(3)})`);
    g.addColorStop(0.35, 'rgba(255,250,235,0)');
    g.addColorStop(0.62, 'rgba(20,10,40,0)');
    g.addColorStop(1, `rgba(20,10,40,${(o.shadow ?? 0.3).toFixed(3)})`);
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    if (o.rim) {
      // rim: the sprite's own silhouette, offset up-left, cut away -> a thin lit edge at bottom-right
      const t = document.createElement('canvas');
      t.width = w;
      t.height = h;
      const tx = t.getContext('2d');
      if (tx) {
        tx.fillStyle = o.rim;
        tx.fillRect(0, 0, w, h);
        tx.globalCompositeOperation = 'destination-in';
        tx.drawImage(c, 0, 0);
        tx.globalCompositeOperation = 'destination-out';
        tx.drawImage(c, -2, -2);
        x.globalCompositeOperation = 'source-atop';
        x.globalAlpha = 0.55;
        x.drawImage(t, 0, 0);
        x.globalAlpha = 1;
      }
    }
    x.globalCompositeOperation = 'source-over';
  }
  m.set(key, c);
  return c;
}

// Stable small ids for objects (people, looks) so they can key sprite caches cheaply.
const IDS = new WeakMap<object, number>();
let nextId = 1;
export function idOf(o: object): number {
  let v = IDS.get(o);
  if (!v) {
    v = nextId++;
    IDS.set(o, v);
  }
  return v;
}

// A 1x pixel sprite rendered once by `draw` (e.g. a pose of drawPerson) and cached by key, so it can
// go through hdSprite. Keep keys discrete (pose, frame, facing), never continuous values.
const SPR = new Map<string, HTMLCanvasElement>();
export function spriteOf(key: string, w: number, h: number, draw: (x: Ctx) => void): HTMLCanvasElement {
  let c = SPR.get(key);
  if (c) return c;
  if (SPR.size > 600) SPR.clear();
  c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  draw(x);
  SPR.set(key, c);
  return c;
}

// Draw a pixel sprite through hdSprite at logical position (px,py), optionally mirrored.
export function drawHd(x: Ctx, src: HTMLCanvasElement, px: number, py: number, flip = false, o?: HdSpriteOpts): void {
  const img = hdSprite(src, o);
  if (!flip) {
    x.drawImage(img, px, py, src.width, src.height);
    return;
  }
  x.save();
  x.translate(px + src.width, py);
  x.scale(-1, 1);
  x.drawImage(img, 0, 0, src.width, src.height);
  x.restore();
}
