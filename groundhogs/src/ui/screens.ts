// Menu screens: title, level select, briefing, results.
import type { Groundhog, GHState, LevelDef } from '../types';
import { GLIDE_SPEED, SKILLS, SKILL_LABELS, TICK_RATE, VIEW_H, VIEW_W, WALK_SPEED } from '../types';
import { art, ceilingAbove, createGame, LEVELS, skillIconCanvas } from './assets';
import { play as sfx } from './audio';
import { Bag, button, fmtTime, h, pct, pixelSvg } from './dom';
import type { Nav, PlayResult } from './nav';
import { FS_ICONS, fullscreenSupported, toggleFullscreen } from './fullscreen';
import { bestPct, isCompleted, isUnlocked } from './save';
import { canvasRes, currentScale, isTouchDevice, onLayoutChange } from './scale';

const LOCK_ICON = ['.###.', '#...#', '#...#', '#####', '##.##', '##.##', '#####'];

function firstOpenLevel(): number {
  for (let i = 0; i < LEVELS.length; i++) {
    if (isUnlocked(LEVELS, i) && !isCompleted(LEVELS[i].id)) return i;
  }
  return 0;
}

// ---------------- title ----------------

const GROUND_Y = 199; // feet row on the title scene
const HOLE_L = 34;
const HOLE_R = VIEW_W - 34;

function fakeHog(id: number, x: number, y: number, state: GHState, dir: 1 | -1): Groundhog {
  return { id, x, y, dir, state, stateTicks: 0, isClimber: false, isGlider: state === 'gliding', fallDist: 0, work: 0, vx: 0, vy: 0, alarmTicks: -1 };
}

function drawHole(c: CanvasRenderingContext2D, cx: number): void {
  const rows = [5, 8, 9, 9, 8, 6];
  rows.forEach((hw, i) => {
    c.fillStyle = i === 0 ? '#3b2414' : '#140b06';
    c.fillRect(cx - hw, GROUND_Y - 1 + i, hw * 2 + 1, 1);
  });
  c.fillStyle = '#7a5232'; // dirt rim
  c.fillRect(cx - 11, GROUND_Y, 2, 1);
  c.fillRect(cx + 10, GROUND_Y, 2, 1);
  c.fillRect(cx - 12, GROUND_Y + 1, 2, 1);
  c.fillRect(cx + 11, GROUND_Y + 1, 2, 1);
}

function buildTitleBackdrop(): HTMLCanvasElement {
  const cv = h('canvas');
  cv.width = VIEW_W;
  cv.height = VIEW_H;
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.drawImage(art.renderBackground('meadow', VIEW_W, VIEW_H), 0, 0);
  // soil band with strata and pebbles
  c.fillStyle = '#5b3a22';
  c.fillRect(0, GROUND_Y + 1, VIEW_W, VIEW_H - GROUND_Y);
  c.fillStyle = '#4a2f1b';
  for (let y = GROUND_Y + 9; y < VIEW_H; y += 9) c.fillRect(0, y, VIEW_W, 2);
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    c.fillStyle = rnd() < 0.5 ? '#7a5232' : '#3d2615';
    c.fillRect(Math.floor(rnd() * VIEW_W), GROUND_Y + 4 + Math.floor(rnd() * (VIEW_H - GROUND_Y - 5)), 2, 1);
  }
  c.fillStyle = '#5fa83a';
  c.fillRect(0, GROUND_Y + 1, VIEW_W, 2);
  c.fillStyle = '#8fd14f';
  for (let i = 0; i < 120; i++) c.fillRect(Math.floor(rnd() * VIEW_W), GROUND_Y - 1 + Math.floor(rnd() * 2), 1, 2);
  drawHole(c, HOLE_L);
  drawHole(c, HOLE_R);
  return cv;
}

