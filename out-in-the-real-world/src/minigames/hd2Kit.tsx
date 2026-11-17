// HD render helpers for the action mini-games: a high-res canvas that keeps logical coordinates,
// smooth shading (gradients, rounded volumetric shapes, soft shadows, light pools, fog), a pixel-art
// smoother for legacy sprites (Scale2x twice + form shading), smooth lettering, and an HD particle pass.
// Everything here is visual only: game logic keeps drawing in the same logical units as before.
import type { RefObject } from 'react';
import type { Ctx } from '../art/px.ts';

// Cache layers and sprites are always rendered at this scale; the live canvas uses it too.
export const HD = 4;

// ---------- canvas ----------
// Drop-in for kit's PixelCanvas: same logical size and pointer mapping, a HD-times backing store,
// and smooth (not pixelated) upscaling so the image reads soft and filtered, not blocky.
export function Hd2Canvas({ canvasRef, width = 192, height = 108, onPointer, className = '' }: { canvasRef: RefObject<HTMLCanvasElement | null>; width?: number; height?: number; onPointer?: (x: number, y: number, kind: 'down' | 'move' | 'up') => void; className?: string }) {
  const s = scaleFor(width);
  const toLogical = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * width, ((e.clientY - r.top) / r.height) * height];
  };
  return (
    <canvas
      ref={canvasRef}
      className={`mini-canvas hd2-canvas ${className}`}
      width={width * s}
      height={height * s}
      data-lw={width}
      style={{ aspectRatio: `${width} / ${height}`, imageRendering: 'auto' }}
      onPointerDown={onPointer ? (e) => { e.currentTarget.setPointerCapture(e.pointerId); onPointer(...toLogical(e), 'down'); } : undefined}
      onPointerMove={onPointer ? (e) => onPointer(...toLogical(e), 'move') : undefined}
      onPointerUp={onPointer ? (e) => onPointer(...toLogical(e), 'up') : undefined}
    />
  );
}

// Backing-store scale for a logical width: HD, but keep very wide canvases under ~1100 device px.
export function scaleFor(w: number): number {
  return Math.max(2, Math.min(HD, Math.floor(1100 / w)));
}

// The 2D context for an Hd2Canvas, with the transform reset so logical coordinates map to the
// backing store. Pixel sprites stay crisp unless a helper turns smoothing on.
export function hdCtx(c: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  const x = c?.getContext('2d') ?? null;
  if (!x || !c) return null;
  const lw = Number(c.dataset.lw) || 192;
  const s = c.width / lw;
  x.setTransform(s, 0, 0, s, 0, 0);
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
  x.imageSmoothingEnabled = false;
  return x;
}

// ---------- cached layers ----------
const LAYERS = new Map<string, HTMLCanvasElement>();
// An offscreen layer at HD scale, drawn in logical coordinates. Draw it back with blit().
export function layer(key: string, w: number, h: number, draw: (x: Ctx) => void): HTMLCanvasElement {
  let c = LAYERS.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = Math.ceil(w * HD);
    c.height = Math.ceil(h * HD);
    const x = c.getContext('2d');
    if (x) {
      x.setTransform(HD, 0, 0, HD, 0, 0);
      x.imageSmoothingEnabled = true;
      draw(x);
    }
    LAYERS.set(key, c);
  }
  return c;
}
export function blit(x: Ctx, c: HTMLCanvasElement, lx: number, ly: number, lw = c.width / HD, lh = c.height / HD): void {
  const sm = x.imageSmoothingEnabled;
  x.imageSmoothingEnabled = true;
  x.drawImage(c, lx, ly, lw, lh);
  x.imageSmoothingEnabled = sm;
}

