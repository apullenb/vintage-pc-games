// HD dialogue portraits: big smooth-shaded busts built from the same Person data
// as the in-scene figures (same head, hair, hats and glasses code, at bust scale),
// with the five expressions, talk frames, blinks and gaze.
import type { Person } from '../people.ts';
import type { PortraitFrame } from '../portraits.ts';
import { drawHairBack, drawHead } from './head.ts';
import { canvas, ell, fillRR, hash, lgrad, mix, poly, rgba, rgrad, seg, shade, type Ctx } from './kit.ts';

export const PHD = 192; // portrait canvas size
const K = 7.4; // head units -> pixels
const HX = PHD / 2;
const HY = 90;

const edge = (c: string): string => rgba(shade(c, 0.4), 0.85);

function bust(x: Ctx, p: Person, look: number): void {
  const top = p.hood ?? p.shirt;
  const lean = look * 0.4;
  // neck
  fillRR(x, -1.8 + lean * 0.3, 3.5, 3.6, 8, 1.2, lgrad(x, -1.8, 0, 1.8, 0, [[0, shade(p.skin, 0.86)], [1, shade(p.skin, 0.62)]]));
  ell(x, lean * 0.3, 5.6, 2.2, 1.6, rgba(shade(p.skin, 0.4), 0.35));
  // hood bunched behind the neck
  if (p.hood) {
    x.beginPath();
    x.ellipse(lean, 10.6, 7.4, 3.4, 0, Math.PI, Math.PI * 2);
    x.fillStyle = lgrad(x, 0, 7, 0, 11, [[0, shade(p.hood, 1.12)], [1, shade(p.hood, 0.72)]]);
    x.fill();
  }
  // shoulders & torso
  const torso = (): void => {
    x.beginPath();
    x.moveTo(-13.5 + lean, 22);
    x.bezierCurveTo(-13.5 + lean, 14.5, -11.5 + lean, 10.6, -6 + lean, 10.2);
    x.lineTo(6 + lean, 10.2);
    x.bezierCurveTo(11.5 + lean, 10.6, 13.5 + lean, 14.5, 13.5 + lean, 22);
    x.closePath();
  };
  torso();
  x.fillStyle = lgrad(x, -13, 9, 13, 22, [[0, shade(top, 1.2)], [0.45, top], [1, shade(top, 0.62)]]);
  x.fill();
  x.strokeStyle = edge(top);
  x.lineWidth = 0.18;
  x.stroke();
  x.save();
  torso();
  x.clip();
  if (p.plaid) {
    x.fillStyle = rgba(p.plaid, 0.5);
    for (let k = -6; k <= 6; k++) x.fillRect(k * 2.6 - 0.5 + lean, 9, 1, 14);
    for (let k = 0; k < 5; k++) x.fillRect(-14, 11.5 + k * 2.6, 28, 0.8);
  }
  // folds and occlusion
  x.fillStyle = lgrad(x, 0, 10, 0, 22, [[0, 'rgba(255,255,255,0.06)'], [1, 'rgba(10,0,30,0.25)']]);
  x.fillRect(-14, 9, 28, 14);
  x.strokeStyle = rgba(shade(top, 0.5), 0.35);
  x.lineWidth = 0.25;
  x.beginPath();
  x.moveTo(-9 + lean, 13);
  x.quadraticCurveTo(-7 + lean, 17, -8 + lean, 21);
  x.moveTo(8.5 + lean, 13.5);
  x.quadraticCurveTo(7 + lean, 17, 8 + lean, 21);
  x.stroke();
  // vest
  if (p.vest) {
    for (const s of [-1, 1]) {
      x.fillStyle = lgrad(x, s * 3, 0, s * 13, 0, [[0, shade(p.vest, s < 0 ? 1.12 : 0.95)], [1, shade(p.vest, s < 0 ? 0.95 : 0.72)]]);
      poly(x, [s * 3.2 + lean, 10, s * 14 + lean, 10, s * 14 + lean, 23, s * 3.2 + lean, 23], x.fillStyle as CanvasGradient);
      x.fillStyle = lgrad(x, 0, 17, 0, 18.4, [[0, '#ffffff'], [1, '#b8c0cc']]);
      x.fillRect(s < 0 ? -14 + lean : 3.2 + lean, 17, 10.8, 1.4);
    }
  }
  // apron bib
  if (p.apron) {
    seg(x, -3.6 + lean, 14, -2.4 + lean, 10, p.apron, 0.8);
    seg(x, 3.6 + lean, 14, 2.4 + lean, 10, p.apron, 0.8);
    fillRR(x, -5 + lean, 13.6, 10, 12, 1.2, lgrad(x, -5, 0, 5, 0, [[0, shade(p.apron, 1.15)], [1, shade(p.apron, 0.75)]]));
  }
  x.restore();
  // coat panels and lapels
  if (p.coat) {
    const c = p.coat;
    for (const s of [-1, 1]) {
      x.beginPath();
      x.moveTo(s * 2.2 + lean, 10.4);
      x.lineTo(s * 6 + lean, 10.2);
      x.bezierCurveTo(s * 11.5 + lean, 10.6, s * 13.6 + lean, 14.5, s * 13.6 + lean, 22);
      x.lineTo(s * 2.6 + lean, 22);
      x.lineTo(s * 2.2 + lean, 18);
      x.closePath();
      x.fillStyle = lgrad(x, -13, 9, 13, 22, [[0, shade(c, 1.2)], [0.45, c], [1, shade(c, 0.64)]]);
      x.fill();
      x.strokeStyle = edge(c);
      x.lineWidth = 0.18;
      x.stroke();
      poly(x, [s * 2.2 + lean, 10.4, s * 5.4 + lean, 10.6, s * 2.6 + lean, 18.4], shade(c, s < 0 ? 1.15 : 0.82));
    }
  }
  // collar
  if (!p.hood && !p.coat) {
    x.beginPath();
    x.moveTo(-3.2 + lean, 10.2);
    x.quadraticCurveTo(lean, 13.4, 3.2 + lean, 10.2);
    x.strokeStyle = shade(top, 0.7);
    x.lineWidth = 0.6;
    x.stroke();
  }
  if (p.hood) {
    seg(x, -1.5 + lean, 11.4, -1.8 + lean, 18, '#f2efe6', 0.4);
    seg(x, 1.5 + lean, 11.4, 1.8 + lean, 17.4, '#f2efe6', 0.4);
  }
  if (p.tie) {
    poly(x, [-1 + lean, 10.6, 1 + lean, 10.6, 0.7 + lean, 12.2, -0.7 + lean, 12.2], shade(p.tie, 0.8));
    poly(x, [-0.7 + lean, 12.1, 0.7 + lean, 12.1, 1.6 + lean, 22, -1.6 + lean, 22], lgrad(x, -1.6, 0, 1.6, 0, [[0, shade(p.tie, 1.2)], [1, shade(p.tie, 0.72)]]));
  }
  if (p.bowtie) {
    poly(x, [lean, 11.4, -2.8 + lean, 10, -2.8 + lean, 12.8], p.bowtie);
    poly(x, [lean, 11.4, 2.8 + lean, 10, 2.8 + lean, 12.8], shade(p.bowtie, 0.75));
    ell(x, lean, 11.4, 0.7, 0.7, shade(p.bowtie, 0.6));
  }
  if (p.scarf) fillRR(x, -6 + lean, 8.8, 12, 3.4, 1.6, lgrad(x, -6, 0, 6, 0, [[0, shade(p.scarf, 1.15)], [1, shade(p.scarf, 0.7)]]));
  if (p.necklace) {
    x.beginPath();
    x.ellipse(lean, 9.6, 3.6, 3.2, 0, Math.PI * 0.12, Math.PI * 0.88);
    x.strokeStyle = p.necklace;
    x.lineWidth = 0.3;
    x.stroke();
    ell(x, lean, 12.8, 0.6, 0.6, p.necklace);
  }
  if (p.lanyard) {
    seg(x, -2.4 + lean, 10.2, -0.6 + lean, 17, p.lanyard, 0.6);
    seg(x, 2.4 + lean, 10.2, 0.6 + lean, 17, p.lanyard, 0.6);
    fillRR(x, -1.8 + lean, 16.6, 3.6, 4.6, 0.4, '#f6f2e8');
    x.fillStyle = p.lanyard;
    x.fillRect(-1.8 + lean, 16.6, 3.6, 1.1);
  }
  if (p.badge) {
    const bx = (p.coat ? -9 : 5) + lean;
    fillRR(x, bx, 14.6, 3.6, 2, 0.4, p.hat === 'police' ? lgrad(x, bx, 0, bx + 3.6, 0, [[0, '#fff0a0'], [1, '#c8961a']]) : '#f8f4ea');
    if (p.hat !== 'police') seg(x, bx + 0.6, 15.6, bx + 3, 15.6, 'rgba(60,80,140,0.6)', 0.3, 'butt');
  }
  if (p.stethoscope) {
    x.beginPath();
    x.moveTo(-3.4 + lean, 10);
    x.quadraticCurveTo(-4.2 + lean, 16, -1 + lean, 18);
    x.moveTo(3.4 + lean, 10);
    x.quadraticCurveTo(3.8 + lean, 15, 2.2 + lean, 19.6);
    x.strokeStyle = '#4a5460';
    x.lineWidth = 0.55;
    x.stroke();
    ell(x, 2.2 + lean, 20.4, 1.1, 1.1, rgrad(x, 1.8 + lean, 20, 1.5, [[0, '#ffffff'], [1, '#8a96a4']]));
  }
  if (p.headphones) {
    x.beginPath();
    x.ellipse(lean, 10.2, 5.6, 2.2, 0, 0, Math.PI);
    x.strokeStyle = '#2a2a33';
    x.lineWidth = 0.7;
    x.stroke();
    for (const s of [-1, 1]) ell(x, s * 5.4 + lean, 10.4, 1.8, 2.2, rgrad(x, s * 5.4 - 0.6 + lean, 9.6, 2.6, [[0, shade(p.headphones, 1.3)], [1, shade(p.headphones, 0.6)]]));
  }
}

