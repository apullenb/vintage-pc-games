// Menu screens: title, star map, briefing, results.
import { art, artUrl, LEVELS } from './assets';
import { isMuted, onMuteChange, play as sfx, toggleMute } from './audio';
import { Bag, button, fmtTime, h, ICONS, pixelSvg, starsHtml } from './dom';
import { FINGER_COLOR, FINGER_NAME, fingerOf, keyName } from './fingers';
import { fullscreenButtonWanted, isFullscreen, onFullscreenChange, toggleFullscreen } from './fullscreen';
import { Keyboard } from './keyboard';
import type { Nav, PlayResult } from './nav';
import { best, totalStars } from './save';

// Mute + fullscreen buttons; shared by every screen.
export function toolButtons(bag: Bag, extra: HTMLElement[] = []): HTMLDivElement {
  const bar = h('div', 'tools');
  bar.append(...extra);
  const mute = button('tool', '', () => {
    toggleMute();
    sfx('click');
  });
  const syncMute = (): void => {
    mute.innerHTML = pixelSvg(isMuted() ? ICONS.mute : ICONS.sound);
    mute.title = isMuted() ? 'Sound off' : 'Sound on';
    mute.setAttribute('aria-label', mute.title);
    mute.classList.toggle('off', isMuted());
  };
  syncMute();
  bag.add(onMuteChange(syncMute));
  bar.append(mute);
  if (fullscreenButtonWanted()) {
    const fs = button('tool', '', () => toggleFullscreen());
    const syncFs = (): void => {
      fs.innerHTML = pixelSvg(isFullscreen() ? ICONS.fsExit : ICONS.fsEnter);
      fs.title = isFullscreen() ? 'Exit fullscreen' : 'Fullscreen';
      fs.setAttribute('aria-label', fs.title);
    };
    syncFs();
    bag.add(onFullscreenChange(syncFs));
    bar.append(fs);
  }
  return bar;
}

// First world not yet escaped (else first below 3 stars).
export function recommendedIndex(): number {
  const i = LEVELS.findIndex((l) => !best(l.id));
  if (i >= 0) return i;
  const j = LEVELS.findIndex((l) => (best(l.id)?.stars ?? 0) < 3);
  return j >= 0 ? j : 0;
}

function worldIcon(i: number): HTMLImageElement {
  const img = h('img', 'world-icon');
  img.alt = '';
  img.src = artUrl(`world:${LEVELS[i].theme}`, () => art.worldIcon(LEVELS[i].theme));
  return img;
}

function heartsRow(n: number): HTMLElement {
  const row = h('span', 'hearts');
  const src = artUrl('heart:1', () => art.heart(true));
  for (let i = 0; i < n; i++) {
    const img = h('img', 'heart');
    img.src = src;
    img.alt = '';
    row.append(img);
  }
  return row;
}

// Enter/Space with no button focused runs fn.
function onConfirm(bag: Bag, fn: () => void, keys = ['Enter']): void {
  bag.on<KeyboardEvent>(window, 'keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!keys.includes(e.key)) return;
    if (document.activeElement instanceof HTMLButtonElement) return;
    e.preventDefault();
    fn();
  });
}

function onEscape(bag: Bag, fn: () => void): void {
  bag.on<KeyboardEvent>(window, 'keydown', (e) => {
    if (e.key === 'Escape' && !e.repeat) {
      e.preventDefault();
      fn();
    }
  });
}

// ---------- title ----------

