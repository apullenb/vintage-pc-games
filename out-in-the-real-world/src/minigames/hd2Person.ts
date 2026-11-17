// HD people: the same Person specs as the pixel cast (skin, hair style, outfit, accessories, held
// item), modelled as rounded, smooth-shaded chibi figures lit from the upper left. Same footprint
// as drawPerson: a 14x30 box whose feet sit at (x+7, y+30). Each pose is rendered once at HD
// resolution and cached, so drawing a person per frame is a single drawImage.
import { HAIRS, type DrawOpts, type Person } from '../art/people.ts';
import type { Ctx } from '../art/px.ts';
import { ball, ell, HD, lin, rad, rgba, rr, shadow, tint } from './hd2Kit.tsx';

const OUTL = 'rgba(28,18,40,0.85)';
const RECEDING = 20;
const SLICK = 21;

function capsule(x: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, c: string, lit = 1): void {
  x.save();
  x.lineCap = 'round';
  x.lineWidth = w + 0.7;
  x.strokeStyle = OUTL;
  x.beginPath();
  x.moveTo(x0, y0);
  x.lineTo(x1, y1);
  x.stroke();
  x.lineWidth = w;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * w * 0.5;
  const ny = (dx / len) * w * 0.5;
  x.strokeStyle = lin(x, x0 + nx, y0 + ny, x0 - nx, y0 - ny, [[0, tint(c, 0.62)], [0.55, tint(c, 0.95 * lit)], [0.8, tint(c, 1.18 * lit)], [1, tint(c, 0.9)]]);
  x.stroke();
  x.restore();
}

function hairSheen(x: Ctx, cx: number, cy: number, rx: number, h: string): void {
  x.save();
  x.globalCompositeOperation = 'lighter';
  x.lineWidth = 0.7;
  x.lineCap = 'round';
  x.strokeStyle = rgba(tint(h, 1.6), 0.45);
  x.beginPath();
  x.ellipse(cx, cy, rx, rx * 0.55, 0, Math.PI * 1.12, Math.PI * 1.45);
  x.stroke();
  x.restore();
}

function fillShape(x: Ctx, base: string, x0: number, y0: number, x1: number, y1: number, outline = true): void {
  x.fillStyle = lin(x, x0, y0, x1, y1, [[0, tint(base, 1.28)], [0.45, base], [1, tint(base, 0.6)]]);
  x.fill();
  if (outline) {
    x.lineWidth = 0.45;
    x.strokeStyle = OUTL;
    x.stroke();
  }
}

// Hair that sits behind the head (long curtains, afro, braids, bob sides, ponytail).
function hairBack(x: Ctx, p: Person): void {
  const h = p.hair;
  switch (p.style) {
    case 1:
      rr(x, 0.8, 2, 12.4, 12, 3);
      fillShape(x, tint(h, 0.85), 0, 2, 13, 14);
      break;
    case 6:
      ell(x, 7, 3, 7.4, 6.2);
      x.fillStyle = rad(x, 5, 0, 0, 9, [tint(h, 1.35), h, tint(h, 0.55)]);
      x.fill();
      x.lineWidth = 0.45;
      x.strokeStyle = OUTL;
      x.stroke();
      break;
    case 7:
      for (const bx of [1.9, 12.1]) {
        for (let k = 0; k < 5; k++) ball(x, bx, 5 + k * 2.1, 1.25, h, 1.25, 0.25);
        ball(x, bx, 14.6, 0.9, '#f2b632', 0.9, 0.5);
      }
      break;
    case 8:
      rr(x, 0.9, 2, 12.2, 8.2, 3);
      fillShape(x, tint(h, 0.9), 0, 2, 13, 10);
      break;
    case 5:
      rr(x, 11.6, 2.4, 2.6, 7.6, 1.3);
      fillShape(x, tint(h, 0.9), 11, 2, 14, 10);
      break;
  }
}

