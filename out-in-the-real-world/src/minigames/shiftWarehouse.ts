// Shift Rush, work skin: Package Sort. Parcels ride the overhead belt and tip off at the arrow;
// walk under them to catch (up to 3 at once), then carry each to the chute for its zone, where it
// slides in. Fragile parcels shatter if they hit the floor; heavy ones slow you down. Twists: the
// label printer runs out of color ink (read the letters), and PEAK RUSH speeds up the belt.
import { playerPerson } from '../art/people.ts';
import { INK, text, type Ctx } from '../art/px.ts';
import { sfx } from '../ui/audio.ts';
import { ball, beam, blit, ctext, cyl, ell, glare, haze, label, layer, lin, otext, pool, rgba, rr, sbox, shadow, tint, vfill } from './hd2Kit.tsx';
import { person } from './hd2Person.ts';
import { approach, irnd, pick, rnd, shiftScore, shuffle, type ModeEnv, type ShiftMode } from './shiftKit.ts';

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
    const px0 = cx - p.w / 2;
    const py0 = by - p.h;
    const base = p.heavy ? '#8a5a32' : p.fragile ? '#dcbc8c' : '#c8945a';
    sbox(x, px0, py0, p.w, p.h, base, { r: 1, gloss: 0.25 });
    // folded flap seam + packing tape with a sheen
    x.fillStyle = rgba(tint(base, 0.55), 0.6);
    x.fillRect(px0 + 0.5, py0 + 1.6, p.w - 1, 0.4);
    x.fillStyle = lin(x, px0 + p.w / 2 - 1, 0, px0 + p.w / 2 + 1, 0, [rgba(tint(base, 0.85), 0.9), 'rgba(255,240,210,0.7)', rgba(tint(base, 0.8), 0.9)]);
    x.fillRect(px0 + p.w / 2 - 1, py0, 2, p.h);
    // zone label
    const z = ZONES[p.zone];
    const lc = p.plain ? '#f4f0e4' : z.c;
    sbox(x, px0 + 1, py0 + 2, 5, 6, lc, { r: 0.8, gloss: 0.45, lw: 0.35 });
    text(x, z.l, Math.round(px0) + 2, Math.round(py0) + 3, p.plain || z.l === 'D' ? INK : '#ffffff');
    if (p.fragile) {
      // wine-glass icon
      const gx = px0 + p.w - 2.5;
      x.fillStyle = '#e0503c';
      x.beginPath();
      x.moveTo(gx - 1.6, py0 + 2);
      x.lineTo(gx + 1.6, py0 + 2);
      x.quadraticCurveTo(gx + 1.4, py0 + 4.4, gx, py0 + 4.4);
      x.quadraticCurveTo(gx - 1.4, py0 + 4.4, gx - 1.6, py0 + 2);
      x.fill();
      x.fillRect(gx - 0.3, py0 + 4.2, 0.6, 2);
      x.fillRect(gx - 1.4, py0 + 6, 2.8, 0.7);
    }
    if (p.heavy) {
      // kettlebell icon
      ball(x, px0 + p.w - 3.5, py0 + 4.4, 1.9, '#3a3a44', 1.6, 0.5);
      x.lineWidth = 0.6;
      x.strokeStyle = '#3a3a44';
      x.beginPath();
      x.arc(px0 + p.w - 3.5, py0 + 2.6, 1, Math.PI, 0);
      x.stroke();
    }
  }

  const bg = (): HTMLCanvasElement =>
    layer('hd-wh-bg', 192, 108, (x) => {
      // a tall warehouse: cool steel walls fading into haze
      vfill(x, 0, 0, 192, 94, ['#2a3044', '#465070', '#5a6684']);
      // corrugated wall ribs
      for (let i = 0; i < 192; i += 8) {
        x.fillStyle = lin(x, i, 0, i + 8, 0, ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.18)']);
        x.fillRect(i, 22, 8, 72);
      }
      // steel trusses up high
      x.strokeStyle = 'rgba(20,24,36,0.6)';
      x.lineWidth = 0.8;
      for (let i = 0; i < 192; i += 24) {
        x.beginPath();
        x.moveTo(i, 22);
        x.lineTo(i + 12, 6);
        x.lineTo(i + 24, 22);
        x.stroke();
      }
      vfill(x, 0, 21, 192, 1.6, ['#6a7490', '#2a3044']);
      // high windows
      for (const wx of [8, 104]) {
        sbox(x, wx, 26, 80, 10, '#2a3048', { r: 0.6, gloss: 0, outline: 'rgba(10,12,20,0.8)' });
        vfill(x, wx + 1, 27, 78, 8, ['#c8e8ff', '#8ab8d8', '#e0f0ff']);
        glare(x, wx + 1, 27, 78, 8, 0.35);
        for (let k = 0; k < 80; k += 10) {
          x.fillStyle = '#2a3048';
          x.fillRect(wx + k, 26, 0.8, 10);
        }
        pool(x, wx + 40, 31, 50, 12, '#d8f0ff', 0.25);
      }
      // haze settles at mid height
      haze(x, 0, 36, 192, 94, '#8090b0', 0.0, 0.25);
      // polished concrete floor with soft reflections
      vfill(x, 0, 94, 192, 14, ['#7a7a84', '#5e5e68', '#4e4e58']);
      for (const wx of [48, 144]) pool(x, wx, 98, 40, 3, '#c8e0f0', 0.14);
      vfill(x, 0, 94, 192, 1.4, ['rgba(10,10,20,0.7)', 'rgba(10,10,20,0)']);
      for (let i = 0; i < 192; i += 12) sbox(x, i, 104, 6, 2, '#f2c230', { r: 0.4, gloss: 0.3, outline: null });
      // belt frame + legs
      for (let i = 10; i < 192; i += 46) cyl(x, i, 0, 2, BELT_Y, '#5a5a6a', { spec: 0.4 });
      vfill(x, 0, BELT_Y, 192, 4, ['#4a4a58', '#2a2a34', '#1a1a24']);
      vfill(x, 0, BELT_Y + 4, 192, 3, ['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']);
    });
  // sunlight shafts from the high windows (additive)
  const sun = (): HTMLCanvasElement =>
    layer('hd-wh-sun', 192, 108, (x) => {
      for (const wx of [8, 104]) beam(x, wx + 6, wx + 74, 36, wx + 24, wx + 110, 104, '#fff4d8', 0.13);
    });

  function drawChute(x: Ctx, slot: number, t: number, near: boolean): void {
    const z = ZONES[order[slot]];
    const cx = CHUTE_X[slot];
    const x0 = cx - 16;
    shadow(x, cx, 95, 19, 2.5, 0.5);
    sbox(x, x0 - 1, 55, 34, 40, '#7a8098', { r: 2, gloss: 0.4 });
    rr(x, x0 + 4, 66, 24, 26, 1.5);
    x.fillStyle = lin(x, 0, 66, 0, 92, ['#05040a', '#14101c', '#2a2438']);
    x.fill();
    // rollers inside the mouth
    for (let k = 0; k < 3; k++) cyl(x, x0 + 5, 72 + k * 7, 22, 1.2, '#5a5468', { spec: 0 });
    // zone sign: a backlit box
    pool(x, cx, 50, 18, 12, z.c, 0.35);
    sbox(x, cx - 10, 43, 20, 14, z.c, { r: 2.5, gloss: 0.55 });
    label(x, z.l, cx, 50.4, 11, z.l === 'D' ? '#2a1a10' : '#ffffff', z.l === 'D' ? '#f8e8a0' : '#1c1424', 'center', 900);
    // hazard stripe
    x.save();
    rr(x, x0, 92, 32, 2.4, 0.6);
    x.clip();
    x.fillStyle = '#2a2a34';
    x.fillRect(x0, 92, 32, 2.4);
    x.fillStyle = z.c;
    for (let k = -4; k < 34; k += 4) {
      x.beginPath();
      x.moveTo(x0 + k, 94.4);
      x.lineTo(x0 + k + 2, 92);
      x.lineTo(x0 + k + 4, 92);
      x.lineTo(x0 + k + 2, 94.4);
      x.fill();
    }
    x.restore();
    if (near && held.some((p) => p.zone === order[slot])) {
      const a = 0.55 + 0.45 * Math.sin(t * 12);
      x.lineWidth = 0.9;
      x.strokeStyle = rgba('#fff3c4', a);
      rr(x, x0 - 2, 54, 36, 42, 3);
      x.stroke();
      pool(x, cx, 80, 22, 18, '#fff3c4', 0.18 * a);
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
      blit(x, bg(), 0, 0, 192, 108);
      // belt rollers
      const bo = beltOff % 6;
      for (let i = -8; i < 200; i += 6) {
        ell(x, i + bo + 1, BELT_Y + 2, 1, 1);
        x.fillStyle = '#6a6a7a';
        x.fill();
      }
      x.fillStyle = 'rgba(255,255,255,0.12)';
      x.fillRect(0, BELT_Y, 192, 0.6);
      // rush beacon
      if (rush()) {
        const on = 0.5 + 0.5 * Math.sin(t * 18);
        sbox(x, 92, 0, 8, 4, on > 0.5 ? '#ff8a1e' : '#7a3a10', { r: 1.5, gloss: 0.5 });
        pool(x, 96, 3, 60, 30, '#ff8a1e', 0.3 * on);
        x.fillStyle = `rgba(255,138,30,${(0.06 * on).toFixed(3)})`;
        x.fillRect(0, 0, 192, 108);
      }
      const near = slotNear(px);
      for (let s = 0; s < 4; s++) drawChute(x, s, t, s === near);
      // drop markers for parcels on the belt
      for (const p of ps)
        if (p.st === 'belt' && p.dropX > 0) {
          const soon = p.dropX - p.x < 45;
          const c = soon ? (Math.floor(p.t * 8) % 2 ? '#ffe27a' : '#ff8a1e') : '#9a9ab4';
          const ax = p.dropX;
          x.fillStyle = c;
          x.beginPath();
          x.moveTo(ax - 2.6, BELT_Y + 5);
          x.lineTo(ax + 2.6, BELT_Y + 5);
          x.lineTo(ax, BELT_Y + 8);
          x.closePath();
          x.fill();
          if (soon) {
            pool(x, ax, BELT_Y + 6, 5, 4, c, 0.4);
            pool(x, ax, FLOOR, 7, 1.8, p.fragile ? '#ff5a4a' : '#ffe27a', 0.6);
          }
        }
      for (const p of ps) {
        if (p.st === 'fall') {
          // landing spot on the floor
          const w = Math.max(4, p.w * (0.4 + 0.6 * (p.y / FLOOR)));
          if (p.fragile) pool(x, p.x, FLOOR, w / 2 + 1, 1.6, '#ff5a4a', 0.7);
          else shadow(x, p.x, FLOOR, w / 2 + 1, 1.6, 0.45);
        }
      }
      for (const p of ps) if (p.st === 'chute') drawParcel(x, p, p.x, p.y);
      // you
      const pose = Math.abs(vx) > 5;
      person(x, me, px - 7, FLOOR - 30, pose ? 0 : Math.floor(t * 1.5) % 2, false, { face, walk: pose ? Math.floor(walkPh) & 3 : undefined, blink: Math.floor(t * 10) % 41 === 0 });
      // carried stack (arms up)
      let sy = FLOOR - 30;
      for (const p of held) {
        drawParcel(x, p, px, sy);
        sy -= p.h;
      }
      if (held.length) {
        for (const ax of [px - 6, px + 6]) {
          x.save();
          x.lineCap = 'round';
          x.lineWidth = 3;
          x.strokeStyle = 'rgba(28,18,40,0.85)';
          x.beginPath();
          x.moveTo(ax, FLOOR - 18);
          x.lineTo(ax, FLOOR - 31);
          x.stroke();
          x.lineWidth = 2.3;
          x.strokeStyle = lin(x, ax - 1, 0, ax + 1, 0, [tint(me.shirt, 0.7), tint(me.shirt, 1.2), tint(me.shirt, 0.75)]);
          x.stroke();
          x.restore();
          ball(x, ax, FLOOR - 31.5, 1.3, me.skin, 1.3, 0.3);
        }
      }
      for (const p of ps)
        if (p.st === 'belt' || p.st === 'fall') {
          if (p.st === 'fall') shadow(x, p.x, p.y + 1, p.w * 0.4, 1, 0.15);
          drawParcel(x, p, p.x, p.y);
        }
      for (const p of ps)
        if (p.st === 'floor') {
          if (p.fragile) {
            sbox(x, p.x - 6, FLOOR - 2, 12, 2, '#a88858', { r: 0.6, gloss: 0.2 });
            sbox(x, p.x - 3, FLOOR - 4, 6, 2, '#c8a878', { r: 0.6, gloss: 0.2 });
            for (let k = 0; k < 4; k++) {
              ell(x, p.x - 5 + k * 3.3, FLOOR - 0.5, 0.7, 0.4);
              x.fillStyle = 'rgba(220,240,255,0.8)';
              x.fill();
            }
          } else if (p.t < FLOOR_TIME - 1.2 || Math.floor(p.t * 8) % 2 === 0) {
            shadow(x, p.x, FLOOR, p.w * 0.6, 1.4, 0.4);
            drawParcel(x, p, p.x, FLOOR);
          }
        }
      x.globalCompositeOperation = 'lighter';
      blit(x, sun(), 0, 0, 192, 108);
      x.globalCompositeOperation = 'source-over';
      if (pt > 0 && pt < 3.2) ctext(x, 'CATCH, THEN MATCH THE ZONE', 96, 28, '#fff3c4');
      if (held.length >= MAX_CARRY) ctext(x, 'ARMS FULL', px, FLOOR - 36 - carryH(), '#ffc89a');
      if (rush()) otext(x, 'RUSH', 102, 0.5, '#ffe27a');
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
