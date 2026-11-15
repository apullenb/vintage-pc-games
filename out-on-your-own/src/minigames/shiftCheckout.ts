// Shift Rush, home skin: Checkout Rush. Groceries ride the belt toward the red laser: SCAN each one
// as it crosses. Then bag it: heavy things (cans, jugs, melons) at the BOTTOM, squishables (eggs,
// bread, chips) on TOP. Scan the odd coupon, and when a SALE item rings up at full price, hit FIX
// before you bag it. If the bagging spot backs up, the belt stops and the line grows.
import { playerPerson, SHIRTS, SKINS, HAIRS, drawPerson, type Person } from '../art/people.ts';
import { bevel, cached, disc, dither, grad, hash, INK, outlineRect, rect, shade, stipple, text, textWidth, type Ctx } from '../art/px.ts';
import { sfx } from '../ui/audio.ts';
import { centered, hit, irnd, outlined, pick, rnd, shiftScore, type ModeEnv, type ShiftMode } from './shiftKit.ts';

type Kind = 'can' | 'milk' | 'melon' | 'soap' | 'spuds' | 'juice' | 'eggs' | 'bread' | 'chips' | 'tomato' | 'banana' | 'cupcake' | 'coupon';
const HEAVY: Kind[] = ['can', 'milk', 'melon', 'soap', 'spuds', 'juice'];
const SOFT: Kind[] = ['eggs', 'bread', 'chips', 'tomato', 'banana', 'cupcake'];
const PRICE: Record<Kind, number> = { can: 1.29, milk: 3.49, melon: 5.99, soap: 8.99, spuds: 4.49, juice: 3.29, eggs: 3.89, bread: 2.99, chips: 4.29, tomato: 2.49, banana: 1.59, cupcake: 5.49, coupon: 0 };
const NAME: Record<Kind, string> = { can: 'SOUP', milk: 'MILK', melon: 'MELON', soap: 'SOAP', spuds: 'POTATOES', juice: 'JUICE', eggs: 'EGGS', bread: 'BREAD', chips: 'CHIPS', tomato: 'TOMATOES', banana: 'BANANAS', cupcake: 'CUPCAKES', coupon: 'COUPON' };

const BELT_Y = 70; // item bottoms on the belt
const LASER = 104;
const WIN = 9; // scan window, px either side of the laser
const BELT_END = 116;
const SPOTS = [140, 129, 119]; // bagging spot, then the backlog
const BAG_X = 154;
const BAG_W = 30;
const BAG_TOP = 64;
const BAG_BOT = 98;

interface Item {
  kind: Kind;
  x: number;
  y: number;
  st: 'belt' | 'wait' | 'fly' | 'bag' | 'gone';
  scanned: boolean;
  missed: boolean;
  sale: boolean; // rings up wrong unless fixed
  fixed: boolean;
  hinted: boolean;
  layer: 'top' | 'bottom';
  // flight into the bag
  fx0: number;
  fy0: number;
  fx1: number;
  fy1: number;
  ft: number;
}

const isHeavy = (k: Kind): boolean => HEAVY.includes(k);