// ---------- color ----------
export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
export function tint(hex: string, f: number): string {
  const [r, g, b] = rgb(hex);
  const c = (v: number): string => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
export function blend(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  const c = (i: number): string => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0');
  return `#${c(0)}${c(1)}${c(2)}`;
}

// ---------- gradients & shapes ----------
export function lin(x: Ctx, x0: number, y0: number, x1: number, y1: number, stops: (string | [number, string])[]): CanvasGradient {
  const g = x.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((s, i) => (Array.isArray(s) ? g.addColorStop(s[0], s[1]) : g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), s)));
  return g;
}
export function rad(x: Ctx, cx: number, cy: number, r0: number, r1: number, stops: (string | [number, string])[], fx = cx, fy = cy): CanvasGradient {
  const g = x.createRadialGradient(fx, fy, r0, cx, cy, r1);
  stops.forEach((s, i) => (Array.isArray(s) ? g.addColorStop(s[0], s[1]) : g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), s)));
  return g;
}
// Vertical gradient fill of a rect.
export function vfill(x: Ctx, px: number, py: number, w: number, h: number, stops: (string | [number, string])[]): void {
  x.fillStyle = lin(x, 0, py, 0, py + h, stops);
  x.fillRect(px, py, w, h);
}
export function hfill(x: Ctx, px: number, py: number, w: number, h: number, stops: (string | [number, string])[]): void {
  x.fillStyle = lin(x, px, 0, px + w, 0, stops);
  x.fillRect(px, py, w, h);
}
export function rr(x: Ctx, px: number, py: number, w: number, h: number, r: number): void {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  x.beginPath();
  x.moveTo(px + q, py);
  x.arcTo(px + w, py, px + w, py + h, q);
  x.arcTo(px + w, py + h, px, py + h, q);
  x.arcTo(px, py + h, px, py, q);
  x.arcTo(px, py, px + w, py, q);
  x.closePath();
}
export function ell(x: Ctx, cx: number, cy: number, rx: number, ry: number): void {
  x.beginPath();
  x.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, Math.PI * 2);
}

