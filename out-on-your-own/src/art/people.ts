// Pixel people: the player (from their chosen look) and the cast.
import type { Look, NpcId } from '../engine/types.ts';
import { rect, type Ctx } from './px.ts';

export const SKINS = ['#f7d7bd', '#eab38c', '#c98c62', '#a26a46', '#714a32', '#4b3022'];
export const HAIRS = ['#2a1b12', '#5b3a22', '#a7652b', '#e3c26b', '#c2412f', '#14131d', '#a3a3b4', '#7a55b8'];
export const SHIRTS = ['#e0503c', '#3f7fd8', '#3caa6a', '#f2b632', '#9a5ad0', '#ef7fae', '#2fb5b0', '#eeeae0'];
export const HAIR_STYLES = ['Short', 'Long', 'Bun', 'Curly', 'Buzz', 'Ponytail'];

export interface Person {
  skin: string;
  hair: string;
  style: number;
  shirt: string;
  pants: string;
  shoes?: string;
  glasses?: boolean;
  hat?: 'cap' | 'police' | 'hard';
  coat?: string; // long coat over shirt (lab coat, blazer)
  vest?: string; // safety vest / apron
  beard?: boolean;
  tie?: string;
}

const OUT = '#1c1424';

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

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
  mom: { name: 'Mom', p: { skin: SKINS[1], hair: HAIRS[1], style: 2, shirt: '#5aa36e', pants: '#47406a', glasses: true } },
  rae: { name: 'Rae', p: { skin: SKINS[3], hair: HAIRS[7], style: 3, shirt: '#f2b632', pants: '#2f3a5c' } },
  clerk: { name: 'Gloria (DMV)', p: { skin: SKINS[2], hair: HAIRS[6], style: 2, shirt: '#8a9ab8', pants: '#3b3b4e', glasses: true } },
  banker: { name: 'Banker', p: { skin: SKINS[4], hair: HAIRS[5], style: 4, shirt: '#e8e8f0', pants: '#26304a', coat: '#2e3f6e', tie: '#c0392b' } },
  boss: { name: 'Your boss', p: { skin: SKINS[0], hair: HAIRS[2], style: 5, shirt: '#3f7fd8', pants: '#2b2b38', vest: '#ff8a1e' } },
  dentist: { name: 'Dr. Park', p: { skin: SKINS[1], hair: HAIRS[5], style: 0, shirt: '#7fd0d8', pants: '#5a8a98', coat: '#f4f6f8', glasses: true } },
  doctor: { name: 'Doctor', p: { skin: SKINS[4], hair: HAIRS[0], style: 4, shirt: '#3caa6a', pants: '#2c7a52', coat: '#f4f6f8' } },
  landlord: { name: 'Landlord', p: { skin: SKINS[5], hair: HAIRS[6], style: 4, shirt: '#b07a4a', pants: '#3a3028', beard: true } },
  roommate: { name: 'Roommate', p: { skin: SKINS[2], hair: HAIRS[0], style: 1, shirt: '#2fb5b0', pants: '#3a2f4a' } },
  dealer: { name: 'Car dealer', p: { skin: SKINS[0], hair: HAIRS[3], style: 0, shirt: '#e0503c', pants: '#2a2a33', tie: '#f2b632' } },
  cop: { name: 'Officer', p: { skin: SKINS[3], hair: HAIRS[0], style: 4, shirt: '#2b3f7a', pants: '#1f2a52', hat: 'police' } },
  advisor: { name: 'Advisor', p: { skin: SKINS[1], hair: HAIRS[4], style: 1, shirt: '#9a5ad0', pants: '#33304a', glasses: true } },
  mechanic: { name: 'Mechanic', p: { skin: SKINS[2], hair: HAIRS[0], style: 4, shirt: '#4a6a8a', pants: '#3a4a5a', hat: 'cap', beard: true } },
  grandma: { name: 'Grandma', p: { skin: SKINS[0], hair: HAIRS[6], style: 2, shirt: '#ef7fae', pants: '#6a4a6a', glasses: true } },
  taxpro: { name: 'Tax helper', p: { skin: SKINS[0], hair: HAIRS[6], style: 4, shirt: '#f2efe6', pants: '#4a4a5a', glasses: true, coat: '#6b5a44' } },
  hr: { name: 'HR', p: { skin: SKINS[3], hair: HAIRS[1], style: 5, shirt: '#ef7fae', pants: '#2f2f44', coat: '#3a3a52' } },
};

interface Part {
  x: number;
  y: number;
  w: number;
  h: number;
  c: string;
}

