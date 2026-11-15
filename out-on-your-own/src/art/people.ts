// Pixel people: the player (from their chosen look) and the cast.
import type { Look, NpcId, PathId } from '../engine/types.ts';
import { rect, shade, type Ctx } from './px.ts';

export const SKINS = ['#f7d7bd', '#eab38c', '#c98c62', '#a26a46', '#714a32', '#4b3022'];
export const HAIRS = ['#2a1b12', '#5b3a22', '#a7652b', '#e3c26b', '#c2412f', '#14131d', '#a3a3b4', '#7a55b8'];
export const SHIRTS = ['#e0503c', '#3f7fd8', '#3caa6a', '#f2b632', '#9a5ad0', '#ef7fae', '#2fb5b0', '#eeeae0'];
// Player-selectable styles (indices 0..8). Cast-only styles live at 20+.
export const HAIR_STYLES = ['Short', 'Long', 'Bun', 'Curly', 'Buzz', 'Ponytail', 'Afro', 'Braids', 'Bob'];
const RECEDING = 20;
const SLICK = 21;

export type Held = 'clipboard' | 'mug' | 'book' | 'wrench' | 'tablet' | 'phone' | 'keys' | 'scanner' | 'folder' | 'mirror' | 'calculator';

export interface Person {
  skin: string;
  hair: string;
  style: number;
  shirt: string;
  pants: string;
  shoes?: string;
  glasses?: boolean;
  hat?: 'cap' | 'police' | 'hard' | 'beanie';
  hatColor?: string;
  coat?: string; // long coat over shirt (lab coat, blazer, cardigan)
  vest?: string; // safety vest
  beard?: boolean;
  tie?: string;
  // accessories & build (all optional, so older looks still work)
  mustache?: boolean;
  earrings?: string;
  necklace?: string;
  lanyard?: string;
  badge?: boolean; // name tag
  headset?: boolean;
  headphones?: string; // around the neck
  apron?: string;
  scarf?: string;
  bowtie?: string;
  stethoscope?: boolean;
  plaid?: string; // flannel stripes over the shirt
  shortSleeves?: boolean;
  short?: number; // 1..2 px shorter
  wide?: boolean;
  brows?: boolean;
  holds?: Held;
}

const OUT = '#1c1424';

export function playerPerson(l: Look): Person {
  return {
    skin: SKINS[l.skin % SKINS.length],
    hair: HAIRS[l.hair % HAIRS.length],
    style: l.hairStyle % HAIR_STYLES.length,
    shirt: SHIRTS[l.shirt % SHIRTS.length],
    pants: '#34406a',
    shoes: '#2a2a33',
  };
}

