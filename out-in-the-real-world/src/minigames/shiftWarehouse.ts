// Shift Rush, work skin: Package Sort. Parcels ride the overhead belt and tip off at the arrow;
// walk under them to catch (up to 3 at once), then carry each to the chute for its zone, where it
// slides in. Fragile parcels shatter if they hit the floor; heavy ones slow you down. Twists: the
// label printer runs out of color ink (read the letters), and PEAK RUSH speeds up the belt.
import { playerPerson } from '../art/people.ts';
import { bevel, cached, dither, grad, INK, outlineRect, rect, shade, stipple, text, type Ctx } from '../art/px.ts';
import { sfx } from '../ui/audio.ts';
import { drawRunner, shadow } from './busRunner.ts';
import { approach, bigText, centered, irnd, pick, rnd, shiftScore, shuffle, type ModeEnv, type ShiftMode } from './shiftKit.ts';

const ZONES = [
  { l: 'A', c: '#e0503c' },
  { l: 'B', c: '#3f7fd8' },
  { l: 'C', c: '#3caa6a' },
  { l: 'D', c: '#f2b632' },
];
const CHUTE_X = [26, 72, 120, 166];
const FLOOR = 103; // feet line
const BELT_Y = 15; // parcels ride on top of this line
const MAX_CARRY = 3;
const FLOOR_TIME = 3; // seconds a dropped (unbroken) parcel waits to be picked back up
const G = 85;

interface Parcel {
  x: number;
  y: number; // bottom of the box
  vy: number;
  zone: number;
  fragile: boolean;
  heavy: boolean;
  w: number;
  h: number;
  dropX: number;
  st: 'belt' | 'fall' | 'held' | 'chute' | 'floor';
  t: number; // state timer
  tx: number; // chute target for the toss
  ty: number;
  noCatch: boolean; // bounced off a full stack
  plain: boolean; // printed without color: read the letter
}