// Draws a 14x30 person whose feet sit at (x+7, y+30). talk = mouth open frame.
export function drawPerson(ctx: Ctx, p: Person, x: number, y: number, frame = 0, talk = false): void {
  x = Math.round(x);
  y = Math.round(y);
  const bob = frame % 2;
  const skinD = shade(p.skin, 0.82);
  const shirtD = shade(p.shirt, 0.78);
  const parts: Part[] = [];
  const P = (px: number, py: number, w: number, h: number, c: string, moving = true): void => {
    parts.push({ x: x + px, y: y + py + (moving ? bob : 0), w, h, c });
  };
  // legs & shoes (don't bob)
  P(4, 21, 3, 6, p.pants, false);
  P(7, 21, 3, 6, shade(p.pants, 0.85), false);
  P(3, 27, 4, 2, p.shoes ?? '#2a2a33', false);
  P(7, 27, 4, 2, p.shoes ?? '#2a2a33', false);
  // torso
  P(3, 11, 8, 10, p.shirt);
  P(3, 18, 8, 3, shirtD);
  if (p.vest) {
    P(3, 11, 2, 10, p.vest);
    P(9, 11, 2, 10, p.vest);
    P(5, 15, 4, 1, '#fff27a');
  }
  if (p.coat) {
    P(2, 11, 3, 12, p.coat);
    P(9, 11, 3, 12, p.coat);
  }
  if (p.tie) P(6, 12, 2, 6, p.tie);
  // arms
  P(1, 11, 2, 8, p.coat ?? p.shirt);
  P(11, 11, 2, 8, p.coat ?? p.shirt);
  P(1, 19, 2, 2, p.skin);
  P(11, 19, 2, 2, p.skin);
  // neck + head
  P(6, 10, 2, 1, skinD);
  P(2, 1, 10, 9, p.skin);
  P(2, 8, 10, 1, skinD);
  // hair
  const h = p.hair;
  switch (p.style) {
    case 0: // short
      P(2, 0, 10, 3, h);
      P(2, 3, 1, 3, h);
      P(11, 3, 1, 3, h);
      break;
    case 1: // long
      P(2, 0, 10, 3, h);
      P(1, 2, 2, 11, h);
      P(11, 2, 2, 11, h);
      break;
    case 2: // bun
      P(5, -2, 4, 2, h);
      P(2, 0, 10, 3, h);
      P(2, 3, 1, 2, h);
      P(11, 3, 1, 2, h);
      break;
    case 3: // curly
      P(1, -1, 12, 4, h);
      P(1, 3, 2, 5, h);
      P(11, 3, 2, 5, h);
      break;
    case 4: // buzz
      P(2, 0, 10, 2, h);
      break;
    default: // ponytail
      P(2, 0, 10, 3, h);
      P(12, 2, 2, 7, h);
      P(2, 3, 1, 2, h);
      break;
  }
  if (p.beard) P(3, 7, 8, 3, p.hair === HAIRS[6] ? '#cfcfd8' : shade(p.hair, 1.1));
  if (p.hat === 'cap') {
    P(2, -1, 10, 3, '#c0392b');
    P(0, 1, 4, 1, '#8e2a20');
  } else if (p.hat === 'police') {
    P(1, -2, 12, 4, '#1f2a52');
    P(1, 1, 12, 1, '#111833');
    P(6, -1, 2, 2, '#f2b632');
  } else if (p.hat === 'hard') {
    P(1, -2, 12, 4, '#f2c230');
    P(0, 1, 14, 1, '#c99a18');
  }

  // outline pass
  for (const q of parts) rect(ctx, q.x - 1, q.y - 1, q.w + 2, q.h + 2, OUT);
  for (const q of parts) rect(ctx, q.x, q.y, q.w, q.h, q.c);

  // face details (drawn after outline so they sit inside)
  const fy = y + bob;
  rect(ctx, x + 4, fy + 5, 1, 2, OUT);
  rect(ctx, x + 9, fy + 5, 1, 2, OUT);
  if (p.glasses) {
    rect(ctx, x + 3, fy + 4, 3, 1, '#3a3a4a');
    rect(ctx, x + 8, fy + 4, 3, 1, '#3a3a4a');
    rect(ctx, x + 6, fy + 5, 2, 1, '#3a3a4a');
  }
  rect(ctx, x + 3, fy + 7, 1, 1, '#f08a8a');
  rect(ctx, x + 10, fy + 7, 1, 1, '#f08a8a');
  if (!p.beard) {
    if (talk) rect(ctx, x + 6, fy + 7, 2, 2, '#7a2a2a');
    else rect(ctx, x + 6, fy + 8, 2, 1, '#7a2a2a');
  }
}