// Hair on top of the head / the fringe.
function hairFront(x: Ctx, p: Person): void {
  const h = p.hair;
  const cap = (yb: number, side: number): void => {
    x.beginPath();
    x.moveTo(1.9, yb + side);
    x.bezierCurveTo(1.4, -1.2, 12.6, -1.2, 12.1, yb + side);
    x.lineTo(11.3, yb);
    x.quadraticCurveTo(8, 2.2, 6.2, 3.3);
    x.quadraticCurveTo(4.2, 2.6, 2.7, yb);
    x.closePath();
    fillShape(x, h, 2, -1, 12, yb + side);
  };
  switch (p.style) {
    case 0:
      cap(3.4, 2.4);
      hairSheen(x, 6.5, 2.4, 3.5, h);
      break;
    case 1:
    case 7:
    case 8:
      cap(3.6, 1.6);
      hairSheen(x, 6.5, 2.4, 3.5, h);
      break;
    case 2:
      ball(x, 7, -1.2, 2.2, h, 1.7, 0.35);
      cap(3.2, 1.6);
      hairSheen(x, 6.5, 2.4, 3.5, h);
      break;
    case 3:
      for (const [bx, by, r] of [[2.2, 4.5, 1.6], [11.8, 4.5, 1.6], [2.6, 1.6, 1.9], [11.4, 1.6, 1.9], [5, 0, 2], [9, 0, 2], [7, -0.6, 2]] as const) ball(x, bx, by, r, h, r, 0.3);
      break;
    case 4:
      x.beginPath();
      x.moveTo(2, 3);
      x.bezierCurveTo(1.8, -0.4, 12.2, -0.4, 12, 3);
      x.quadraticCurveTo(7, 1.6, 2, 3);
      x.closePath();
      fillShape(x, h, 2, 0, 12, 3);
      break;
    case 6:
      x.beginPath();
      x.moveTo(1.6, 3.5);
      x.bezierCurveTo(1.4, -1.5, 12.6, -1.5, 12.4, 3.5);
      x.quadraticCurveTo(7, 1.8, 1.6, 3.5);
      x.closePath();
      fillShape(x, h, 2, -1, 12, 3);
      hairSheen(x, 6, 0.5, 4.5, h);
      break;
    case RECEDING:
      for (const sx of [2.3, 11.7]) {
        rr(x, sx - 0.9, 1.8, 1.8, 4.2, 0.9);
        fillShape(x, h, sx - 1, 2, sx + 1, 6);
      }
      ell(x, 6, 1.9, 1.4, 0.5);
      x.fillStyle = 'rgba(255,255,255,0.4)';
      x.fill();
      break;
    case SLICK:
      cap(3, 1.4);
      x.strokeStyle = rgba(tint(h, 0.5), 0.9);
      x.lineWidth = 0.4;
      x.beginPath();
      x.moveTo(7, 0.2);
      x.lineTo(7.4, 2.6);
      x.stroke();
      hairSheen(x, 9, 1.5, 2.5, h);
      break;
    default:
      cap(3.4, 1.6);
      hairSheen(x, 6.5, 2.4, 3.5, h);
  }
}

function hat(x: Ctx, p: Person): void {
  const hc = p.hatColor;
  if (p.hat === 'cap') {
    const c = hc ?? '#c0392b';
    ell(x, 2.2, 2.2, 3.2, 0.9);
    fillShape(x, tint(c, 0.75), 0, 1.5, 4, 3);
    x.beginPath();
    x.moveTo(1.8, 2.8);
    x.bezierCurveTo(1.6, -2.2, 12.4, -2.2, 12.2, 2.8);
    x.closePath();
    fillShape(x, c, 2, -2, 12, 3);
    ball(x, 7, -0.9, 0.6, tint(c, 0.8), 0.5, 0.3);
  } else if (p.hat === 'police') {
    rr(x, 1, -2.4, 12, 3.6, 1.2);
    fillShape(x, '#2a3a6a', 1, -2, 13, 1);
    ell(x, 7, 1.4, 6.6, 0.9);
    x.fillStyle = '#111833';
    x.fill();
    ball(x, 7, -0.6, 0.9, '#f2b632', 0.9, 0.7);
  } else if (p.hat === 'hard') {
    const c = hc ?? '#f2c230';
    ell(x, 7, 1.6, 7.2, 1.1);
    fillShape(x, tint(c, 0.8), 0, 1, 14, 3);
    x.beginPath();
    x.moveTo(1.6, 1.8);
    x.bezierCurveTo(1.6, -4.6, 12.4, -4.6, 12.4, 1.8);
    x.closePath();
    fillShape(x, c, 2, -4, 12, 2);
    x.fillStyle = rgba(tint(c, 0.75), 0.9);
    x.fillRect(6.4, -3, 1.2, 4.4);
  } else if (p.hat === 'beanie') {
    const c = hc ?? '#3f7fd8';
    x.beginPath();
    x.moveTo(1.8, 2.4);
    x.bezierCurveTo(1.6, -3.4, 12.4, -3.4, 12.2, 2.4);
    x.closePath();
    fillShape(x, c, 2, -3, 12, 2);
    rr(x, 1.6, 0.8, 10.8, 2, 0.8);
    fillShape(x, tint(c, 0.78), 2, 0.8, 12, 2.8);
    ball(x, 7, -2.6, 1.2, '#f2efe6', 1.2, 0.5);
  }
}