export function showTitle(root: HTMLElement, nav: Nav): () => void {
  const bag = new Bag();
  const el = h('div', 'screen title');
  const logo = h('h1', 'logo');
  logo.innerHTML = '<span class="l1">STAR</span><span class="l2">KEYS</span>';
  const tag = h('p', 'tagline', 'A touch-typing space adventure');

  const heroBox = h('div', 'hero-box');
  const hero = h('canvas', 'hero-float');
  hero.width = 48;
  hero.height = 48;
  heroBox.append(hero);
  const hctx = hero.getContext('2d')!;
  hctx.imageSmoothingEnabled = false;
  let raf = 0;
  const t0 = performance.now();
  const draw = (now: number): void => {
    raf = requestAnimationFrame(draw);
    const t = (now - t0) / 1000;
    hctx.clearRect(0, 0, 48, 48);
    try {
      art.drawHero(hctx, 'float', t, 24, 38, 1, false);
    } catch {
      cancelAnimationFrame(raf);
    }
  };
  raf = requestAnimationFrame(draw);
  bag.add(() => cancelAnimationFrame(raf));

  const play = () => {
    sfx('click');
    nav.brief(recommendedIndex());
  };
  const actions = h('div', 'actions');
  const bPlay = button('btn big primary', 'Play', play);
  const bMap = button('btn big', 'Star map', () => {
    sfx('click');
    nav.map();
  });
  actions.append(bPlay, bMap);
  const hint = h('p', 'hint blink', 'Press Enter to play');
  const blurb = h('p', 'blurb', 'Type the words over each platform to move Cadet Comet. Outrun the danger and reach the escape craft!');
  el.append(toolButtons(bag), logo, tag, heroBox, actions, hint, blurb);
  root.append(el);
  onConfirm(bag, play);
  return () => bag.dispose();
}

// ---------- star map ----------

// 3 rows of 4, snaking left-right-left.
function planetPos(i: number): { x: number; y: number } {
  const row = Math.floor(i / 4);
  const col = i % 4;
  const c = row % 2 === 0 ? col : 3 - col;
  return { x: 66 + c * 116, y: 38 + row * 84 };
}

function routePath(n: number): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = planetPos(i);
    if (i === 0) {
      d += `M${p.x} ${p.y}`;
      continue;
    }
    const a = planetPos(i - 1);
    if (a.y === p.y) {
      const mx = (a.x + p.x) / 2;
      const wob = i % 2 ? -10 : 10;
      d += ` Q${mx} ${p.y + wob} ${p.x} ${p.y}`;
    } else {
      const side = a.x > 240 ? 56 : -56;
      d += ` C${a.x + side} ${a.y} ${p.x + side} ${p.y} ${p.x} ${p.y}`;
    }
  }
  return d;
}

export function showMap(root: HTMLElement, nav: Nav, focus?: number): () => void {
  const bag = new Bag();
  const el = h('div', 'screen map');
  const head = h('div', 'head');
  const title = h('h2', 'screen-title', 'Star map');
  const total = h('span', 'total');
  total.innerHTML = `${pixelSvg(ICONS.star)} ${totalStars()} / ${LEVELS.length * 3}`;
  head.append(title, total, toolButtons(bag));

  const area = h('div', 'map-area');
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'route');
  svg.setAttribute('viewBox', '0 0 480 252');
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', routePath(LEVELS.length));
  svg.append(path);
  area.append(svg);

  const rec = recommendedIndex();
  const info = h('div', 'map-info');
  const planets: HTMLButtonElement[] = [];
  const describe = (i: number): void => {
    const l = LEVELS[i];
    const b = best(l.id);
    const keys = [...l.lesson.newKeys].map((c) => keyName(c).toUpperCase()).join(' ');
    info.innerHTML = '';
    const name = h('b', '', `${i + 1}. ${l.name}`);
    const meta = h('span', '', `New keys: ${keys || '-'}  ·  target ${l.targetWpm} wpm${b ? `  ·  best ${b.wpm} wpm, ${Math.round(b.acc * 100)}%` : ''}`);
    info.append(name, meta);
  };

  LEVELS.forEach((l, i) => {
    const p = planetPos(i);
    const b = best(l.id);
    const btn = button('planet', '', () => {
      sfx('click');
      nav.brief(i);
    });
    btn.style.left = `calc(var(--px) * ${p.x})`;
    btn.style.top = `calc(var(--px) * ${p.y})`;
    if (i === rec) btn.classList.add('rec');
    if (b) btn.classList.add('done');
    btn.setAttribute('aria-label', `${i + 1}. ${l.name}${b ? `, ${b.stars} stars` : ''}`);
    const orb = h('span', 'orb');
    orb.append(worldIcon(i));
    if (i === rec) orb.append(h('span', 'rec-tag', 'Next'));
    const name = h('span', 'pname', l.name);
    const st = h('span', 'pstars');
    st.innerHTML = starsHtml(b?.stars ?? 0);
    const wpm = h('span', 'pwpm', b ? `${b.wpm} wpm` : '');
    btn.append(orb, name, st, wpm);
    bag.on(btn, 'pointerenter', () => describe(i));
    bag.on(btn, 'focus', () => describe(i));
    planets.push(btn);
    area.append(btn);
  });

  const foot = h('div', 'foot');
  const back = button('btn', 'Back', () => {
    sfx('click');
    nav.title();
  });
  foot.append(back, info);
  el.append(head, area, foot);
  root.append(el);

  const start = focus ?? rec;
  describe(start);
  planets[start]?.focus({ preventScroll: true });

  // arrows walk the route
  bag.on<KeyboardEvent>(window, 'keydown', (e) => {
    const cur = planets.indexOf(document.activeElement as HTMLButtonElement);
    let d = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') d = 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') d = -1;
    if (!d) return;
    e.preventDefault();
    const n = cur < 0 ? start : Math.max(0, Math.min(planets.length - 1, cur + d));
    planets[n].focus();
    sfx('select');
  });
  onEscape(bag, () => nav.title());
  return () => bag.dispose();
}

