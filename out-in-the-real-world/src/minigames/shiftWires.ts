// Shift Rush, trade skin: Wire It Up. A run of devices (outlet, light, switch, dryer...) to wire
// before each one's timer runs out: land every wire on its terminal (black/red/blue = HOT on brass,
// white = NEUTRAL on silver, green/bare = GROUND on the green screw). Some boxes are still LIVE:
// the wires spark, and you have to flip the breaker off before you touch anything.
import { playerPerson } from '../art/people.ts';
import { text, textWidth, type Ctx } from '../art/px.ts';
import { sfx } from '../ui/audio.ts';
import { ball, beam, blit, ctext, cyl, ell, hfill, layer, lin, otext, pool, rad, rgba, rr, sbox, shadow, tint, vfill } from './hd2Kit.tsx';
import { person } from './hd2Person.ts';
import { hit, pick, rnd, shiftScore, shuffle, type ModeEnv, type ShiftMode } from './shiftKit.ts';

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
    const bare = w.kind === 'bare';
    // one smooth cable: straight down out of the conduit, then over to the end
    const path = (): void => {
      x.beginPath();
      x.moveTo(w.ox, 12);
      x.bezierCurveTo(w.ox, 12 + (endY - 12) * 0.45 + sag, endX, endY - (endY - 12) * 0.4 + sag * 0.5, endX, endY);
    };
    x.save();
    x.lineCap = 'round';
    x.lineJoin = 'round';
    path();
    x.lineWidth = bare ? 1.6 : 2.7;
    x.strokeStyle = 'rgba(20,12,28,0.85)';
    x.stroke();
    x.lineWidth = bare ? 1 : 2;
    x.strokeStyle = bare ? '#c87838' : col;
    x.stroke();
    x.lineWidth = bare ? 0.9 : 1.1;
    x.strokeStyle = tint(col, 0.6);
    x.translate(0.35, 0.35);
    path();
    x.stroke();
    x.translate(-0.7, -0.7);
    path();
    x.lineWidth = bare ? 0.35 : 0.45;
    x.strokeStyle = bare ? 'rgba(255,230,190,0.9)' : rgba(tint(col, 1.7), 0.75);
    x.stroke();
    x.restore();
    // stripped copper tip with a hot specular
    x.fillStyle = lin(x, endX - 1, 0, endX + 1, 0, ['#9a5420', '#ffd0a0', '#e8a060', '#8a4a1a']);
    x.fillRect(endX - 1, endY, 2, 4);
    ell(x, endX, endY + 4, 1, 0.5);
    x.fillStyle = '#b86a30';
    x.fill();
  }

  function drawScrew(x: Ctx, t: Term, tx: number, ty: number): void {
    const c = SCREW[t.role];
    shadow(x, tx + 0.6, ty + 3.6, 5, 1.6, 0.45);
    ell(x, tx, ty + 0.5, 4.1, 3.6);
    x.fillStyle = 'rgba(20,12,28,0.9)';
    x.fill();
    ball(x, tx, ty + 0.5, 3.4, c, 2.9, 0.85);
    x.save();
    x.translate(tx, ty + 0.5);
    x.rotate(0.5);
    x.fillStyle = rgba(tint(c, 0.4), 0.95);
    x.fillRect(-2.2, -0.35, 4.4, 0.7);
    x.restore();
    const tag = TAG[t.role];
    const tw = textWidth(tag);
    sbox(x, tx - tw / 2 - 1.5, ty + 5.6, tw + 3, 7.4, '#1c1424', { r: 1.6, gloss: 0.15, outline: rgba(c, 0.6) });
    text(x, tag, Math.round(tx - tw / 2), ty + 7, c);
  }

  const bg = (): HTMLCanvasElement =>
    layer('hd-wire-bg', 192, 108, (x) => {
      // unfinished wall: drywall with a soft work-light falloff
      vfill(x, 0, 0, 192, 108, ['#e8dcc0', '#d0bc98', '#a8906a']);
      x.fillStyle = rad(x, 150, 10, 4, 150, ['rgba(255,240,200,0.35)', 'rgba(255,240,200,0)']);
      x.fillRect(0, 0, 192, 108);
      // studs: rounded wood with grain
      for (const sx of [0, 40, 176]) {
        x.fillStyle = lin(x, sx, 0, sx + 6, 0, ['#8a5a2a', '#e8bc80', '#c89a5a', '#7a4a20']);
        x.fillRect(sx, 0, 6, 108);
        x.strokeStyle = 'rgba(120,70,30,0.35)';
        x.lineWidth = 0.3;
        for (let g = 0; g < 4; g++) {
          x.beginPath();
          x.moveTo(sx + 1.2 + g * 1.2, 0);
          x.bezierCurveTo(sx + 2 + g, 30, sx + 0.8 + g * 1.3, 70, sx + 1.6 + g, 108);
          x.stroke();
        }
      }
      // breaker panel: brushed steel
      shadow(x, 20, 82, 20, 3, 0.4);
      sbox(x, 3, 12, 32, 70, '#9aa2b4', { r: 1.5, gloss: 0.4 });
      vfill(x, 7, 18, 24, 58, ['#3a4254', '#5a6274', '#4a5264']);
      for (let k = 0; k < 6; k++) {
        sbox(x, 9, 21 + k * 9, 8, 6, '#2a2a34', { r: 1, gloss: 0.3 });
        sbox(x, 20, 21 + k * 9, 8, 6, '#2a2a34', { r: 1, gloss: 0.3 });
      }
      // the box: a deep steel junction box
      shadow(x, BOX_X + BOX_W / 2, 105, BOX_W * 0.55, 3, 0.45);
      sbox(x, BOX_X - 1, 5, BOX_W + 2, 100, '#a8b0c2', { r: 2, gloss: 0.45 });
      vfill(x, BOX_X + 4, 10, BOX_W - 8, 90, ['#202430', '#3a3e4c', '#4e5262']);
      vfill(x, BOX_X + 4, 10, BOX_W - 8, 8, ['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)']);
      hfill(x, BOX_X + 4, 10, 6, 90, ['rgba(0,0,0,0.4)', 'rgba(0,0,0,0)']);
      hfill(x, BOX_X + BOX_W - 10, 10, 6, 90, ['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)']);
      // conduit
      cyl(x, 92, 0, 24, 11, '#b8bccc', { spec: 0.6 });
      sbox(x, 89, 8, 30, 6, '#8a92a4', { r: 1.5, gloss: 0.5 });
    });
  // the clamp work light up top-right: a warm cone across the box
  const light = (): HTMLCanvasElement =>
    layer('hd-wire-light', 192, 108, (x) => {
      beam(x, 160, 176, 0, 60, 170, 108, '#fff0c8', 0.12);
      pool(x, 112, 70, 70, 40, '#ffe8b0', 0.12);
    });

  function drawDevice(x: Ctx, d: Device, oy: number, t: number): void {
    // device body behind the terminals
    const y0 = TERM_Y - 8 + oy;
    shadow(x, BOX_X + BOX_W / 2, y0 + 23, BOX_W / 2 - 6, 2.5, 0.5);
    sbox(x, BOX_X + 7, y0 - 1, BOX_W - 14, 24, d.spec.body, { r: 3, gloss: 0.45 });
    d.terms.forEach((tm) => drawScrew(x, tm, tm.x, TERM_Y + oy));
    // wires
    d.wires.forEach((w, i) => {
      if (i === held) return;
      if (w.term >= 0) {
        const tm = d.terms[w.term];
        drawWire(x, w, tm.x, TERM_Y - 4 + oy, 6);
        x.fillStyle = lin(x, 0, TERM_Y - 2 + oy, 0, TERM_Y + oy, ['#ffd0a0', '#b86a30']);
        x.fillRect(tm.x - 3, TERM_Y - 2 + oy, 6, 2);
      } else {
        const sway = Math.sin(t * 2 + i) * 0.6;
        drawWire(x, w, w.ex + sway, w.ey + oy, 4);
      }
    });
    if (held >= 0) {
      const w = d.wires[held];
      drawWire(x, w, hx, hy, 3);
    }
    // header + timer
    const head = `${di + 1}/${DEVICES} ${d.spec.name}`;
    sbox(x, BOX_X + 4, 14, BOX_W - 8, 9, '#1c1424', { r: 1.5, gloss: 0.12, outline: null });
    text(x, head, BOX_X + 7, 16, '#f2e6c8');
    const frac = Math.max(0, d.left / d.limit);
    const bw = 40;
    const bx = BOX_X + BOX_W - bw - 7;
    rr(x, bx - 0.5, 15.5, bw + 1, 6, 3);
    x.fillStyle = '#3a2a3a';
    x.fill();
    if (frac > 0) sbox(x, bx, 16, Math.max(2, bw * frac), 5, frac > 0.5 ? '#7cf08a' : frac > 0.25 ? '#f2c230' : '#ff5a4a', { r: 2.5, gloss: 0.5, outline: null });
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
      blit(x, bg(), 0, 0, 192, 108);
      // breaker handle + light
      const on = breakerOn && swap <= 0;
      sbox(x, 10, 74, 18, 5, '#2a2a34', { r: 1, gloss: 0.2, outline: null });
      otext(x, `CKT${dev.ckt}`, 7, 5, '#4a3a2a', 6);
      const hy0 = on ? 29 : 45;
      sbox(x, 13, 28, 12, 26, '#1c1424', { r: 2, gloss: 0.1 });
      sbox(x, 14, hy0, 10, 8, on ? '#e0503c' : '#3caa6a', { r: 2, gloss: 0.55 });
      const blink = on && Math.floor(t * 5) % 2 === 0;
      sbox(x, 12, 58, 14, 7, '#1c1424', { r: 1.5, gloss: 0.1, outline: null });
      text(x, on ? 'LIVE' : 'OFF', on ? 12 : 14, 59, on ? (blink ? '#ff5a4a' : '#ffb0a0') : '#7cf08a');
      if (on) {
        const a = 0.35 + 0.25 * Math.sin(t * 12);
        pool(x, 19, 47, 26, 42, '#ff4a3a', a * 0.6);
        x.lineWidth = 0.9;
        x.strokeStyle = rgba('#ff5a4a', a + 0.2);
        rr(x, 2, 11, 34, 72, 2.5);
        x.stroke();
      } else pool(x, 19, 61, 10, 5, '#7cf08a', 0.3);
      // legend
      sbox(x, 2, 86, 37, 21, '#1c1424', { r: 2, gloss: 0.12 });
      text(x, 'HOT', 4, 88, SCREW.hot);
      text(x, 'NEU', 4, 94, SCREW.neu);
      text(x, 'GND', 4, 100, SCREW.gnd);
      for (const [lx, ly, c] of [[18, 89, WIRE.black.c], [25, 89, WIRE.red.c], [32, 89, WIRE.blue.c], [18, 95, WIRE.white.c], [18, 101, WIRE.green.c], [25, 101, WIRE.bare.c]] as const) {
        sbox(x, lx, ly - 0.3, 5, 2.4, c, { r: 1.2, gloss: 0.5, outline: null });
      }
      // device (slides in on a swap)
      const u = swap > 0 ? 1 - swap / 0.75 : 0;
      if (!finished) drawDevice(x, dev, u * u * 70, t);
      if (swap > 0 && !finished) ctext(x, `NEXT: ${specs[di].name}`, BOX_X + BOX_W / 2, 40, '#fff3c4');
      // live sparks glow at the conduit
      if (on && !finished && dev.live) pool(x, 104, 14, 16, 10, '#9ad8ff', 0.25 + 0.2 * Math.sin(t * 30));
      // selection highlight (keyboard)
      if (!ptr && swap <= 0 && !finished) {
        const a = 0.55 + 0.45 * Math.sin(t * 12);
        x.lineWidth = 0.8;
        x.strokeStyle = rgba('#ffe27a', a);
        if (held < 0) {
          const w = dev.wires[sel];
          if (w && w.term < 0) {
            rr(x, w.ex - 4, w.ey - 3, 8, 10, 2);
            x.stroke();
            pool(x, w.ex, w.ey + 2, 7, 7, '#ffe27a', 0.2 * a);
          }
        } else {
          const tm = dev.terms[sel];
          if (tm && !tm.used) {
            rr(x, tm.x - 6, TERM_Y - 5, 12, 11, 2.5);
            x.stroke();
            pool(x, tm.x, TERM_Y, 9, 8, '#ffe27a', 0.2 * a);
          }
        }
      }
      // gloved hand
      if (!finished) {
        shadow(x, hx + 1.5, hy + 9, 4, 1.2, 0.3);
        rr(x, hx - 2.5, hy + 2.5, 6, 5, 2);
        x.fillStyle = rad(x, hx - 1, hy + 3.5, 0, 6, ['#ffe080', '#f2c230', '#a8780a']);
        x.fill();
        x.lineWidth = 0.45;
        x.strokeStyle = 'rgba(28,20,36,0.85)';
        x.stroke();
        ball(x, hx - 1, hy + 2, 1.2, '#f2c230', 1.4, 0.5);
        x.fillStyle = 'rgba(160,110,10,0.8)';
        x.fillRect(hx - 2.2, hy + 6.2, 5.4, 0.6);
        if (stun > 0 && Math.floor(t * 20) % 2) pool(x, hx, hy + 4, 9, 9, '#ffffff', 0.9);
      }
      // you, on a step stool at the side
      person(x, me, 169, 73, Math.floor(t * 1.5) % 2, false, { face: -1, blink: stun > 0 });
      x.globalCompositeOperation = 'lighter';
      blit(x, light(), 0, 0, 192, 108);
      x.globalCompositeOperation = 'source-over';
      if (hintT > 0) {
        const hw = textWidth(hint) + 6;
        const bx = Math.max(2, Math.min(190 - hw, BOX_X + BOX_W / 2 - hw / 2));
        sbox(x, bx - 1, 25, hw + 2, 11, '#1c1424', { r: 2, gloss: 0.15, outline: '#ffe27a', lw: 0.7 });
        text(x, hint, bx + 3, 28, '#ffe27a');
      }
      if (held >= 0 && !ptr) ctext(x, 'NOW PICK ITS SCREW', BOX_X + BOX_W / 2, 64, '#fff3c4');
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
