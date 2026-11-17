// Shift Rush, college skin: Book Return Rush. Returned books drop down the chute; steer each one
// into the cart whose call-number range matches its first letter. Twists: color-coded spines fade
// out after the warm-up, the carts get moved mid-shift, and books with a HOLD slip go to the holds shelf.
import { playerPerson } from '../art/people.ts';
import { hash, INK, text, textWidth, type Ctx } from '../art/px.ts';
import { sfx } from '../ui/audio.ts';
import { ball, beam, bigWord, blit, ctext, cyl, ell, haze, layer, lin, pool, rgba, sbox, shadow, tint, vfill } from './hd2Kit.tsx';
import { person } from './hd2Person.ts';
import { approach, hit, irnd, pick, shiftScore, shuffle, type ModeEnv, type ShiftMode } from './shiftKit.ts';

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
    px = px - BW / 2;
    shadow(x, px + BW / 2 + 1, py + BH + 0.5, BW * 0.6, 1.6, 0.35);
    hardcover(x, px, py, BW, BH, b.cover);
    // call-number label
    sbox(x, px + 3, py + 4, BW - 5, 14, '#fbf6e8', { r: 1, gloss: 0.2, outline: rgba(tint(b.cover, 0.45), 0.9) });
    const lx = Math.round(px);
    const ly = Math.round(py);
    text(x, b.code, lx + 4 + Math.floor((BW - 7 - textWidth(b.code)) / 2), ly + 6, INK);
    text(x, b.num, lx + 4 + Math.floor((BW - 7 - textWidth(b.num)) / 2), ly + 12, '#5a4a6a');
    if (b.hold) {
      const wob = Math.sin(t * 10);
      x.save();
      x.translate(px + 13, py - 2 + wob);
      x.rotate(wob * 0.08);
      sbox(x, -3, -4, 6, 8, HOLD_C, { r: 0.8, gloss: 0.4 });
      x.fillStyle = '#8a6a10';
      x.fillRect(-2, -1.5, 4, 0.7);
      x.restore();
    }
  }

  function drawCart(x: Ctx, c: Cart, cx: number, lane: number): void {
    const px = cx - 17;
    const y = LAND_Y;
    shadow(x, cx, y + 24, 20, 2.4, 0.45);
    // books already on it
    for (let i = 0; i < Math.min(9, c.count); i++) {
      const h = 9 + Math.floor(hash(i * 7 + c.lo) * 5);
      const col = tint([c.color, '#c8b89a', '#7a5a3a'][Math.floor(hash(i * 3 + c.lo) * 3)], 0.9 + (i % 3) * 0.08);
      cyl(x, px + 3 + i * 3, y - h + 1, 3, h, col, { spec: 0.3 });
    }
    // frame: legs, shelves, wheels
    cyl(x, px + 1, y + 3, 2, 18, '#6a4424', { spec: 0.25 });
    cyl(x, px + 31, y + 3, 2, 18, '#5a3a20', { spec: 0.2 });
    sbox(x, px, y, 34, 4, '#a8743e', { r: 1, gloss: 0.5 });
    sbox(x, px, y + 13, 34, 3, '#8a5a32', { r: 1, gloss: 0.35 });
    ball(x, px + 4.5, y + 22.5, 1.8, '#3a3440', 1.8, 0.5);
    ball(x, px + 29.5, y + 22.5, 1.8, '#3a3440', 1.8, 0.5);
    // range plate
    const lab = label(c);
    const lw = textWidth(lab) + 6;
    const lx = Math.round(cx - lw / 2);
    sbox(x, lx - 1, y + 4, lw + 2, 10, c.color, { r: 2, gloss: 0.5 });
    text(x, lab, lx + 3, y + 7, '#ffffff');
    if (lane === flashLane && flashT > 0) pool(x, cx, y + 6, 26, 18, flashGood ? '#9af0a0' : '#ff5a4a', Math.min(0.7, flashT * 2.4));
  }

  // A glossy hardcover: board with a rounded spine, embossed band, top sheen.
  function hardcover(x: Ctx, px: number, py: number, w: number, h: number, cover: string): void {
    sbox(x, px, py, w, h, cover, { r: 1.4, gloss: 0.4, lw: 0.6 });
    x.fillStyle = lin(x, px, 0, px + 3.4, 0, [tint(cover, 0.5), tint(cover, 1.1), tint(cover, 0.7)]);
    x.fillRect(px + 0.6, py + 0.6, 2.8, h - 1.2);
    x.fillStyle = rgba(tint(cover, 1.5), 0.5);
    x.fillRect(px + 3.5, py + 1.6, w - 4.5, 0.5);
    x.fillRect(px + 3.5, py + h - 2.2, w - 4.5, 0.5);
  }

  const bg = (): HTMLCanvasElement =>
    layer('hd-lib-bg', 192, 108, (x) => {
      // warm wood-panelled stacks
      vfill(x, 0, 0, 192, 76, ['#2a1814', '#4a2c22', '#5e3a2a']);
      for (let sx = 0; sx < 160; sx += 48) {
        // shelf unit: deep recess with a lit face frame
        vfill(x, sx + 2, 5, 44, 68, ['#1c0e0a', '#2e1a12']);
        for (let shelf = 0; shelf < 4; shelf++) {
          const sy = 8 + shelf * 16;
          vfill(x, sx + 3, sy, 42, 14, ['#160a08', '#3a2218']);
          let bx = sx + 4;
          let k = sx * 13 + shelf * 7;
          while (bx < sx + 44) {
            const w = 2 + Math.floor(hash(k) * 3);
            const h = 9 + Math.floor(hash(k + 1) * 5);
            const col = ['#8a3a32', '#2e4a7a', '#3a6a4a', '#9a7a3a', '#5a3a6a', '#c8b89a', '#4a4a5a'][Math.floor(hash(k + 2) * 7)];
            const ww = Math.min(w, sx + 44 - bx);
            cyl(x, bx, sy + 14 - h, ww, h, tint(col, 0.8), { spec: 0.18 });
            x.fillStyle = 'rgba(255,220,140,0.35)';
            x.fillRect(bx + 0.3, sy + 16 - h, ww - 0.6, 0.4);
            bx += w;
            k += 3;
          }
          // ambient occlusion at the top of each bay
          vfill(x, sx + 3, sy, 42, 5, ['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']);
          sbox(x, sx + 2, sy + 14, 44, 2.2, '#8a5630', { r: 0.4, gloss: 0.5, outline: 'rgba(30,14,8,0.7)' });
        }
        sbox(x, sx + 1, 4, 2.4, 70, '#6a3e24', { r: 0.6, gloss: 0.2, vert: false });
        sbox(x, sx + 44.6, 4, 2.4, 70, '#5a3420', { r: 0.6, gloss: 0.1, vert: false });
      }
      // depth haze over the stacks
      haze(x, 0, 0, 192, 76, '#3a2418', 0.25, 0);
      // floor: polished planks receding to a vanishing point
      vfill(x, 0, 74, 192, 34, ['#5a3820', '#8a5a34', '#6a4226']);
      x.strokeStyle = 'rgba(40,20,10,0.5)';
      x.lineWidth = 0.4;
      for (let i = -96; i <= 288; i += 16) {
        x.beginPath();
        x.moveTo(96 + (i - 96) * 0.55, 74);
        x.lineTo(i, 108);
        x.stroke();
      }
      for (const fy of [80, 88, 99]) {
        x.fillStyle = 'rgba(30,14,8,0.25)';
        x.fillRect(0, fy, 192, 0.4);
      }
      // reflections of the lamps in the varnish
      for (const lx of [24, 120]) pool(x, lx, 84, 28, 6, '#ffcf80', 0.18);
      vfill(x, 0, 74, 192, 3, ['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)']);
      // holds corner: a darker alcove
      vfill(x, 160, 0, 32, 74, ['#2a1c30', '#3a2a40', '#2e2236']);
      vfill(x, 160, 0, 3, 74, ['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.3)']);
      ctext(x, 'NEXT', 176, 2, '#f2e6c8', false, 6);
    });

  // banker's lamps: brass stems, green glass shades, warm pools of light (drawn over everything)
  const lamps = (): HTMLCanvasElement =>
    layer('hd-lib-light', 192, 108, (x) => {
      for (const lx of [24, 120]) {
        beam(x, lx - 4, lx + 4, 7, lx - 30, lx + 30, 100, '#ffd890', 0.24);
        pool(x, lx, 12, 38, 30, '#ffc060', 0.42);
      }
    });
  function lampHeads(x: Ctx): void {
    for (const lx of [24, 120]) {
      x.fillStyle = '#2a1a14';
      x.fillRect(lx - 0.3, 0, 0.8, 4);
      x.beginPath();
      x.moveTo(lx - 5, 7.4);
      x.quadraticCurveTo(lx - 4, 3.2, lx + 0.25, 3.2);
      x.quadraticCurveTo(lx + 4.5, 3.2, lx + 5.5, 7.4);
      x.closePath();
      x.fillStyle = lin(x, lx - 5, 3, lx + 5, 7, ['#7ad08a', '#2e7a4a', '#163a24']);
      x.fill();
      ell(x, lx + 0.25, 7.4, 5.2, 0.9);
      x.fillStyle = '#fff2c0';
      x.fill();
    }
  }
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
      blit(x, bg(), 0, 0, 192, 108);
      // lane guide under the falling book
      if (book) {
        const gx = LANE_X[book.lane];
        beam(x, gx - BW / 2, gx + BW / 2, book.y + BH, gx - 13, gx + 13, LAND_Y, '#fff0c8', 0.12);
        for (let y = book.y + BH + 2; y < LAND_Y - 1; y += 4) {
          ell(x, gx, y + 1, 0.9, 0.9);
          x.fillStyle = 'rgba(255,240,200,0.45)';
          x.fill();
        }
      }
      for (let l = 0; l < 4; l++) drawCart(x, carts[laneCart[l]], carts[laneCart[l]].x, l);
      // holds shelf
      shadow(x, 176, LAND_Y + 24, 15, 2.2, 0.45);
      for (let i = 0; i < Math.min(6, holds); i++) cyl(x, 166 + i * 4, LAND_Y - 9, 3, 9, tint(HOLD_C, 0.7 + (i % 2) * 0.2), { spec: 0.35 });
      cyl(x, 164, LAND_Y + 3, 2, 21, '#7a6020', { spec: 0.3 });
      cyl(x, 187, LAND_Y + 3, 2, 21, '#6a5018', { spec: 0.2 });
      sbox(x, 163, LAND_Y, 27, 4, '#d0a848', { r: 1, gloss: 0.5 });
      sbox(x, 164, LAND_Y + 7, 25, 11, HOLD_C, { r: 2, gloss: 0.45 });
      text(x, 'HOLD', 169, LAND_Y + 10, INK);
      if (flashLane === 4 && flashT > 0) pool(x, 176, LAND_Y + 6, 20, 18, flashGood ? '#9af0a0' : '#ff5a4a', Math.min(0.7, flashT * 2.4));
      // you, at the return desk, with the next book in hand
      person(x, me, 169, 40, Math.floor(t * 2) % 2, false, { face: -1, blink: Math.floor(t * 10) % 37 === 0 });
      if (next && pt > 0) drawBook(x, next, 176, 14, t);
      for (const tb of tumbles) {
        x.save();
        x.translate(tb.x, tb.y);
        x.rotate(tb.r);
        x.globalAlpha = Math.min(1, tb.life * 2);
        hardcover(x, -BW / 2, -BH / 2, BW, BH, tb.cover);
        x.restore();
      }
      if (book) drawBook(x, book, book.x, book.y, t);
      x.globalCompositeOperation = 'lighter';
      blit(x, lamps(), 0, 0, 192, 108);
      x.globalCompositeOperation = 'source-over';
      lampHeads(x);
      if (shuffleT > 0) bigWord(x, 'CARTS MOVED!', 80, 40, 14, '#ffe27a', '#ff9a2a');
      else if (pt < 3.5 && pt > 0) ctext(x, 'MATCH THE FIRST LETTER', 80, 32, '#fff3c4');
      else if (pt >= colorUntil && pt < colorUntil + 2.5 && colorUntil > 0) ctext(x, 'NO MORE COLOR HINTS!', 80, 32, '#ffe27a');
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
