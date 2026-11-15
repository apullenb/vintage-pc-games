// Shift Rush, trade skin: Wire It Up. A run of devices (outlet, light, switch, dryer...) to wire
// before each one's timer runs out: land every wire on its terminal (black/red/blue = HOT on brass,
// white = NEUTRAL on silver, green/bare = GROUND on the green screw). Some boxes are still LIVE:
// the wires spark, and you have to flip the breaker off before you touch anything.
import { playerPerson } from '../art/people.ts';
import { bevel, cached, dither, grad, INK, line, outlineRect, rect, shade, stipple, text, textWidth, type Ctx } from '../art/px.ts';
import { sfx } from '../ui/audio.ts';
import { drawRunner } from './busRunner.ts';
import { centered, hit, pick, rnd, shiftScore, shuffle, type ModeEnv, type ShiftMode } from './shiftKit.ts';

type Role = 'hot' | 'neu' | 'gnd';
const WIRE: Record<string, { c: string; role: Role; name: string }> = {
  black: { c: '#2a2a34', role: 'hot', name: 'BLACK' },
  red: { c: '#d0302a', role: 'hot', name: 'RED' },
  blue: { c: '#3f6fd8', role: 'hot', name: 'BLUE' },
  white: { c: '#eeeae0', role: 'neu', name: 'WHITE' },
  green: { c: '#3caa6a', role: 'gnd', name: 'GREEN' },
  bare: { c: '#d88a4a', role: 'gnd', name: 'BARE' },
};
const SCREW: Record<Role, string> = { hot: '#e0b040', neu: '#c8ccd8', gnd: '#3caa6a' };
const TAG: Record<Role, string> = { hot: 'HOT', neu: 'NEU', gnd: 'GND' };
const HINT: Record<Role, string> = { hot: 'BLACK/RED: HOT, BRASS SCREW', neu: 'WHITE: NEUTRAL, SILVER SCREW', gnd: 'GREEN/BARE: GROUND, GREEN SCREW' };

interface DevSpec {
  name: string;
  wires: string[];
  body: string;
}
const DEV3: DevSpec[] = [
  { name: 'OUTLET', wires: ['black', 'white', 'bare'], body: '#efe8d8' },
  { name: 'LIGHT FIXTURE', wires: ['black', 'white', 'green'], body: '#f4f0e4' },
  { name: 'PORCH LIGHT', wires: ['black', 'white', 'bare'], body: '#d8d8e0' },
  { name: 'SWITCH', wires: ['black', 'red', 'bare'], body: '#f4f0e4' },
];
const DEV4: DevSpec[] = [
  { name: 'DRYER 240V', wires: ['black', 'red', 'white', 'green'], body: '#c8ccd8' },
  { name: 'CEILING FAN', wires: ['black', 'blue', 'white', 'green'], body: '#e8dcc0' },
  { name: 'GFCI OUTLET', wires: ['black', 'white', 'bare', 'black'], body: '#f4f0e4' },
  { name: 'RANGE 240V', wires: ['black', 'red', 'white', 'bare'], body: '#b8bcc8' },
];

interface Wire {
  kind: string;
  ox: number; // where it leaves the conduit
  ex: number; // resting end
  ey: number;
  term: number; // connected terminal, -1 if loose
}
interface Term {
  role: Role;
  x: number;
  used: boolean;
}
interface Device {
  spec: DevSpec;
  wires: Wire[];
  terms: Term[];
  live: boolean;
  limit: number;
  left: number;
  ckt: number;
}

const BOX_X = 46;
const BOX_W = 116;
const END_Y = 48;
const TERM_Y = 84;
const DEVICES = 7;

