// Play screen: fixed-step loop, camera, canvas render, prompt labels, HUD, typing.
import type { ParallaxLayer, RunEvent } from '../types';
import { CONTACT_GAP, HERO_H, NEAR_GAP, TICK_RATE, VIEW_H, VIEW_W } from '../types';
import { art, artUrl, createRun, ESCAPE_DOOR, LEVELS } from './assets';
import { isMuted, onMuteChange, play as sfx, playEvent, toggleMute } from './audio';
import { Bag, button, h, ICONS, pixelSvg, setText } from './dom';
import { TypingInput } from './input';
import { Keyboard } from './keyboard';
import type { Nav } from './nav';
import { getKeyboardVisible, recordWin, setKeyboardVisible } from './save';
import { availableSize, canvasRes, fitScale, isTouchDevice, onLayoutChange } from './scale';
import { toolButtons } from './screens';

const STEP = 1 / TICK_RATE;
const MAX_STEPS = 8; // catch-up cap per frame
const CAM_LEAD = VIEW_W / 3; // hero this far from the left edge
const CAM_RATE = 4; // follow stiffness (1/s)
const WIN_FALLBACK = 8; // s from escape to results if boarding never starts
const LAUNCH_SHOW = 2.4; // s of launch before results
const DOOR_WALK = 0.6; // s to walk to the craft door
const LOSE_DELAY = 2.4;
const DONE_FADE = 0.7; // completed label fade time
const HUD_H = 16; // logical
const KB_ROWS_H = 5.7; // keyboard height in key heights (rows + gaps + padding)
const KB_LEGEND_H = 1.1;
const KEY_H = 20; // logical key height on desktop