export function drawGrocery(x: Ctx, k: Kind, cx: number, by: number): void {
  cx = Math.round(cx);
  by = Math.round(by);
  const R = (dx: number, dy: number, w: number, h: number, c: string) => rect(x, cx + dx, by + dy, w, h, c);
  const O = (dx: number, dy: number, w: number, h: number) => R(dx - 1, dy - 1, w + 2, h + 2, INK);
  switch (k) {
    case 'can':
      O(-3, -9, 7, 9);
      R(-3, -9, 7, 9, '#d0d4dc');
      R(-3, -7, 7, 5, '#d0302a');
      R(-3, -5, 7, 1, '#f4f0e4');
      R(-3, -9, 7, 1, '#f4f6f8');
      break;
    case 'milk':
      O(-4, -11, 9, 11);
      R(-4, -9, 9, 9, '#f4f6f8');
      R(-3, -11, 5, 2, '#f4f6f8');
      R(-2, -12, 3, 1, '#3f7fd8');
      R(2, -8, 2, 4, '#c8ccd8');
      R(-3, -5, 5, 3, '#3f7fd8');
      break;
    case 'melon':
      O(-6, -9, 13, 9);
      R(-6, -8, 13, 7, '#3c8a4a');
      R(-5, -9, 11, 9, '#3c8a4a');
      for (let i = -4; i <= 4; i += 3) R(i, -9, 1, 9, '#7ac85a');
      R(-4, -8, 3, 1, '#9ae07a');
      break;
    case 'soap':
      O(-4, -11, 8, 11);
      R(-4, -9, 8, 9, '#ff8a1e');
      R(-2, -11, 3, 2, '#3f7fd8');
      R(-3, -6, 6, 3, '#f4f0e4');
      R(2, -9, 2, 9, '#d06a10');
      break;
    case 'spuds':
      O(-5, -9, 11, 9);
      R(-5, -7, 11, 7, '#a8784a');
      R(-4, -9, 9, 2, '#a8784a');
      R(-1, -10, 3, 1, '#6a4a2a');
      R(-3, -5, 2, 2, '#c8985a');
      R(1, -4, 2, 2, '#c8985a');
      break;
    case 'juice':
      O(-3, -11, 7, 11);
      R(-3, -9, 7, 9, '#f2b632');
      R(-2, -11, 5, 2, '#f4f0e4');
      R(-2, -6, 5, 3, '#ff8a1e');
      break;
    case 'eggs':
      O(-6, -6, 12, 6);
      R(-6, -6, 12, 6, '#c8b89a');
      for (let i = -5; i <= 3; i += 3) R(i, -8, 2, 2, '#f4ecd8');
      R(-6, -3, 12, 1, '#a8987a');
      break;
    case 'bread':
      O(-6, -7, 12, 7);
      R(-6, -6, 12, 6, '#d8a060');
      R(-5, -7, 10, 1, '#d8a060');
      R(-5, -6, 10, 2, '#a86a30');
      R(-3, -3, 6, 2, '#f4e8c8');
      break;
    case 'chips':
      O(-4, -11, 9, 11);
      R(-4, -10, 9, 10, '#e0503c');
      R(-4, -11, 9, 1, '#f4f0e4');
      R(-2, -7, 5, 4, '#f2c230');
      R(-4, -1, 9, 1, '#a83a2a');
      break;
    case 'tomato':
      O(-5, -6, 11, 6);
      disc(x, cx - 3, by - 3, 2, '#e0402c');
      disc(x, cx + 2, by - 3, 2, '#d0302a');
      disc(x, cx, by - 5, 2, '#f05a3c');
      R(0, -8, 1, 1, '#3caa6a');
      R(-3, -6, 1, 1, '#3caa6a');
      break;
    case 'banana':
      O(-6, -6, 12, 5);
      R(-6, -4, 3, 3, '#f2d048');
      R(-4, -3, 8, 3, '#f2d048');
      R(3, -5, 3, 3, '#f2d048');
      R(-4, -1, 8, 1, '#c8a020');
      R(5, -6, 1, 1, '#6a4a2a');
      break;
    case 'cupcake':
      O(-5, -8, 11, 8);
      R(-5, -8, 11, 8, '#d8eef8');
      R(-4, -6, 4, 3, '#ef7fae');
      R(1, -6, 4, 3, '#ef7fae');
      R(-4, -3, 4, 2, '#c8985a');
      R(1, -3, 4, 2, '#c8985a');
      break;
    case 'coupon':
      O(-6, -6, 13, 6);
      R(-6, -6, 13, 6, '#f8f4e8');
      R(-6, -6, 13, 1, '#3caa6a');
      R(-6, -1, 13, 1, '#3caa6a');
      text(x, '%', cx - 5, by - 5, '#3caa6a');
      R(0, -4, 5, 1, '#8a8a9a');
      R(0, -2, 4, 1, '#8a8a9a');
      break;
  }
}

