// Laser Tag with Rae and the crew: a top-down blacklight arena. Move with WASD/arrows, aim with the
// mouse and click (or hold) to fire; on phones, the left stick moves and the right stick (or tapping
// the arena) aims and fires. Friends seek, strafe, take cover, rush and dodge. Getting tagged dims
// your vest for a few seconds. Arenas and modes rotate every laser-tag night: free-for-all, glow
// flag, last one standing.
import { useEffect, useRef, useState } from 'react';
import { castFor, HAIRS, playerPerson, type Person } from '../art/people.ts';
import { INK, rect, type Ctx } from '../art/px.ts';
import { hdScale, useInput, useLoop, type MiniProps } from './kit.tsx';
import { ARENAS, LIVES, MODE_INFO, newMatch, points, POWER_INFO, standings, stepMatch, tagScore, los, type Agent, type Crew, type Match, type Mode } from './tagArena.ts';
import { arenaBg, arenaGlow, buildLights, drawBolt, drawFlag, drawGuide, drawOb, drawPad, drawPower, drawReticle, emitOb, lampC } from './tagArenaArt.ts';
import { audioInit, audioStop, bloom, centered, COUNT_TIME, countLabel, drawBanner, drawCount, Fx, Groove, outlined, snd, VH, VW, type Lamp, type LightMap } from './tagFx.ts';
import { angDiff, clamp, dist } from './tagMath.ts';
import { bobOf, chibi, drawBlaster, drawChibi, facingOf, footShadow, vestLights } from './tagSprite.ts';
import { GameCanvas, newPtr, newStick, ResultCard, Stick, TagHud, type BoardRow, type HudCell } from './tagUi.tsx';
import { drawHd, hdSprite } from './hdFx.ts';
import type { PostOpts } from './kit.tsx';

// HD: neon wants a strong, low-threshold bloom; the flat pixel backdrop is only rounded off, not relit.
const TAG_POST: PostOpts = { bloom: 0.75, threshold: 0.55, radius: 1.2, saturation: 1.18, warmth: 0, vignette: 0.38, smooth: 0.3 };
const FLAT = { light: 0, shadow: 0 };
const CHIBI_LIT = { light: 0.24, shadow: 0.34, rim: '#c8a8ff' };

const BOLT_H = 8; // bolts fly at chest height: drawn this far above their floor position
const MODES: Mode[] = ['ffa', 'flag', 'lms'];
const ME_C = '#7cf08a';

// Friends never share your hair colour, so you can always tell yourself apart at a glance.
function crewFor(round: number, me: Person): Crew[] {
  const crew = baseCrew(round);
  crew.forEach((c, i) => {
    if (c.p.hair === me.hair) c.p = { ...c.p, hair: HAIRS[(HAIRS.indexOf(me.hair) + 3 + i) % HAIRS.length] };
  });
  return crew;
}

function baseCrew(round: number): Crew[] {
  const lift = Math.min(0.12, round * 0.04);
  const rae = { ...castFor('rae').p, holds: undefined };
  const theo = { ...castFor('roommate').p, holds: undefined };
  const sam: Person = { skin: '#c98c62', hair: '#14131d', style: 6, shirt: '#e0503c', pants: '#2a2a3a', shoes: '#f2efe6' };
  const nico: Person = { skin: '#f7d7bd', hair: '#e3c26b', style: 5, shirt: '#3caa6a', pants: '#3a2f4a', glasses: true, shoes: '#3f7fd8' };
  return [
    { name: 'Rae', p: rae, color: '#ff4fd8', skill: 0.72 + lift, bold: 0.55, rival: 1 },
    { name: 'Theo', p: theo, color: '#4fd8ff', skill: 0.48 + lift, bold: 0.35 },
    { name: 'Sam', p: sam, color: '#ffb84f', skill: 0.42 + lift, bold: 0.9 },
    { name: 'Nico', p: nico, color: '#b48cff', skill: 0.56 + lift, bold: 0.2 },
  ];
}

const QUIPS = {
  tagYou: ['GOTCHA!', 'TOO SLOW!', 'ZAP!', 'HA!', 'TAGGED!'],
  gotTagged: ['HEY!', 'NO WAY!', 'LUCKY!', 'OOF!', 'RUDE!'],
};
const pickOf = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

interface G {
  m: Match;
  fx: Fx;
  light: LightMap;
  arenaIdx: number;
  round: number;
  phase: 'count' | 'play' | 'end' | 'board';
  t: number;
  endT: number;
  label: string | null;
  aim: number;
  kick: number;
  firstTag: boolean;
  lastBy: number; // who last tagged you (for REVENGE!)
  warned10: boolean;
  lastSec: number;
  sparkT: number;
  groove: Groove;
  emit: HTMLCanvasElement | null;
  result: { score: number; rank: number; n: number } | null;
  quip: { a: number; s: string; life: number }[];
}

