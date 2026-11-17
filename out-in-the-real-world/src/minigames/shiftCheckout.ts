// Shift Rush, home skin: Checkout Rush. Groceries ride the belt toward the red laser: SCAN each one
// as it crosses. Then bag it: heavy things (cans, jugs, melons) at the BOTTOM, squishables (eggs,
// bread, chips) on TOP. Scan the odd coupon, and when a SALE item rings up at full price, hit FIX
// before you bag it. If the bagging spot backs up, the belt stops and the line grows.
import { playerPerson, SHIRTS, SKINS, HAIRS, type Person } from '../art/people.ts';
import { blit, ctext, cyl, glare, otext, haze, label, layer, lin, pool, rgba, rr, sbox, shadow, vfill } from './hd2Kit.tsx';
import { hdGrocery, shelfProducts } from './hd2Groceries.ts';
import { person } from './hd2Person.ts';
import { INK, text, textWidth, type Ctx } from '../art/px.ts';
import { sfx } from '../ui/audio.ts';
import { hit, irnd, pick, rnd, shiftScore, type ModeEnv, type ShiftMode } from './shiftKit.ts';

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
    layer('hd-checkout-bg', 192, 108, (x) => {
      // back wall of shelving, warm under fluorescents
      vfill(x, 0, 0, 192, 60, ['#fbf3dc', '#e8dcbc', '#c9bb98']);
      for (const sy of [8, 24, 40]) {
        // recessed shelf bay: darker at the back top, lit at the front lip
        vfill(x, 0, sy - 1, 192, 13, ['#6a5c4c', '#9a8a72', '#c8b896']);
        shelfProducts(x, 0, 192, sy + 11, sy * 13 + 7, ['#e0503c', '#3f7fd8', '#3caa6a', '#f2b632', '#9a5ad0', '#f4f0e4', '#ff8a1e'], 0.2);
        sbox(x, -2, sy + 11, 196, 2.2, '#b8a88e', { r: 0.4, gloss: 0.5, outline: 'rgba(60,40,30,0.5)' });
        vfill(x, 0, sy + 13.2, 192, 3, ['rgba(40,28,20,0.35)', 'rgba(40,28,20,0)']);
      }
      // aerial haze pushes the shelves back
      haze(x, 0, 0, 192, 60, '#fff6e0', 0.28, 0.1);
      // ceiling and its tubes
      vfill(x, 0, 0, 192, 4, ['#cfc6b0', '#e8e0cc']);
      for (const tx of [8, 72, 136]) {
        sbox(x, tx, 0.6, 48, 1.8, '#fffef4', { r: 0.9, gloss: 0.6, outline: 'rgba(120,110,90,0.6)' });
        pool(x, tx + 24, 3, 40, 22, '#fff4d0', 0.32);
      }
      // lane light
      cyl(x, 60, 0, 1.4, 8, '#5a5a6a');
      sbox(x, 52, 8, 18, 10, '#2e9a5a', { r: 2, gloss: 0.5 });
      pool(x, 61, 13, 14, 9, '#7cf08a', 0.35);
      label(x, '4', 61, 13.3, 8, '#f4fff0', 'rgba(10,60,30,0.9)');
      // the counter: steel lip, belt bed, laminate front
      vfill(x, 0, 59.5, 192, 2.5, ['#f4f6fa', '#9aa2b0', '#5a6070']);
      rr(x, -2, 61, BELT_END + 4, 11.5, 2);
      x.fillStyle = '#1c1424';
      x.fill();
      vfill(x, 0, 62, BELT_END, 9, ['#4a4a58', '#2a2a34', '#1e1e26']);
      vfill(x, 0, 72, 192, 36, ['#4cab70', '#2e7a4c', '#1e5434']);
      vfill(x, 0, 72, 192, 1.6, ['#c8f0d0', 'rgba(60,140,90,0)']);
      x.fillStyle = 'rgba(10,30,20,0.25)';
      for (let i = 0; i < 192; i += 24) x.fillRect(i, 73, 0.5, 35);
      // soft reflection of the store lights in the laminate
      for (const tx of [8, 72, 136]) pool(x, tx + 24, 76, 22, 3, '#ffffff', 0.12);
      vfill(x, 0, 86, 192, 2, ['rgba(20,50,30,0.5)', 'rgba(150,220,170,0.35)']);
      label(x, 'FRESH FIELDS', 7, 96.5, 6.5, '#e6ffd8', 'rgba(10,40,20,0.85)', 'left', 900);
      // scanner glass
      rr(x, LASER - 8, 61, 16, 11, 1.5);
      x.fillStyle = '#9aa2b0';
      x.fill();
      vfill(x, LASER - 7, 62, 14, 9, ['#4a8a9a', '#2a5a6a', '#183a48']);
      glare(x, LASER - 7, 62, 14, 9, 0.35);
      // bagging shelf + register pole
      vfill(x, BELT_END + 2, 69.5, 76, 2.5, ['#f4f6fa', '#9aa2b0', '#5a6070']);
      cyl(x, 135, 46, 3, 15, '#5a5a6a', { spec: 0.4 });
    });

  function drawBag(x: Ctx, ox: number): void {
    const bx = BAG_X + ox;
    shadow(x, bx + BAG_W / 2, BAG_BOT + 0.5, BAG_W * 0.6, 2.4, 0.4);
    // back of the tote
    rr(x, bx, BAG_TOP + 8, BAG_W, BAG_BOT - BAG_TOP - 8, 2);
    x.fillStyle = 'rgba(40,110,80,0.35)';
    x.fill();
    // contents
    for (const it of items) if (it.st === 'bag') hdGrocery(x, it.kind, it.fx1 + ox, it.fy1, false);
    // see-through front with a sheen
    rr(x, bx, BAG_TOP + 8, BAG_W, BAG_BOT - BAG_TOP - 8, 2);
    x.fillStyle = lin(x, bx, 0, bx + BAG_W, 0, ['rgba(200,240,220,0.35)', 'rgba(200,240,220,0.1)', 'rgba(60,140,100,0.3)']);
    x.fill();
    x.lineWidth = 1.1;
    x.strokeStyle = '#2e8a5a';
    x.stroke();
    x.lineWidth = 0.4;
    x.strokeStyle = 'rgba(200,255,220,0.7)';
    rr(x, bx + 0.8, BAG_TOP + 8.8, BAG_W - 1.6, BAG_BOT - BAG_TOP - 9.6, 1.5);
    x.stroke();
    glare(x, bx, BAG_TOP + 8, BAG_W, BAG_BOT - BAG_TOP - 8, 0.2);
    // handles
    x.lineCap = 'round';
    x.lineWidth = 1.6;
    x.strokeStyle = '#2e8a5a';
    x.beginPath();
    x.moveTo(bx + 6, BAG_TOP + 8.5);
    x.bezierCurveTo(bx + 6, BAG_TOP - 1.5, bx + BAG_W - 6, BAG_TOP - 1.5, bx + BAG_W - 6, BAG_TOP + 8.5);
    x.stroke();
    x.lineWidth = 0.5;
    x.strokeStyle = 'rgba(190,255,215,0.7)';
    x.stroke();
    x.lineCap = 'butt';
    // layer divider
    x.setLineDash([1, 1.5]);
    x.lineWidth = 0.5;
    x.strokeStyle = 'rgba(160,230,200,0.8)';
    x.beginPath();
    x.moveTo(bx + 2, BAG_TOP + 21.5);
    x.lineTo(bx + BAG_W - 2, BAG_TOP + 21.5);
    x.stroke();
    x.setLineDash([]);
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
      blit(x, bg(), 0, 0, 192, 108);
      // belt treads, lit on top
      const off = belt % 6;
      for (let i = -6; i < BELT_END; i += 6) {
        const bx = i + off;
        if (bx < LASER - 8 || bx > LASER + 7) {
          x.fillStyle = 'rgba(110,110,130,0.55)';
          x.fillRect(bx, 63, 0.6, 7);
          x.fillStyle = 'rgba(0,0,0,0.4)';
          x.fillRect(bx + 0.6, 63, 0.5, 7);
        }
      }
      // you, behind the scanner
      person(x, me, 74, 36, Math.floor(t * 2) % 2, false, { face: 1, clipY: 24, blink: Math.floor(t * 10) % 43 === 0 });
      // customer
      const cy = 35 + Math.round((1 - custIn) * 26);
      person(x, cust, 170 + (bagOut > 0 ? Math.round((0.6 - bagOut) * 60) : 0), cy, Math.floor(t * 2) % 2, false, { face: -1, clipY: 60 - cy });
      // counter edge shadow under the people
      vfill(x, 0, 60, 192, 2, ['rgba(20,10,30,0.25)', 'rgba(20,10,30,0)']);
      // register monitor
      shadow(x, 137, 47, 18, 3, 0.35);
      sbox(x, 119, 23, 36, 24, '#4a4a5a', { r: 2.5, gloss: 0.3 });
      const warnBlink = screen.warn && Math.floor(t * 5) % 2 === 0;
      rr(x, 121.5, 25.5, 31, 19, 1.4);
      x.fillStyle = warnBlink ? lin(x, 0, 25, 0, 45, ['#5a1a18', '#2a0a0a']) : lin(x, 0, 25, 0, 45, ['#14402a', '#0a2016']);
      x.fill();
      const fg = screen.warn ? '#ff7a5a' : '#7cf08a';
      pool(x, 137, 34, 15, 9, fg, 0.22);
      text(x, screen.text, 137 - Math.floor(textWidth(screen.text) / 2), 28, fg);
      if (screen.sub) {
        const sub = screen.sub.length > 7 ? screen.sub.slice(0, 7) : screen.sub;
        text(x, sub, 137 - Math.floor(textWidth(sub) / 2), 35, screen.warn ? '#ffe27a' : '#5ac87a');
      }
      x.fillStyle = 'rgba(0,0,0,0.18)';
      for (let sy = 26; sy < 44; sy += 1) x.fillRect(122, sy + 0.5, 30, 0.25);
      glare(x, 121.5, 25.5, 31, 19, 0.16);
      // laser: a hot core with bloom on the belt
      const lc = laserFlash > 0 ? (laserGood ? '#7cf08a' : '#ff5a4a') : '#ff3a2a';
      const pulse = 0.75 + 0.25 * Math.sin(t * 20);
      pool(x, LASER + 0.5, 62, 6, 10, lc, 0.5 * pulse);
      pool(x, LASER + 0.5, 70, 10, 2.5, lc, 0.7);
      x.fillStyle = lin(x, 0, 54, 0, 70, [rgba(lc, 0.2), rgba(lc, 1)]);
      x.fillRect(LASER, 54, 1, 16);
      x.fillStyle = 'rgba(255,240,230,0.9)';
      x.fillRect(LASER + 0.35, 56, 0.3, 14);
      // bag (slides off when full)
      const bo = bagOut > 0 ? Math.round((0.6 - bagOut) * 80) : 0;
      drawBag(x, bo);
      // groceries
      for (const it of items) {
        if (it.st === 'bag') continue;
        hdGrocery(x, it.kind, it.x, it.y, it.st !== 'fly');
        if (Math.abs(it.x - LASER) < 6 && it.st === 'belt') pool(x, LASER, it.y - 5, 5, 6, lc, 0.25);
        if (it.sale && it.st !== 'fly') {
          const lab = it.fixed ? 'OK' : 'SALE';
          const tw = textWidth(lab) + 2;
          const sx = Math.round(it.x - tw / 2);
          const sy = Math.round(it.y) - 19;
          sbox(x, sx - 1, sy - 1, tw + 2, 8, it.fixed ? '#7cf08a' : '#f2d048', { r: 1.5, gloss: 0.45 });
          text(x, lab, sx + 1, sy + 1, INK);
          x.fillStyle = 'rgba(28,20,36,0.8)';
          x.fillRect(it.x - 0.3, sy + 7, 0.6, 2);
        }
        if (it.scanned && it.st === 'belt' && it.kind !== 'coupon') pool(x, it.x, it.y + 1, 3, 1.2, '#7cf08a', 0.8);
      }
      // bagging hint for the first few items
      const front = waiting()[0];
      if (front && front.st === 'wait') {
        if (shown < hintsFor || pt < 8) {
          const heavy = isHeavy(front.kind);
          otext(x, heavy ? 'HEAVY' : 'SOFT', 123, 48, heavy ? '#ffc89a' : '#bfe8ff');
          otext(x, heavy ? 'BOTTOM' : 'TOP', 123, 55, '#fff3c4');
        }
        const blink = 0.55 + 0.45 * Math.sin(t * 12);
        x.lineWidth = 0.8;
        x.strokeStyle = rgba('#ffe27a', blink);
        rr(x, front.x - 7, BELT_Y - 13, 15, 15, 2.5);
        x.stroke();
        pool(x, front.x, BELT_Y - 6, 9, 9, '#ffe27a', 0.18 * blink);
      }
      if (front && !front.hinted) {
        front.hinted = true;
        shown++;
      }
      // scan-window brackets
      x.fillStyle = '#ff9a7a';
      x.fillRect(LASER - WIN, 72, 0.8, 3);
      x.fillRect(LASER + WIN, 72, 0.8, 3);
      if (stopped) {
        const b = Math.floor(t * 4) % 2;
        if (b) ctext(x, 'BELT STOPPED: BAG FASTER!', 70, 78, '#ffe27a');
      } else if (pt > 0 && pt < 3) ctext(x, 'SCAN ON THE RED LASER', 60, 78, '#fff3c4');
      otext(x, `$${total.toFixed(2)}`, 7, 100, '#fff3c4', 6.5);
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