// ---------- briefing ----------

export function showBriefing(root: HTMLElement, i: number, nav: Nav): () => void {
  const bag = new Bag();
  const l = LEVELS[i];
  const el = h('div', 'screen brief');

  const head = h('div', 'head');
  const title = h('h2', 'screen-title');
  title.append(worldIcon(i), h('span', 'wnum', `World ${i + 1}`), h('span', 'wname', l.name));
  head.append(title, toolButtons(bag));

  const story = h('p', 'story', l.story);

  const lesson = h('div', 'panel lesson');
  const newKeys = h('div', 'newkeys');
  const uniq = [...new Set(l.lesson.newKeys)];
  for (const c of uniq) {
    const f = fingerOf(c);
    const cap = h('div', 'bigkey');
    cap.style.setProperty('--fc', FINGER_COLOR[f]);
    cap.append(h('b', '', c === ' ' ? 'space' : c), h('span', '', FINGER_NAME[f]));
    newKeys.append(cap);
  }
  const lessonHead = h('div', 'lesson-head');
  lessonHead.append(h('span', 'label', uniq.length ? 'New keys' : 'Review'), newKeys);
  const tip = h('p', 'tip', l.lesson.tip);
  const kb = new Keyboard({ legend: false });
  kb.el.classList.add('mini');
  kb.dimExcept(l.keys);
  kb.mark(uniq, 'new');
  lesson.append(lessonHead, tip, kb.el);

  const facts = h('div', 'facts');
  const hp = h('span', 'fact');
  hp.append(h('i', '', 'Hearts'), heartsRow(l.hp));
  const tgt = h('span', 'fact');
  tgt.append(h('i', '', '3 stars'), h('b', '', `${l.targetWpm} wpm`));
  const steps = h('span', 'fact');
  steps.append(h('i', '', 'Jumps'), h('b', '', String(l.steps)));
  facts.append(hp, tgt, steps);

  const launch = (): void => {
    sfx('start');
    nav.play(i);
  };
  const actions = h('div', 'actions');
  actions.append(
    button('btn', 'Map', () => {
      sfx('click');
      nav.map(i);
    }),
    h('span', 'hint blink', 'Press Space to launch'),
    button('btn primary', 'Launch', launch),
  );
  el.append(head, story, lesson, facts, actions);
  root.append(el);
  onConfirm(bag, launch, ['Enter', ' ']);
  onEscape(bag, () => nav.map(i));
  return () => bag.dispose();
}

// ---------- results ----------