function runTitleScene(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')!;
  let k = 1;
  const fitRes = (): void => {
    const r = canvasRes(VIEW_W * currentScale());
    k = r.k;
    canvas.width = VIEW_W * k;
    canvas.height = VIEW_H * k;
    canvas.classList.toggle('smooth', r.smooth);
    ctx.imageSmoothingEnabled = false;
  };
  fitRes();
  const offLayout = onLayoutChange(fitRes);
  const backdrop = buildTitleBackdrop();
  const hogs: Groundhog[] = [];
  let nextId = 0;
  let tick = 0;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  const step = 1000 / TICK_RATE;

  function update(): void {
    tick++;
    if (tick % 56 === 1) hogs.push(fakeHog(nextId++, HOLE_L, GROUND_Y, 'walking', 1));
    if (tick % 260 === 130) {
      const x = 140 + Math.floor(Math.random() * 200);
      hogs.push(fakeHog(nextId++, x, -6, 'gliding', Math.random() < 0.5 ? 1 : -1));
    }
    for (const g of hogs) {
      g.stateTicks++;
      if (g.state === 'walking') {
        g.x += g.dir * WALK_SPEED;
        const atHole = g.dir === 1 ? g.x >= HOLE_R : g.x <= HOLE_L;
        if (atHole) {
          g.state = 'exiting';
          g.stateTicks = 0;
        }
      } else if (g.state === 'gliding') {
        g.y += GLIDE_SPEED;
        if (g.stateTicks % 3 === 0) g.x += g.dir;
        if (g.y >= GROUND_Y) {
          g.y = GROUND_Y;
          g.state = 'walking';
          g.stateTicks = 0;
        }
      } else if (g.state === 'exiting' && g.stateTicks > 20) {
        g.state = 'saved';
      }
    }
    for (let i = hogs.length - 1; i >= 0; i--) if (hogs[i].state === 'saved') hogs.splice(i, 1);
  }

  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    acc += Math.min(now - last, 250);
    last = now;
    while (acc >= step) {
      update();
      acc -= step;
    }
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.drawImage(backdrop, 0, 0);
    for (const g of hogs) art.drawGroundhog(ctx, g, Math.round(g.x), Math.round(g.y), false);
  }
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    offLayout();
  };
}

export function showTitle(root: HTMLElement, nav: Nav): () => void {
  const bag = new Bag();
  const el = h('div', 'screen title');
  const stage = h('div', 'stage');
  const canvas = h('canvas', 'view');
  const overlay = h('div', 'title-overlay');
  const logo = h('h1', 'logo');
  logo.setAttribute('aria-label', 'Groundhogs');
  for (const ch of 'GROUNDHOGS') logo.append(h('span', '', ch));
  overlay.append(logo, h('p', 'tagline', 'Get them home before the shadow falls'));
  stage.append(canvas, overlay);

  const panel = h('div', 'toolbar menu-bar');
  const play = button('btn big', 'PLAY', () => {
    sfx('click');
    nav.brief(firstOpenLevel());
  });
  const levels = button('btn big', 'BURROWS', () => {
    sfx('click');
    nav.select();
  });
  panel.append(play, levels);
  if (fullscreenSupported()) {
    const fs = button('btn big fs-btn', '', () => toggleFullscreen());
    fs.title = 'Fullscreen';
    fs.innerHTML = pixelSvg(FS_ICONS.enter);
    panel.append(fs);
  }
  if (!isTouchDevice()) panel.append(h('span', 'menu-hint', 'Enter: play  -  M: sound'));
  el.append(stage, panel);
  root.append(el);

  bag.add(runTitleScene(canvas));
  bag.on<KeyboardEvent>(window, 'keydown', (e) => {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      nav.brief(firstOpenLevel());
    } else if (e.code === 'KeyL') {
      nav.select();
    }
  });
  return () => bag.dispose();
}

// ---------------- level select ----------------

export function showLevelSelect(root: HTMLElement, nav: Nav): () => void {
  const bag = new Bag();
  const el = h('div', 'screen select panel');
  const head = h('div', 'panel-head');
  head.append(
    h('h2', '', 'CHOOSE A BURROW'),
    button('btn', 'BACK', () => {
      sfx('click');
      nav.title();
    }),
  );
  const grid = h('div', 'level-grid');
  LEVELS.forEach((lv, i) => {
    const open = isUnlocked(LEVELS, i);
    const best = bestPct(lv.id);
    const card = h('button', `level-card theme-${lv.theme}${open ? '' : ' locked'}${best !== undefined ? ' done' : ''}`);
    card.type = 'button';
    card.disabled = !open;
    card.append(h('span', 'num', String(i + 1).padStart(2, '0')), h('span', 'name', open ? lv.name : '???'));
    const state = h('span', 'state');
    if (!open) state.innerHTML = `${pixelSvg(LOCK_ICON)} LOCKED`;
    else state.textContent = best !== undefined ? `BEST ${best}%` : 'NEW';
    card.append(state);
    if (open) {
      card.addEventListener('click', () => {
        sfx('click');
        nav.brief(i);
      });
    }
    grid.append(card);
  });
  el.append(head, grid);
  root.append(el);
  bag.on<KeyboardEvent>(window, 'keydown', (e) => {
    if (e.code === 'Escape') nav.title();
  });
  return () => bag.dispose();
}