function held(x: Ctx, p: Person, hx: number): void {
  switch (p.holds) {
    case 'clipboard':
      rr(x, hx - 1, 14, 5, 7, 0.6);
      fillShape(x, '#9a6a3a', hx - 1, 14, hx + 4, 21);
      x.fillStyle = '#f4f0e4';
      x.fillRect(hx - 0.2, 15, 3.4, 5);
      x.fillStyle = '#8a8a9a';
      x.fillRect(hx + 0.8, 13.4, 1.4, 1.4);
      break;
    case 'book':
      rr(x, hx - 1, 13, 4, 7, 0.5);
      fillShape(x, '#c0392b', hx - 1, 13, hx + 3, 20);
      x.fillStyle = '#f2efe6';
      x.fillRect(hx + 2.2, 13.4, 0.7, 6.2);
      x.fillStyle = '#f2b632';
      x.fillRect(hx - 1, 15, 4, 0.7);
      break;
    case 'folder':
      rr(x, hx - 1, 14, 4, 6, 0.5);
      fillShape(x, '#f2b632', hx - 1, 14, hx + 3, 20);
      break;
    case 'mug':
      rr(x, hx + 0.8, 16, 3.2, 3.2, 0.6);
      fillShape(x, '#e0503c', hx + 1, 16, hx + 4, 19);
      x.lineWidth = 0.6;
      x.strokeStyle = '#b03a2a';
      x.beginPath();
      x.arc(hx + 4.2, 17.6, 0.9, -Math.PI / 2, Math.PI / 2);
      x.stroke();
      break;
    case 'wrench':
      capsule(x, hx + 1.5, 14, hx + 1.5, 20, 1, '#9aa4b0');
      ball(x, hx + 1.5, 13.6, 1.4, '#b8c0cc', 1.2, 0.6);
      break;
    case 'tablet':
      rr(x, hx - 1, 14, 5, 6, 0.8);
      fillShape(x, '#2a2a33', hx - 1, 14, hx + 4, 20);
      x.fillStyle = lin(x, hx, 15, hx + 3, 19, ['#a8e0ff', '#3a90d0']);
      x.fillRect(hx - 0.1, 14.9, 3.2, 4.2);
      break;
    case 'phone':
      rr(x, hx + 0.8, 15.8, 2.2, 3.4, 0.5);
      fillShape(x, '#2a2a33', hx + 1, 16, hx + 3, 19);
      break;
    case 'keys':
      ball(x, hx + 2, 22, 1.1, '#f2c230', 1.1, 0.7);
      break;
    case 'scanner':
      rr(x, hx, 15, 3, 3, 0.8);
      fillShape(x, '#f2c230', hx, 15, hx + 3, 18);
      capsule(x, hx + 1.5, 18, hx + 1.5, 19.6, 1, '#2a2a33');
      break;
    case 'mirror':
      capsule(x, hx + 1.5, 15, hx + 1.5, 19, 0.9, '#b0b8c0');
      ball(x, hx + 1.5, 13.8, 1.6, '#d8e0e8', 1.4, 0.8);
      break;
    case 'calculator':
      rr(x, hx - 1, 15, 4, 5, 0.6);
      fillShape(x, '#3a3a4a', hx - 1, 15, hx + 3, 20);
      x.fillStyle = '#9ad89a';
      x.fillRect(hx - 0.2, 15.8, 2.4, 1);
      break;
  }
}