export function LaserTag({ s, data, onDone, reducedMotion }: MiniProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useInput();
  const ptr = useRef(newPtr()).current;
  const move = useRef(newStick()).current;
  const aimSt = useRef(newStick()).current;
  const gref = useRef<G | null>(null);
  if (!gref.current) {
    const ft = Number(s.flags.friendTime ?? 1) || 1;
    const round = Math.max(0, Math.floor((ft - 1) / 2));
    const mode = (typeof data.mode === 'string' && (MODES as string[]).includes(data.mode) ? data.mode : MODES[round % 3]) as Mode;
    const arenaIdx = typeof data.arena === 'number' ? Math.abs(data.arena) % ARENAS.length : round % ARENAS.length;
    const arena = ARENAS[arenaIdx];
    const meP = playerPerson(s.look);
    const m = newMatch(arena, mode, { name: 'You', p: meP, color: ME_C }, crewFor(round, meP), Math.random);
    gref.current = {
      m,
      fx: new Fx(reducedMotion),
      light: buildLights(arena),
      arenaIdx,
      round,
      phase: 'count',
      t: 0,
      endT: 0,
      label: null,
      aim: -Math.PI / 2,
      kick: 0,
      firstTag: false,
      lastBy: -1,
      warned10: false,
      lastSec: 99,
      sparkT: 0,
      groove: new Groove(128, [2, null, 2, 14, null, 2, null, 9, 0, null, 0, 12, null, 0, 7, null], 0.03),
      emit: null,
      result: null,
      quip: [],
    };
  }
  const g = gref.current;
  const [hud, setHud] = useState<{ cells: HudCell[]; chips: { label: string; c: string; t: number }[] }>({ cells: [], chips: [] });
  const hudKey = useRef('');
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const sent = useRef(false);

  useEffect(() => {
    audioInit();
    return () => audioStop();
  }, []);

  const finish = (): void => {
    if (sent.current || !g.result) return;
    sent.current = true;
    const me = g.m.agents[0];
    onDone({ score: g.result.score, stats: { rank: g.result.rank, players: g.result.n, tags: me.tags, tagged: me.tagged, captures: me.caps, round: g.round } });
  };

  const say = (a: Agent, s2: string): void => {
    g.quip = g.quip.filter((q) => q.a !== a.id);
    g.quip.push({ a: a.id, s: s2, life: 1.1 });
  };

  const handleEvents = (): void => {
    const { m, fx } = g;
    const me = m.agents[0];
    for (const e of m.ev) {
      switch (e.k) {
        case 'fire':
          if (e.a === 0) {
            snd.zap();
            g.kick = 1;
            fx.kick(0.7);
            fx.jet(e.x, e.y - BOLT_H, e.ang, 0.5, ['#ffffff', ME_C], 4, 60, { glow: true, life: 0.15 });
          } else {
            const a = m.agents[e.a];
            if (dist(a.x, a.y, me.x, me.y) < 150) snd.ezap();
            fx.jet(e.x, e.y - BOLT_H, e.ang, 0.5, ['#ffffff', a.color], 3, 50, { glow: true, life: 0.12 });
          }
          break;
        case 'tag': {
          const by = m.agents[e.by];
          const on = m.agents[e.on];
          const hx = e.x;
          const hy = e.y - BOLT_H;
          fx.burst(hx, hy, [on.color, '#ffffff', by.color], 14, 70, { glow: true, life: 0.45, drag: 3 });
          fx.ring(hx, hy, on.color, 70, 0.35);
          if (e.on === 0) {
            snd.tagged();
            fx.kick(4.5);
            fx.blink('#ff2a5a', 0.32);
            fx.pop(me.x, me.y - 30, 'TAGGED!', '#ff7a8a');
            g.lastBy = e.by;
            say(by, pickOf(QUIPS.tagYou));
            if (m.mode === 'lms' && me.lives > 0) fx.pop(me.x, me.y - 38, `${me.lives} LEFT`, '#ffd0a0');
          } else if (e.by === 0) {
            snd.tagHit();
            fx.kick(2);
            fx.pop(on.x, on.y - 30, '+1', ME_C);
            say(on, pickOf(QUIPS.gotTagged));
            const st = me.streak;
            if (e.on === g.lastBy) {
              fx.say('REVENGE!', '#ff8a3c', `ON ${on.name.toUpperCase()}`);
              snd.streak(3);
              g.lastBy = -1;
            } else if (!g.firstTag) {
              fx.say('FIRST TAG!', '#7cf0ff');
              snd.streak(1);
            } else if (st >= 2) {
              const names = ['', '', 'DOUBLE TAG!', 'TRIPLE TAG!', 'ON FIRE!', 'UNSTOPPABLE!'];
              fx.say(names[Math.min(st, 5)] || 'LEGENDARY!', st >= 4 ? '#ff8a3c' : '#ffe27a', `${st} IN A ROW`);
              snd.streak(st);
            }
            g.firstTag = true;
          } else {
            snd.aiTag();
            if (Math.random() < 0.35) say(by, pickOf(QUIPS.tagYou));
          }
          break;
        }
        case 'block': {
          const on = m.agents[e.on];
          snd.block();
          fx.ring(on.x, on.y - 10, '#4fd8ff', 50, 0.4, 8);
          fx.pop(on.x, on.y - 30, 'BLOCKED!', '#9ae8ff');
          break;
        }
        case 'spark':
          fx.jet(e.x, e.y - BOLT_H, e.ang, 1.1, ['#ffffff', e.c], 5, 55, { glow: true, life: 0.22 });
          if (g.sparkT <= 0) {
            snd.spark();
            g.sparkT = 0.05;
          }
          break;
        case 'power': {
          const a = m.agents[e.a];
          const info = POWER_INFO[e.kind];
          fx.burst(e.x, e.y - 8, [info.c, '#ffffff'], 16, 60, { glow: true, life: 0.5 });
          fx.ring(e.x, e.y - 8, info.c, 60, 0.4);
          if (a.me) {
            snd.power();
            fx.say(info.label + '!', info.c);
          } else fx.pop(a.x, a.y - 30, info.label, info.c);
          break;
        }
        case 'powerSpawn':
          fx.ring(e.x, e.y - 8, '#ffffff', 40, 0.4);
          snd.tick();
          break;
        case 'grab': {
          const a = m.agents[e.a];
          snd.grab();
          if (a.me) fx.say('GOT THE FLAG!', '#ffe04f', 'RUN IT TO THE GREEN PAD');
          else fx.pop(a.x, a.y - 32, `${a.name.toUpperCase()} HAS IT!`, a.color);
          break;
        }
        case 'drop': {
          const a = m.agents[e.a];
          fx.pop(a.x, a.y - 36, 'DROPPED!', '#ffe04f');
          break;
        }
        case 'capture': {
          const a = m.agents[e.a];
          fx.burst(e.x, e.y - 6, ['#ffe04f', '#7cf08a', '#ffffff'], 30, 90, { glow: true, life: 0.7 });
          fx.ring(e.x, e.y, '#7cf08a', 90, 0.5);
          if (a.me) {
            snd.capture();
            fx.kick(3);
            fx.say('CAPTURE! +3', '#7cf08a');
          } else {
            snd.aiTag();
            fx.say(`${a.name.toUpperCase()} SCORES`, a.color, '+3 POINTS');
          }
          break;
        }
        case 'out': {
          const a = m.agents[e.a];
          fx.burst(a.x, a.y - 10, [a.color, '#ffffff', '#555577'], 24, 80, { glow: true, life: 0.7 });
          if (a.me) {
            snd.out();
            fx.say("YOU'RE OUT!", '#ff7a5a');
          } else {
            snd.out();
            const left = m.agents.filter((o) => !o.out).length;
            fx.say(`${a.name.toUpperCase()} IS OUT!`, a.color, left === 2 ? 'FINAL TWO!' : `${left} LEFT`);
          }
          break;
        }
        case 'overheat':
          snd.empty();
          fx.pop(me.x, me.y - 32, 'OVERHEAT!', '#ff9a5a');
          fx.jet(me.x, me.y - 12, -Math.PI / 2, 0.6, ['#d8d0e8', '#a8a0c0'], 10, 30, { life: 0.7, drag: 2 });
          break;
        case 'back':
          if (e.a === 0) {
            fx.pop(me.x, me.y - 30, 'VEST ON!', ME_C);
            fx.ring(me.x, me.y - 10, ME_C, 50, 0.35, 6);
            snd.tick();
          }
          break;
      }
    }
    m.ev.length = 0;
  };

  const endRound = (): void => {
    const { m } = g;
    const st = standings(m);
    const me = m.agents[0];
    const rank = st.indexOf(me) + 1;
    const score = tagScore(rank, st.length, me.tags, me.tagged + (m.mode === 'lms' && me.out ? 1 : 0));
    g.result = { score, rank, n: st.length };
    if (rank === 1) snd.fanfare();
    else snd.whistle();
  };

  const showBoard = (): void => {
    const { m } = g;
    const rows: BoardRow[] = standings(m).map((a) => ({
      key: String(a.id),
      name: a.me ? 'You' : a.name,
      color: a.color,
      me: a.me,
      cols: m.mode === 'flag' ? [a.tags, a.caps, a.tagged, points(m, a)] : m.mode === 'lms' ? [a.tags, a.tagged, a.out ? 'OUT' : '♥'.repeat(Math.max(0, a.lives))] : [a.tags, a.tagged],
    }));
    setBoard(rows);
  };

  useLoop(
    (dt) => {
      const { m, fx } = g;
      const me = m.agents[0];
      g.t += dt;
      g.sparkT -= dt;
      fx.update(dt);
      g.kick = Math.max(0, g.kick - dt * 8);
      for (const q of g.quip) q.life -= dt;
      g.quip = g.quip.filter((q) => q.life > 0);
      if (g.phase !== 'board') g.groove.update(g.phase === 'play' ? 1 : 0.4);

      // ----- aim -----
      const kx = (input.down.has('right') ? 1 : 0) - (input.down.has('left') ? 1 : 0);
      const ky = (input.down.has('down') ? 1 : 0) - (input.down.has('up') ? 1 : 0);
      const mx = clamp(kx + move.x, -1, 1);
      const my = clamp(ky + move.y, -1, 1);
      const cy = me.y - 1;
      let assist = false;
      if (aimSt.active && Math.hypot(aimSt.x, aimSt.y) > 0.2) {
        g.aim = Math.atan2(aimSt.y, aimSt.x);
        assist = true;
      } else if (ptr.inside || ptr.down) {
        g.aim = Math.atan2(ptr.y + BOLT_H - cy, ptr.x - me.x);
        assist = ptr.touch;
      } else if (Math.hypot(mx, my) > 0.2) g.aim = Math.atan2(my, mx);
      if (assist) {
        // gentle aim assist for thumbs: snap toward a friend near the aim line
        let best = 0.32;
        let snap: number | null = null;
        for (const a of m.agents) {
          if (a.me || a.out || a.dim > 0) continue;
          const want = Math.atan2(a.y - cy, a.x - me.x);
          const d = Math.abs(angDiff(g.aim, want));
          if (d < best && los(m, me.x, cy, a.x, a.y - 1)) {
            best = d;
            snap = want;
          }
        }
        if (snap !== null) g.aim = snap;
      }
      const firing = ptr.down || (aimSt.active && Math.hypot(aimSt.x, aimSt.y) > 0.35) || input.down.has('action');

      // ----- phases -----
      if (g.phase === 'count') {
        const lab = countLabel(g.t);
        if (lab !== g.label) {
          g.label = lab;
          if (lab === 'GO!') snd.go();
          else if (lab) snd.tick();
        }
        if (g.t >= COUNT_TIME) {
          g.phase = 'play';
          fx.say(MODE_INFO[m.mode].name, '#7cf0ff', MODE_INFO[m.mode].goal);
        }
        me.aim = g.aim;
      } else if (g.phase === 'play') {
        stepMatch(m, dt, { mx, my, aim: g.aim, fire: firing });
        handleEvents();
        const sec = Math.ceil(m.left);
        if (sec !== g.lastSec) {
          g.lastSec = sec;
          if (sec <= 5 && sec > 0) snd.tick();
        }
        if (!g.warned10 && m.left <= 10) {
          g.warned10 = true;
          snd.alarm();
          fx.say('10 SECONDS!', '#ff8a3c');
        }
        if (m.over) {
          g.phase = 'end';
          g.endT = 0;
          endRound();
        }
      } else if (g.phase === 'end') {
        g.endT += dt;
        // friends wind down
        for (const a of m.agents) {
          a.vx *= 0.9;
          a.vy *= 0.9;
        }
        if (g.endT > 2.4) {
          g.phase = 'board';
          showBoard();
        }
      } else if (g.phase === 'board') {
        g.endT += dt;
        if (input.pressed.has('action') && g.endT > 3) finish();
        if (g.endT > 14) finish();
      }

      // ----- HUD -----
      const st = standings(m);
      const rank = st.indexOf(me) + 1;
      const heatCell: HudCell = { label: me.hot > 0 ? 'OVERHEAT' : me.rapid > 0 ? 'BLASTER: RAPID' : 'BLASTER', value: '', meter: me.rapid > 0 ? 1 : 1 - me.heat, warn: me.hot > 0, wide: true };
      const vestCell: HudCell =
        m.mode === 'lms'
          ? { label: 'VEST', value: me.out ? 'OUT' : '♥'.repeat(Math.max(0, me.lives)) + '♡'.repeat(LIVES - Math.max(0, me.lives)), tone: 'hot', warn: me.dim > 0 || me.out }
          : { label: 'VEST', value: me.dim > 0 ? `${me.dim.toFixed(1)}s` : 'LIVE', warn: me.dim > 0, tone: 'good' };
      const cells: HudCell[] = [
        { label: 'TIME', value: clock(m.left), warn: g.phase === 'play' && m.left <= 10 },
        m.mode === 'flag' ? { label: 'POINTS', value: points(m, me), tone: 'cool' } : { label: 'TAGS', value: me.tags, tone: 'good' },
        { label: 'RANK', value: `#${rank}/${st.length}`, tone: rank === 1 ? 'good' : undefined },
        vestCell,
        heatCell,
      ];
      const chips: { label: string; c: string; t: number }[] = [];
      if (me.rapid > 0) chips.push({ label: 'RAPID', c: POWER_INFO.rapid.c, t: me.rapid });
      if (me.shield > 0) chips.push({ label: 'SHIELD', c: POWER_INFO.shield.c, t: me.shield });
      if (me.speed > 0) chips.push({ label: 'SPEED', c: POWER_INFO.speed.c, t: me.speed });
      if (m.flag.carrier === 0) chips.push({ label: 'FLAG', c: '#ffe04f', t: 0 });
      const key = cells.map((c) => `${c.value}${c.warn ? '!' : ''}${c.meter !== undefined ? Math.round(c.meter * 20) : ''}`).join('|') + chips.map((c) => c.label + Math.ceil(c.t)).join(',');
      if (key !== hudKey.current) {
        hudKey.current = key;
        setHud({ cells, chips });
      }

      draw();
    },
    true,
    input,
  );

  const draw = (): void => {
    const cv = canvas.current;
    if (!cv) return;
    const x = cv.getContext('2d');
    const S = hdScale(cv);
    if (!x) return;
    x.imageSmoothingEnabled = false;
    if (!g.emit) {
      g.emit = document.createElement('canvas');
      g.emit.width = VW * S;
      g.emit.height = VH * S;
    }
    const e = g.emit.getContext('2d');
    if (!e) return;
    e.imageSmoothingEnabled = false;
    const { m, fx, t } = { m: g.m, fx: g.fx, t: g.t };
    const me = m.agents[0];
    const [ox, oy] = fx.offset();

    // ---------- lit pass ----------
    x.setTransform(S, 0, 0, S, 0, 0);
    x.globalCompositeOperation = 'source-over';
    drawHd(x, arenaBg(m.arena, g.arenaIdx), 0, 0, false, FLAT);
    x.translate(ox, oy);

    type D = { y: number; ob?: (typeof m.arena.obs)[number]; a?: Agent; flag?: boolean };
    const ds: D[] = [];
    for (const o of m.arena.obs) ds.push({ y: o.y + o.h, ob: o });
    for (const a of m.agents) if (!a.out) ds.push({ y: a.y, a });
    if (m.mode === 'flag' && m.flag.carrier < 0 && m.flag.hidden <= 0) ds.push({ y: m.flag.y, flag: true });
    ds.sort((p, q) => p.y - q.y);

    const sprite = (a: Agent) => {
      const moving = Math.hypot(a.vx, a.vy) > 8;
      const pose = moving ? ('run' as const) : ('idle' as const);
      const frame = moving ? Math.floor(a.runPh) % 4 : Math.floor(t * 2 + a.id) % 2;
      const { dir, flip } = facingOf(a.aim);
      const v = a.flash > 0 ? ('white' as const) : a.dim > 0 ? ('dim' as const) : ('n' as const);
      return { pose, frame, dir, flip, v, b: bobOf(pose, frame) };
    };

    for (const d of ds) {
      if (d.ob) drawOb(x, d.ob);
      else if (d.flag) drawFlag(x, m.flag.x, m.flag.y, t, false);
      else if (d.a) {
        const a = d.a;
        const sp = sprite(a);
        footShadow(x, a.x, a.y);
        const blink = a.prot > 0 && Math.floor(t * 20) % 2 === 0;
        if (blink) continue;
        const gun = (): void => {
          drawBlaster(x, a.x, a.y, a.aim, a.dim > 0 ? '#3a3850' : a.color, a.recoil, sp.b, a.p.shirt, a.p.skin);
        };
        if (sp.dir === 'up') gun();
        drawChibi(x, a.p, `lt${a.id}`, a.x, a.y, sp.dir, sp.flip, sp.frame, sp.pose, true, sp.v);
        if (sp.dir !== 'up') gun();
        if (m.mode === 'flag' && m.flag.carrier === a.id) drawFlag(x, a.x, a.y - 8, t, true);
      }
    }
    fx.drawParts(x, false);

    // ---------- light pass ----------
    x.setTransform(S, 0, 0, S, 0, 0);
    const dyn: Lamp[] = [];
    if (!me.out) dyn.push({ x: me.x, y: me.y - 8, r: 34, ry: 28, c: [1.2, 1.2, 1.25] });
    for (const a of m.agents) {
      if (a.me || a.out) continue;
      dyn.push({ x: a.x, y: a.y - 8, r: 18, c: lampC(a.color, 0.5, 0.75) });
      if (a.muzzle > 0) dyn.push({ x: a.x, y: a.y - 9, r: 22, c: lampC(a.color, 1.2, 0.8) });
    }
    if (me.muzzle > 0) dyn.push({ x: me.x, y: me.y - 9, r: 26, c: lampC(ME_C, 1.2, 0.8) });
    for (const b of m.bolts.slice(-14)) dyn.push({ x: b.x, y: b.y - BOLT_H, r: 13, c: lampC(b.c, 1.2, 0.7) });
    for (const p of m.powers) dyn.push({ x: p.x, y: p.y - 6, r: 16, c: lampC(POWER_INFO[p.kind].c, 1, 0.7) });
    if (m.mode === 'flag') {
      if (m.flag.hidden <= 0) dyn.push({ x: m.flag.x, y: m.flag.y - 10, r: 24, c: [1.6, 1.45, 0.9] });
      dyn.push({ x: m.pad.x, y: m.pad.y, r: 18, c: [0.9, 1.5, 1.0] });
    }
    // two sweeping spotlights
    if (!reducedMotion) {
      dyn.push({ x: 128 + Math.sin(t * 0.7) * 96, y: 80 + Math.sin(t * 1.1) * 40, r: 30, ry: 22, c: [1.25, 1.15, 1.35] });
      dyn.push({ x: 128 + Math.sin(t * 0.5 + 2) * 100, y: 82 + Math.cos(t * 0.9) * 38, r: 26, ry: 20, c: [1.1, 1.25, 1.35] });
    }
    g.light.apply(x, dyn);

    // ---------- glow pass (with bodies cut out so depth reads) ----------
    e.setTransform(S, 0, 0, S, 0, 0);
    e.globalCompositeOperation = 'source-over';
    e.clearRect(0, 0, VW, VH);
    e.translate(ox, oy);
    drawHd(e, arenaGlow(m.arena, g.arenaIdx), 0, 0, false, FLAT);
    if (m.mode === 'flag') {
      drawPad(e, m.pad.x, m.pad.y, t, m.flag.carrier === 0);
      if (m.flag.carrier === 0) drawGuide(e, me.x, me.y, m.pad.x, m.pad.y, t);
      else if (m.flag.carrier < 0 && m.flag.hidden <= 0 && !me.out) drawGuide(e, me.x, me.y, m.flag.x, m.flag.y, t);
    }
    // player marker ring
    if (!me.out) {
      const pr = 7 + Math.floor(t * 4) % 2;
      for (let k = 0; k < 16; k++) {
        const an = (k / 16) * Math.PI * 2 + t;
        if (k % 2) continue;
        rect(e, Math.round(me.x + Math.cos(an) * pr), Math.round(me.y + 1 + Math.sin(an) * pr * 0.45), 1, 1, ME_C);
      }
    }
    for (const p of m.powers) drawPower(e, p.kind, p.x, p.y, t + p.x, POWER_INFO[p.kind].c);
    for (const d of ds) {
      if (d.ob) emitOb(e, d.ob, t);
      else if (d.a) {
        const a = d.a;
        const sp = sprite(a);
        if (a.prot > 0 && Math.floor(t * 20) % 2 === 0) continue;
        e.globalCompositeOperation = 'destination-out';
        const img = chibi(a.p, `lt${a.id}`, sp.dir, sp.frame, sp.pose, true, 'n');
        const px = Math.round(a.x) - 8;
        const py = Math.round(a.y) - 22;
        if (sp.flip) {
          e.save();
          e.translate(px + 16, py);
          e.scale(-1, 1);
          e.drawImage(hdSprite(img, CHIBI_LIT), 0, 0, img.width, img.height);
          e.restore();
        } else e.drawImage(hdSprite(img, CHIBI_LIT), px, py, img.width, img.height);
        e.globalCompositeOperation = 'source-over';
        const lit = a.dim <= 0;
        const lc = lit ? a.color : Math.floor(t * 4) % 2 ? '#5a1a2a' : '#2a1020';
        for (const [vx, vy] of vestLights(a.x, a.y, sp.dir, sp.flip, sp.b)) rect(e, vx, vy, 1, 1, lc);
        if (lit && sp.dir !== 'up') {
          // blaster tip
          const tx = a.x + Math.cos(a.aim) * (9 - a.recoil);
          const ty = a.y - 9 + sp.b + Math.sin(a.aim) * (8 - a.recoil);
          rect(e, Math.round(tx), Math.round(ty), 1, 1, a.color);
        }
        if (a.shield > 0) {
          const r = 10;
          for (let k = 0; k < 20; k++) {
            const an = (k / 20) * Math.PI * 2 + t * 2;
            if ((k + Math.floor(t * 10)) % 4 === 0) continue;
            rect(e, Math.round(a.x + Math.cos(an) * r), Math.round(a.y - 10 + Math.sin(an) * r * 1.1), 1, 1, '#4fd8ff');
          }
        }
      }
    }
    e.setTransform(S, 0, 0, S, 0, 0);
    x.drawImage(g.emit, 0, 0, VW, VH);

    // ---------- additive glows ----------
    x.translate(ox, oy);
    for (const o of m.arena.obs) if (o.kind === 'pillar') bloom(x, o.x + o.w / 2, o.y - o.hgt + o.h / 2, 9, o.c, 0.3);
    for (const p of m.powers) bloom(x, p.x, p.y - 9, 9, POWER_INFO[p.kind].c, 0.4);
    if (m.mode === 'flag' && m.flag.hidden <= 0) bloom(x, m.flag.x + 4, m.flag.y - 14, 10, '#ffe04f', 0.35);
    for (const a of m.agents) {
      if (a.out || a.muzzle <= 0) continue;
      const tx = a.x + Math.cos(a.aim) * 10;
      const ty = a.y - 9 + Math.sin(a.aim) * 8;
      bloom(x, tx, ty, 7, a.color, 0.8);
      rect(x, tx - 1, ty, 3, 1, '#ffffff');
      rect(x, tx, ty - 1, 1, 3, '#ffffff');
    }
    for (const b of m.bolts) {
      bloom(x, b.x, b.y - BOLT_H, 5, b.c, 0.45);
      drawBolt(x, b.x, b.y - BOLT_H, b.vx, b.vy, b.c);
      // tiny floor reflection
      x.globalAlpha = 0.35;
      rect(x, b.x, b.y, 2, 1, b.c);
      x.globalAlpha = 1;
    }
    fx.drawParts(x, true);
    fx.drawRings(x);

    // haze drifting through the beams (depth)
    if (!reducedMotion) {
      x.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const hx = ((t * (6 + k * 3) + k * 90) % (VW + 80)) - 40;
        const hy = 40 + k * 34 + Math.sin(t * 0.4 + k) * 6;
        x.globalAlpha = 0.045;
        x.fillStyle = k === 1 ? '#ff4fd8' : '#4fd8ff';
        for (let j = -8; j <= 8; j++) {
          const hw = Math.round(40 * Math.sqrt(1 - (j / 9) ** 2));
          if ((j & 1) === 0) x.fillRect(Math.round(hx - hw), Math.round(hy + j), hw * 2, 1);
        }
      }
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
    }

    // name tags during the count-in, quips during play
    if (g.phase === 'count') {
      for (const a of m.agents) {
        const nm = a.me ? 'YOU' : a.name.toUpperCase();
        centered(x, nm, a.x, a.y - 30, a.me ? ME_C : a.color);
      }
      const bob = Math.floor(t * 4) % 2;
      rect(x, me.x - 1, me.y - 24 + bob, 3, 1, ME_C);
      rect(x, me.x, me.y - 23 + bob, 1, 1, ME_C);
    }
    for (const q of g.quip) {
      const a = m.agents[q.a];
      if (a.out) continue;
      speech(x, a.x, a.y - 27, q.s, a.color);
    }
    // blaster heat gauge under your feet once it gets warm
    if (!me.out && (me.heat > 0.35 || me.hot > 0) && me.rapid <= 0) {
      const w = 12;
      const bx = Math.round(me.x - w / 2);
      const by = Math.round(me.y + 4);
      rect(x, bx - 1, by - 1, w + 2, 4, INK);
      rect(x, bx, by, Math.round(w * me.heat), 2, me.hot > 0 ? (Math.floor(t * 10) % 2 ? '#ff4a3a' : '#ffb04a') : me.heat > 0.7 ? '#ff8a3c' : '#ffd84f');
    }
    // a dimmed vest shows a countdown ring over your head
    if (me.dim > 0 && !me.out) {
      const k = me.dim / 2.6;
      for (let i = 0; i < 12; i++) if (i / 12 < k) rect(x, Math.round(me.x + Math.cos((i / 12) * Math.PI * 2 - Math.PI / 2) * 5), Math.round(me.y - 31 + Math.sin((i / 12) * Math.PI * 2 - Math.PI / 2) * 5), 1, 1, '#ff7a8a');
    }
    fx.drawPops(x);
    x.setTransform(S, 0, 0, S, 0, 0);

    // aim: reticle for the mouse, a dotted sight line for sticks and keys
    if (g.phase === 'play' || g.phase === 'count') {
      const usingMouse = ptr.inside && !ptr.touch;
      if (usingMouse) {
        let hot = false;
        for (const a of m.agents) if (!a.me && !a.out && a.dim <= 0 && dist(a.x, a.y - 10, ptr.x, ptr.y) < 8) hot = true;
        drawReticle(x, ptr.x, ptr.y, me.dim > 0 ? '#8a7a9a' : '#ffffff', hot, g.kick);
      } else if (!me.out) {
        for (let i = 3; i < 8; i++) {
          const d = 10 + i * 6;
          if ((i + Math.floor(t * 12)) % 2) continue;
          rect(x, Math.round(me.x + Math.cos(g.aim) * d), Math.round(me.y - 9 + Math.sin(g.aim) * d), 1, 1, me.dim > 0 ? '#6a5a7a' : ME_C);
        }
      }
    }

    // low-time red edge pulse
    if (g.phase === 'play' && m.left <= 10 && !reducedMotion) {
      const a = 0.18 + 0.12 * Math.sin(t * 10);
      x.globalAlpha = a;
      rect(x, 0, 0, VW, 2, '#ff3a3a');
      rect(x, 0, VH - 2, VW, 2, '#ff3a3a');
      rect(x, 0, 0, 2, VH, '#ff3a3a');
      rect(x, VW - 2, 0, 2, VH, '#ff3a3a');
      x.globalAlpha = 1;
    }
    // tagged: the screen dims a little while your vest is down
    if (me.dim > 0 && g.phase === 'play') {
      x.globalAlpha = 0.18;
      rect(x, 0, 0, VW, VH, '#1a0010');
      x.globalAlpha = 1;
    }
    fx.drawAnnounce(x, 34);
    fx.drawFlash(x);
    drawCount(x, g.t);
    if (g.phase === 'end' && g.result) {
      const r = g.result;
      const head = r.rank === 1 ? 'YOU WIN!' : m.mode === 'lms' && me.out ? 'OUT!' : 'TIME!';
      const ord = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH'][r.rank - 1] ?? `${r.rank}TH`;
      drawBanner(x, head, `YOU PLACED ${ord} OF ${r.n}  -  ${me.tags} TAGS`, r.rank <= 2, g.endT);
    }
    // corner mode tag
    if (g.phase === 'play') {
      const nm = MODE_INFO[m.mode].name;
      rect(x, 2, VH - 9, nm.length * 4 + 3, 8, 'rgba(10,6,20,0.7)');
      outlined(x, nm, 4, VH - 8, '#9a8ac8', INK);
    }
  };

  const onDownAny = (): void => audioInit();
  const mi = MODE_INFO[g.m.mode];
  return (
    <div className="mini tag-game">
      <TagHud cells={hud.cells} chips={hud.chips} />
      <div className="tag-wrap">
        <GameCanvas canvasRef={canvas} ptr={ptr} onDown={onDownAny} hd={{ reducedMotion, post: TAG_POST }} />
        {board && (
          <ResultCard
            title={`${mi.name} - SCOREBOARD`}
            sub={`${g.m.arena.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} · ${g.result && g.result.rank === 1 ? 'You took first. Rae wants a rematch.' : 'Good game, everyone.'}`}
            head={g.m.mode === 'flag' ? ['Player', 'Tags', 'Caps', 'Hit', 'Pts'] : g.m.mode === 'lms' ? ['Player', 'Tags', 'Hit', 'Vest'] : ['Player', 'Tags', 'Hit']}
            rows={board}
            onContinue={finish}
          />
        )}
      </div>
      <div className="tag-pad">
        <Stick st={move} label="MOVE" kind="move" onDown={onDownAny} />
        <div className="mid">
          <span className="tag-touch-note mini-note">Tap the arena to shoot there</span>
        </div>
        <Stick st={aimSt} label="AIM + FIRE" kind="aim" onDown={onDownAny} />
      </div>
      <p className="tag-keys">
        <b>WASD</b>/<b>arrows</b> move · <b>mouse</b> aims · <b>click</b> to fire (<b>SPACE</b> too; holding it overheats) · grab power-ups ·{' '}
        {g.m.mode === 'flag' ? 'carry the glowing flag to the green pad' : g.m.mode === 'lms' ? 'five hits and you’re out' : 'most tags wins'}
      </p>
    </div>
  );
}

// A little speech bubble above a friend, edged in their vest colour.
function speech(x: Ctx, cx: number, by: number, s: string, c: string): void {
  const w = s.length * 4 + 3;
  const px = Math.round(Math.max(2, Math.min(VW - w - 2, cx - w / 2)));
  const py = Math.round(Math.max(2, by - 8));
  rect(x, px - 1, py - 1, w + 2, 9, c);
  rect(x, px, py, w, 7, '#fff8e8');
  rect(x, px, py + 6, w, 1, '#d8ccb8');
  rect(x, Math.round(cx) - 1, py + 7, 3, 1, c);
  rect(x, Math.round(cx), py + 7, 1, 1, '#fff8e8');
  rect(x, Math.round(cx), py + 8, 1, 1, c);
  centered(x, s, px + w / 2, py + 1, INK, false);
}

const clock = (sec: number): string => {
  const c = Math.ceil(sec);
  return `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`;
};