function customer(): Person {
  return {
    skin: pick(SKINS),
    hair: pick(HAIRS),
    style: irnd(0, 8),
    shirt: pick(SHIRTS),
    pants: '#3a3a4a',
    glasses: Math.random() < 0.3,
    hat: Math.random() < 0.2 ? 'cap' : undefined,
    hatColor: pick(['#c0392b', '#2e3f6e', '#3caa6a']),
  };
}

export function checkoutMode({ fx, level, look }: ModeEnv): ShiftMode {
  const me: Person = { ...playerPerson(look), apron: '#3caa6a', badge: true, shortSleeves: true };
  const duration = 45;
  const target = 25 + level * 3;
  const hintsFor = level >= 2 ? 2 : 4;
  let pt = 0;
  let belt = 0;
  let nextGap = 0;
  let items: Item[] = [];
  let lock = 0;
  let laserFlash = 0;
  let laserGood = true;
  let screen = { text: 'WELCOME', sub: '', warn: false, t: 0 };
  let bagCount = 0;
  let bagOut = 0; // slide-away animation timer for a full bag
  let cust = customer();
  let custIn = 0;
  let total = 0;
  let good = 0;
  let bad = 0;
  let bagged = 0;
  let squished = 0;
  let missed = 0;
  let fixes = 0;
  let coupons = 0;
  let overcharged = 0;
  let streak = 0;
  let best = 0;
  let shown = 0; // bagging hints shown
  let stopped = false;

  const onBelt = (): Item[] => items.filter((i) => i.st === 'belt');
  const waiting = (): Item[] => items.filter((i) => i.st === 'wait');
  const goodHit = (): void => {
    good++;
    streak++;
    best = Math.max(best, streak);
  };
  const badHit = (w = 1): void => {
    bad += w;
    streak = 0;
  };

  function spawn(): void {
    const prog = Math.min(1, pt / duration);
    let kind: Kind;
    if (pt > 6 && Math.random() < 0.08) kind = 'coupon';
    else kind = Math.random() < 0.5 ? pick(HEAVY) : pick(SOFT);
    const sale = kind !== 'coupon' && pt > (level >= 1 ? 5 : 8) && Math.random() < 0.18 + prog * 0.08;
    items.push({ kind, x: -10, y: BELT_Y, st: 'belt', scanned: false, missed: false, sale, fixed: false, hinted: false, layer: 'top', fx0: 0, fy0: 0, fx1: 0, fy1: 0, ft: 0 });
  }

  function scan(): void {
    if (lock > 0) return;
    const cand = onBelt()
      .filter((i) => !i.scanned && !i.missed && Math.abs(i.x - LASER) <= WIN)
      .sort((a, b) => Math.abs(a.x - LASER) - Math.abs(b.x - LASER))[0];
    if (!cand) {
      lock = 0.35;
      badHit(0.25);
      laserFlash = 0.2;
      laserGood = false;
      sfx('spend');
      fx.pop(LASER, 48, 'NOTHING THERE', '#c8c0d8');
      return;
    }
    cand.scanned = true;
    laserFlash = 0.25;
    laserGood = true;
    goodHit();
    const perfect = Math.abs(cand.x - LASER) <= 3;
    sfx(cand.kind === 'coupon' ? 'coin' : 'click');
    fx.burst(LASER, BELT_Y - 6, ['#ff5a4a', '#ffffff'], 5, 25, 0, 0.25);
    if (cand.kind === 'coupon') {
      screen = { text: 'COUPON', sub: '-$1.00', warn: false, t: 0 };
      fx.pop(LASER, 46, 'COUPON!', '#7cf08a');
      cand.st = 'gone';
      coupons++;
      return;
    }
    const p = PRICE[cand.kind];
    if (cand.sale) {
      screen = { text: `$${p.toFixed(2)}`, sub: `SALE $${(p * 0.6).toFixed(2)}?`, warn: true, t: 0 };
      fx.pop(LASER, 46, 'PRICE?', '#ffe27a');
    } else {
      screen = { text: `$${p.toFixed(2)}`, sub: NAME[cand.kind], warn: false, t: 0 };
      if (perfect) fx.pop(LASER, 46, 'BEEP!', '#fff3c4');
    }
    total += p;
  }

  function fix(): void {
    const it = items.find((i) => i.sale && i.scanned && !i.fixed && (i.st === 'belt' || i.st === 'wait'));
    if (!it) {
      if (lock <= 0) fx.pop(136, 24, 'PRICES OK', '#c8c0d8');
      lock = 0.25;
      return;
    }
    it.fixed = true;
    goodHit();
    fixes++;
    sfx('coin');
    const p = PRICE[it.kind] * 0.6;
    screen = { text: `$${p.toFixed(2)}`, sub: 'PRICE FIXED', warn: false, t: 0 };
    fx.pop(136, 24, 'FIXED!', '#7cf08a');
    fx.burst(137, 36, ['#7cf08a', '#ffffff'], 8, 30);
  }

  function bag(layer: 'top' | 'bottom'): void {
    const it = waiting()[0];
    if (!it) {
      if (lock <= 0) fx.pop(BAG_X + BAG_W / 2, 52, 'NOTHING TO BAG', '#c8c0d8');
      lock = 0.2;
      return;
    }
    it.st = 'fly';
    it.layer = layer;
    it.ft = 0;
    it.fx0 = it.x;
    it.fy0 = it.y;
    const n = items.filter((i) => (i.st === 'bag' || i.st === 'fly') && i.layer === layer).length - 1;
    it.fx1 = BAG_X + 7 + (n % 3) * 8;
    it.fy1 = layer === 'bottom' ? BAG_BOT - 2 - Math.floor(n / 3) * 3 : BAG_TOP + 18 - Math.floor(n / 3) * 3;
    const ok = isHeavy(it.kind) === (layer === 'bottom');
    const cx = BAG_X + BAG_W / 2;
    if (ok) {
      goodHit();
      bagged++;
      sfx('select');
      fx.pop(cx, 52, streak >= 4 ? `X${streak}!` : layer === 'bottom' ? 'HEAVY LOW' : 'SOFT ON TOP', '#fff3c4');
    } else {
      badHit();
      squished++;
      sfx('bad');
      fx.kick(3);
      fx.blink('#ff4a3a', 0.25);
      if (layer === 'bottom') {
        fx.pop(cx, 52, 'SQUISHED!', '#ff9a7a');
        fx.burst(cx, BAG_BOT - 6, it.kind === 'eggs' ? ['#f2d048', '#f8f4e8'] : ['#e0503c', '#d8a060', '#f2d048'], 14, 50);
      } else {
        fx.pop(cx, 52, 'TOO HEAVY UP TOP', '#ff9a7a');
        fx.burst(cx, BAG_TOP + 10, ['#c8a070', '#8a6a40'], 8, 40);
      }
    }
    if (it.sale && !it.fixed) {
      badHit();
      overcharged++;
      fx.pop(136, 24, 'OVERCHARGED!', '#ff9a7a');
      screen = { text: 'HEY!', sub: 'THAT WAS ON SALE', warn: true, t: 0 };
    }
    bagCount++;
    if (bagCount >= 5) {
      bagOut = 0.6;
    }
  }

  const bg = (): HTMLCanvasElement =>
    cached('shift-checkout-bg', 192, 108, (x) => {
      grad(x, 0, 0, 192, 60, ['#e8e0c8', '#d8d0b8', '#c8c0a8']);
      // shelves of groceries in the back
      for (const sy of [8, 24, 40]) {
        rect(x, 0, sy + 11, 192, 2, '#8a7a6a');
        for (let i = 0; i < 192; i += 4) {
          const h = 5 + Math.floor(hash(i + sy * 7) * 6);
          const col = ['#e0503c', '#3f7fd8', '#3caa6a', '#f2b632', '#9a5ad0', '#f4f0e4', '#ff8a1e'][Math.floor(hash(i * 3 + sy) * 7)];
          rect(x, i, sy + 11 - h, 3, h, shade(col, 0.82));
        }
      }
      stipple(x, 0, 0, 192, 60, '#000000', 0.08);
      // lane light
      rect(x, 60, 0, 1, 8, '#4a4a5a');
      bevel(x, 52, 8, 18, 10, '#3caa6a');
      text(x, '4', 59, 11, '#ffffff');
      // the counter
      rect(x, 0, 60, 192, 48, '#5a5a6a');
      grad(x, 0, 72, 192, 36, ['#3c8a5a', '#2e6e48', '#24583a']);
      rect(x, 0, 72, 192, 1, '#1c1424');
      dither(x, 0, 86, 192, 2, '#24583a', '#3c8a5a');
      text(x, 'FRESH FIELDS', 6, 94, '#d8f0c8');
      // belt bed
      rect(x, 0, 61, BELT_END + 2, 11, '#1c1424');
      rect(x, 0, 62, BELT_END, 9, '#2a2a34');
      // scanner glass
      rect(x, LASER - 7, 62, 14, 9, '#3a5a6a');
      dither(x, LASER - 7, 62, 14, 9, '#3a5a6a', '#4a7a8a');
      outlineRect(x, LASER - 8, 61, 16, 11, '#8a92a4');
      // bagging shelf
      rect(x, BELT_END + 2, 70, 74, 2, '#8a92a4');
      // register pole
      rect(x, 135, 46, 3, 15, '#4a4a5a');
    });

  function drawBag(x: Ctx, ox: number): void {
    const bx = BAG_X + ox;
    // contents
    for (const it of items) if (it.st === 'bag') drawGrocery(x, it.kind, it.fx1 + ox, it.fy1);
    // see-through tote
    x.globalAlpha = 0.28;
    rect(x, bx, BAG_TOP + 8, BAG_W, BAG_BOT - BAG_TOP - 8, '#c8e8d8');
    x.globalAlpha = 1;
    outlineRect(x, bx - 1, BAG_TOP + 7, BAG_W + 2, BAG_BOT - BAG_TOP - 6, INK);
    outlineRect(x, bx, BAG_TOP + 8, BAG_W, BAG_BOT - BAG_TOP - 8, '#3caa6a');
    // handles
    rect(x, bx + 5, BAG_TOP, 2, 8, '#3caa6a');
    rect(x, bx + BAG_W - 7, BAG_TOP, 2, 8, '#3caa6a');
    rect(x, bx + 5, BAG_TOP, BAG_W - 10, 2, '#3caa6a');
    // layer divider + labels
    for (let i = 2; i < BAG_W - 2; i += 3) rect(x, bx + i, BAG_TOP + 21, 1, 1, '#8ac8a8');
  }

  return {
    duration,
    keys: [
      { key: 'left', label: 'FIX $' },
      { key: 'up', label: 'TOP ▲' },
      { key: 'down', label: 'BOTTOM ▼' },
      { key: 'action', label: 'SCAN' },
    ],
    note: 'SPACE scans at the red laser · ↑ bags on TOP · ↓ bags at the BOTTOM · ← fixes a wrong SALE price',
    touchNote: 'Tap the belt to SCAN at the laser · tap the bag top or bottom · tap the screen to FIX a price.',
    step(dt, _t, inp, live) {
      laserFlash = Math.max(0, laserFlash - dt);
      screen.t += dt;
      custIn = Math.min(1, custIn + dt * 2);
      // flights into the bag
      for (const it of items)
        if (it.st === 'fly') {
          it.ft += dt * 4;
          const u = Math.min(1, it.ft);
          it.x = it.fx0 + (it.fx1 - it.fx0) * u;
          it.y = it.fy0 + (it.fy1 - it.fy0) * u - Math.sin(u * Math.PI) * 12;
          if (u >= 1) it.st = 'bag';
        }
      if (bagOut > 0) {
        bagOut -= dt;
        if (bagOut <= 0) {
          items = items.filter((i) => i.st !== 'bag');
          bagCount = 0;
          cust = customer();
          custIn = 0;
          sfx('coin');
          fx.pop(176, 30, 'THANKS!', '#7cf08a');
        }
      }
      if (!live) return;
      pt += dt;
      lock = Math.max(0, lock - dt);
      const prog = Math.min(1, pt / duration);
      const speed = 18 + 18 * prog + level * 3;
      const backlog = waiting().length;
      stopped = backlog >= SPOTS.length;
      if (!stopped) {
        belt += speed * dt;
        nextGap -= speed * dt;
        if (nextGap <= 0) {
          spawn();
          nextGap = Math.max(25, 48 - 24 * prog - level * 4) * rnd(0.9, 1.25);
        }
        for (const it of onBelt()) {
          it.x += speed * dt;
          if (!it.scanned && !it.missed && it.x > LASER + WIN) {
            it.missed = true;
            missed++;
            badHit(it.kind === 'coupon' ? 0.5 : 1);
            sfx('bad');
            fx.kick(1.5);
            fx.pop(LASER + 4, 46, it.kind === 'coupon' ? 'MISSED COUPON' : 'MISSED SCAN', '#ff9a7a');
          }
          if (it.x >= BELT_END) {
            if (it.kind === 'coupon') it.st = 'gone';
            else {
              it.st = 'wait';
              it.y = BELT_Y + 1;
            }
          }
        }
      }
      // waiting items slide into their spots
      waiting().forEach((it, i) => {
        const tx = SPOTS[i];
        it.x += (tx - it.x) * Math.min(1, dt * 12);
      });
      items = items.filter((i) => i.st !== 'gone');
      if (hit(inp, 'action')) scan();
      if (hit(inp, 'left')) fix();
      if (bagOut <= 0) {
        if (hit(inp, 'up')) bag('top');
        if (hit(inp, 'down')) bag('bottom');
      }
    },
    pointer(px, py, kind) {
      if (kind !== 'down') return;
      if (px >= 118 && px < 154 && py < 52) fix();
      else if (px >= 146 && py >= 52) {
        if (bagOut <= 0) bag(py < BAG_TOP + 22 ? 'top' : 'bottom');
      } else if (px < 118) scan();
    },
    draw(x, t) {
      x.drawImage(bg(), 0, 0);
      // belt treads
      const off = Math.floor(belt) % 6;
      for (let i = -6; i < BELT_END; i += 6) if (i + off < LASER - 8 || i + off > LASER + 7) rect(x, i + off, 63, 1, 7, '#3a3a46');
      // you, behind the scanner
      drawPerson(x, me, 74, 36, Math.floor(t * 2) % 2, false, { face: 1, clipY: 24, blink: Math.floor(t * 10) % 43 === 0 });
      // customer
      const cy = 35 + Math.round((1 - custIn) * 26);
      drawPerson(x, cust, 170 + (bagOut > 0 ? Math.round((0.6 - bagOut) * 60) : 0), cy, Math.floor(t * 2) % 2, false, { face: -1, clipY: 60 - cy });
      // register screen
      rect(x, 119, 23, 36, 24, INK);
      bevel(x, 120, 24, 34, 22, '#4a4a5a', false);
      const warnBlink = screen.warn && Math.floor(t * 5) % 2 === 0;
      rect(x, 122, 26, 30, 18, warnBlink ? '#3a1414' : '#0e2a1c');
      const fg = screen.warn ? '#ff7a5a' : '#7cf08a';
      text(x, screen.text, 137 - Math.floor(textWidth(screen.text) / 2), 28, fg);
      if (screen.sub) {
        const sub = screen.sub.length > 7 ? screen.sub.slice(0, 7) : screen.sub;
        text(x, sub, 137 - Math.floor(textWidth(sub) / 2), 35, screen.warn ? '#ffe27a' : '#5ac87a');
      }
      // laser
      const lc = laserFlash > 0 ? (laserGood ? '#7cf08a' : '#ff5a4a') : '#ff3a2a';
      rect(x, LASER, 54, 1, 16, lc);
      x.globalAlpha = 0.25 + 0.1 * Math.sin(t * 20);
      rect(x, LASER - 2, 56, 5, 14, lc);
      x.globalAlpha = 1;
      // bag (slides off when full)
      const bo = bagOut > 0 ? Math.round((0.6 - bagOut) * 80) : 0;
      drawBag(x, bo);
      // groceries
      for (const it of items) {
        if (it.st === 'bag') continue;
        drawGrocery(x, it.kind, it.x, it.y);
        if (it.sale && it.st !== 'fly') {
          const lab = it.fixed ? 'OK' : 'SALE';
          const tw = textWidth(lab) + 2;
          const sx = Math.round(it.x - tw / 2);
          const sy = Math.round(it.y) - 19;
          rect(x, sx - 1, sy - 1, tw + 2, 8, INK);
          rect(x, sx, sy, tw, 6, it.fixed ? '#7cf08a' : '#f2d048');
          text(x, lab, sx + 1, sy + 1, INK);
          rect(x, Math.round(it.x), sy + 7, 1, 2, INK);
        }
        if (it.scanned && it.st === 'belt' && it.kind !== 'coupon') rect(x, Math.round(it.x) - 1, Math.round(it.y) + 1, 3, 1, '#7cf08a');
      }
      // bagging hint for the first few items
      const front = waiting()[0];
      if (front && front.st === 'wait') {
        if (shown < hintsFor || pt < 8) {
          const heavy = isHeavy(front.kind);
          outlined(x, heavy ? 'HEAVY' : 'SOFT', 124, 49, heavy ? '#ffc89a' : '#bfe8ff');
          outlined(x, heavy ? 'BOTTOM' : 'TOP', 124, 55, '#fff3c4');
        }
        const blink = Math.floor(t * 4) % 2;
        if (blink) outlineRect(x, Math.round(front.x) - 7, BELT_Y - 13, 15, 15, '#ffe27a');
      }
      if (front && !front.hinted) {
        front.hinted = true;
        shown++;
      }
      // scan-window brackets
      rect(x, LASER - WIN, 72, 1, 3, '#ff9a7a');
      rect(x, LASER + WIN, 72, 1, 3, '#ff9a7a');
      if (stopped) {
        const b = Math.floor(t * 4) % 2;
        if (b) centered(x, 'BELT STOPPED: BAG FASTER!', 70, 78, '#ffe27a');
      } else if (pt > 0 && pt < 3) centered(x, 'SCAN ON THE RED LASER', 60, 78, '#fff3c4');
      text(x, `$${total.toFixed(2)}`, 6, 101, '#fff3c4');
    },
    hud: () => [
      { label: 'Bagged', value: bagged },
      { label: 'Streak', value: streak >= 2 ? `x${streak}` : '-' },
      { label: 'Oops', value: missed + squished + overcharged, warn: missed + squished + overcharged > 0 },
    ],
    result() {
      return {
        score: shiftScore(good / Math.max(1, good + bad), bagged / target),
        stats: { sorted: bagged, mistakes: squished, missed, overcharged, fixes, coupons, best },
        line: `${bagged} BAGGED, ${squished} SQUISHED, ${missed} MISSED`,
      };
    },
  };
}