function renderPerson(x: Ctx, p: Person, frame: number, talk: boolean, opts: DrawOpts): void {
  const bob = frame % 2;
  const u = Math.max(0, Math.min(2, p.short ?? 0));
  const wd = p.wide ? 1 : 0;
  const shoes = p.shoes ?? '#2a2a33';
  const wk = opts.walk === undefined ? -1 : opts.walk & 3;
  const lUp = wk === 1 ? 1 : 0;
  const rUp = wk === 3 ? 1 : 0;
  const clip = opts.clipY;
  if (clip !== undefined) {
    x.save();
    x.beginPath();
    x.rect(-3, -6, 22, clip + 6);
    x.clip();
  }
  // legs & shoes (don't bob)
  capsule(x, 5.4, 21 + u, 5.4, 27.4 - lUp, 2.9, p.pants);
  capsule(x, 8.6, 21 + u, 8.6, 27.4 - rUp, 2.9, tint(p.pants, 0.85));
  for (const [sx, up, f] of [[4.9, lUp, 1], [9.1, rUp, 0.85]] as const) {
    ell(x, sx, 28.3 - up, 2.3, 1.25);
    x.fillStyle = rad(x, sx - 0.8, 27.6 - up, 0, 2.6, [tint(shoes, 1.9 * f), tint(shoes, f), tint(shoes, 0.6)]);
    x.fill();
    x.lineWidth = 0.4;
    x.strokeStyle = OUTL;
    x.stroke();
  }
  x.save();
  x.translate(0, bob + u);
  const top = p.hood ?? p.shirt;
  const sleeve = p.coat ?? p.hood ?? p.shirt;
  const sw = wk === 1 ? 1 : wk === 3 ? -1 : 0;
  const ges = opts.gesture ?? 0;
  const bare = p.shortSleeves && !p.coat && !p.hood;
  // far arm (viewer's right) sits behind the torso
  const rx = 11.8 + wd;
  if (bare) {
    capsule(x, rx, 12, rx + 0.2, 15 - sw, 2.4, tint(sleeve, 0.85));
    capsule(x, rx + 0.2, 15 - sw, rx + 0.2, 19.6 - sw, 2, tint(p.skin, 0.9));
  } else capsule(x, rx, 12, rx + 0.2, 19.2 - sw, 2.4, tint(sleeve, 0.85));
  ball(x, rx + 0.2, 20 - sw, 1.25, p.skin, 1.25, 0.3);
  // torso
  const tx0 = 2.6 - wd;
  const tw = 8.8 + wd * 2;
  rr(x, tx0, 10.4, tw, 10.6, 2.4);
  x.fillStyle = lin(x, tx0, 0, tx0 + tw, 0, [[0, tint(top, 0.9)], [0.25, tint(top, 1.22)], [0.6, top], [1, tint(top, 0.62)]]);
  x.fill();
  x.save();
  x.clip();
  vshade(x, tx0, 10.4, tw, 10.6);
  if (p.plaid) {
    x.fillStyle = rgba(p.plaid, 0.75);
    for (const px of [5, 8]) x.fillRect(px, 10.4, 0.8, 10);
    for (const py of [14, 17]) x.fillRect(tx0, py, tw, 0.8);
  }
  // belt line + pants top
  x.fillStyle = lin(x, 0, 18.6, 0, 21, [tint(p.pants, 0.8), tint(p.pants, 0.55)]);
  x.fillRect(tx0, 19.4, tw, 2);
  if (p.hood) {
    rr(x, 4, 16, 6, 3, 1);
    x.fillStyle = rgba(tint(p.hood, 0.82), 0.9);
    x.fill();
  }
  x.restore();
  rr(x, tx0, 10.4, tw, 10.6, 2.4);
  x.lineWidth = 0.45;
  x.strokeStyle = OUTL;
  x.stroke();
  // collar
  x.fillStyle = tint(top, 1.18);
  ell(x, 7, 10.9, 2.4, 0.7);
  x.fill();
  if (p.hood) {
    rr(x, 2.8, 9.6, 8.4, 2.4, 1.2);
    fillShape(x, tint(p.hood, 0.9), 3, 9.6, 11, 12);
    x.fillStyle = '#f2efe6';
    x.fillRect(5.8, 12, 0.5, 2.2);
    x.fillRect(8, 12, 0.5, 2.2);
  }
  if (p.apron) {
    rr(x, 4, 13, 6, 8.2, 1);
    fillShape(x, p.apron, 4, 13, 10, 21);
    x.fillStyle = p.apron;
    x.fillRect(4.1, 10.6, 0.8, 2.6);
    x.fillRect(9.1, 10.6, 0.8, 2.6);
    rr(x, 5, 16.6, 4, 1.8, 0.5);
    x.fillStyle = rgba(tint(p.apron, 0.7), 0.9);
    x.fill();
  }
  if (p.vest) {
    for (const vx of [tx0, 9 + wd]) {
      rr(x, vx, 10.6, 2.4, 10.2, 0.8);
      fillShape(x, p.vest, vx, 10.6, vx + 2.4, 21);
      x.fillStyle = 'rgba(240,244,250,0.95)';
      x.fillRect(vx, 15, 2.4, 0.7);
      x.fillRect(vx, 18, 2.4, 0.7);
    }
  }
  if (p.coat) {
    for (const [cx0, f] of [[2 - wd, 1], [9 + wd, 0.82]] as const) {
      rr(x, cx0, 10.6, 3, 12.6, 1);
      fillShape(x, tint(p.coat, f), cx0, 10.6, cx0 + 3, 23);
    }
    x.fillStyle = tint(p.coat, 1.2);
    x.beginPath();
    x.moveTo(4.8 - wd, 10.8);
    x.lineTo(5.8, 13.8);
    x.lineTo(4.8 - wd, 14.6);
    x.closePath();
    x.fill();
  }
  if (p.tie) {
    x.beginPath();
    x.moveTo(6.3, 11.4);
    x.lineTo(7.7, 11.4);
    x.lineTo(8, 17);
    x.lineTo(7, 18.2);
    x.lineTo(6, 17);
    x.closePath();
    fillShape(x, p.tie, 6, 11, 8, 18);
  }
  if (p.scarf) {
    rr(x, 2.8, 9.6, 8.4, 2.4, 1.2);
    fillShape(x, p.scarf, 3, 9.6, 11, 12);
    rr(x, 8, 11.6, 2, 4.4, 0.8);
    fillShape(x, tint(p.scarf, 0.85), 8, 11.6, 10, 16);
  }
  if (p.toolbelt) {
    rr(x, tx0, 19, tw, 2, 0.6);
    fillShape(x, '#7a5232', tx0, 19, tx0 + tw, 21);
    for (const bx of [tx0, 9 + wd]) {
      rr(x, bx, 20, 2, 3, 0.5);
      fillShape(x, '#5a3a20', bx, 20, bx + 2, 23);
    }
  }
  if (p.necklace) {
    x.lineWidth = 0.5;
    x.strokeStyle = p.necklace;
    x.beginPath();
    x.arc(7, 10.6, 2.6, 0.2, Math.PI - 0.2);
    x.stroke();
  }
  if (p.bowtie) {
    x.fillStyle = p.bowtie;
    x.beginPath();
    x.moveTo(5, 10.8);
    x.lineTo(7, 11.6);
    x.lineTo(9, 10.8);
    x.lineTo(9, 12.4);
    x.lineTo(7, 11.6);
    x.lineTo(5, 12.4);
    x.closePath();
    x.fill();
  }
  if (p.lanyard) {
    x.lineWidth = 0.5;
    x.strokeStyle = p.lanyard;
    x.beginPath();
    x.moveTo(5.2, 10.8);
    x.lineTo(7, 13.4);
    x.lineTo(8.8, 10.8);
    x.stroke();
    rr(x, 6, 13.4, 2, 2.2, 0.4);
    x.fillStyle = '#f2efe6';
    x.fill();
  }
  if (p.badge) {
    rr(x, 9 + (p.coat ? -1 : 0), 12.8, 2.2, 1.2, 0.3);
    x.fillStyle = p.hat === 'police' ? '#f2c230' : '#f4f0e4';
    x.fill();
  }
  if (p.stethoscope) {
    x.lineWidth = 0.5;
    x.strokeStyle = '#5a6470';
    x.beginPath();
    x.moveTo(4.4, 10.8);
    x.quadraticCurveTo(5, 14.6, 7, 14.6);
    x.quadraticCurveTo(9, 14.6, 9.6, 10.8);
    x.stroke();
    ball(x, 7, 15.4, 0.7, '#c8d0d8', 0.7, 0.8);
  }
  // near arm (viewer's left), with optional gestures
  const lx = 2.2 - wd;
  if (ges === 1) {
    capsule(x, lx, 12, lx - 0.4, 15.8, 2.4, sleeve);
    capsule(x, lx - 0.4, 15.8, lx - 2.6, 14.6, 2, bare ? p.skin : sleeve);
    ball(x, lx - 3, 14, 1.25, p.skin, 1.25, 0.3);
  } else if (ges === 2) {
    capsule(x, lx, 12, lx + 0.2, 15.6, 2.4, sleeve);
    capsule(x, lx + 0.2, 15.6, 4.8, 15.2, 2, bare ? p.skin : tint(sleeve, 0.95));
    ball(x, 5.6, 14.4, 1.25, p.skin, 1.25, 0.3);
  } else {
    if (bare) {
      capsule(x, lx, 12, lx - 0.2, 15 + sw, 2.4, sleeve);
      capsule(x, lx - 0.2, 15 + sw, lx - 0.2, 19.6 + sw, 2, p.skin);
    } else capsule(x, lx, 12, lx - 0.2, 19.2 + sw, 2.4, sleeve);
    ball(x, lx - 0.2, 20 + sw, 1.25, p.skin, 1.25, 0.3);
  }
  held(x, p, 11 + wd);
  // head
  hairBack(x, p);
  x.fillStyle = tint(p.skin, 0.78);
  x.fillRect(6, 9.4, 2, 1.6);
  for (const ex of [1.9, 12.1]) {
    ell(x, ex, 5.6, 0.9, 1.3);
    x.fillStyle = tint(p.skin, ex < 7 ? 0.95 : 0.78);
    x.fill();
  }
  rr(x, 2, 0.8, 10, 9.4, 3.6);
  x.fillStyle = rad(x, 5, 3, 0.5, 9.5, [[0, tint(p.skin, 1.18)], [0.5, p.skin], [1, tint(p.skin, 0.66)]]);
  x.fill();
  x.lineWidth = 0.45;
  x.strokeStyle = OUTL;
  x.stroke();
  if (p.headphones) {
    for (const ex of [2.6, 11.4]) ball(x, ex, 10.6, 1.3, p.headphones, 1, 0.5);
  }
  const lk = opts.face ?? 0;
  const e1 = 4.6 + lk * 0.8;
  const e2 = 9.4 + lk * 0.8;
  // cheeks
  for (const cx of [3.6, 10.4]) {
    ell(x, cx, 7.4, 1.2, 0.7);
    x.fillStyle = 'rgba(240,120,120,0.35)';
    x.fill();
  }
  if (p.beard) {
    const bc = p.hair === HAIRS[6] ? '#cfcfd8' : tint(p.hair, 1.1);
    x.beginPath();
    x.moveTo(2.4, 6.4);
    x.quadraticCurveTo(2.6, 10.6, 7, 10.6);
    x.quadraticCurveTo(11.4, 10.6, 11.6, 6.4);
    x.quadraticCurveTo(7, 8.6, 2.4, 6.4);
    x.closePath();
    fillShape(x, bc, 3, 6, 11, 11, false);
  }
  // eyes
  if (opts.blink) {
    x.lineWidth = 0.55;
    x.strokeStyle = '#1c1424';
    x.lineCap = 'round';
    for (const ex of [e1, e2]) {
      x.beginPath();
      x.moveTo(ex - 0.7, 6.2);
      x.quadraticCurveTo(ex, 6.7, ex + 0.7, 6.2);
      x.stroke();
    }
  } else {
    for (const ex of [e1, e2]) {
      ell(x, ex, 5.8, 0.62, 0.98);
      x.fillStyle = '#1c1424';
      x.fill();
      ell(x, ex - 0.2, 5.4, 0.22, 0.26);
      x.fillStyle = '#ffffff';
      x.fill();
    }
  }
  if (p.brows && !p.glasses) {
    x.lineWidth = 0.6;
    x.lineCap = 'round';
    x.strokeStyle = tint(p.hair, 0.8);
    for (const ex of [e1, e2]) {
      x.beginPath();
      x.moveTo(ex - 0.9, 3.9);
      x.lineTo(ex + 0.8, 3.6);
      x.stroke();
    }
  }
  if (p.glasses) {
    x.lineWidth = 0.45;
    x.strokeStyle = '#2a2a3a';
    for (const ex of [e1, e2]) {
      rr(x, ex - 1.5, 4.4, 3, 2.6, 0.9);
      x.fillStyle = 'rgba(200,230,255,0.22)';
      x.fill();
      x.stroke();
    }
    x.beginPath();
    x.moveTo(e1 + 1.5, 5.4);
    x.lineTo(e2 - 1.5, 5.4);
    x.stroke();
  }
  // nose
  ell(x, 7 + lk * 0.9, 7, 0.55, 0.45);
  x.fillStyle = rgba(tint(p.skin, 0.62), 0.7);
  x.fill();
  if (p.mustache) {
    rr(x, 5, 7.6, 4, 0.9, 0.45);
    x.fillStyle = p.hair === HAIRS[6] ? '#cfcfd8' : tint(p.hair, 1.1);
    x.fill();
  }
  // mouth
  if (talk) {
    ell(x, 7, 8.7, 0.95, 0.75);
    x.fillStyle = '#6a1a1a';
    x.fill();
  } else if (!p.mustache) {
    x.lineWidth = 0.5;
    x.lineCap = 'round';
    x.strokeStyle = '#8a3030';
    x.beginPath();
    x.moveTo(6.1, 8.4);
    x.quadraticCurveTo(7, 9.1, 7.9, 8.4);
    x.stroke();
  }
  if (p.earrings) {
    ball(x, 1.9, 7.4, 0.55, p.earrings, 0.55, 0.6);
    ball(x, 12.1, 7.4, 0.55, p.earrings, 0.55, 0.6);
  }
  if (!p.hat || p.hat === 'cap' || p.hat === 'beanie') hairFront(x, p);
  hat(x, p);
  if (p.headset) {
    x.lineWidth = 0.7;
    x.strokeStyle = '#2a2a33';
    x.beginPath();
    x.moveTo(1.8, 4);
    x.quadraticCurveTo(2, 7.4, 4.6, 7.6);
    x.stroke();
    ball(x, 1.8, 4.6, 1, '#3a3a44', 1.3, 0.4);
  }
  x.restore();
  if (clip !== undefined) x.restore();
}