export function showResults(root: HTMLElement, r: PlayResult, nav: Nav): () => void {
  const bag = new Bag();
  const l = LEVELS[r.levelIndex];
  const s = r.stats;
  const el = h('div', `screen results ${r.won ? 'won' : 'lost'}`);

  const head = h('div', 'head');
  const title = h('h2', 'screen-title');
  title.append(worldIcon(r.levelIndex), h('span', 'wname', l.name));
  head.append(title, toolButtons(bag));

  const banner = h('div', 'result-banner');
  banner.append(h('h1', 'verdict', r.won ? 'Escaped!' : 'Caught!'));
  const stars = h('div', 'big-stars');
  stars.innerHTML = starsHtml(r.stars, 3, 'stars pop');
  banner.append(stars);
  const why = h('p', 'why');
  if (!r.won) why.textContent = 'Comet ran out of hearts. Take a breath and try again!';
  else if (r.stars === 3) why.textContent = 'Perfect run: fast and accurate!';
  else if (r.stars === 2) why.textContent = `Accurate! Reach ${l.targetWpm} wpm for the third star.`;
  else why.textContent = 'Escaped! Hit 90% accuracy for the second star.';
  banner.append(why);

  const nb = r.newBest;
  const stat = (label: string, value: string, isNew = false, sub = ''): HTMLElement => {
    const e = h('div', 'stat');
    e.append(h('i', '', label), h('b', '', value));
    if (sub) e.append(h('small', '', sub));
    if (isNew) e.append(h('em', 'new-best', 'New best'));
    return e;
  };
  const stats = h('div', 'stat-grid');
  stats.append(
    stat('Speed', `${Math.round(s.wpm)} wpm`, !!nb?.wpm, `target ${l.targetWpm}`),
    stat('Accuracy', `${Math.round(s.accuracy * 100)}%`, !!nb?.acc, `${s.wrong} miss${s.wrong === 1 ? '' : 'es'}`),
    stat('Time', fmtTime(s.elapsed), false, `${s.correct} keys`),
  );

  const practice = h('div', 'panel practice');
  const missed = Object.entries(s.missed)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (missed.length) {
    const ph = h('div', 'practice-head');
    ph.append(h('span', 'label', 'Keys to practice'));
    for (const [c, n] of missed) {
      const chip = h('span', 'chip');
      chip.style.setProperty('--fc', FINGER_COLOR[fingerOf(c)]);
      chip.append(h('b', '', keyName(c)), h('span', '', `x${n}`));
      ph.append(chip);
    }
    const kb = new Keyboard();
    kb.el.classList.add('mini');
    kb.dimExcept(missed.map(([c]) => c).join(''));
    for (const [c, n] of missed) {
      kb.mark(c, 'miss');
      kb.badge(c, String(n));
    }
    practice.append(ph, kb.el);
  } else {
    practice.classList.add('clean');
    practice.append(h('span', 'label', 'Keys to practice'), h('p', '', s.correct ? 'No missed keys. Flawless fingers!' : 'No keys typed yet.'));
  }

  const actions = h('div', 'actions');
  const hasNext = r.levelIndex + 1 < LEVELS.length;
  const retry = button(`btn${r.won ? '' : ' primary'}`, 'Retry', () => {
    sfx('click');
    nav.brief(r.levelIndex);
  });
  const next = button(`btn${r.won ? ' primary' : ''}`, 'Next world', () => {
    sfx('click');
    nav.brief(r.levelIndex + 1);
  });
  const map = button('btn', 'Star map', () => {
    sfx('click');
    nav.map(r.levelIndex);
  });
  actions.append(map, retry);
  if (hasNext) actions.append(next);
  el.append(head, banner, stats, practice, actions);
  root.append(el);
  // brief grace so a still-typing player doesn't press Space on a button
  for (const b of [map, retry, next]) b.disabled = true;
  const timer = window.setTimeout(() => {
    for (const b of [map, retry, next]) b.disabled = false;
    (r.won && hasNext ? next : retry).focus({ preventScroll: true });
  }, 700);
  bag.add(() => clearTimeout(timer));
  onEscape(bag, () => nav.map(r.levelIndex));
  return () => bag.dispose();
}
