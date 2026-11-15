// Shift Rush, college skin: Book Return Rush. Returned books drop down the chute; steer each one
// into the cart whose call-number range matches its first letter. Twists: color-coded spines fade
// out after the warm-up, the carts get moved mid-shift, and books with a HOLD slip go to the holds shelf.
import { drawPerson, playerPerson } from '../art/people.ts';
import { bevel, cached, dither, grad, hash, INK, outlineRect, rect, shade, text, textWidth, type Ctx } from '../art/px.ts';
import { sfx } from '../ui/audio.ts';
import { approach, bigText, centered, hit, irnd, pick, shiftScore, shuffle, type ModeEnv, type ShiftMode } from './shiftKit.ts';

// Library of Congress classes (no I, O, W, X, Y) and a few real subclasses for flavor.
const LC = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'Z'];
const SUB: Record<string, string[]> = {
  A: ['AC', 'AE', 'AY'], B: ['B', 'BF', 'BL', 'BX'], C: ['CB', 'CT'], D: ['D', 'DA', 'DS'], E: ['E'], F: ['F', 'FC'],
  G: ['G', 'GV', 'GN'], H: ['HB', 'HF', 'HQ', 'HV'], J: ['JK', 'JZ'], K: ['K', 'KF'], L: ['LB', 'LC'], M: ['M', 'ML'],
  N: ['N', 'NA', 'ND'], P: ['PN', 'PR', 'PS', 'PZ'], Q: ['QA', 'QB', 'QH'], R: ['R', 'RA', 'RC'], S: ['S', 'SB', 'SF'],
  T: ['TK', 'TX'], U: ['U', 'UA'], V: ['V', 'VK'], Z: ['Z', 'ZA'],
};
const CART_C = ['#e0503c', '#3f7fd8', '#3caa6a', '#9a5ad0'];
const HOLD_C = '#f2c230';
const PLAIN = ['#7a5a3a', '#5a5a6a', '#4a3a5a', '#8a7a5a', '#3a4a4a', '#6a3a32'];
const LANE_X = [20, 60, 100, 140, 176];
const LAND_Y = 80; // top of the carts
const BW = 18;
const BH = 22;

interface Cart {
  lo: number; // index into LC
  hi: number;
  color: string;
  x: number; // current lane x (animated)
  count: number;
}
interface Book {
  lane: number;
  x: number;
  y: number;
  li: number;
  code: string;
  num: string;
  cover: string;
  hold: boolean;
  fast: boolean;
}
interface Tumble {
  x: number;
  y: number;
  vy: number;
  vr: number;
  r: number;
  cover: string;
  life: number;
}

function makeRanges(): [number, number][] {
  // Three cut points, every range at least 3 classes wide.
  for (;;) {
    const cuts = [irnd(3, 17), irnd(3, 17), irnd(3, 17)].sort((a, b) => a - b);
    if (cuts[0] >= 3 && cuts[1] - cuts[0] >= 3 && cuts[2] - cuts[1] >= 3 && LC.length - cuts[2] >= 3)
      return [
        [0, cuts[0] - 1],
        [cuts[0], cuts[1] - 1],
        [cuts[1], cuts[2] - 1],
        [cuts[2], LC.length - 1],
      ];
  }
}

const label = (c: Cart): string => `${LC[c.lo]}-${LC[c.hi]}`;