// ---------------- briefing ----------------

const PREVIEW_W = 456; // logical px
const PREVIEW_H = 124;

function buildPreview(level: LevelDef): HTMLCanvasElement {
  const game = createGame(level);
  const world = h('canvas');
  world.width = level.width;
  world.height = VIEW_H;
  const w = world.getContext('2d')!;
  w.imageSmoothingEnabled = false;
  w.drawImage(art.renderBackground(level.theme, level.width, VIEW_H), 0, 0);
  for (const hz of level.hazards) art.drawHazard(w, hz, 0, 0);
  const tv = art.createTerrainView(game.terrain, level.theme);
  tv.update(game.terrain.takeDirty());
  w.drawImage(tv.canvas, 0, 0);
  for (const ex of level.exits) art.drawExit(w, ex.x, ex.y, 0);
  for (const en of level.entrances) art.drawEntrance(w, en.x, en.y, 0, 0, ceilingAbove(game.terrain, en.x, en.y - 36));

  const k = Math.min(PREVIEW_W / level.width, PREVIEW_H / VIEW_H);
  const pw = Math.round(level.width * k);
  const ph = Math.round(VIEW_H * k);
  // render at 2x logical so downscaled detail survives
  const out = h('canvas', 'preview');
  out.width = pw * 2;
  out.height = ph * 2;
  const o = out.getContext('2d')!;
  o.imageSmoothingEnabled = true;
  o.imageSmoothingQuality = 'high';
  o.drawImage(world, 0, 0, out.width, out.height);
  out.style.width = `calc(var(--px) * ${pw})`;
  out.style.height = `calc(var(--px) * ${ph})`;
  return out;
}

export function showBriefing(root: HTMLElement, levelIndex: number, nav: Nav): () => void {
  const bag = new Bag();
  const level = LEVELS[levelIndex];
  const el = h('div', `screen brief panel theme-${level.theme}`);

  const head = h('div', 'panel-head');
  const titleWrap = h('div', 'brief-title');
  titleWrap.append(h('span', 'kicker', `BURROW ${levelIndex + 1}`), h('h2', '', level.name));
  const back = button('btn', 'BACK', () => {
    sfx('click');
    nav.select();
  });
  head.append(titleWrap, back);

  const hint = h('p', 'hint', level.hint ?? '');
  if (level.entrances.length > 1) hint.append(h('span', 'multi', ` ${level.entrances.length} burrows - watch every end!`));
  const preview = h('div', 'preview-wrap');
  preview.append(buildPreview(level));

  const stats = h('div', 'brief-stats');
  const stat = (label: string, value: string): void => {
    const s = h('div', 'bstat');
    s.append(h('i', '', label), h('b', '', value));
    stats.append(s);
  };
  stat('GROUNDHOGS', String(level.count));
  stat('TO SAVE', `${level.required} (${pct(level.required, level.count)}%)`);
  stat('RELEASE', String(level.releaseRate));
  stat('TIME', fmtTime(level.timeLimit));

  const skills = h('div', 'brief-skills');
  for (const s of SKILLS) {
    const n = level.skills[s] ?? 0;
    const chip = h('div', `bskill${n > 0 ? '' : ' none'}`);
    chip.title = SKILL_LABELS[s];
    chip.append(skillIconCanvas(s), h('b', '', String(n)));
    skills.append(chip);
  }

  const go = h('p', 'go blink', isTouchDevice() ? 'TAP TO DIG IN' : 'CLICK OR PRESS ENTER TO DIG IN');
  el.append(head, hint, preview, stats, skills, go);
  root.append(el);

  const start = (): void => {
    sfx('click');
    nav.play(levelIndex);
  };
  bag.on<MouseEvent>(el, 'click', (e) => {
    if (e.target instanceof Node && back.contains(e.target)) return;
    start();
  });
  bag.on<KeyboardEvent>(window, 'keydown', (e) => {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      start();
    } else if (e.code === 'Escape') {
      nav.select();
    }
  });
  return () => bag.dispose();
}