// A smooth-shaded box with rounded corners: lit from the top-left, a specular top edge, a soft
// darker base and a thin dark outline. The workhorse for crates, books, cards and panels.
export function sbox(x: Ctx, px: number, py: number, w: number, h: number, base: string, o: { r?: number; outline?: string | null; gloss?: number; vert?: boolean; lw?: number } = {}): void {
  const r = o.r ?? Math.min(2, w / 4, h / 4);
  rr(x, px, py, w, h, r);
  x.fillStyle = o.vert === false ? lin(x, px, py, px + w, py + h, [tint(base, 1.22), base, tint(base, 0.62)]) : lin(x, px, py, px, py + h, [[0, tint(base, 1.25)], [0.45, base], [1, tint(base, 0.6)]]);
  x.fill();
  // side falloff
  x.fillStyle = lin(x, px, 0, px + w, 0, [[0, 'rgba(255,255,255,0.10)'], [0.35, 'rgba(255,255,255,0)'], [0.8, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.22)']]);
  x.fill();
  const gl = o.gloss ?? 0.35;
  if (gl > 0) {
    x.save();
    x.clip();
    x.fillStyle = lin(x, 0, py, 0, py + h * 0.5, [`rgba(255,255,255,${gl})`, 'rgba(255,255,255,0)']);
    x.fillRect(px, py, w, h * 0.5);
    x.restore();
  }
  if (o.outline !== null) {
    x.lineWidth = o.lw ?? 0.5;
    x.strokeStyle = o.outline ?? 'rgba(20,12,30,0.75)';
    rr(x, px + 0.25, py + 0.25, w - 0.5, h - 0.5, r);
    x.stroke();
  }
}

// A sphere-ish blob (fruit, heads, knobs): radial body, specular dot, dark terminator.
export function ball(x: Ctx, cx: number, cy: number, rx: number, base: string, ry = rx, spec = 0.7): void {
  ell(x, cx, cy, rx, ry);
  x.fillStyle = rad(x, cx - rx * 0.35, cy - ry * 0.4, 0, Math.max(rx, ry) * 1.35, [[0, tint(base, 1.35)], [0.45, base], [1, tint(base, 0.45)]]);
  x.fill();
  if (spec > 0) {
    ell(x, cx - rx * 0.38, cy - ry * 0.42, rx * 0.32, ry * 0.24);
    x.fillStyle = rad(x, cx - rx * 0.38, cy - ry * 0.42, 0, Math.max(rx, ry) * 0.35, [`rgba(255,255,255,${spec})`, 'rgba(255,255,255,0)']);
    x.fill();
  }
}

// A vertical cylinder (cans, jugs, poles): horizontal shading band with a specular stripe.
export function cyl(x: Ctx, px: number, py: number, w: number, h: number, base: string, o: { cap?: string; spec?: number } = {}): void {
  x.fillStyle = lin(x, px, 0, px + w, 0, [[0, tint(base, 0.55)], [0.22, tint(base, 1.2)], [0.32, tint(base, 1.4)], [0.55, base], [1, tint(base, 0.45)]]);
  x.fillRect(px, py, w, h);
  const sp = o.spec ?? 0.55;
  if (sp > 0) {
    x.fillStyle = `rgba(255,255,255,${sp})`;
    x.fillRect(px + w * 0.24, py + 0.5, Math.max(0.4, w * 0.08), h - 1);
  }
  if (o.cap) {
    ell(x, px + w / 2, py, w / 2, Math.max(0.6, w * 0.16));
    x.fillStyle = lin(x, px, py - 1, px + w, py + 1, [tint(o.cap, 1.25), tint(o.cap, 0.7)]);
    x.fill();
  }
}

// ---------- light ----------
// Additive light pool (lamps, fluorescents, screens). Elliptical.
export function pool(x: Ctx, cx: number, cy: number, rx: number, ry: number, color: string, a: number, mode: GlobalCompositeOperation = 'lighter'): void {
  if (a <= 0) return;
  x.save();
  x.globalCompositeOperation = mode;
  x.translate(cx, cy);
  x.scale(1, ry / rx);
  x.fillStyle = rad(x, 0, 0, 0, rx, [[0, rgba(color, a)], [0.4, rgba(color, a * 0.45)], [1, rgba(color, 0)]]);
  x.fillRect(-rx, -rx, rx * 2, rx * 2);
  x.restore();
}
// Soft contact shadow under an object.
export function shadow(x: Ctx, cx: number, cy: number, rx: number, ry: number, a = 0.35, color = '#140a1e'): void {
  x.save();
  x.translate(cx, cy);
  x.scale(1, ry / rx);
  x.fillStyle = rad(x, 0, 0, 0, rx, [[0, rgba(color, a)], [0.55, rgba(color, a * 0.6)], [1, rgba(color, 0)]]);
  x.fillRect(-rx, -rx, rx * 2, rx * 2);
  x.restore();
}
// A light shaft: a quad from a narrow top to a wide bottom, fading downward. Additive.
export function beam(x: Ctx, tx0: number, tx1: number, ty: number, bx0: number, bx1: number, by: number, color: string, a: number): void {
  if (a <= 0) return;
  x.save();
  x.globalCompositeOperation = 'lighter';
  x.beginPath();
  x.moveTo(tx0, ty);
  x.lineTo(tx1, ty);
  x.lineTo(bx1, by);
  x.lineTo(bx0, by);
  x.closePath();
  x.fillStyle = lin(x, 0, ty, 0, by, [[0, rgba(color, a)], [0.6, rgba(color, a * 0.35)], [1, rgba(color, 0)]]);
  x.fill();
  x.restore();
}
// Horizontal haze band (distance fog, steam, dust in the air).
export function haze(x: Ctx, px: number, y0: number, w: number, y1: number, color: string, aTop: number, aBot: number): void {
  x.fillStyle = lin(x, 0, y0, 0, y1, [rgba(color, aTop), rgba(color, aBot)]);
  x.fillRect(px, y0, w, y1 - y0);
}
// Smooth radial vignette, pre-rendered once per size/strength.
export function vignette2(x: Ctx, w: number, h: number, strength = 0.45, color = '#120a1e'): void {
  const c = layer(`vig|${w}|${h}|${strength}|${color}`, w, h, (g) => {
    g.save();
    g.translate(w / 2, h / 2);
    g.scale(1, h / w);
    g.fillStyle = rad(g, 0, 0, w * 0.32, w * 0.75, [[0, rgba(color, 0)], [0.55, rgba(color, strength * 0.45)], [1, rgba(color, strength)]]);
    g.fillRect(-w, -w, w * 2, w * 2);
    g.restore();
  });
  blit(x, c, 0, 0, w, h);
}
// A soft diagonal glass sheen (screens, windows, glass doors).
export function glare(x: Ctx, px: number, py: number, w: number, h: number, a = 0.18): void {
  x.save();
  x.beginPath();
  x.rect(px, py, w, h);
  x.clip();
  x.globalCompositeOperation = 'lighter';
  x.fillStyle = lin(x, px, py, px + w, py + h, [[0, `rgba(255,255,255,${a})`], [0.32, `rgba(255,255,255,${a * 0.5})`], [0.33, 'rgba(255,255,255,0)'], [0.52, 'rgba(255,255,255,0)'], [0.53, `rgba(255,255,255,${a * 0.35})`], [0.62, 'rgba(255,255,255,0)']]);
  x.fillRect(px, py, w, h);
  x.restore();
}

// ---------- smooth lettering ----------
export const FONT = '"Trebuchet MS", "Arial Rounded MT Bold", "Segoe UI", system-ui, sans-serif';
// Big rounded gradient lettering with a thick outline and drop shadow (count-ins, banners).
export function bigWord(x: Ctx, s: string, cx: number, cy: number, size: number, top: string, bot: string, outline = '#1c1424'): void {
  x.save();
  x.font = `900 ${size}px ${FONT}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  x.fillStyle = 'rgba(10,4,20,0.45)';
  x.fillText(s, cx + size * 0.06, cy + size * 0.1);
  x.lineWidth = Math.max(1, size * 0.2);
  x.strokeStyle = outline;
  x.strokeText(s, cx, cy);
  x.fillStyle = lin(x, 0, cy - size * 0.45, 0, cy + size * 0.45, [[0, tint(top, 1.25)], [0.45, top], [0.55, bot], [1, tint(bot, 0.75)]]);
  x.fillText(s, cx, cy);
  x.globalCompositeOperation = 'lighter';
  x.fillStyle = lin(x, 0, cy - size * 0.45, 0, cy, ['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']);
  x.fillText(s, cx, cy);
  x.restore();
}
// Small readable label with an outline (pop-ups, signs). Returns its width.
export function label(x: Ctx, s: string, cx: number, cy: number, size: number, fill: string, outline: string | null = '#1c1424', align: CanvasTextAlign = 'center', weight = 800): number {
  x.save();
  x.font = `${weight} ${size}px ${FONT}`;
  x.textAlign = align;
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  if (outline) {
    x.lineWidth = Math.max(0.6, size * 0.28);
    x.strokeStyle = outline;
    x.strokeText(s, cx, cy);
  }
  x.fillStyle = fill;
  x.fillText(s, cx, cy);
  const w = x.measureText(s).width;
  x.restore();
  return w;
}

// ---------- the start count-in & end banner (HD) ----------
export function hdCount(x: Ctx, lab: string | null, local: number, w = 192, h = 108): void {
  if (!lab) return;
  const go = lab === 'GO!';
  if (!go) {
    x.fillStyle = 'rgba(16,10,28,0.32)';
    x.fillRect(0, 0, w, h);
  }
  const k = Math.min(1, local / 0.12);
  const sz = (go ? 34 : 44) * (1.25 - 0.25 * k);
  bigWord(x, lab, w / 2, h / 2 - 3, sz, go ? '#9cff8a' : '#ffe27a', go ? '#2ea84a' : '#ff9a2a');
}
export function hdBanner(x: Ctx, head: string, sub: string, good: boolean, t: number, w = 192, h = 108): void {
  const k = Math.min(1, t / 0.18);
  const bh = 36 * k;
  const y0 = h / 2 - bh / 2 - 4;
  x.fillStyle = lin(x, 0, y0, 0, y0 + bh, ['rgba(30,18,52,0.92)', 'rgba(14,8,26,0.92)']);
  x.fillRect(0, y0, w, bh);
  const c = good ? '#7cf08a' : '#ff7a5a';
  x.fillStyle = lin(x, 0, 0, w, 0, [rgba(c, 0), rgba(c, 1), rgba(c, 0)]);
  x.fillRect(0, y0, w, 0.8);
  x.fillRect(0, y0 + bh - 0.8, w, 0.8);
  if (k < 1) return;
  bigWord(x, head, w / 2, y0 + 13, 15, good ? '#fff0a0' : '#ffb09a', good ? '#ffb02a' : '#e0503c');
  label(x, sub, w / 2, y0 + 27, 6.5, '#f4eedd', null, 'center', 700);
}

// ---------- HD particles for the shared Fx ----------
interface FxLike {
  parts: { x: number; y: number; life: number; max: number; c: string; s: number }[];
  pops: { x: number; y: number; s: string; c: string; life: number }[];
  flash: number;
  flashC: string;
}
export function hdFx(x: Ctx, fx: FxLike, w = 192, h = 108): void {
  x.save();
  x.globalCompositeOperation = 'lighter';
  for (const p of fx.parts) {
    const a = Math.min(1, (p.life / p.max) * 1.6);
    const r = p.s * 1.6;
    x.fillStyle = rad(x, p.x, p.y, 0, r * 1.6, [[0, rgba(p.c, 0.55 * a)], [1, rgba(p.c, 0)]]);
    x.fillRect(p.x - r * 1.6, p.y - r * 1.6, r * 3.2, r * 3.2);
  }
  x.restore();
  for (const p of fx.parts) {
    const a = Math.min(1, (p.life / p.max) * 1.6);
    x.globalAlpha = a;
    ell(x, p.x, p.y, p.s * 0.6, p.s * 0.6);
    x.fillStyle = p.c;
    x.fill();
  }
  x.globalAlpha = 1;
  for (const p of fx.pops) {
    const a = Math.min(1, p.life / 0.25);
    x.globalAlpha = a;
    const sc = p.life > 0.75 ? 1 + (p.life - 0.75) * 1.6 : 1;
    x.save();
    x.font = `900 ${7 * sc}px ${FONT}`;
    const tw = x.measureText(p.s).width;
    x.restore();
    const cx = Math.max(tw / 2 + 1, Math.min(w - tw / 2 - 1, p.x));
    label(x, p.s, cx, p.y + 2.5, 7 * sc, p.c, '#1c1424', 'center', 900);
    x.globalAlpha = 1;
  }
  if (fx.flash > 0) {
    x.globalAlpha = Math.min(0.6, fx.flash);
    x.fillStyle = rad(x, w / 2, h / 2, w * 0.1, w * 0.7, [rgba(fx.flashC, 0.2), rgba(fx.flashC, 1)]);
    x.fillRect(0, 0, w, h);
    x.globalAlpha = 1;
  }
}

// Floating dust/pollen specks, smooth and soft-edged.
export function motes2(x: Ctx, t: number, box: { x: number; y: number; w: number; h: number }, n: number, color: string, drift = 4, rise = -3, size = 0.7): void {
  x.save();
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const r1 = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    const r2 = Math.abs(Math.sin(i * 78.233) * 12543.123) % 1;
    const sp = 0.5 + r2;
    const px = box.x + ((((r1 * box.w + t * drift * sp + Math.sin(t * 0.8 + i) * 3) % box.w) + box.w) % box.w);
    const py = box.y + ((((r2 * box.h + t * rise * sp) % box.h) + box.h) % box.h);
    const tw = (Math.sin(t * 2 + i * 1.7) + 1) / 2;
    const r = size * (0.7 + r1 * 0.8);
    x.fillStyle = rad(x, px, py, 0, r * 2, [rgba(color, 0.15 + tw * 0.45), rgba(color, 0)]);
    x.fillRect(px - r * 2, py - r * 2, r * 4, r * 4);
  }
  x.restore();
}

// ---------- pixel-art smoother ----------
// Scale2x (EPX) on raw RGBA: rounds staircase edges into smooth diagonals without blurring.
function scale2x(src: Uint32Array, w: number, h: number): Uint32Array {
  const out = new Uint32Array(w * 2 * h * 2);
  const W2 = w * 2;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const P = src[j * w + i];
      const A = j > 0 ? src[(j - 1) * w + i] : P;
      const D = j < h - 1 ? src[(j + 1) * w + i] : P;
      const C = i > 0 ? src[j * w + i - 1] : P;
      const B = i < w - 1 ? src[j * w + i + 1] : P;
      let e0 = P;
      let e1 = P;
      let e2 = P;
      let e3 = P;
      if (A !== D && C !== B) {
        if (C === A) e0 = A;
        if (A === B) e1 = B;
        if (C === D) e2 = C;
        if (D === B) e3 = B;
      }
      const o = j * 2 * W2 + i * 2;
      out[o] = e0;
      out[o + 1] = e1;
      out[o + W2] = e2;
      out[o + W2 + 1] = e3;
    }
  return out;
}

// Re-renders a low-res pixel painting into dst at 2x with Scale2x, so a shared pixel backdrop can be
// drawn back with bilinear filtering: rounded edges and a soft, texture-filtered look. Cheap enough
// to run when the source repaints (a few times a second), not meant for every frame.
export function smoothUp(src: HTMLCanvasElement, dst: HTMLCanvasElement): void {
  const w = src.width;
  const h = src.height;
  if (dst.width !== w * 2) dst.width = w * 2;
  if (dst.height !== h * 2) dst.height = h * 2;
  const sx = src.getContext('2d', { willReadFrequently: true });
  const dx = dst.getContext('2d');
  if (!sx || !dx) return;
  const img = sx.getImageData(0, 0, w, h);
  const up = scale2x(new Uint32Array(img.data.buffer), w, h);
  const out = dx.createImageData(w * 2, h * 2);
  out.data.set(new Uint8ClampedArray(up.buffer));
  dx.putImageData(out, 0, 0);
}

export type SpriteShade ='body' | 'ball' | 'box' | 'flat' | 'cyl';
interface SpriteOpts {
  shade?: SpriteShade;
  pad?: number;
  // sprite-local sphere highlight (e.g. a head), in logical px from the sprite's top-left
  head?: [number, number, number];
}
const SPRITES = new Map<string, HTMLCanvasElement>();
// Renders pixel art (drawn at 1x in sprite-local coordinates) into a smoothed, form-shaded HD
// sprite. Cached by key. Draw it back with drawSprite at the same logical top-left.
export function smoothSprite(key: string, w: number, h: number, draw: (x: Ctx) => void, o: SpriteOpts = {}): HTMLCanvasElement {
  let c = SPRITES.get(key);
  if (c) return c;
  if (SPRITES.size > 600) SPRITES.clear();
  const pad = o.pad ?? 2;
  const W = w + pad * 2;
  const H = h + pad * 2;
  const s = document.createElement('canvas');
  s.width = W;
  s.height = H;
  const sx = s.getContext('2d', { willReadFrequently: true });
  c = document.createElement('canvas');
  c.width = W * 4;
  c.height = H * 4;
  const cx = c.getContext('2d');
  if (!sx || !cx) return c;
  sx.imageSmoothingEnabled = false;
  sx.translate(pad, pad);
  draw(sx);
  const img = sx.getImageData(0, 0, W, H);
  const up = scale2x(scale2x(new Uint32Array(img.data.buffer), W, H), W * 2, H * 2);
  const out = cx.createImageData(W * 4, H * 4);
  out.data.set(new Uint8ClampedArray(up.buffer));
  cx.putImageData(out, 0, 0);
  // form shading, only where the sprite has paint
  cx.setTransform(4, 0, 0, 4, pad * 4, pad * 4);
  cx.globalCompositeOperation = 'source-atop';
  const sh = o.shade ?? 'box';
  if (sh === 'body' || sh === 'cyl') {
    cx.fillStyle = lin(cx, 0, 0, w, 0, [[0, 'rgba(0,0,0,0.22)'], [0.18, 'rgba(255,255,255,0.10)'], [0.36, 'rgba(255,255,255,0.16)'], [0.62, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.32)']]);
    cx.fillRect(-pad, -pad, W, H);
    cx.fillStyle = lin(cx, 0, 0, 0, h, [[0, 'rgba(255,240,220,0.10)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(10,0,30,0.22)']]);
    cx.fillRect(-pad, -pad, W, H);
  } else if (sh === 'ball') {
    cx.fillStyle = rad(cx, w * 0.36, h * 0.3, 0, Math.max(w, h) * 0.85, [[0, 'rgba(255,255,255,0.32)'], [0.35, 'rgba(255,255,255,0.05)'], [0.7, 'rgba(0,0,0,0.08)'], [1, 'rgba(0,0,0,0.38)']]);
    cx.fillRect(-pad, -pad, W, H);
  } else if (sh === 'box') {
    cx.fillStyle = lin(cx, 0, 0, w, h, [[0, 'rgba(255,255,255,0.22)'], [0.45, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.3)']]);
    cx.fillRect(-pad, -pad, W, H);
  }
  if (o.head) {
    const [hx, hy, hr] = o.head;
    cx.fillStyle = rad(cx, hx - hr * 0.3, hy - hr * 0.35, 0, hr * 1.3, [[0, 'rgba(255,250,240,0.26)'], [0.5, 'rgba(255,255,255,0.04)'], [1, 'rgba(0,0,0,0.16)']]);
    cx.fillRect(hx - hr * 1.6, hy - hr * 1.6, hr * 3.2, hr * 3.2);
  }
  cx.globalCompositeOperation = 'source-over';
  SPRITES.set(key, c);
  return c;
}
// Draws a smoothSprite whose sprite-local origin lands at logical (px, py).
export function drawSprite(x: Ctx, c: HTMLCanvasElement, px: number, py: number, pad = 2, alpha = 1): void {
  const sm = x.imageSmoothingEnabled;
  x.imageSmoothingEnabled = true;
  if (alpha !== 1) x.globalAlpha = alpha;
  x.drawImage(c, px - pad, py - pad, c.width / 4, c.height / 4);
  if (alpha !== 1) x.globalAlpha = 1;
  x.imageSmoothingEnabled = sm;
}

// Smooth stand-ins for the 3x5 pixel font helpers, positioned the same way (top-left / centered
// at the pixel font's top line), a touch larger so they stay readable on phones.
export function otext(x: Ctx, s: string, px: number, py: number, c: string, size = 6.2): number {
  return label(x, s, px, py + 2.6, size, c, '#1c1424', 'left', 900);
}
export function ctext(x: Ctx, s: string, cx: number, py: number, c: string, outline = true, size = 6.2): number {
  return label(x, s, cx, py + 2.6, size, c, outline ? '#1c1424' : null, 'center', outline ? 900 : 800);
}
// Smooth text with no outline, top-left anchored like the pixel font (signs, labels on objects).
export function ptext(x: Ctx, s: string, px: number, py: number, c: string, size = 5.6, weight = 800): number {
  return label(x, s, px, py + 2.5, size, c, null, 'left', weight);
}