export function libraryMode({ fx, level, look }: ModeEnv): ShiftMode {
  const ranges = makeRanges();
  const carts: Cart[] = ranges.map(([lo, hi], i) => ({ lo, hi, color: CART_C[i], x: LANE_X[i], count: 0 }));
  const laneCart = shuffle([0, 1, 2, 3]); // lane -> cart index (carts get moved mid-shift)
  for (let l = 0; l < 4; l++) carts[laneCart[l]].x = LANE_X[l];
  const duration = 45;
  const colorUntil = [16, 11, 7, 3, 0][level];
  const shuffles = level >= 2 ? [15, 30] : [24];
  const holdFrom = level >= 1 ? 6 : 12;
  const target = 26 + level * 2;
  const me = playerPerson(look);
  let pt = 0;
  let book: Book | null = null;
  let next: Book | null = null;
  let spawnT = 0;
  let shuffleT = 0;
  let correct = 0;
  let wrong = 0;
  let holds = 0;
  let streak = 0;
  let best = 0;
  let dragging = false;
  let flashLane = -1;
  let flashT = 0;
  let flashGood = true;
  const tumbles: Tumble[] = [];

  const cartAt = (lane: number): Cart | null => (lane < 4 ? carts[laneCart[lane]] : null);

  function newBook(): Book {
    const hold = pt > holdFrom && Math.random() < 0.13;
    const li = irnd(0, LC.length - 1);
    const code = pick(SUB[LC[li]]);
    const owner = carts.find((c) => li >= c.lo && li <= c.hi)!;
    const colored = pt < colorUntil;
    return {
      lane: irnd(0, 3),
      x: 0,
      y: -BH - 2,
      li,
      code,
      num: String(irnd(1, 999)),
      cover: colored ? owner.color : pick(PLAIN),
      hold,
      fast: false,
    };
  }

  function land(b: Book): void {
    const c = cartAt(b.lane);
    const ok = b.hold ? b.lane === 4 : !!c && b.li >= c.lo && b.li <= c.hi;
    const cx = LANE_X[b.lane];
    flashLane = b.lane;
    flashT = 0.35;
    flashGood = ok;
    if (ok) {
      correct++;
      if (b.hold) holds++;
      streak++;
      best = Math.max(best, streak);
      if (c) c.count++;
      sfx('coin');
      fx.burst(cx, LAND_Y - 2, [b.hold ? HOLD_C : c!.color, '#fff3c4', '#ffffff'], 10, 45);
      fx.kick(0.8);
      fx.pop(cx, LAND_Y - 14, streak >= 3 ? `X${streak}!` : b.fast ? 'QUICK!' : pick(['NICE', 'SHELVED', 'YES']), '#fff3c4');
    } else {
      wrong++;
      streak = 0;
      sfx('bad');
      fx.kick(3);
      fx.blink('#ff4a3a', 0.25);
      fx.pop(cx, LAND_Y - 14, b.hold ? 'THAT WAS A HOLD' : b.lane === 4 ? 'NOT A HOLD' : 'WRONG CART', '#ff9a7a');
      tumbles.push({ x: cx, y: LAND_Y - BH, vy: -60, vr: (Math.random() < 0.5 ? -1 : 1) * 6, r: 0, cover: b.cover, life: 1.1 });
    }
  }

  function steer(lane: number): void {
    if (!book) return;
    book.lane = Math.max(0, Math.min(4, lane));
  }
  const laneOf = (x: number): number => (x >= 160 ? 4 : Math.max(0, Math.min(3, Math.floor(x / 40))));

  function drawBook(x: Ctx, b: Book, px: number, py: number, t: number): void {
    px = Math.round(px - BW / 2);
    py = Math.round(py);
    rect(x, px + 1, py + BH, BW, 1, 'rgba(20,10,30,0.35)');
    bevel(x, px, py, BW, BH, b.cover);
    rect(x, px + 1, py + 1, 2, BH - 2, shade(b.cover, 0.7)); // spine hinge
    // call-number label
    rect(x, px + 3, py + 4, BW - 5, 14, '#f8f4e8');
    outlineRect(x, px + 3, py + 4, BW - 5, 14, shade(b.cover, 0.55));
    text(x, b.code, px + 4 + Math.floor((BW - 7 - textWidth(b.code)) / 2), py + 6, INK);
    text(x, b.num, px + 4 + Math.floor((BW - 7 - textWidth(b.num)) / 2), py + 12, '#5a4a6a');
    if (b.hold) {
      const wob = Math.round(Math.sin(t * 10));
      rect(x, px + 10, py - 6 + wob, 6, 8, HOLD_C);
      outlineRect(x, px + 9, py - 7 + wob, 8, 9, INK);
      rect(x, px + 11, py - 4 + wob, 4, 1, '#8a6a10');
    }
  }

  function drawCart(x: Ctx, c: Cart, cx: number, lane: number): void {
    const px = Math.round(cx - 17);
    const y = LAND_Y;
    // books already on it
    for (let i = 0; i < Math.min(9, c.count); i++) {
      const h = 9 + Math.floor(hash(i * 7 + c.lo) * 5);
      rect(x, px + 3 + i * 3, y - h + 1, 3, h, shade([c.color, '#c8b89a', '#7a5a3a'][Math.floor(hash(i * 3 + c.lo) * 3)], 0.9 + (i % 3) * 0.08));
      rect(x, px + 3 + i * 3, y - h + 1, 1, h, 'rgba(255,255,255,0.18)');
    }
    bevel(x, px, y, 34, 4, '#9a6a3a');
    rect(x, px + 1, y + 4, 2, 16, '#6a4424');
    rect(x, px + 31, y + 4, 2, 16, '#6a4424');
    bevel(x, px, y + 13, 34, 3, '#8a5a32');
    rect(x, px + 3, y + 21, 3, 3, INK);
    rect(x, px + 28, y + 21, 3, 3, INK);
    // range plate
    const lab = label(c);
    const lw = textWidth(lab) + 6;
    const lx = Math.round(cx - lw / 2);
    rect(x, lx, y + 5, lw, 8, c.color);
    outlineRect(x, lx - 1, y + 4, lw + 2, 10, INK);
    text(x, lab, lx + 3, y + 7, '#ffffff');
    if (lane === flashLane && flashT > 0) {
      x.globalAlpha = Math.min(0.6, flashT * 2);
      rect(x, px - 2, y - 2, 38, 28, flashGood ? '#9af0a0' : '#ff5a4a');
      x.globalAlpha = 1;
    }
  }

  const bg = (): HTMLCanvasElement =>
    cached('shift-lib-bg', 192, 108, (x) => {
      grad(x, 0, 0, 192, 74, ['#4a2e2a', '#5e3a2e', '#6a4232']);
      // tall shelves full of spines
      for (let sx = 0; sx < 192; sx += 48) {
        rect(x, sx + 2, 6, 44, 66, '#3a2218');
        for (let shelf = 0; shelf < 4; shelf++) {
          const sy = 8 + shelf * 16;
          let bx = sx + 4;
          let k = sx * 13 + shelf * 7;
          while (bx < sx + 44) {
            const w = 2 + Math.floor(hash(k) * 3);
            const h = 9 + Math.floor(hash(k + 1) * 5);
            const col = ['#8a3a32', '#2e4a7a', '#3a6a4a', '#9a7a3a', '#5a3a6a', '#c8b89a', '#4a4a5a'][Math.floor(hash(k + 2) * 7)];
            rect(x, bx, sy + 14 - h, Math.min(w, sx + 44 - bx), h, shade(col, 0.75));
            bx += w;
            k += 3;
          }
          rect(x, sx + 2, sy + 14, 44, 2, '#7a4a2a');
        }
      }
      // reading lamps
      for (const lx of [24, 120]) {
        rect(x, lx, 0, 1, 4, '#2a1a14');
        rect(x, lx - 4, 4, 9, 3, '#3a6a4a');
      }
      // floor
      grad(x, 0, 74, 192, 34, ['#7a5232', '#6a4428', '#5a3820']);
      for (let i = 0; i < 192; i += 24) rect(x, i, 74, 1, 34, '#4a2e1a');
      rect(x, 0, 74, 192, 1, '#3a2218');
      // holds corner
      rect(x, 160, 0, 32, 74, '#3a2a3a');
      dither(x, 160, 0, 32, 74, '#3a2a3a', '#433044');
      rect(x, 160, 0, 1, 74, INK);
      text(x, 'NEXT', 169, 2, '#f2e6c8');
    });

  return {
    duration,
    keys: [
      { key: 'left', label: '◀' },
      { key: 'down', label: 'DROP ▼', wide: true },
      { key: 'right', label: '▶' },
    ],
    note: '← → steer the book · ↓ or SPACE drops it · or click a cart',
    touchNote: 'Tap a cart to send the book there, or steer with ◀ ▶ and DROP.',
    step(dt, _t, inp, live) {
      flashT = Math.max(0, flashT - dt);
      for (const tb of tumbles) {
        tb.life -= dt;
        tb.vy += 300 * dt;
        tb.y = Math.min(96, tb.y + tb.vy * dt);
        tb.r += tb.vr * dt;
      }
      for (let i = tumbles.length - 1; i >= 0; i--) if (tumbles[i].life <= 0) tumbles.splice(i, 1);
      for (let l = 0; l < 4; l++) {
        const c = carts[laneCart[l]];
        c.x = approach(c.x, LANE_X[l], dt * 160);
      }
      if (!next) next = newBook();
      if (!live) return;
      pt += dt;
      if (shuffleT > 0) {
        shuffleT -= dt;
        return;
      }
      if (!book) {
        if (shuffles.length && pt >= shuffles[0]) {
          shuffles.shift();
          const old = laneCart.slice();
          while (laneCart.every((v, i) => v === old[i]) || laneCart.filter((v, i) => v === old[i]).length > 1) shuffle(laneCart);
          shuffleT = 1.1;
          sfx('page');
          fx.pop(80, 50, 'CARTS MOVED!', '#ffe27a');
          fx.kick(2);
          return;
        }
        spawnT -= dt;
        if (spawnT <= 0) {
          book = next ?? newBook();
          next = newBook();
          book.x = LANE_X[book.lane];
        }
        return;
      }
      const b = book;
      if (hit(inp, 'left')) steer(b.lane - 1);
      if (hit(inp, 'right')) steer(b.lane + 1);
      if (hit(inp, 'down') || hit(inp, 'action')) {
        if (!b.fast) sfx('click');
        b.fast = true;
      }
      b.x = approach(b.x, LANE_X[b.lane], dt * 320);
      const prog = Math.min(1, pt / duration);
      const v = b.fast ? 170 : 20 + 22 * prog + level * 4;
      b.y += v * dt;
      if (b.fast && Math.random() < 0.5) fx.spray(b.x + (Math.random() - 0.5) * BW, b.y, ['#fff3c4'], 1, 0, -20, 6, 0, 0.25);
      if (b.y + BH >= LAND_Y && Math.abs(b.x - LANE_X[b.lane]) < 3) {
        land(b);
        book = null;
        spawnT = 0.22;
      }
    },
    pointer(px, _py, kind) {
      if (kind === 'down') {
        dragging = true;
        steer(laneOf(px));
      } else if (kind === 'move' && dragging) steer(laneOf(px));
      else if (kind === 'up' && dragging) {
        dragging = false;
        if (book && !book.fast) {
          book.fast = true;
          sfx('click');
        }
      }
    },
    draw(x, t) {
      x.drawImage(bg(), 0, 0);
      // lane guide under the falling book
      if (book) {
        const gx = LANE_X[book.lane];
        for (let y = Math.round(book.y + BH + 2); y < LAND_Y - 1; y += 4) rect(x, gx - 1, y, 2, 2, 'rgba(255,240,200,0.35)');
      }
      for (let l = 0; l < 4; l++) drawCart(x, carts[laneCart[l]], carts[laneCart[l]].x, l);
      // holds shelf
      bevel(x, 163, LAND_Y, 27, 4, '#c8a040');
      rect(x, 164, LAND_Y + 4, 2, 20, '#7a6020');
      rect(x, 187, LAND_Y + 4, 2, 20, '#7a6020');
      rect(x, 165, LAND_Y + 8, 23, 9, HOLD_C);
      outlineRect(x, 164, LAND_Y + 7, 25, 11, INK);
      text(x, 'HOLD', 169, LAND_Y + 10, INK);
      for (let i = 0; i < Math.min(6, holds); i++) rect(x, 166 + i * 4, LAND_Y - 9, 3, 9, shade(HOLD_C, 0.7 + (i % 2) * 0.2));
      if (flashLane === 4 && flashT > 0) {
        x.globalAlpha = Math.min(0.6, flashT * 2);
        rect(x, 161, LAND_Y - 2, 30, 28, flashGood ? '#9af0a0' : '#ff5a4a');
        x.globalAlpha = 1;
      }
      // you, at the return desk, with the next book in hand
      drawPerson(x, me, 169, 40, Math.floor(t * 2) % 2, false, { face: -1, blink: Math.floor(t * 10) % 37 === 0 });
      if (next && pt > 0) drawBook(x, next, 176, 14, t);
      for (const tb of tumbles) {
        x.save();
        x.translate(Math.round(tb.x), Math.round(tb.y));
        x.rotate(Math.round(tb.r * 4) / 4);
        rect(x, -BW / 2, -BH / 2, BW, BH, tb.cover);
        outlineRect(x, -BW / 2, -BH / 2, BW, BH, INK);
        x.restore();
      }
      if (book) drawBook(x, book, book.x, book.y, t);
      if (shuffleT > 0) bigText(x, 'CARTS MOVED!', 80, 40, 2, '#ffe27a');
      else if (pt < 3.5 && pt > 0) centered(x, 'MATCH THE FIRST LETTER', 80, 32, '#fff3c4');
      else if (pt >= colorUntil && pt < colorUntil + 2.5 && colorUntil > 0) centered(x, 'NO MORE COLOR HINTS!', 80, 32, '#ffe27a');
    },
    hud: () => [
      { label: 'Shelved', value: correct },
      { label: 'Streak', value: streak >= 2 ? `x${streak}` : '-' },
      { label: 'Misfiled', value: wrong, warn: wrong > 0 },
    ],
    result() {
      return {
        score: shiftScore(correct / Math.max(1, correct + wrong), correct / target),
        stats: { sorted: correct, mistakes: wrong, best },
        line: `${correct} BOOKS SHELVED, ${wrong} MISFILED`,
      };
    },
  };
}