const FIG = new Map<string, HTMLCanvasElement>();
export function portraitHDCanvas(p: Person, f: PortraitFrame, key: string): HTMLCanvasElement {
  const k = `${key}|${f.expr}|${f.mouth}|${f.blink ? 1 : 0}|${f.look}`;
  let c = FIG.get(k);
  if (c) return c;
  c = canvas(PHD, PHD);
  const x = c.getContext('2d');
  if (x) {
    x.setTransform(K, 0, 0, K, HX, HY);
    // soft shadow behind the figure, separating it from the backdrop
    x.save();
    x.fillStyle = rgrad(x, 1.5, 12, 16, [[0, 'rgba(10,6,24,0.35)'], [1, 'rgba(10,6,24,0)']]);
    x.fillRect(-16, -6, 32, 30);
    x.restore();
    const headAt = (): void => {
      x.translate(f.look * 0.5, 0);
      x.rotate(f.look * 0.03);
    };
    x.save();
    headAt();
    drawHairBack(x, p, 0);
    x.restore();
    x.save();
    x.translate(0, -1.6);
    bust(x, p, f.look);
    x.restore();
    x.save();
    headAt();
    drawHead(x, p, { expr: f.expr, mouth: f.mouth === 2 ? 2 : f.mouth === 1 ? 1 : 0, blink: f.blink, look: f.look, detail: true, noBack: true }, 0);
    x.restore();
    // warm key light from the upper left and a cool rim on the right edge
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    const g = x.createLinearGradient(0, 0, PHD, PHD);
    g.addColorStop(0, 'rgba(255,236,200,0.10)');
    g.addColorStop(0.6, 'rgba(255,236,200,0)');
    g.addColorStop(1, 'rgba(120,150,255,0.10)');
    x.fillStyle = g;
    x.fillRect(0, 0, PHD, PHD);
    x.globalCompositeOperation = 'source-over';
  }
  if (FIG.size > 300) FIG.clear();
  FIG.set(k, c);
  return c;
}