// ---------------- results ----------------

const WIN_LINES = [
  'No shadow in sight. Spring is officially sprung!',
  'Burrow-ly a scratch on them.',
  'Hog heaven: warm, dark and full of snacks.',
  'Six more weeks of winter? Not on your watch.',
  'They dug it. You dug it. Everybody dug it.',
];
const PERFECT_LINES = ['Every last whistle-pig tucked in. Flawless forecast!', 'A perfect burrow. Punxsutawney is jealous.'];
const LOSE_LINES = [
  'They saw their shadow. Six more weeks of retries.',
  'That plan went straight down the burrow.',
  'Ground control to groundhogs... no answer.',
  'Hibernate on it and try again.',
  'Not quite a hole in one.',
];
const NUKE_LINES = [
  'Kaboom. Dust settles, plan B digs in.',
  'Back to the drawing burrow.',
  'Everyone poofed. Time for a do-over.',
];
const pick = (a: string[]): string => a[Math.floor(Math.random() * a.length)];

export function showResults(root: HTMLElement, r: PlayResult, nav: Nav): () => void {
  const bag = new Bag();
  const level = LEVELS[r.levelIndex];
  const savedPct = pct(r.saved, r.count);
  const needPct = pct(r.required, r.count);
  const hasNext = r.levelIndex + 1 < LEVELS.length;
  const perfect = r.won && r.saved >= r.count;

  const el = h('div', `screen results panel ${r.won ? 'won' : 'lost'}`);
  el.append(h('span', 'kicker', `BURROW ${r.levelIndex + 1} - ${level.name}`));
  el.append(h('h2', 'verdict', r.won ? (perfect ? 'PERFECT BURROW!' : 'SPRING HAS SPRUNG!') : r.nuked ? 'NUKED!' : 'SIX MORE WEEKS...'));

  const meter = h('div', 'meter');
  const fill = h('div', 'fill');
  fill.style.width = `${Math.min(100, savedPct)}%`;
  const mark = h('div', 'mark');
  mark.style.left = `${needPct}%`;
  meter.append(fill, mark);

  const nums = h('div', 'result-nums');
  const num = (label: string, value: string): void => {
    const d = h('div', 'bstat');
    d.append(h('i', '', label), h('b', '', value));
    nums.append(d);
  };
  num('SAVED', `${savedPct}%`);
  num('NEEDED', `${needPct}%`);
  num('HOME', `${r.saved} / ${r.count}`);

  const flavour = h('p', 'flavour', r.won ? pick(perfect ? PERFECT_LINES : WIN_LINES) : pick(r.nuked ? NUKE_LINES : LOSE_LINES));
  el.append(meter, nums, flavour);
  if (r.won && !hasNext) el.append(h('p', 'finale', 'Every burrow is home. See you next February!'));

  const actions = h('div', 'actions');
  const retry = (): void => {
    sfx('click');
    nav.play(r.levelIndex);
  };
  const next = (): void => {
    sfx('click');
    nav.brief(r.levelIndex + 1);
  };
  const retryBtn = button(`btn big${r.won ? '' : ' primary'}`, 'RETRY', retry);
  actions.append(retryBtn);
  if (r.won && hasNext) actions.append(button('btn big primary', 'NEXT BURROW', next));
  actions.append(
    button('btn big', 'BURROWS', () => {
      sfx('click');
      nav.select();
    }),
  );
  el.append(actions);
  root.append(el);
  // after a loss Retry is the default (Enter); focus shows it
  if (!r.won || !hasNext) retryBtn.focus({ preventScroll: true });

  bag.on<KeyboardEvent>(window, 'keydown', (e) => {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      if (r.won && hasNext) next();
      else retry();
    } else if (e.code === 'KeyR') {
      retry();
    } else if (e.code === 'Escape') {
      nav.select();
    }
  });
  return () => bag.dispose();
}