// vertical form shading on the torso: lit chest, darker waist
function vshade(x: Ctx, px: number, py: number, w: number, h: number): void {
  x.fillStyle = lin(x, 0, py, 0, py + h, [[0, 'rgba(255,248,235,0.18)'], [0.4, 'rgba(255,255,255,0)'], [1, 'rgba(10,0,30,0.25)']]);
  x.fillRect(px, py, w, h);
}

const CACHE = new Map<string, HTMLCanvasElement>();
const PAD_X = 5;
const PAD_T = 7;
const CW = 14 + PAD_X * 2;
const CH = 31 + PAD_T;

// Same signature as drawPerson.
export function person(x: Ctx, p: Person, px: number, py: number, frame = 0, talk = false, opts: DrawOpts = {}): void {
  if (opts.shadow !== false && opts.clipY === undefined) shadow(x, px + 7, py + 29.6, 8.5, 2.4, 0.4);
  const key = `${JSON.stringify(p)}|${frame % 2}|${talk ? 1 : 0}|${opts.face ?? 0}|${opts.blink ? 1 : 0}|${opts.clipY ?? ''}|${opts.walk ?? ''}|${opts.gesture ?? 0}`;
  let c = CACHE.get(key);
  if (!c) {
    if (CACHE.size > 400) CACHE.clear();
    c = document.createElement('canvas');
    c.width = CW * HD;
    c.height = CH * HD;
    const g = c.getContext('2d');
    if (g) {
      g.setTransform(HD, 0, 0, HD, PAD_X * HD, PAD_T * HD);
      renderPerson(g, p, frame, talk, opts);
    }
    CACHE.set(key, c);
  }
  const sm = x.imageSmoothingEnabled;
  x.imageSmoothingEnabled = true;
  x.drawImage(c, px - PAD_X, py - PAD_T, CW, CH);
  x.imageSmoothingEnabled = sm;
}