export function startPlay(root: HTMLElement, levelIndex: number, nav: Nav): () => void {
  const level = LEVELS[levelIndex];
  const run = createRun(level);
  const path = level.path;
  const steps = level.steps;
  const bag = new Bag();
  let bg: ParallaxLayer[] = [];
  try {
    bg = art.renderBackground(level.theme, level.width);
  } catch (err) {
    console.error(err);
  }

  // ---- state ----
  let camX = clampCam(run.heroX - CAM_LEAD);
  let t = 0; // game time (s), frozen while paused
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let paused = false;
  let started = false;
  let wonAt = -1;
  let endAt = -1;
  let boardAt = -1; // 'board' pose began
  let launchAt = -1;
  let finished = false;
  let shake = 0;
  let errUntil = -1;
  let res = 1;
  let viewF = 1; // css px per logical px
  let kbVisible = getKeyboardVisible();
  let deviceKb = false;
  const doneAt = new Map<number, number>(); // prompt index -> completion time

  function clampCam(x: number): number {
    return Math.max(0, Math.min(level.width - VIEW_W, x));
  }

  // ---- DOM ----
  const el = h('div', 'screen play');
  const hud = h('div', 'hud');
  const hearts = h('div', 'hearts');
  const heartImgs: HTMLImageElement[] = [];
  const fullHeart = artUrl('heart:1', () => art.heart(true));
  const emptyHeart = artUrl('heart:0', () => art.heart(false));
  for (let i = 0; i < level.hp; i++) {
    const img = h('img', 'heart');
    img.alt = '';
    img.src = fullHeart;
    heartImgs.push(img);
    hearts.append(img);
  }
  const hpCount = h('b', 'hp-count');
  hearts.append(hpCount);
  hearts.classList.toggle('many', level.hp > 6);
  hpCount.textContent = `x${level.hp}`;
  let shownHp = level.hp;
  const stat = (label: string): [HTMLElement, HTMLElement] => {
    const s = h('span', 'hstat');
    const v = h('b', '');
    s.append(h('i', '', label), v);
    return [s, v];
  };
  const [progEl, progV] = stat('Jump');
  const [wpmEl, wpmV] = stat('Wpm');
  const [accEl, accV] = stat('Acc');
  const meter = h('div', 'meter');
  const meterBar = h('span', 'bar');
  const meterFill = h('span', 'fill');
  const meterMark = h('span', 'mark');
  meterMark.style.left = `${(1 - (NEAR_GAP - CONTACT_GAP) / (NEAR_GAP * 3)) * 100}%`;
  meterBar.append(meterFill, meterMark);
  const meterDist = h('b', 'dist');
  meter.append(h('i', '', 'Danger'), meterBar, meterDist);

  const pauseBtn = button('tool', '', () => setPaused(!paused));
  pauseBtn.innerHTML = pixelSvg(ICONS.pause);
  pauseBtn.title = 'Pause (Esc)';
  pauseBtn.setAttribute('aria-label', 'Pause');
  const kbBtn = button('tool', '', () => toggleKeyboard());
  kbBtn.innerHTML = pixelSvg(ICONS.keys);
  const extra: HTMLElement[] = [pauseBtn, kbBtn];
  let phoneBtn: HTMLButtonElement | null = null;
  if (isTouchDevice()) {
    phoneBtn = button('tool', '', () => (input.deviceActive ? input.blurDevice() : input.focusDevice()));
    phoneBtn.innerHTML = pixelSvg(ICONS.phone);
    phoneBtn.title = 'Use your phone keyboard';
    phoneBtn.setAttribute('aria-label', phoneBtn.title);
    // keep the soft keyboard from closing before the click
    phoneBtn.addEventListener('pointerdown', (e) => e.preventDefault());
    extra.push(phoneBtn);
  }
  hud.append(hearts, progEl, wpmEl, accEl, meter, toolButtons(bag, extra));

  const stage = h('div', 'stage');
  const canvas = h('canvas', 'view');
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  const ctx = canvas.getContext('2d')!;
  const labels = h('div', 'labels');
  const toast = h('div', 'toast');
  toast.append(h('b', '', 'Type the word to run!'), h('span', '', 'Each word moves Comet to the next platform. Wrong keys cost a heart.'));
  const pauseMenu = h('div', 'pause-menu');
  stage.append(canvas, labels, toast, pauseMenu);

  const kb = new Keyboard({ legend: true, onType: (ch) => typeChar(ch) });
  const kbWrap = h('div', 'kb-wrap');
  kbWrap.append(kb.el);
  el.append(hud, stage, kbWrap);
  root.append(el);

  const input = new TypingInput(stage, {
    onChar: (ch) => typeChar(ch),
    onEscape: () => setPaused(!paused),
    enabled: () => !paused && !finished && run.status !== 'won' && run.status !== 'lost',
    onDeviceKeyboard: (on) => {
      deviceKb = on;
      phoneBtn?.classList.toggle('on', on);
      document.body.classList.toggle('devkb', on);
      layout();
    },
  });
  bag.add(() => {
    input.dispose();
    document.body.classList.remove('devkb');
  });

  // tap the view on touch screens = bring up the phone keyboard when ours is hidden
  bag.on<PointerEvent>(canvas, 'pointerdown', (e) => {
    if (e.pointerType !== 'mouse' && !kbVisible && !paused) {
      e.preventDefault();
      input.focusDevice();
    }
  });

  // ---- layout ----
  function layout(): void {
    const { w, h: ah } = availableSize();
    const kbOn = kbVisible && !deviceKb;
    el.classList.toggle('no-kb', !kbOn);
    kbBtn.classList.toggle('on', kbVisible);
    kbBtn.title = kbVisible ? 'Hide keyboard' : 'Show keyboard';
    kbBtn.setAttribute('aria-label', kbBtn.title);
    const kbLogical = kbOn ? KEY_H * (KB_ROWS_H + KB_LEGEND_H) + 4 : 0;
    const fit = Math.min((w - 8) / (VIEW_W + 8), (ah - 8) / (HUD_H + 8 + VIEW_H + kbLogical));
    let cssW: number;
    let keyH = 0;
    if (fit >= 1.25) {
      el.classList.remove('compact');
      const s = fitScale(fit);
      el.style.setProperty('--px', `${s}px`);
      el.style.width = `${(VIEW_W + 4) * s}px`;
      cssW = VIEW_W * s;
      keyH = KEY_H * s;
    } else {
      el.classList.add('compact');
      const u = Math.max(1.1, Math.min(1.5, Math.min(w / 488, ah / 300) * 1.1));
      el.style.setProperty('--px', `${u}px`);
      el.style.width = `${w}px`;
      const kbW = Math.min(w - 4, 900);
      const hudH = HUD_H * u + 6;
      const portrait = ah > w;
      keyH = Math.max(22, Math.min(48, (kbW / 15) * (portrait ? 1.25 : 0.6)));
      const canvasFor = (kh: number): number => {
        const ch = ah - hudH - (kbOn ? kh * KB_ROWS_H + 6 : 0) - 8;
        return Math.max(160, Math.min(w - 4, (ch * VIEW_W) / VIEW_H));
      };
      const want = Math.min(w - 4, w * 0.55);
      while (kbOn && keyH > 22 && canvasFor(keyH) < want) keyH -= 1;
      cssW = Math.floor(canvasFor(keyH));
    }
    kb.el.style.setProperty('--kh', `${Math.floor(keyH)}px`);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${Math.round((cssW * VIEW_H) / VIEW_W)}px`;
    viewF = cssW / VIEW_W;
    stage.style.setProperty('--f', `${viewF}px`);
    const r = canvasRes(cssW);
    res = r.k;
    if (canvas.width !== VIEW_W * res) {
      canvas.width = VIEW_W * res;
      canvas.height = VIEW_H * res;
    }
    canvas.classList.toggle('smooth', r.smooth);
    // follow the visual viewport while a phone keyboard is up
    const vv = window.visualViewport;
    document.body.style.setProperty('--vvh', vv ? `${vv.height}px` : '100%');
    document.body.style.setProperty('--vvt', vv ? `${vv.offsetTop}px` : '0px');
  }
  layout();
  bag.add(onLayoutChange(layout));
  if (window.visualViewport) bag.on(window.visualViewport, 'scroll', layout);

  // ---- actions ----
  function typeChar(ch: string): void {
    if (paused || finished || run.status === 'won' || run.status === 'lost') return;
    run.input(ch);
    handleEvents();
  }

  function toggleKeyboard(): void {
    kbVisible = !kbVisible;
    setKeyboardVisible(kbVisible);
    sfx('click');
    layout();
    buildPause();
  }

  function setPaused(p: boolean): void {
    if (finished || run.status === 'won' || run.status === 'lost') p = false;
    if (p === paused) return;
    paused = p;
    sfx('click');
    el.classList.toggle('paused', paused);
    pauseBtn.innerHTML = pixelSvg(paused ? ICONS.play : ICONS.pause);
    if (paused) {
      buildPause();
      pauseMenu.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    } else {
      (document.activeElement as HTMLElement | null)?.blur?.();
      last = performance.now();
    }
  }

  function buildPause(): void {
    pauseMenu.replaceChildren();
    const card = h('div', 'pause-card');
    card.append(h('h2', '', 'Paused'));
    const resume = button('btn primary', 'Resume', () => setPaused(false));
    const restart = button('btn', 'Restart', () => {
      sfx('click');
      nav.play(levelIndex);
    });
    const map = button('btn', 'Star map', () => {
      sfx('click');
      nav.map(levelIndex);
    });
    const snd = button('btn', isMuted() ? 'Sound: off' : 'Sound: on', () => {
      toggleMute();
      snd.textContent = isMuted() ? 'Sound: off' : 'Sound: on';
    });
    const keys = button('btn', kbVisible ? 'Keyboard: shown' : 'Keyboard: hidden', () => toggleKeyboard());
    const grid = h('div', 'pause-grid');
    grid.append(resume, restart, map, snd, keys);
    card.append(grid, h('p', 'hint', 'Esc to resume'));
    pauseMenu.append(card);
  }
  bag.add(onMuteChange(() => paused && buildPause()));

  // lose focus = pause (never while waiting for the first key)
  const autoPause = (): void => {
    if (run.status === 'playing') setPaused(true);
  };
  bag.on(window, 'blur', autoPause);
  bag.on(document, 'visibilitychange', () => document.hidden && autoPause());

  // ---- events ----
  function handleEvents(): void {
    for (const e of run.drainEvents()) {
      playEvent(e);
      onEvent(e);
    }
  }

  function restartAnim(node: Element, cls: string): void {
    node.classList.remove(cls);
    void (node as HTMLElement).offsetWidth;
    node.classList.add(cls);
  }

  function onEvent(e: RunEvent): void {
    switch (e.type) {
      case 'start':
        started = true;
        toast.classList.add('gone');
        break;
      case 'correct':
        kb.flash(e.char, true);
        break;
      case 'wrong':
        kb.flash(e.got, false);
        errUntil = t + 0.3;
        break;
      case 'word':
        doneAt.set(e.index, t);
        break;
      case 'hurt':
        shake = e.cause === 'threat' ? 5 : 2;
        syncHearts();
        if (heartImgs[run.hp]) restartAnim(heartImgs[run.hp], 'pop-hurt');
        break;
      case 'heal':
        syncHearts();
        if (heartImgs[run.hp - 1]) restartAnim(heartImgs[run.hp - 1], 'pop-heal');
        break;
      case 'danger':
        meter.classList.toggle('alarm', e.on);
        break;
      case 'won':
        wonAt = t;
        endAt = t + WIN_FALLBACK;
        break;
      case 'lost':
        endAt = t + LOSE_DELAY;
        el.classList.add('lost');
        break;
      case 'move':
      case 'arrive':
        break;
    }
  }

  function syncHearts(): void {
    if (shownHp === run.hp) return;
    shownHp = run.hp;
    heartImgs.forEach((img, i) => {
      const src = i < run.hp ? fullHeart : emptyHeart;
      if (img.getAttribute('src') !== src) img.src = src;
    });
    setText(hpCount, `x${run.hp}`);
  }

  function finish(): void {
    finished = true;
    const won = run.status === 'won';
    const stats = run.stats;
    const stars = won ? run.stars() : 0;
    const newBest = won ? recordWin(level.id, stars, stats.wpm, stats.accuracy) : null;
    nav.results({ levelIndex, won, stars, stats, hpLeft: run.hp, newBest });
  }

  // ---- loop ----
  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (!paused) {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < MAX_STEPS) {
        run.tick(STEP);
        t += STEP;
        acc -= STEP;
        n++;
      }
      if (n >= MAX_STEPS) acc = 0;
      handleEvents();
      const target = clampCam(run.heroX - CAM_LEAD);
      camX += (target - camX) * (1 - Math.exp(-dt * CAM_RATE));
      shake = Math.max(0, shake - dt * 18);
      if (wonAt >= 0 && boardAt < 0 && run.heroPose === 'board') boardAt = t;
      if (boardAt >= 0 && launchAt < 0 && t - boardAt >= DOOR_WALK) {
        launchAt = t;
        endAt = t + LAUNCH_SHOW;
        sfx('launch');
      }
      if (endAt >= 0 && t >= endAt && !finished) {
        finish();
        return;
      }
    }
    render();
    updateHud();
    updateLabels();
  }

  let renderFailed = false;
  function render(): void {
    ctx.setTransform(res, 0, 0, res, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#05061a';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const sx = shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0;
    const sy = shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0;
    const cx = Math.round(camX) - sx;
    try {
      for (const layer of bg) {
        const w = layer.canvas.width;
        if (w <= 0) continue;
        const off = Math.round(cx * layer.factor);
        let x = -(((off % w) + w) % w);
        for (; x < VIEW_W; x += w) ctx.drawImage(layer.canvas, x, sy);
      }
      ctx.save();
      ctx.translate(0, sy);
      const inView = (x0: number, x1: number): boolean => Math.max(x0, x1) >= cx - 48 && Math.min(x0, x1) <= cx + VIEW_W + 48;
      for (let i = 1; i <= steps; i++) {
        const a = path[i - 1];
        const b = path[i];
        if (inView(a.x, b.x)) art.drawConnector(ctx, b.move, level.theme, a.x - cx, a.y, b.x - cx, b.y);
      }
      for (const wp of path) {
        if (wp.platform === 'none') continue;
        const w = wp.platformW ?? 24;
        if (inView(wp.x - w, wp.x + w)) art.drawPlatform(ctx, wp.platform, level.theme, wp.x - cx, wp.y, w);
      }
      const end = path[steps];
      const phase = launchAt >= 0 ? 'launch' : wonAt >= 0 ? 'boarding' : 'idle';
      art.drawEscape(ctx, level.escape, end.x - cx, end.y, launchAt >= 0 ? t - launchAt : t, phase);
      const gap = run.heroS - run.threatS;
      const closeness = Math.max(0, Math.min(1, 1 - (gap - CONTACT_GAP) / (NEAR_GAP - CONTACT_GAP)));
      art.drawThreat(ctx, level.threat, run.threatX - cx, run.threatY, t, closeness);
      if (launchAt < 0) {
        const flash = run.heroPose === 'hurt' && Math.floor(t * 20) % 2 === 0;
        let hx = run.heroX;
        let hy = run.heroY;
        let dir = run.heroDir;
        if (boardAt >= 0) {
          // walk to the craft door
          const door = ESCAPE_DOOR[level.escape] ?? { dx: 0, dy: 0 };
          const p = Math.min(1, (t - boardAt) / DOOR_WALK);
          hx = end.x + door.dx * p;
          hy = end.y + door.dy * p;
          if (door.dx) dir = door.dx > 0 ? 1 : -1;
        }
        art.drawHero(ctx, run.heroPose, run.heroPoseTime, Math.round(hx - cx), Math.round(hy), dir, flash);
      }
      ctx.restore();
    } catch (err) {
      ctx.restore();
      if (!renderFailed) console.error(err);
      renderFailed = true;
    }
  }

  function updateHud(): void {
    syncHearts();
    const s = run.stats;
    setText(progV, `${Math.min(run.index, steps)}/${steps}`);
    setText(wpmV, String(Math.round(s.wpm)));
    setText(accV, `${Math.round(s.accuracy * 100)}%`);
    const gap = run.heroS - run.threatS;
    const fill = Math.max(0, Math.min(1, 1 - (gap - CONTACT_GAP) / (NEAR_GAP * 3)));
    meterFill.style.width = `${Math.round(fill * 100)}%`;
    // pulse quickens as the threat creeps closer
    meter.style.setProperty('--pulse', `${(1.4 - fill * 1.15).toFixed(2)}s`);
    meter.classList.toggle('warn', fill > 0.3 && !run.danger);
    meter.classList.toggle('alarm', run.danger);
    setText(meterDist, `${Math.max(0, Math.round(gap / 4))}m`);
    kb.setNext(paused ? null : run.nextChar());
  }

  // ---- prompt labels (DOM over the canvas; crisp text at any scale) ----
  interface Label {
    el: HTMLDivElement;
    pin: HTMLSpanElement;
    key: string;
  }
  const labelMap = new Map<number, Label>();

  function charSpans(word: string, typed: number, cur: boolean): string {
    let s = '';
    for (let i = 0; i < word.length; i++) {
      const c = word[i];
      const cls = !cur ? 'todo' : i < typed ? 'ok' : i === typed ? 'nx' : 'todo';
      const txt = c === ' ' ? '&nbsp;' : c === '<' ? '&lt;' : c === '&' ? '&amp;' : c === '>' ? '&gt;' : c;
      s += `<span class="${cls}${c === ' ' ? ' sp' : ''}">${txt}</span>`;
    }
    return s;
  }

  function updateLabels(): void {
    const cx = camX;
    const want = new Set<number>();
    const idx = run.index;
    for (let i = Math.max(0, idx - 1); i <= Math.min(steps - 1, idx + 2); i++) {
      if (i < idx) {
        const d = doneAt.get(i);
        if (d === undefined || t - d > DONE_FADE) continue;
      }
      want.add(i);
    }
    for (const [i, lab] of labelMap) {
      if (!want.has(i)) {
        lab.el.remove();
        labelMap.delete(i);
      }
    }
    const err = t < errUntil;
    for (const i of want) {
      let lab = labelMap.get(i);
      if (!lab) {
        const e = h('div', 'plabel');
        const pin = h('span', 'pin');
        e.append(pin);
        labels.append(e);
        lab = { el: e, pin, key: '' };
        labelMap.set(i, lab);
      }
      const word = run.prompts[i];
      const state = i < idx ? 'done' : i === idx ? 'cur' : i === idx + 1 ? 'up1' : 'up2';
      const typed = i === idx ? run.typed : i < idx ? word.length : 0;
      const key = `${state}:${typed}:${err && state === 'cur' ? 1 : 0}`;
      if (lab.key !== key) {
        lab.key = key;
        lab.el.className = `plabel ${state}${err && state === 'cur' ? ' err' : ''}`;
        lab.pin.innerHTML = state === 'done' ? `<span class="ok">${charSpans(word, 0, false)}</span>` : charSpans(word, typed, state === 'cur');
      }
      const wp = path[i + 1];
      let x = wp.x - cx;
      if (state === 'cur') x = Math.max(36, Math.min(VIEW_W - 36, x));
      let y = wp.y - HERO_H - 6;
      if (state === 'done') y -= Math.min(1, (t - (doneAt.get(i) ?? t)) / DONE_FADE) * 12;
      y = Math.max(state === 'cur' ? 22 : 16, y);
      lab.el.style.transform = `translate(${Math.round(x * viewF)}px, ${Math.round(y * viewF)}px)`;
    }
    el.classList.toggle('waiting', !started && run.status === 'ready');
  }

  raf = requestAnimationFrame(frame);
  bag.add(() => cancelAnimationFrame(raf));
  return () => bag.dispose();
}