export const CAST: Record<NpcId, { name: string; p: Person }> = {
  mom: { name: 'Mom', p: { skin: SKINS[1], hair: HAIRS[1], style: 2, shirt: '#e8dcc0', pants: '#47406a', coat: '#5aa36e', glasses: true, earrings: '#f2d048', holds: 'mug' } },
  rae: { name: 'Rae', p: { skin: SKINS[3], hair: HAIRS[7], style: 3, shirt: '#f2b632', pants: '#2f3a5c', headphones: '#e0503c', earrings: '#e8e8f0', shoes: '#e8e8f0', holds: 'phone' } },
  clerk: { name: 'Gloria (DMV)', p: { skin: SKINS[2], hair: HAIRS[6], style: 2, shirt: '#b8a8d8', pants: '#3b3b4e', coat: '#6a5a8a', glasses: true, badge: true, necklace: '#e8e8f0', short: 1 } },
  banker: { name: 'Banker', p: { skin: SKINS[4], hair: HAIRS[5], style: SLICK, shirt: '#e8e8f0', pants: '#26304a', coat: '#2e3f6e', tie: '#c0392b', badge: true, shoes: '#1a1418' } },
  boss: { name: 'Your boss', p: { skin: SKINS[0], hair: HAIRS[2], style: 4, shirt: '#2b4a7a', pants: '#2b2b38', vest: '#ff8a1e', headset: true, beard: true, holds: 'scanner' } },
  dentist: { name: 'Dr. Park', p: { skin: SKINS[1], hair: HAIRS[5], style: 8, shirt: '#7fd0d8', pants: '#5a8a98', coat: '#f4f6f8', glasses: true, holds: 'mirror', shoes: '#e8e8f0' } },
  doctor: { name: 'Doctor', p: { skin: SKINS[4], hair: HAIRS[0], style: 4, shirt: '#3caa6a', pants: '#2c7a52', coat: '#f4f6f8', stethoscope: true, holds: 'clipboard', brows: true } },
  landlord: { name: 'Landlord', p: { skin: SKINS[5], hair: HAIRS[6], style: RECEDING, shirt: '#b04a3a', plaid: '#5a2a24', pants: '#3a3028', beard: true, wide: true, holds: 'keys', shoes: '#4a3424' } },
  roommate: { name: 'Roommate', p: { skin: SKINS[2], hair: HAIRS[0], style: 1, shirt: '#2fb5b0', pants: '#3a2f4a', hat: 'beanie', hatColor: '#e07a3c', shoes: '#c0392b' } },
  dealer: { name: 'Car dealer', p: { skin: SKINS[0], hair: HAIRS[3], style: SLICK, shirt: '#f2efe6', pants: '#2a2a33', coat: '#c0392b', tie: '#f2b632', holds: 'keys', brows: true } },
  cop: { name: 'Officer', p: { skin: SKINS[3], hair: HAIRS[0], style: 4, shirt: '#2b3f7a', pants: '#1f2a52', hat: 'police', badge: true, mustache: true, shoes: '#111118' } },
  advisor: { name: 'Advisor', p: { skin: SKINS[1], hair: HAIRS[4], style: 1, shirt: '#e8dcc0', pants: '#33304a', coat: '#9a5ad0', glasses: true, lanyard: '#3f7fd8', holds: 'folder' } },
  mechanic: { name: 'Mechanic', p: { skin: SKINS[2], hair: HAIRS[0], style: 4, shirt: '#4a6a8a', pants: '#4a6a8a', hat: 'cap', hatColor: '#c0392b', beard: true, badge: true, holds: 'wrench', wide: true } },
  grandma: { name: 'Grandma', p: { skin: SKINS[0], hair: HAIRS[6], style: 3, shirt: '#f2e8f0', pants: '#6a4a6a', coat: '#ef7fae', glasses: true, necklace: '#f8f4f0', short: 2 } },
  taxpro: { name: 'Tax helper', p: { skin: SKINS[0], hair: HAIRS[6], style: RECEDING, shirt: '#f2efe6', pants: '#4a4a5a', glasses: true, coat: '#6b5a44', bowtie: '#2e6e4a', mustache: true, holds: 'calculator' } },
  hr: { name: 'HR', p: { skin: SKINS[3], hair: HAIRS[1], style: 5, shirt: '#ef7fae', pants: '#2f2f44', coat: '#3a3a52', lanyard: '#c0392b', earrings: '#f2d048', holds: 'tablet' } },
};

// The boss looks different depending on where you work.
export const BOSSES: Record<PathId, { name: string; p: Person }> = {
  // Fresh Fields grocery manager: store apron, name tag, short sleeves, tie.
  home: { name: 'Store manager', p: { skin: SKINS[2], hair: HAIRS[0], style: RECEDING, shirt: '#f2efe6', pants: '#3a3a4a', apron: '#3caa6a', tie: '#2e3f6e', badge: true, mustache: true, shortSleeves: true, wide: true, holds: 'clipboard' } },
  // Library supervisor / professor: tweed cardigan, bow tie, books.
  college: { name: 'Library supervisor', p: { skin: SKINS[4], hair: HAIRS[6], style: 8, shirt: '#e8e0d0', pants: '#4a3a30', coat: '#8a6a44', bowtie: '#c0392b', glasses: true, earrings: '#f2d048', holds: 'book' } },
  // Brightline Electric foreman Dee: hard hat, hi-vis vest, clipboard.
  trade: { name: 'Dee (foreman)', p: { skin: SKINS[3], hair: HAIRS[0], style: 5, shirt: '#4a6a8a', pants: '#2f4a6a', hat: 'hard', hatColor: '#f2c230', vest: '#c8f03c', holds: 'clipboard', shoes: '#7a5232', brows: true } },
  // ParcelPoint warehouse supervisor: polo, orange vest, headset, scanner.
  work: CAST.boss,
};