export function wiresMode({ fx, level, look }: ModeEnv): ShiftMode {
  const me = { ...playerPerson(look), hat: 'hard' as const, hatColor: '#f2c230', vest: '#c8f03c' };
  // a run of devices: three-wire jobs first, then four-wire ones
  const specs = [...shuffle(DEV3.slice()).slice(0, 3 - Math.min(2, Math.floor(level / 2))), ...shuffle(DEV4.slice())].slice(0, DEVICES);
  while (specs.length < DEVICES) specs.push(pick(DEV4));
  const liveIdx = new Set<number>();
  {
    const first = level >= 1 ? 1 : 2;
    const pool = shuffle([...Array(DEVICES).keys()].filter((i) => i >= first));
    pool.slice(0, 3 + Math.min(1, level)).forEach((i) => liveIdx.add(i));
  }
  let di = 0;
  let dev: Device = makeDevice(0);
  let breakerOn = dev.live;
  let held = -1; // wire index in hand
  let sel = 0; // keyboard selection in the current row (wires when empty-handed, terminals when holding)
  let hx = 0; // hand position
  let hy = 0;
  let ptr: { x: number; y: number } | null = null; // mouse/touch drag position
  let dragging = false;
  let stun = 0;
  let swap = 0; // transition timer between devices
  let sparkT = 0;
  let conns = 0;
  let wrong = 0;
  let zaps = 0;
  let loose = 0;
  let done = 0;
  let paceSum = 0;
  let used = 0; // seconds spent on the current device
  let streak = 0;
  let hint = '';
  let hintT = 0;
  let liveHintShown = false;
  let finished = false;
  let pt = 0;

  function makeDevice(i: number): Device {
    const spec = specs[i];
    const n = spec.wires.length;
    const xs = (k: number, a: number, b: number) => Math.round(a + ((b - a) * (k + 0.5)) / n);
    const ends = shuffle([...Array(n).keys()]);
    const wires: Wire[] = spec.wires.map((kind, k) => ({ kind, ox: 104 + (k - (n - 1) / 2) * 5, ex: xs(ends[k], BOX_X + 10, BOX_X + BOX_W - 10), ey: END_Y + (k % 2) * 3, term: -1 }));
    const roles = shuffle(spec.wires.map((k) => WIRE[k].role));
    const terms: Term[] = roles.map((role, k) => ({ role, x: xs(k, BOX_X + 14, BOX_X + BOX_W - 14), used: false }));
    const limit = Math.max(6, 10.5 - i * 0.45 - level * 0.5) + (n - 3) * 2.2;
    return { spec, wires, terms, live: liveIdx.has(i), limit, left: limit, ckt: 3 + ((i * 5 + 2) % 17) };
  }

  const say = (s: string, tsec = 2.2): void => {
    hint = s;
    hintT = tsec;
  };

  function nextDevice(timeout: boolean): void {
    const n = dev.wires.length;
    const got = dev.wires.filter((w) => w.term >= 0).length;
    if (timeout) {
      loose += n - got;
      paceSum += (got / n) * 0.5;
    } else {
      done++;
      // full speed credit for about a second per wire
      const speed = Math.max(0, Math.min(1, (n * 0.95 + 0.5) / Math.max(0.1, used)));
      paceSum += 0.5 + 0.5 * speed;
    }
    used = 0;
    held = -1;
    di++;
    if (di >= DEVICES) {
      finished = true;
      return;
    }
    swap = 0.75;
  }

  function grab(i: number): void {
    const w = dev.wires[i];
    if (!w || w.term >= 0 || stun > 0) return;
    if (breakerOn) {
      zaps++;
      streak = 0;
      stun = 0.9;
      sfx('bad');
      fx.blink('#ffffff', 0.8);
      fx.kick(6);
      fx.burst(w.ex, w.ey, ['#fff7a0', '#ffffff', '#7ad8ff'], 22, 80, 60, 0.5);
      fx.pop(w.ex, w.ey - 14, 'ZAP!', '#ffe27a');
      say('ZAP! FLIP THE BREAKER OFF FIRST');
      held = -1;
      return;
    }
    held = i;
    sfx('click');
    // keyboard: jump the selection to the terminal nearest the wire
    let best = 0;
    let d = 999;
    dev.terms.forEach((t, k) => {
      if (!t.used && Math.abs(t.x - w.ex) < d) (d = Math.abs(t.x - w.ex)), (best = k);
    });
    sel = best;
  }

  function connect(ti: number): void {
    if (held < 0) return;
    const w = dev.wires[held];
    const t = dev.terms[ti];
    if (!t || t.used) return;
    const role = WIRE[w.kind].role;
    if (role === t.role) {
      t.used = true;
      w.term = ti;
      conns++;
      streak++;
      sfx('coin');
      fx.burst(t.x, TERM_Y, ['#fff3c4', SCREW[t.role], '#ffffff'], 10, 35);
      fx.kick(0.8);
      fx.pop(t.x, TERM_Y - 16, streak >= 4 ? `X${streak}!` : pick(['TIGHT!', 'GOOD', 'SNUG']), '#fff3c4');
      held = -1;
      if (dev.wires.every((x) => x.term >= 0)) {
        sfx('star');
        fx.burst(BOX_X + BOX_W / 2, 70, ['#7cf08a', '#fff3c4', '#ffffff'], 24, 70);
        fx.pop(BOX_X + BOX_W / 2, 58, used < dev.wires.length * 0.95 + 0.5 ? 'PASSED! FAST!' : 'PASSED!', '#7cf08a');
        nextDevice(false);
      } else {
        sel = dev.wires.findIndex((x) => x.term < 0);
      }
    } else {
      wrong++;
      streak = 0;
      sfx('bad');
      fx.kick(3);
      fx.blink('#ff4a3a', 0.25);
      fx.burst(t.x, TERM_Y, ['#ff7a5a', '#ffe27a'], 10, 50);
      fx.pop(t.x, TERM_Y - 16, 'WRONG!', '#ff9a7a');
      say(HINT[role]);
      held = -1;
    }
  }

  function toggleBreaker(): void {
    if (swap > 0) return;
    breakerOn = !breakerOn;
    sfx(breakerOn ? 'spend' : 'click');
    fx.kick(1);
    fx.pop(19, 12, breakerOn ? 'ON' : 'OFF', breakerOn ? '#ff9a7a' : '#7cf08a');
    if (!breakerOn && held < 0) sel = Math.max(0, dev.wires.findIndex((w) => w.term < 0));
  }

  // rows for keyboard selection
  const looseWires = (): number[] =>
    dev.wires
      .map((w, i) => [w, i] as const)
      .filter(([w]) => w.term < 0)
      .sort((a, b) => a[0].ex - b[0].ex)
      .map(([, i]) => i);
  const freeTerms = (): number[] =>
    dev.terms
      .map((t, i) => [t, i] as const)
      .filter(([t]) => !t.used)
      .sort((a, b) => a[0].x - b[0].x)
      .map(([, i]) => i);
  function moveSel(d: number): void {
    const row = held < 0 ? looseWires() : freeTerms();
    if (!row.length) return;
    const k = row.indexOf(sel);
    sel = row[Math.max(0, Math.min(row.length - 1, (k < 0 ? 0 : k) + d))];
    sfx('type');
  }

  const wireAt = (x: number, y: number): number => {
    let best = -1;
    let d = 11;
    dev.wires.forEach((w, i) => {
      if (w.term >= 0) return;
      const dd = Math.hypot(w.ex - x, (w.ey - y) * 0.6);
      if (dd < d) (d = dd), (best = i);
    });
    return best;
  };
  const termAt = (x: number, y: number): number => {
    if (Math.abs(y - TERM_Y) > 14) return -1;
    let best = -1;
    let d = 12;
    dev.terms.forEach((t, i) => {
      if (t.used) return;
      if (Math.abs(t.x - x) < d) (d = Math.abs(t.x - x)), (best = i);
    });
    return best;
  };

  function drawWire(x: Ctx, w: Wire, endX: number, endY: number, sag: number): void {
    const col = WIRE[w.kind].c;
    const dark = shade(col, 0.6);
    let lx = w.ox;
    let ly = 12;
    const N = 12;
    for (let k = 1; k <= N; k++) {
      const u = k / N;
      // quadratic-ish curve: straight down out of the conduit, then over to the end
      const cx = w.ox + (endX - w.ox) * (u * u * (3 - 2 * u));
      const cy = 12 + (endY - 12) * u + Math.sin(u * Math.PI) * sag;
      line(x, lx - 1, ly, cx - 1, cy, INK);
      line(x, lx + 1, ly, cx + 1, cy, INK);
      line(x, lx, ly, cx, cy, col);
      line(x, lx, ly + 1, cx, cy + 1, dark);
      lx = cx;
      ly = cy;
    }
    // stripped copper tip
    rect(x, endX - 1, endY, 2, 4, '#e8a060');
    rect(x, endX - 1, endY + 3, 2, 1, '#b86a30');
  }

  function drawScrew(x: Ctx, t: Term, tx: number, ty: number): void {
    const c = SCREW[t.role];
    rect(x, tx - 4, ty - 3, 8, 7, INK);
    rect(x, tx - 3, ty - 2, 6, 5, c);
    rect(x, tx - 3, ty - 2, 6, 1, shade(c, 1.3));
    rect(x, tx - 2, ty, 4, 1, shade(c, 0.6)); // slot
    const tag = TAG[t.role];
    const tw = textWidth(tag);
    rect(x, tx - tw / 2 - 1, ty + 6, tw + 2, 7, '#1c1424');
    text(x, tag, tx - tw / 2, ty + 7, c);
  }

  const bg = (): HTMLCanvasElement =>
    cached('shift-wire-bg', 192, 108, (x) => {
      grad(x, 0, 0, 192, 108, ['#d8c8a8', '#c8b490', '#b8a07a']);
      stipple(x, 0, 0, 192, 108, '#c0ac88', 0.25);
      // studs
      for (const sx of [0, 40, 176]) {
        rect(x, sx, 0, 6, 108, '#c89a5a');
        rect(x, sx, 0, 1, 108, '#e0b878');
        rect(x, sx + 5, 0, 1, 108, '#9a6a3a');
      }
      // breaker panel
      rect(x, 3, 12, 32, 70, INK);
      bevel(x, 4, 13, 30, 68, '#8a92a4', false);
      rect(x, 7, 18, 24, 58, '#5a6274');
      for (let k = 0; k < 6; k++) {
        rect(x, 9, 21 + k * 9, 8, 6, '#2a2a34');
        rect(x, 20, 21 + k * 9, 8, 6, '#2a2a34');
        rect(x, 11, 23 + k * 9, 4, 2, '#3a3a44');
        rect(x, 22, 23 + k * 9, 4, 2, '#3a3a44');
      }
      // the box
      rect(x, BOX_X - 1, 5, BOX_W + 2, 100, INK);
      bevel(x, BOX_X, 6, BOX_W, 98, '#9aa2b4', false);
      rect(x, BOX_X + 4, 10, BOX_W - 8, 90, '#4a4e5c');
      dither(x, BOX_X + 4, 10, BOX_W - 8, 4, '#3a3e4c', '#4a4e5c');
      // conduit
      rect(x, 92, 0, 24, 12, INK);
      grad(x, 93, 0, 22, 11, ['#c8ccd8', '#9aa2b4']);
      rect(x, 90, 9, 28, 4, '#7a8294');
      outlineRect(x, 89, 8, 30, 6, INK);
    });

  function drawDevice(x: Ctx, d: Device, oy: number, t: number): void {
    // device body behind the terminals
    const y0 = TERM_Y - 8 + oy;
    rect(x, BOX_X + 7, y0 - 1, BOX_W - 14, 24, INK);
    bevel(x, BOX_X + 8, y0, BOX_W - 16, 22, d.spec.body, false);
    rect(x, BOX_X + 8, y0 + 21, BOX_W - 16, 1, shade(d.spec.body, 0.7));
    d.terms.forEach((tm) => drawScrew(x, tm, tm.x, TERM_Y + oy));
    // wires
    d.wires.forEach((w, i) => {
      if (i === held) return;
      if (w.term >= 0) {
        const tm = d.terms[w.term];
        drawWire(x, w, tm.x, TERM_Y - 4 + oy, 6);
        rect(x, tm.x - 3, TERM_Y - 2 + oy, 6, 2, '#e8a060');
      } else {
        const sway = Math.round(Math.sin(t * 2 + i) * 0.6);
        drawWire(x, w, w.ex + sway, w.ey + oy, 4);
      }
    });
    if (held >= 0) {
      const w = d.wires[held];
      drawWire(x, w, hx, hy, 3);
    }
    // header + timer
    const head = `${di + 1}/${DEVICES} ${d.spec.name}`;
    rect(x, BOX_X + 4, 14, BOX_W - 8, 9, '#1c1424');
    text(x, head, BOX_X + 7, 16, '#f2e6c8');
    const frac = Math.max(0, d.left / d.limit);
    const bw = 40;
    const bx = BOX_X + BOX_W - bw - 7;
    rect(x, bx, 16, bw, 5, '#3a2a3a');
    rect(x, bx, 16, Math.round(bw * frac), 5, frac > 0.5 ? '#7cf08a' : frac > 0.25 ? '#f2c230' : '#ff5a4a');
    outlineRect(x, bx - 1, 15, bw + 2, 7, '#8a7a9a');
  }

  return {
    duration: 58,
    keys: [
      { key: 'up', label: 'POWER' },
      { key: 'left', label: '◀' },
      { key: 'action', label: 'GRAB/WIRE', wide: true },
      { key: 'right', label: '▶' },
    ],
    note: '← → pick · SPACE grabs a wire, then lands it on a screw · ↑ flips the breaker · or drag with the mouse',
    touchNote: 'Sparks? Tap the breaker (or POWER) first. Then drag each wire onto its screw (or tap wire, then screw).',
    step(dt, _t, inp, live) {
      hintT = Math.max(0, hintT - dt);
      // hand position: follow the pointer, else hover the keyboard selection
      let tx: number;
      let ty: number;
      if (ptr && (dragging || held >= 0)) {
        tx = ptr.x;
        ty = ptr.y;
      } else if (held >= 0) {
        const tm = dev.terms[sel];
        tx = tm ? tm.x : hx;
        ty = TERM_Y - 10;
      } else {
        const w = dev.wires[sel];
        tx = w ? w.ex : 116;
        ty = w ? w.ey + 6 : 60;
      }
      const k = Math.min(1, dt * 18);
      hx += (tx - hx) * k;
      hy += (ty - hy) * k;
      // live sparks
      if (breakerOn && swap <= 0) {
        sparkT -= dt;
        if (sparkT <= 0) {
          sparkT = rnd(0.12, 0.45);
          const loosies = dev.wires.filter((w) => w.term < 0);
          if (loosies.length) {
            const w = pick(loosies);
            fx.burst(w.ex, w.ey + 3, ['#fff7a0', '#ffffff', '#7ad8ff'], 5, 40, 80, 0.3);
            if (Math.random() < 0.3) sfx('type');
          }
        }
      }
      if (!live) return;
      pt += dt;
      stun = Math.max(0, stun - dt);
      if (swap > 0) {
        swap -= dt;
        if (swap <= 0) {
          dev = makeDevice(di);
          breakerOn = dev.live;
          sel = looseWires()[0] ?? 0;
          if (dev.live && !liveHintShown) {
            liveHintShown = true;
            say('SPARKS! IT IS LIVE. FLIP THE BREAKER', 3);
          }
        }
        return;
      }
      if (pt < 0.1 && !hint) say('MATCH EACH WIRE TO ITS SCREW', 2.5);
      dev.left -= dt;
      used += dt;
      if (dev.left <= 0) {
        sfx('bad');
        fx.kick(2);
        fx.pop(BOX_X + BOX_W / 2, 58, 'OUT OF TIME', '#ff9a7a');
        nextDevice(true);
        return;
      }
      if ((['up', 'left', 'right', 'action', 'down'] as const).some((k) => inp.pressed.has(k))) ptr = null; // keyboard takes the hand back
      if (hit(inp, 'up')) toggleBreaker();
      if (hit(inp, 'left')) moveSel(-1);
      if (hit(inp, 'right')) moveSel(1);
      if (hit(inp, 'action') || hit(inp, 'down')) {
        if (held < 0) grab(sel);
        else connect(sel);
      }
    },
    pointer(x, y, kind) {
      if (swap > 0) return;
      ptr = { x, y };
      if (kind === 'down') {
        if (x < 38 && y > 10 && y < 84) {
          toggleBreaker();
          return;
        }
        if (held >= 0) {
          const ti = termAt(x, y);
          if (ti >= 0) {
            connect(ti);
            ptr = null;
            return;
          }
        }
        const wi = wireAt(x, y);
        if (wi >= 0) {
          dragging = true;
          grab(wi);
          hx = x;
          hy = y;
          if (held < 0) ptr = null;
        }
      } else if (kind === 'up') {
        if (dragging && held >= 0) {
          const ti = termAt(x, y);
          if (ti >= 0) {
            connect(ti);
            ptr = null;
          }
        }
        dragging = false;
      }
    },
    draw(x, t) {
      x.drawImage(bg(), 0, 0);
      // breaker handle + light
      const on = breakerOn && swap <= 0;
      rect(x, 10, 74, 18, 5, '#2a2a34');
      text(x, `CKT${dev.ckt}`, 7, 6, '#4a3a2a');
      const hy0 = on ? 29 : 45;
      rect(x, 13, 28, 12, 26, '#1c1424');
      bevel(x, 14, hy0, 10, 8, on ? '#e0503c' : '#3caa6a');
      const blink = on && Math.floor(t * 5) % 2 === 0;
      rect(x, 12, 58, 14, 7, '#1c1424');
      text(x, on ? 'LIVE' : 'OFF', on ? 12 : 14, 59, on ? (blink ? '#ff5a4a' : '#ffb0a0') : '#7cf08a');
      if (on) {
        x.globalAlpha = 0.35 + 0.25 * Math.sin(t * 12);
        outlineRect(x, 2, 11, 34, 72, '#ff5a4a');
        x.globalAlpha = 1;
      }
      // legend
      rect(x, 2, 86, 37, 21, '#1c1424');
      text(x, 'HOT', 4, 88, SCREW.hot);
      text(x, 'NEU', 4, 94, SCREW.neu);
      text(x, 'GND', 4, 100, SCREW.gnd);
      rect(x, 18, 89, 5, 2, WIRE.black.c);
      rect(x, 18, 89, 5, 1, '#5a5a64');
      rect(x, 25, 89, 5, 2, WIRE.red.c);
      rect(x, 32, 89, 5, 2, WIRE.blue.c);
      rect(x, 18, 95, 5, 2, WIRE.white.c);
      rect(x, 18, 101, 5, 2, WIRE.green.c);
      rect(x, 25, 101, 5, 2, WIRE.bare.c);
      // device (slides in on a swap)
      const u = swap > 0 ? 1 - swap / 0.75 : 0;
      if (!finished) drawDevice(x, dev, Math.round(u * u * 70), t);
      if (swap > 0 && !finished) centered(x, `NEXT: ${specs[di].name}`, BOX_X + BOX_W / 2, 40, '#fff3c4');
      // selection highlight (keyboard)
      if (!ptr && swap <= 0 && !finished && Math.floor(t * 4) % 2 === 0) {
        if (held < 0) {
          const w = dev.wires[sel];
          if (w && w.term < 0) outlineRect(x, w.ex - 4, w.ey - 3, 8, 10, '#ffe27a');
        } else {
          const tm = dev.terms[sel];
          if (tm && !tm.used) outlineRect(x, tm.x - 6, TERM_Y - 5, 12, 11, '#ffe27a');
        }
      }
      // gloved hand
      const gx = Math.round(hx);
      const gy = Math.round(hy);
      if (!finished) {
        rect(x, gx - 3, gy + 2, 7, 6, INK);
        rect(x, gx - 2, gy + 3, 5, 4, '#f2c230');
        rect(x, gx - 2, gy + 1, 2, 2, '#f2c230');
        rect(x, gx - 2, gy + 6, 5, 1, '#c8961a');
        if (stun > 0 && Math.floor(t * 20) % 2) rect(x, gx - 4, gy, 9, 9, '#ffffff');
      }
      // you, on a step stool at the side
      drawRunner(x, me, 169, 73, 'stand', 0, -1, stun > 0);
      if (hintT > 0) {
        const hw = textWidth(hint) + 6;
        const bx = Math.max(2, Math.min(190 - hw, BOX_X + BOX_W / 2 - hw / 2));
        rect(x, bx, 26, hw, 9, '#1c1424');
        outlineRect(x, bx - 1, 25, hw + 2, 11, '#ffe27a');
        text(x, hint, bx + 3, 28, '#ffe27a');
      }
      if (held >= 0 && !ptr) centered(x, 'NOW PICK ITS SCREW', BOX_X + BOX_W / 2, 64, '#fff3c4');
    },
    hud: () => [
      { label: 'Device', value: `${Math.min(DEVICES, di + 1)}/${DEVICES}` },
      { label: 'Breaker', value: breakerOn && swap <= 0 ? 'LIVE' : 'OFF', warn: breakerOn && swap <= 0 },
      { label: 'Passed', value: done },
      { label: 'Zaps', value: zaps, warn: zaps > 0 },
    ],
    finished: () => finished,
    result() {
      const acc = conns / Math.max(1, conns + wrong + 2 * zaps + loose);
      const pace = paceSum / DEVICES;
      return {
        score: shiftScore(acc, pace),
        stats: { sorted: conns, mistakes: wrong, zaps, devices: done },
        line: `${done}/${DEVICES} PASSED, ${zaps} ZAP${zaps === 1 ? '' : 'S'}, ${wrong} WRONG`,
      };
    },
  };
}