// Backdrop: a soft lit gradient with gentle bokeh, in the speaker's color.
const BACK = new Map<string, HTMLCanvasElement>();
export function portraitHDBackdrop(color: string, seed = 1): HTMLCanvasElement {
  const k = `${color}|${seed}`;
  let c = BACK.get(k);
  if (c) return c;
  c = canvas(PHD, PHD);
  const x = c.getContext('2d');
  if (x) {
    const hi = mix(color, '#fff6e0', 0.4);
    const lo = shade(color, 0.55);
    x.fillStyle = rgrad(x, PHD * 0.3, PHD * 0.22, PHD * 1.05, [[0, hi], [0.45, color], [1, lo]]);
    x.fillRect(0, 0, PHD, PHD);
    for (let n = 0; n < 9; n++) {
      const bx = hash(seed * 31 + n) * PHD;
      const by = hash(seed * 17 + n * 3) * PHD * 0.6;
      const r = 6 + hash(seed + n * 7) * 16;
      x.fillStyle = rgrad(x, bx, by, r, [[0, rgba(mix(color, '#ffffff', 0.7), 0.22)], [0.8, rgba(mix(color, '#ffffff', 0.7), 0.12)], [1, rgba('#ffffff', 0)]]);
      x.fillRect(bx - r, by - r, r * 2, r * 2);
    }
    // floor of color toward the bottom
    const v = x.createLinearGradient(0, PHD * 0.55, 0, PHD);
    v.addColorStop(0, rgba(lo, 0));
    v.addColorStop(1, rgba(lo, 0.55));
    x.fillStyle = v;
    x.fillRect(0, 0, PHD, PHD);
  }
  BACK.set(k, c);
  return c;
}