export function castFor(id: NpcId, path?: PathId | null): { name: string; p: Person } {
  if (id === 'boss' && path && BOSSES[path]) return BOSSES[path];
  return CAST[id];
}

interface Part {
  x: number;
  y: number;
  w: number;
  h: number;
  c: string;
}

export interface DrawOpts {
  blink?: boolean;
  face?: -1 | 0 | 1; // eye direction: -1 looks left, 1 looks right
  shadow?: boolean; // ground shadow (default on)
  clipY?: number; // only draw rows above this sprite-local y (for seated people)
}

// Draws a 14x30 person whose feet sit at (x+7, y+30). talk = mouth open frame.
export function drawPerson(ctx: Ctx, p: Person, x: number, y: number, frame = 0, talk = false, opts: DrawOpts = {}): void {
  x = Math.round(x);
  y = Math.round(y);
  const bob = frame % 2;
  const u = Math.max(0, Math.min(2, p.short ?? 0)); // shorter people: upper body sits lower
  const wd = p.wide ? 1 : 0;
  const skinD = shade(p.skin, 0.82);
  const shirtD = shade(p.shirt, 0.78);
  const pantsD = shade(p.pants, 0.8);
  const shoes = p.shoes ?? '#2a2a33';
  const parts: Part[] = [];
  const P = (px: number, py: number, w: number, h: number, c: string, moving = true): void => {
    parts.push({ x: x + px, y: y + py + (moving ? bob + u : 0), w, h, c });
  };

  if (opts.shadow !== false && opts.clipY === undefined) {
    ctx.fillStyle = 'rgba(16,8,28,0.28)';
    ctx.fillRect(x - 1, y + 29, 16, 2);
    ctx.fillRect(x + 1, y + 31, 12, 1);
  }

  // legs & shoes (don't bob)
  P(4, 21 + u, 3, 6 - u, p.pants, false);
  P(7, 21 + u, 3, 6 - u, pantsD, false);
  P(3, 27, 4, 2, shoes, false);
  P(7, 27, 4, 2, shade(shoes, 0.85), false);
  // torso
  P(3 - wd, 11, 8 + wd * 2, 10, p.shirt);
  P(10 + wd, 11, 1, 10, shirtD);
  P(3 - wd, 18, 8 + wd * 2, 3, shirtD);
  P(3 - wd, 20, 8 + wd * 2, 1, pantsD); // belt line
  if (p.plaid) {
    P(5, 11, 1, 9, p.plaid);
    P(8, 11, 1, 9, p.plaid);
    P(3 - wd, 14, 8 + wd * 2, 1, p.plaid);
    P(3 - wd, 17, 8 + wd * 2, 1, p.plaid);
  }
  P(5, 11, 4, 1, shade(p.shirt, 1.12)); // collar
  if (p.apron) {
    P(4, 13, 6, 8, p.apron);
    P(4, 11, 1, 2, p.apron);
    P(9, 11, 1, 2, p.apron);
    P(5, 17, 4, 1, shade(p.apron, 0.8));
  }
  if (p.vest) {
    P(3 - wd, 11, 2, 10, p.vest);
    P(9 + wd, 11, 2, 10, p.vest);
    P(3 - wd, 15, 2, 1, '#eef0f4');
    P(9 + wd, 15, 2, 1, '#eef0f4');
    P(3 - wd, 18, 2, 1, '#eef0f4');
    P(9 + wd, 18, 2, 1, '#eef0f4');
  }
  if (p.coat) {
    P(2 - wd, 11, 3, 12, p.coat);
    P(9 + wd, 11, 3, 12, p.coat);
    P(4 - wd, 11, 1, 4, shade(p.coat, 1.15)); // lapels
    P(9 + wd, 11, 1, 4, shade(p.coat, 0.85));
    P(11 + wd, 12, 1, 11, shade(p.coat, 0.78));
  }
  if (p.tie) {
    P(6, 12, 2, 1, shade(p.tie, 0.8));
    P(6, 13, 2, 5, p.tie);
  }
  if (p.scarf) {
    P(3, 10, 8, 2, p.scarf);
    P(8, 12, 2, 4, shade(p.scarf, 0.85));
  }
  // arms
  const sleeve = p.coat ?? p.shirt;
  if (p.shortSleeves && !p.coat) {
    P(1 - wd, 11, 2, 4, sleeve);
    P(11 + wd, 11, 2, 4, shade(sleeve, 0.85));
    P(1 - wd, 15, 2, 4, p.skin);
    P(11 + wd, 15, 2, 4, skinD);
  } else {
    P(1 - wd, 11, 2, 8, sleeve);
    P(11 + wd, 11, 2, 8, shade(sleeve, 0.82));
  }
  P(1 - wd, 19, 2, 2, p.skin);
  P(11 + wd, 19, 2, 2, p.skin);
  // held item (in the hand on the viewer's right)
  const hx = 11 + wd;
  switch (p.holds) {
    case 'clipboard':
      P(hx - 1, 14, 5, 7, '#9a6a3a');
      P(hx, 15, 3, 5, '#f4f0e4');
      P(hx + 1, 13, 1, 2, '#8a8a9a');
      P(hx, 19, 2, 2, p.skin);
      break;
    case 'book':
      P(hx - 1, 13, 4, 7, '#c0392b');
      P(hx + 2, 13, 1, 7, '#f2efe6');
      P(hx - 1, 15, 4, 1, '#f2b632');
      break;
    case 'folder':
      P(hx - 1, 14, 4, 6, '#f2b632');
      P(hx - 1, 14, 4, 1, shade('#f2b632', 0.8));
      break;
    case 'mug':
      P(hx + 1, 16, 3, 3, '#e0503c');
      P(hx + 4, 17, 1, 1, '#e0503c');
      break;
    case 'wrench':
      P(hx + 1, 14, 1, 6, '#9aa4b0');
      P(hx, 13, 3, 2, '#9aa4b0');
      break;
    case 'tablet':
      P(hx - 1, 14, 5, 6, '#2a2a33');
      P(hx, 15, 3, 4, '#6ac0f0');
      break;
    case 'phone':
      P(hx + 1, 16, 2, 3, '#2a2a33');
      break;
    case 'keys':
      P(hx + 1, 21, 2, 2, '#f2c230');
      break;
    case 'scanner':
      P(hx, 15, 3, 3, '#f2c230');
      P(hx + 1, 18, 1, 2, '#2a2a33');
      break;
    case 'mirror':
      P(hx + 1, 14, 1, 5, '#b0b8c0');
      P(hx, 13, 3, 2, '#d8e0e8');
      break;
    case 'calculator':
      P(hx - 1, 15, 4, 5, '#3a3a4a');
      P(hx, 16, 2, 1, '#9ad89a');
      break;
  }
  // neck + head
  P(6, 10, 2, 1, skinD);
  P(2, 1, 10, 9, p.skin);
  P(11, 2, 1, 7, skinD);
  P(2, 8, 10, 1, skinD);
  if (p.headphones) {
    P(2, 10, 3, 2, p.headphones);
    P(9, 10, 3, 2, p.headphones);
    P(5, 10, 4, 1, '#2a2a33');
  }
  // hair
  const h = p.hair;
  let hi: [number, number, number] | null = [4, 0, 4]; // highlight streak x, y, w
  switch (p.style) {
    case 0: // short
      P(2, 0, 10, 3, h);
      P(2, 3, 1, 3, h);
      P(11, 3, 1, 3, h);
      P(3, 3, 2, 1, h);
      break;
    case 1: // long
      P(2, 0, 10, 3, h);
      P(1, 2, 2, 11, h);
      P(11, 2, 2, 11, h);
      P(3, 3, 3, 1, h);
      break;
    case 2: // bun
      P(5, -2, 4, 2, h);
      P(2, 0, 10, 3, h);
      P(2, 3, 1, 2, h);
      P(11, 3, 1, 2, h);
      hi = [6, -2, 2];
      break;
    case 3: // curly
      P(1, -1, 12, 4, h);
      P(1, 3, 2, 5, h);
      P(11, 3, 2, 5, h);
      hi = [3, -1, 3];
      break;
    case 4: // buzz
      P(2, 0, 10, 2, h);
      hi = null;
      break;
    case 6: // afro
      P(1, -3, 12, 1, h);
      P(0, -2, 14, 5, h);
      P(0, 3, 2, 4, h);
      P(12, 3, 2, 4, h);
      hi = [3, -2, 3];
      break;
    case 7: // braids
      P(2, 0, 10, 3, h);
      P(2, 3, 1, 2, h);
      P(11, 3, 1, 2, h);
      P(1, 4, 2, 11, h);
      P(11, 4, 2, 11, h);
      break;
    case 8: // bob
      P(2, 0, 10, 3, h);
      P(1, 2, 2, 7, h);
      P(11, 2, 2, 7, h);
      P(3, 3, 5, 1, h);
      break;
    case RECEDING:
      P(2, 2, 1, 4, h);
      P(11, 2, 1, 4, h);
      P(3, 1, 1, 2, h);
      P(10, 1, 1, 2, h);
      hi = null;
      break;
    case SLICK:
      P(2, 0, 10, 2, h);
      P(2, 2, 4, 1, h);
      P(8, 2, 4, 1, h);
      P(2, 3, 1, 2, h);
      P(11, 3, 1, 2, h);
      hi = [8, 0, 3];
      break;
    default: // ponytail
      P(2, 0, 10, 3, h);
      P(12, 2, 2, 7, h);
      P(2, 3, 1, 2, h);
      P(3, 3, 2, 1, h);
      break;
  }
  if (p.beard) P(3, 7, 8, 3, p.hair === HAIRS[6] ? '#cfcfd8' : shade(p.hair, 1.1));
  const hc = p.hatColor;
  if (p.hat === 'cap') {
    P(2, -1, 10, 3, hc ?? '#c0392b');
    P(0, 1, 4, 1, shade(hc ?? '#c0392b', 0.72));
    hi = [4, -1, 3];
  } else if (p.hat === 'police') {
    P(1, -2, 12, 4, '#1f2a52');
    P(1, 1, 12, 1, '#111833');
    P(6, -1, 2, 2, '#f2b632');
    hi = null;
  } else if (p.hat === 'hard') {
    P(2, -3, 10, 2, hc ?? '#f2c230');
    P(1, -1, 12, 3, hc ?? '#f2c230');
    P(0, 1, 14, 1, shade(hc ?? '#f2c230', 0.78));
    P(6, -3, 2, 4, shade(hc ?? '#f2c230', 0.88));
    hi = [3, -2, 2];
  } else if (p.hat === 'beanie') {
    P(2, -2, 10, 4, hc ?? '#3f7fd8');
    P(2, 1, 10, 1, shade(hc ?? '#3f7fd8', 0.75));
    P(6, -3, 2, 1, '#f2efe6');
    hi = null;
  }
  if (p.headset) {
    P(1, 3, 2, 3, '#2a2a33');
    P(2, 6, 3, 1, '#2a2a33');
  }

  // outline pass
  const clip = opts.clipY;
  if (clip !== undefined) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 3, y - 6, 22, clip + 6);
    ctx.clip();
  }
  for (const q of parts) rect(ctx, q.x - 1, q.y - 1, q.w + 2, q.h + 2, OUT);
  for (const q of parts) rect(ctx, q.x, q.y, q.w, q.h, q.c);
  if (clip !== undefined) ctx.restore();

  // details drawn after the outline so they sit inside
  const fy = y + bob + u;
  const D = (px: number, py: number, w: number, hh: number, c: string): void => rect(ctx, x + px, fy + py, w, hh, c);
  if (hi && p.style !== RECEDING) D(hi[0], hi[1], hi[2], 1, shade(p.hat === 'hard' || p.hat === 'cap' ? (hc ?? (p.hat === 'cap' ? '#c0392b' : '#f2c230')) : h, 1.35));
  if (p.style === RECEDING && !p.hat) D(5, 1, 2, 1, shade(p.skin, 1.12)); // scalp shine
  if (p.style === 7) {
    D(1, 8, 2, 1, shade(h, 0.7));
    D(11, 8, 2, 1, shade(h, 0.7));
    D(1, 14, 2, 1, '#f2b632');
    D(11, 14, 2, 1, '#f2b632');
  }
  const lk = opts.face ?? 0;
  const ex1 = 4 + lk;
  const ex2 = 9 + lk;
  if (opts.blink) {
    D(ex1, 6, 1, 1, OUT);
    D(ex2, 6, 1, 1, OUT);
  } else {
    D(ex1, 5, 1, 2, OUT);
    D(ex2, 5, 1, 2, OUT);
  }
  if (p.brows && !p.glasses) {
    D(ex1 - 1, 3, 2, 1, shade(h, 0.8));
    D(ex2, 3, 2, 1, shade(h, 0.8));
  }
  if (p.glasses) {
    D(3 + lk, 4, 3, 1, '#3a3a4a');
    D(8 + lk, 4, 3, 1, '#3a3a4a');
    D(6 + lk, 5, 2, 1, '#3a3a4a');
    if (!opts.blink) {
      D(5 + lk, 5, 1, 1, '#ffffff');
      D(10 + lk, 5, 1, 1, '#ffffff');
    }
  }
  D(6 + (lk > 0 ? 1 : 0), 6, 1, 1, skinD); // nose
  D(3, 7, 1, 1, '#f08a8a');
  D(10, 7, 1, 1, '#f08a8a');
  if (p.mustache) D(5, 7, 4, 1, p.hair === HAIRS[6] ? '#cfcfd8' : shade(p.hair, 1.1));
  if (!p.beard) {
    if (talk) D(6, 8, 2, 1, '#7a2a2a');
    else D(6, 8, 2, 1, p.mustache ? skinD : '#7a2a2a');
    if (talk) D(6, 9, 2, 1, '#5a1a1a');
  } else if (talk) D(6, 8, 2, 1, '#3a1a1a');
  if (p.earrings) {
    D(2, 8, 1, 1, p.earrings);
    D(11, 8, 1, 1, p.earrings);
  }
  if (clip !== undefined && clip <= 11) return;
  if (p.necklace) {
    D(4, 11, 1, 1, p.necklace);
    D(5, 12, 4, 1, p.necklace);
    D(9, 11, 1, 1, p.necklace);
  }
  if (p.bowtie) {
    D(5, 11, 4, 1, p.bowtie);
    D(6, 11, 2, 1, shade(p.bowtie, 0.7));
  }
  if (p.lanyard) {
    D(5, 11, 1, 2, p.lanyard);
    D(8, 11, 1, 2, p.lanyard);
    D(6, 13, 2, 1, p.lanyard);
    D(6, 14, 2, 2, '#f2efe6');
  }
  if (p.badge) D(9 + (p.coat ? -1 : 0), 13, 2, 1, p.hat === 'police' ? '#f2c230' : '#f4f0e4');
  if (p.stethoscope) {
    D(4, 11, 1, 2, '#5a6470');
    D(9, 11, 1, 2, '#5a6470');
    D(5, 13, 1, 1, '#5a6470');
    D(8, 13, 1, 1, '#5a6470');
    D(6, 14, 2, 1, '#5a6470');
    D(6, 15, 2, 1, '#c8d0d8');
  }
}

// A person sitting on a seat whose top is at seatY, facing dir (-1 left / 1 right).
export function drawSeated(ctx: Ctx, p: Person, x: number, seatY: number, frame = 0, dir: -1 | 1 = 1, blink = false): void {
  const y = seatY - 21; // hips land on the seat
  drawPerson(ctx, p, x, y, frame % 2, false, { clipY: 21, face: dir, blink });
  x = Math.round(x);
  const fx = dir > 0 ? x + 3 : x - 3;
  // thighs forward, shins down
  rect(ctx, fx + 2, seatY - 1, 10, 4, OUT);
  rect(ctx, fx + 3, seatY, 8, 2, p.pants);
  const sx = dir > 0 ? fx + 9 : fx + 2;
  rect(ctx, sx - 1, seatY + 1, 4, 8, OUT);
  rect(ctx, sx, seatY + 2, 2, 5, shade(p.pants, 0.85));
  rect(ctx, sx - (dir > 0 ? 0 : 1), seatY + 7, 3, 1, p.shoes ?? '#2a2a33');
}