export function warehouseMode({ fx, level, look }: ModeEnv): ShiftMode {
  const me = { ...playerPerson(look), vest: '#ff8a1e' };
  const order = shuffle([0, 1, 2, 3]); // chute slot -> zone
  const duration = 45;
  const rushAt = level >= 2 ? 16 : 24;
  const rushLen = 9;
  const target = 14 + level * 2;
  const inkAt = [27, 20, 14, 10, 8][level];
  let inkAnnounced = false;
  let depositCd = 0;
  let pt = 0;
  let px = 96;
  let vx = 0;
  let face: -1 | 1 = 1;
  let walkPh = 0;
  let spawnT = 0.4;
  let goal: number | null = null; // touch: walk here
  let dragging = false;
  let good = 0;
  let dropped = 0;
  let broken = 0;
  let fumbles = 0; // hit the floor (can still be picked up)
  let recovered = 0;
  let streak = 0;
  let best = 0;
  let beltOff = 0;
  let rushAnnounced = false;
  const ps: Parcel[] = [];
  const held: Parcel[] = [];

  const rush = (): boolean => pt >= rushAt && pt < rushAt + rushLen;
  const slotNear = (x: number): number => {
    let best = -1;
    let d = 15;
    for (let i = 0; i < 4; i++) if (Math.abs(CHUTE_X[i] - x) < d) (d = Math.abs(CHUTE_X[i] - x)), (best = i);
    return best;
  };
  const carryH = (): number => held.reduce((a, p) => a + p.h, 0);

  function spawn(): void {
    const fragile = pt > 6 && Math.random() < 0.18 + level * 0.03;
    const heavy = !fragile && pt > 8 && Math.random() < 0.18;
    const w = heavy ? 15 : fragile ? 11 : pick([11, 12, 13]);
    const h = heavy ? 10 : fragile ? 9 : pick([8, 9]);
    // drop somewhere reachable and not right on top of the previous drop point
    let dropX = rnd(14, 178);
    const last = ps.filter((p) => p.st === 'belt').at(-1);
    if (last && Math.abs(last.dropX - dropX) < 18) dropX = Math.max(14, Math.min(178, dropX + (dropX < 96 ? 40 : -40)));
    ps.push({ x: -w, y: BELT_Y, vy: 0, zone: irnd(0, 3), fragile, heavy, w, h, dropX, st: 'belt', t: 0, tx: 0, ty: 0, noCatch: false, plain: pt >= inkAt });
  }

  function lose(p: Parcel): void {
    p.st = 'floor';
    p.t = 0;
    streak = 0;
    if (p.fragile) {
      broken++;
      sfx('bad');
      fx.kick(3);
      fx.blink('#ff4a3a', 0.25);
      fx.burst(p.x, FLOOR - 2, ['#bfe8ff', '#ffffff', '#8ac8e8'], 16, 60, 160, 0.7);
      fx.pop(p.x, FLOOR - 22, 'CRASH!', '#ff9a7a');
    } else {
      fumbles++;
      sfx('spend');
      fx.kick(1.5);
      fx.spray(p.x, FLOOR - 1, ['#b8a888', '#8a7a62'], 8, 0, -20, 25, 60, 0.4);
      fx.pop(p.x, FLOOR - 22, 'OOPS! GRAB IT', '#ffc89a');
    }
  }

  // Standing at a chute slides in one matching parcel (any in your stack).
  function deposit(slot: number): void {
    const zone = order[slot];
    const i = held.findIndex((p) => p.zone === zone);
    if (i < 0) return;
    const p = held.splice(i, 1)[0];
    depositCd = 0.25;
    p.st = 'chute';
    p.t = 0;
    p.tx = CHUTE_X[slot];
    p.ty = 74;
    p.vy = -70;
    good++;
    streak++;
    best = Math.max(best, streak);
    sfx('coin');
    fx.burst(CHUTE_X[slot], 66, [ZONES[zone].c, '#ffffff', '#fff3c4'], 10, 45);
    fx.kick(0.8);
    fx.pop(CHUTE_X[slot], 48, streak >= 3 ? `X${streak}!` : p.fragile ? 'SAFE!' : pick(['SORTED', 'NICE', 'ZONE ' + ZONES[zone].l]), '#fff3c4');
  }

  function drawParcel(x: Ctx, p: Parcel, cx: number, by: number): void {
    const px0 = Math.round(cx - p.w / 2);
    const py0 = Math.round(by - p.h);
    const base = p.heavy ? '#8a5a32' : p.fragile ? '#d8b888' : '#c8945a';
    bevel(x, px0, py0, p.w, p.h, base);
    rect(x, px0 + Math.floor(p.w / 2) - 1, py0, 2, p.h, shade(base, 0.8)); // tape
    // zone label
    const z = ZONES[p.zone];
    const lc = p.plain ? '#f4f0e4' : z.c;
    rect(x, px0 + 1, py0 + 2, 5, 6, lc);
    rect(x, px0 + 1, py0 + 2, 5, 1, shade(lc, 1.3));
    text(x, z.l, px0 + 2, py0 + 3, p.plain || z.l === 'D' ? INK : '#ffffff');
    if (p.fragile) {
      // wine-glass icon
      rect(x, px0 + p.w - 4, py0 + 2, 3, 2, '#e0503c');
      rect(x, px0 + p.w - 3, py0 + 4, 1, 2, '#e0503c');
      rect(x, px0 + p.w - 4, py0 + 6, 3, 1, '#e0503c');
    }
    if (p.heavy) {
      rect(x, px0 + p.w - 6, py0 + 2, 5, 4, '#3a3a44');
      rect(x, px0 + p.w - 5, py0 + 1, 3, 1, '#3a3a44');
    }
  }

  const bg = (): HTMLCanvasElement =>
    cached('shift-wh-bg', 192, 108, (x) => {
      grad(x, 0, 0, 192, 94, ['#3a4258', '#4a5470', '#56607a']);
      for (let i = 0; i < 192; i += 8) rect(x, i, 22, 1, 72, '#3e4660');
      // high windows
      for (const wx of [8, 104]) {
        rect(x, wx, 26, 80, 10, '#2a3048');
        grad(x, wx + 1, 27, 78, 8, ['#8ab8d8', '#c8e0f0']);
        for (let k = 0; k < 80; k += 10) rect(x, wx + k, 26, 1, 10, '#2a3048');
      }
      // floor
      grad(x, 0, 94, 192, 14, ['#6a6a72', '#5a5a62']);
      stipple(x, 0, 94, 192, 14, '#4e4e56', 0.2);
      rect(x, 0, 94, 192, 1, '#2a2a34');
      for (let i = 0; i < 192; i += 12) {
        rect(x, i, 104, 6, 2, '#f2c230');
      }
      // belt frame + legs
      rect(x, 0, BELT_Y, 192, 4, '#2a2a34');
      rect(x, 0, BELT_Y + 4, 192, 1, '#1a1a24');
      for (let i = 10; i < 192; i += 46) rect(x, i, 0, 2, BELT_Y, '#4a4a58');
    });

  function drawChute(x: Ctx, slot: number, t: number, near: boolean): void {
    const z = ZONES[order[slot]];
    const cx = CHUTE_X[slot];
    const x0 = cx - 16;
    rect(x, x0 - 1, 55, 34, 40, INK);
    bevel(x, x0, 56, 32, 38, '#6a7088', false);
    rect(x, x0 + 4, 66, 24, 26, '#14101c');
    dither(x, x0 + 4, 66, 24, 4, '#14101c', '#2a2438');
    // rollers inside the mouth
    for (let k = 0; k < 3; k++) rect(x, x0 + 5, 72 + k * 7, 22, 1, '#3a3448');
    // zone sign
    rect(x, cx - 9, 44, 18, 12, z.c);
    outlineRect(x, cx - 10, 43, 20, 14, INK);
    rect(x, cx - 9, 44, 18, 1, shade(z.c, 1.3));
    bigText(x, z.l, cx, 50, 2, z.l === 'D' ? '#2a1a10' : '#ffffff', z.l === 'D' ? '#f8e8a0' : INK);
    // stripe
    for (let k = 0; k < 32; k += 4) rect(x, x0 + k, 92, 2, 2, (k / 4) % 2 ? '#2a2a34' : z.c);
    if (near && held.some((p) => p.zone === order[slot])) {
      const blink = Math.floor(t * 6) % 2;
      if (blink) outlineRect(x, x0 - 2, 54, 36, 42, '#fff3c4');
    }
  }

  return {
    duration,
    keys: [
      { key: 'left', label: '◀ WALK', wide: true },
      { key: 'right', label: 'WALK ▶', wide: true },
    ],
    note: '← → walk under falling parcels to catch them · stop at the matching chute and they slide in',
    touchNote: 'Drag or tap to walk under falling parcels · walk to the matching chute and they slide in.',
    step(dt, _t, inp, live) {
      beltOff += dt * (rush() ? 46 : 30);
      for (const p of ps) {
        p.t += dt;
        if (p.st === 'chute') {
          p.x = approach(p.x, p.tx, dt * 160);
          p.vy += 300 * dt;
          p.y = Math.min(p.ty + 10, p.y + p.vy * dt);
        }
      }
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        if (p.st === 'floor' && !p.fragile && p.t > FLOOR_TIME) {
          dropped++;
          fx.pop(p.x, FLOOR - 22, 'LOST', '#ff9a7a');
          fx.spray(p.x, FLOOR - 4, ['#8a8aa0'], 5, 0, -20, 15, 40, 0.4);
        }
        if ((p.st === 'chute' && p.t > 0.5) || (p.st === 'floor' && p.t > (p.fragile ? 1.4 : FLOOR_TIME))) ps.splice(i, 1);
      }
      if (!live) {
        vx = 0;
        return;
      }
      pt += dt;
      if (pt >= inkAt && !inkAnnounced) {
        inkAnnounced = true;
        sfx('page');
        fx.pop(96, 30, 'OUT OF COLOR INK! READ THE LETTER', '#ffe27a');
      }
      if (rush() && !rushAnnounced) {
        rushAnnounced = true;
        sfx('page');
        fx.pop(96, 40, 'PEAK RUSH!', '#ffe27a');
        fx.kick(2);
      }
      // spawning
      const prog = Math.min(1, pt / duration);
      spawnT -= dt;
      if (spawnT <= 0) {
        spawn();
        spawnT = (rush() ? 1.6 : 3.3 - 1.2 * prog - level * 0.12) * rnd(0.85, 1.15);
      }
      // walking
      const heavyLoad = held.some((p) => p.heavy);
      const maxV = heavyLoad ? 66 : 98;
      let want = 0;
      if (inp.down.has('left')) want = -1;
      else if (inp.down.has('right')) want = 1;
      if (want !== 0) goal = null;
      else if (goal !== null) {
        if (Math.abs(goal - px) > 2) want = goal > px ? 1 : -1;
        else goal = null;
      }
      vx = approach(vx, want * maxV, dt * 600);
      px = Math.max(8, Math.min(184, px + vx * dt));
      if (want) face = want < 0 ? -1 : 1;
      walkPh += Math.abs(vx) * dt * 0.16;
      depositCd = Math.max(0, depositCd - dt);
      if (depositCd <= 0 && held.length && Math.abs(vx) < 70) {
        const s = slotNear(px);
        if (s >= 0 && Math.abs(CHUTE_X[s] - px) < 10) deposit(s);
      }
      // parcels
      const beltV = rush() ? 46 : 30 + level * 3;
      const catchY = FLOOR - 30 - carryH();
      for (const p of ps) {
        if (p.st === 'belt') {
          p.x += beltV * dt;
          if (p.x >= p.dropX) {
            p.st = 'fall';
            p.vy = 10;
            sfx('type');
          }
        } else if (p.st === 'fall') {
          p.vy += G * dt * (p.fragile ? 0.85 : 1);
          p.y += p.vy * dt;
          if (!p.noCatch && p.y >= catchY - 2 && p.y <= catchY + 18 && Math.abs(p.x - px) < 11 + p.w / 2) {
            if (held.length >= MAX_CARRY) {
              fx.pop(px, catchY - 10, 'ARMS FULL!', '#ffc89a');
              p.vy = -40;
              p.x += face * -6;
              p.y = catchY - 1;
              p.noCatch = true; // bounced off: it keeps falling and lands beside you
            } else {
              p.st = 'held';
              held.push(p);
              sfx('click');
              fx.kick(0.6);
              fx.burst(px, catchY, ['#fff3c4'], 4, 20, 40, 0.3);
            }
          } else if (p.y >= FLOOR) {
            p.y = FLOOR;
            lose(p);
          }
        } else if (p.st === 'floor' && !p.fragile && held.length < MAX_CARRY && Math.abs(p.x - px) < 10) {
          p.st = 'held';
          held.push(p);
          recovered++;
          sfx('click');
          fx.pop(px, FLOOR - 40 - carryH(), 'GOT IT', '#fff3c4');
        }
      }
    },
    pointer(x, y, kind) {
      if (kind === 'down') dragging = true;
      if (kind === 'up') dragging = false;
      if (kind !== 'down' && !(kind === 'move' && dragging)) return;
      goal = Math.max(8, Math.min(184, x));
      // tapping a chute walks you to its middle
      if (kind === 'down' && y > 40 && y < 96) {
        const s = slotNear(x);
        if (s >= 0) goal = CHUTE_X[s];
      }
    },
    draw(x, t) {
      x.drawImage(bg(), 0, 0);
      // belt rollers
      for (let i = -8; i < 200; i += 6) rect(x, Math.round(i + (beltOff % 6)), BELT_Y + 1, 2, 2, '#4a4a58');
      // rush beacon
      if (rush()) {
        const on = Math.floor(t * 6) % 2;
        rect(x, 92, 0, 8, 4, on ? '#ff8a1e' : '#7a3a10');
        if (on) {
          x.globalAlpha = 0.1;
          rect(x, 0, 0, 192, 108, '#ff8a1e');
          x.globalAlpha = 1;
        }
      }
      const near = slotNear(px);
      for (let s = 0; s < 4; s++) drawChute(x, s, t, s === near);
      // drop markers for parcels on the belt
      for (const p of ps)
        if (p.st === 'belt' && p.dropX > 0) {
          // a down-arrow under the belt where it will tip off
          const soon = p.dropX - p.x < 45;
          const c = soon ? (Math.floor(p.t * 8) % 2 ? '#ffe27a' : '#ff8a1e') : '#9a9ab4';
          const ax = Math.round(p.dropX);
          rect(x, ax - 2, BELT_Y + 5, 5, 1, c);
          rect(x, ax - 1, BELT_Y + 6, 3, 1, c);
          rect(x, ax, BELT_Y + 7, 1, 1, c);
          if (soon) {
            // faint landing spot on the floor too
            x.globalAlpha = 0.35;
            rect(x, ax - 5, FLOOR - 1, 11, 2, p.fragile ? '#ff5a4a' : '#ffe27a');
            x.globalAlpha = 1;
          }
        }
      for (const p of ps) {
        if (p.st === 'fall') {
          // landing spot on the floor
          const w = Math.max(4, Math.round(p.w * (0.4 + 0.6 * (p.y / FLOOR))));
          rect(x, Math.round(p.x - w / 2), FLOOR - 1, w, 2, p.fragile ? 'rgba(255,90,74,0.55)' : 'rgba(16,8,28,0.35)');
        }
      }
      for (const p of ps) if (p.st === 'chute') drawParcel(x, p, p.x, p.y);
      // you
      shadow(x, px, FLOOR + 1);
      const pose = Math.abs(vx) > 5 ? 'walk' : 'stand';
      drawRunner(x, me, px - 7, FLOOR - 30, pose, walkPh, face, Math.floor(t * 10) % 41 === 0);
      // carried stack (arms up)
      let sy = FLOOR - 30;
      for (const p of held) {
        drawParcel(x, p, px, sy);
        sy -= p.h;
      }
      if (held.length) {
        // arms up, holding the stack
        for (const ax of [px - 7, px + 5]) {
          rect(x, ax - 1, FLOOR - 33, 4, 15, INK);
          rect(x, ax, FLOOR - 32, 2, 3, me.skin);
          rect(x, ax, FLOOR - 29, 2, 10, me.shirt);
        }
      }
      for (const p of ps) if (p.st === 'belt' || p.st === 'fall') drawParcel(x, p, p.x, p.y);
      for (const p of ps)
        if (p.st === 'floor') {
          if (p.fragile) {
            rect(x, p.x - 6, FLOOR - 2, 12, 2, '#a88858');
            rect(x, p.x - 3, FLOOR - 4, 6, 2, '#c8a878');
          } else if (p.t < FLOOR_TIME - 1.2 || Math.floor(p.t * 8) % 2 === 0) drawParcel(x, p, p.x, FLOOR);
        }
      if (pt > 0 && pt < 3.2) centered(x, 'CATCH, THEN MATCH THE ZONE', 96, 28, '#fff3c4');
      if (held.length >= MAX_CARRY) centered(x, 'ARMS FULL', px, FLOOR - 36 - carryH(), '#ffc89a');
      if (rush()) text(x, 'RUSH', 102, 1, '#ffe27a');
    },
    hud: () => [
      { label: 'Sorted', value: good },
      { label: 'Carrying', value: `${held.length}/${MAX_CARRY}` },
      { label: 'Streak', value: streak >= 2 ? `x${streak}` : '-' },
      { label: 'Lost', value: dropped + broken, warn: dropped + broken > 0 },
    ],
    result() {
      const bad = recovered * 0.2 + dropped + broken * 1.5;
      return {
        score: shiftScore(good / Math.max(1, good + bad), good / target),
        stats: { sorted: good, mistakes: dropped + broken, dropped, broken, fumbles, best },
        line: `${good} SORTED, ${dropped} DROPPED, ${broken} BROKEN`,
      };
    },
  };
}
