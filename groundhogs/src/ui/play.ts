// Play screen: fixed-step loop, camera, rendering, input.
import type { Groundhog, SkillId } from '../types';
import { GH_HEIGHT, SKILLS, TICK_RATE, VIEW_H, VIEW_W } from '../types';
import { art, ceilingAbove, createGame, LEVELS } from './assets';
import { isMuted, play as sfx, playEvent, toggleMute } from './audio';
import { Bag, h, pct, setText } from './dom';
import type { Armed } from './hud';
import { Hud } from './hud';
import { Minimap } from './minimap';
import type { Nav } from './nav';
import { recordWin } from './save';
import { availableSize, canvasRes, frameFit, onLayoutChange } from './scale';

const STEP_MS = 1000 / TICK_RATE;
const FAST_MULT = 3;
const MAX_TICKS_PER_FRAME = 6; // catch-up cap (x FAST_MULT when fast)
const PARALLAX = 0.5; // background scroll factor
const EDGE_PX = 10; // edge-scroll zone, logical px
const EDGE_OUTSIDE_PX = 24; // zone extends this far past the canvas edge
const SCROLL_SPEED = 260; // logical px per second
const PICK_R = 6;
const END_DELAY_MS = 1600;
const NUKE_END_DELAY_MS = 900;
const ARM_MS = 1500; // window for the confirming second press
const TOUCH_R = 12; // touch pick radius, logical px
const TAP_SLOP = 10; // CSS px a finger may move and still count as a tap
const FLASH_MS = 450; // bracket shown on a tapped groundhog
const DOUBLE_TAP_MS = 300; // empty-ground double-tap toggles zoom
const DOUBLE_TAP_PX = 24;
const ZOOM = 2; // magnified view shows half the width/height
// compact (phone) layout, in UI units: status, skills row, side column
const C_STATUS = 14;
const C_SKILLS_H = 32;
const C_SKILLS_W = 236;
const C_SIDE_W = 84;
const C_SIDE_H = 178;
const C_BORDER = 4;

export function startPlay(root: HTMLElement, levelIndex: number, nav: Nav): () => void {
  const level = LEVELS[levelIndex];
  const game = createGame(level);
  const bg = art.renderBackground(level.theme, level.width, VIEW_H);
  const terrainView = art.createTerrainView(game.terrain, level.theme);
  terrainView.update(game.terrain.takeDirty());
  const maxCam1 = Math.max(0, level.width - VIEW_W); // 1x camera limit (scene buffer)
  let zoom = 1;
  const clampCam = (x: number): number => Math.min(Math.max(0, level.width - VIEW_W / zoom), Math.max(0, x));
  const clampCamY = (y: number): number => Math.min(VIEW_H - VIEW_H / zoom, Math.max(0, y));

  // ---- state ----
  const firstEntrance = level.entrances[0];
  let camX = clampCam(level.startX ?? (firstEntrance ? firstEntrance.x - VIEW_W / 2 : 0));
  let camY = 0; // >0 only when zoomed
  let paused = false;
  let fast = false;
  let nuked = false;
  let armed: Armed = null;
  let armedAt = 0;
  let selected: SkillId | null = SKILLS.find((s) => (game.skillsLeft[s] ?? 0) > 0) ?? null;
  const mouse = { x: -1, y: -1, present: false };
  const keys = { left: false, right: false, up: false, down: false };
  let drag: { clientX: number; clientY: number; cam: number; camY: number } | null = null;
  let touch: { id: number; x0: number; y0: number; t0: number; cam: number; camY: number; moved: boolean } | null = null;
  let lastEmptyTap: { t: number; x: number; y: number } | null = null;
  let flash: { g: Groundhog; until: number } | null = null;
  let res = 1; // canvas backing-store factor
  let mapDrag = false;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let endAt = 0;
  let done = false;

  // ---- DOM ----
  const el = h('div', 'screen play');
  const stage = h('div', 'stage');
  const canvas = h('canvas', 'view');
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  const banner = h('div', 'banner');
  stage.append(canvas, banner);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  // logical-res scene buffer; the visible part is blitted (2x when zoomed) onto the view
  const scene = h('canvas');
  scene.width = VIEW_W;
  scene.height = VIEW_H;
  const sctx = scene.getContext('2d')!;
  sctx.imageSmoothingEnabled = false;

  const minimap = new Minimap(level.width);
  const hud = new Hud(level, minimap.canvas, {
    rate: (d) => game.setReleaseRate(game.releaseRate + d),
    skill: (s) => selectSkill(s),
    pause: () => togglePause(),
    fast: () => toggleFast(),
    nuke: () => requestNuke(),
    restart: () => nav.play(levelIndex),
    menu: () => requestMenu(),
    mute: () => toggleMute(),
    zoom: () => toggleZoom(insideView() ? mouse.x : VIEW_W / 2, insideView() ? mouse.y : VIEW_H / 2),
  });
  el.append(stage, hud.status, hud.toolbar, hud.side, hud.skillbar);
  root.append(el);

  // ---- layout: integer desktop frame when 2x fits, else compact phone layout ----
  function layout(): void {
    const fit = frameFit();
    const compact = fit < 2;
    el.classList.toggle('compact', compact);
    hud.setCompact(compact);
    let cssW: number;
    if (compact) {
      const { w, h: vh } = availableSize();
      const vw = w - 4;
      const avh = vh - 4;
      // largest UI unit (finger-sized buttons) that still leaves a >=1x view; else accept a slightly smaller view
      let u = 1.5;
      let cw = 0;
      for (const minView of [VIEW_W, VIEW_W * 0.85]) {
        for (let i = 40; i >= 26 && !cw; i--) {
          const t = i / 20;
          const rowsH = avh - C_STATUS * t;
          const cH = rowsH - C_SKILLS_H * t - C_BORDER * t;
          const cW = Math.min(vw - C_SIDE_W * t - C_BORDER * t, cH * 2);
          if (C_SIDE_H * t <= rowsH && C_SKILLS_W * t <= cW + C_BORDER * t && cW >= minView) {
            u = t;
            cw = cW;
          }
        }
        if (cw) break;
      }
      if (!cw) {
        const rowsH = avh - C_STATUS * u;
        cw = Math.min(vw - C_SIDE_W * u - C_BORDER * u, (rowsH - C_SKILLS_H * u - C_BORDER * u) * 2);
      }
      el.style.setProperty('--px', `${u}px`);
      cssW = Math.max(160, Math.floor(cw / 2) * 2);
    } else {
      el.style.removeProperty('--px');
      cssW = VIEW_W * Math.floor(fit);
    }
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssW / 2}px`;
    if (compact) {
      // safety net for font/rounding differences: shrink the view if we still overflow
      const over = el.getBoundingClientRect().height - availableSize().h;
      if (over > 0.5) {
        cssW = Math.max(160, cssW - Math.ceil(over) * 2);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssW / 2}px`;
      }
    }
    const r = canvasRes(cssW);
    res = r.k;
    if (canvas.width !== VIEW_W * res) {
      canvas.width = VIEW_W * res;
      canvas.height = VIEW_H * res;
    }
    canvas.classList.toggle('smooth', r.smooth);
    ctx.imageSmoothingEnabled = false;
  }
  layout();

  // ---- actions ----
  function selectSkill(s: SkillId): void {
    if ((game.skillsLeft[s] ?? 0) <= 0) {
      sfx('fail');
      return;
    }
    if (selected !== s) sfx('select');
    selected = s;
  }
  function togglePause(): void {
    paused = !paused;
    sfx('click');
  }
  function toggleFast(): void {
    fast = !fast;
    sfx('click');
  }
  // First press arms, second within ARM_MS confirms.
  function confirmPress(kind: Exclude<Armed, null>): boolean {
    const now = performance.now();
    if (armed === kind && now - armedAt < ARM_MS) {
      armed = null;
      return true;
    }
    armed = kind;
    armedAt = now;
    sfx('click');
    return false;
  }
  function requestNuke(): void {
    if (nuked || game.status !== 'playing') return;
    if (!confirmPress('nuke')) return;
    nuked = true;
    game.alarm();
    sfx('alarm');
  }
  function requestMenu(): void {
    if (game.status !== 'playing' || confirmPress('menu')) nav.select();
  }
  // Toggle 1x/2x; zooming in centres on view point (lx, ly) in logical screen px.
  function toggleZoom(lx: number, ly: number): void {
    if (zoom === 1) {
      const wx = camX + lx;
      const wy = camY + ly;
      zoom = ZOOM;
      camX = clampCam(wx - VIEW_W / ZOOM / 2);
      camY = clampCamY(wy - VIEW_H / ZOOM / 2);
    } else {
      const centre = camX + VIEW_W / zoom / 2;
      zoom = 1;
      camX = clampCam(centre - VIEW_W / 2);
      camY = 0;
    }
    sfx('click');
  }

  // ---- input ----
  const bag = new Bag();

  const toLogical = (clientX: number, clientY: number): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) * VIEW_W) / r.width, y: ((clientY - r.top) * VIEW_H) / r.height };
  };
  // Logical view point -> world point through camera + zoom.
  const toWorld = (lx: number, ly: number): { x: number; y: number } => ({ x: camX + lx / zoom, y: camY + ly / zoom });
  const insideView = (): boolean => mouse.present && mouse.x >= 0 && mouse.x < VIEW_W && mouse.y >= 0 && mouse.y < VIEW_H;

  bag.on<PointerEvent>(window, 'pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const p = toLogical(e.clientX, e.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.present = true;
    if (drag) {
      const r = canvas.getBoundingClientRect();
      camX = clampCam(drag.cam - ((e.clientX - drag.clientX) * VIEW_W) / r.width / zoom);
      camY = clampCamY(drag.camY - ((e.clientY - drag.clientY) * VIEW_H) / r.height / zoom);
    }
  });
  bag.on(document.documentElement, 'mouseleave', () => (mouse.present = false));
  bag.on(window, 'blur', () => {
    mouse.present = false;
    keys.left = keys.right = keys.up = keys.down = false;
    drag = null;
  });

  bag.on<PointerEvent>(canvas, 'pointerdown', (e) => {
    if (e.pointerType !== 'mouse') {
      // touch/pen: decide tap vs drag on release
      e.preventDefault();
      mouse.present = false;
      if (touch) return;
      touch = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), cam: camX, camY, moved: false };
      capture(canvas, e.pointerId);
      return;
    }
    const p = toLogical(e.clientX, e.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.present = true;
    if (e.button === 0) {
      if (!selected || game.status !== 'playing') return;
      const w = toWorld(mouse.x, mouse.y);
      const g = game.pickAt(w.x, w.y, selected);
      if (g) game.assignSkill(g, selected);
    } else if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      drag = { clientX: e.clientX, clientY: e.clientY, cam: camX, camY };
      capture(canvas, e.pointerId);
    }
  });
  bag.on<PointerEvent>(canvas, 'pointermove', (e) => {
    if (!touch || e.pointerId !== touch.id) return;
    const dx = e.clientX - touch.x0;
    const dy = e.clientY - touch.y0;
    if (!touch.moved && Math.hypot(dx, dy) > TAP_SLOP) touch.moved = true;
    if (touch.moved) {
      const r = canvas.getBoundingClientRect();
      camX = clampCam(touch.cam - (dx * VIEW_W) / r.width / zoom);
      camY = clampCamY(touch.camY - (dy * VIEW_H) / r.height / zoom);
    }
  });
  bag.on<PointerEvent>(canvas, 'pointerup', (e) => {
    drag = null;
    if (!touch || e.pointerId !== touch.id) return;
    if (!touch.moved) tapAt(e.clientX, e.clientY, touch.t0);
    touch = null;
  });
  bag.on(canvas, 'pointercancel', () => {
    drag = null;
    touch = null;
  });
  bag.on<Event>(canvas, 'contextmenu', (e) => e.preventDefault());
  // stop middle-click autoscroll
  bag.on<MouseEvent>(canvas, 'mousedown', (e) => {
    if (e.button === 1) e.preventDefault();
  });
  bag.on<MouseEvent>(canvas, 'auxclick', (e) => e.preventDefault());

  // Nearest groundhog to a fingertip: game's pick first, then a wider scan.
  function pickTouch(wx: number, wy: number): Groundhog | null {
    const g = game.pickAt(wx, wy, selected);
    if (g) return g;
    let best: Groundhog | null = null;
    const r = TOUCH_R / zoom; // constant on screen
    let bestD = r * r;
    for (const c of game.groundhogs) {
      if (GONE_OR_DYING.has(c.state)) continue;
      const dx = c.x - wx;
      const dy = c.y - 5 - wy;
      const d = dx * dx + dy * dy;
      if (d <= bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  // Tap on a groundhog assigns at once; two quick taps on empty ground toggle zoom.
  function tapAt(clientX: number, clientY: number, downAt: number): void {
    const p = toLogical(clientX, clientY);
    const w = toWorld(p.x, p.y);
    const g = game.status === 'playing' ? pickTouch(w.x, w.y) : null;
    if (g) {
      lastEmptyTap = null;
      flash = { g, until: performance.now() + FLASH_MS };
      if (selected) game.assignSkill(g, selected);
      else sfx('fail');
      return;
    }
    const prev = lastEmptyTap;
    if (prev && downAt - prev.t < DOUBLE_TAP_MS && Math.hypot(clientX - prev.x, clientY - prev.y) < DOUBLE_TAP_PX) {
      lastEmptyTap = null;
      toggleZoom(p.x, p.y);
    } else {
      lastEmptyTap = { t: performance.now(), x: clientX, y: clientY };
    }
  }

  const mapTo = (clientX: number, clientY: number): void => {
    camX = clampCam(minimap.worldX(clientX) - VIEW_W / zoom / 2);
    camY = clampCamY(minimap.worldY(clientY) - VIEW_H / zoom / 2);
  };
  bag.on<PointerEvent>(minimap.canvas, 'pointerdown', (e) => {
    if (e.button !== 0) return;
    mapDrag = true;
    capture(minimap.canvas, e.pointerId);
    mapTo(e.clientX, e.clientY);
  });
  bag.on<PointerEvent>(minimap.canvas, 'pointermove', (e) => {
    if (mapDrag) mapTo(e.clientX, e.clientY);
  });
  for (const t of ['pointerup', 'pointercancel']) bag.on(minimap.canvas, t, () => (mapDrag = false));

  bag.on<KeyboardEvent>(window, 'keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const c = e.code;
    if (c === 'ArrowLeft' || c === 'KeyA') {
      keys.left = true;
    } else if (c === 'ArrowRight' || c === 'KeyD') {
      keys.right = true;
    } else if (c === 'ArrowUp' || c === 'KeyW') {
      keys.up = true;
    } else if (c === 'ArrowDown' || c === 'KeyS') {
      keys.down = true;
    } else if (c === 'KeyZ') {
      if (!e.repeat) toggleZoom(insideView() ? mouse.x : VIEW_W / 2, insideView() ? mouse.y : VIEW_H / 2);
    } else if (/^(Digit|Numpad)[0-9]$/.test(c)) {
      // 1-9 then 0 for the 10th
      const d = Number(c[c.length - 1]);
      const s = SKILLS[d === 0 ? 9 : d - 1];
      if (!s) return;
      if (!e.repeat) selectSkill(s);
    } else if (c === 'F1' || c === 'Minus' || c === 'NumpadSubtract' || e.key === '-' || e.key === '_') {
      game.setReleaseRate(game.releaseRate - 1);
    } else if (c === 'F2' || c === 'Equal' || c === 'NumpadAdd' || e.key === '=' || e.key === '+') {
      game.setReleaseRate(game.releaseRate + 1);
    } else if (c === 'KeyP' || c === 'Pause') {
      if (!e.repeat) togglePause();
    } else if (c === 'KeyF') {
      if (!e.repeat) toggleFast();
    } else if (c === 'KeyR') {
      if (!e.repeat) nav.play(levelIndex);
      return;
    } else if (c === 'KeyN') {
      if (!e.repeat) requestNuke();
    } else if (c === 'Escape') {
      if (!e.repeat) requestMenu();
    } else {
      return;
    }
    e.preventDefault();
  });
  bag.add(onLayoutChange(layout));
  // a phone turned to portrait gets the rotate overlay; hold the game meanwhile
  const portrait = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
  const onPortrait = (): void => {
    if (portrait.matches) paused = true;
  };
  onPortrait();
  bag.on(portrait, 'change', onPortrait);

  bag.on<KeyboardEvent>(window, 'keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = false;
  });

  // ---- loop ----
  function scroll(dt: number): void {
    let v = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (!drag && !mapDrag && mouse.present && mouse.y >= 0 && mouse.y < VIEW_H) {
      if (mouse.x < EDGE_PX && mouse.x >= -EDGE_OUTSIDE_PX) v -= 1;
      else if (mouse.x >= VIEW_W - EDGE_PX && mouse.x < VIEW_W + EDGE_OUTSIDE_PX) v += 1;
    }
    const speed = (SCROLL_SPEED * dt) / 1000 / zoom;
    if (v) camX = clampCam(camX + Math.sign(v) * speed);
    const vy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (vy) camY = clampCamY(camY + vy * speed);
  }

  function step(): void {
    game.tick();
    const rects = game.terrain.takeDirty();
    if (rects.length) {
      terrainView.update(rects);
      minimap.markStale();
    }
  }

  function finish(): void {
    done = true;
    const won = game.status === 'won';
    if (won) recordWin(level.id, pct(game.saved, level.count));
    nav.results({ levelIndex, won, saved: game.saved, count: level.count, required: level.required, nuked });
  }

  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(now - last, 250);
    last = now;
    scroll(dt);
    if (armed && now - armedAt >= ARM_MS) armed = null;
    if (!paused) {
      const mult = fast ? FAST_MULT : 1;
      const cap = MAX_TICKS_PER_FRAME * mult;
      acc += dt * mult;
      let n = 0;
      while (acc >= STEP_MS && n < cap) {
        step();
        acc -= STEP_MS;
        n++;
      }
      if (n >= cap) acc = 0;
    }
    // drained every frame so clicks while paused still sound
    for (const ev of game.drainEvents()) playEvent(ev);

    if (game.status !== 'playing') {
      if (!endAt) endAt = now;
      else if (now - endAt > (nuked ? NUKE_END_DELAY_MS : END_DELAY_MS) && !done) {
        finish();
        return;
      }
    }
    render();
  }

  function underCursor(wx: number, wy: number): number {
    let n = 0;
    for (const g of game.groundhogs) {
      if (g.state === 'saved' || g.state === 'dead') continue;
      if (Math.abs(g.x - wx) <= PICK_R && wy >= g.y - GH_HEIGHT - 2 && wy <= g.y + 2) n++;
    }
    return n;
  }

  function render(): void {
    const cx = Math.round(camX);
    const cy = Math.round(camY);
    const vw = VIEW_W / zoom;
    const vh = VIEW_H / zoom;
    const sx0 = Math.min(cx, maxCam1); // scene buffer always covers the visible region
    const t = game.ticks;
    const c = sctx;
    c.fillStyle = '#120b07';
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    const bx = Math.max(0, Math.min(bg.width - VIEW_W, Math.round(sx0 * PARALLAX)));
    c.drawImage(bg, bx, 0, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
    for (const hz of level.hazards) art.drawHazard(c, hz, sx0, t);
    c.drawImage(terrainView.canvas, sx0, 0, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
    for (const ex of level.exits) art.drawExit(c, ex.x - sx0, ex.y, t);
    for (const en of level.entrances) art.drawEntrance(c, en.x - sx0, en.y, game.hatchOpen, t, ceilingAbove(game.terrain, en.x, en.y - 36));
    for (const pad of game.pads) {
      const px = pad.x - sx0;
      if (px > -16 && px < VIEW_W + 16) art.drawBouncePad(c, px, pad.y, t, pad.lastBounce < 0 ? 999 : game.ticks - pad.lastBounce);
    }

    const inside = insideView();
    const mx = Math.floor(mouse.x);
    const my = Math.floor(mouse.y);
    const wmx = Math.floor(cx + mouse.x / zoom);
    const wmy = Math.floor(cy + mouse.y / zoom);
    const hover: Groundhog | null = inside && !drag ? game.pickAt(wmx, wmy, selected) : null;
    if (flash && (performance.now() > flash.until || GONE_OR_DYING.has(flash.g.state))) flash = null;
    const tapped = !hover && flash ? flash.g : null;
    for (const g of game.groundhogs) {
      if (g === hover || g === tapped || g.state === 'saved' || g.state === 'dead') continue;
      const sx = g.x - sx0;
      if (sx < -16 || sx > VIEW_W + 16) continue;
      art.drawGroundhog(c, g, Math.round(sx), Math.round(g.y), false);
    }
    const hl = hover ?? tapped;
    if (hl) art.drawGroundhog(c, hl, Math.round(hl.x - sx0), Math.round(hl.y), true);

    // visible region -> view (integer 2x when zoomed, crisp)
    ctx.setTransform(res, 0, 0, res, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scene, cx - sx0, cy, vw, vh, 0, 0, VIEW_W, VIEW_H);

    if (tapped) drawCursor(Math.round((tapped.x - cx) * zoom), Math.round((tapped.y - 5 - cy) * zoom), true);
    drawOffscreen(cx, cy, vw, t);
    if (zoom !== 1) drawZoomBadge();
    if (inside) drawCursor(mx, my, hover !== null);

    hud.update(game, {
      selected,
      paused,
      fast,
      muted: isMuted(),
      nuked,
      armed: game.status === 'playing' ? armed : null,
      zoomed: zoom !== 1,
      hover: hl,
      under: inside ? underCursor(wmx, wmy) : 0,
    });
    const msg = game.status === 'won' ? 'HOME FOR SPRING' : game.status === 'lost' ? 'SIX MORE WEEKS...' : paused ? 'PAUSED' : '';
    setText(banner, msg);
    banner.classList.toggle('show', msg !== '');
    minimap.draw(game, cx, cy, vw, vh);
  }

  // Tiny "2x" plate in the top-left corner while zoomed.
  function drawZoomBadge(): void {
    ctx.fillStyle = 'rgba(26,14,7,0.78)';
    ctx.fillRect(2, 2, 13, 9);
    drawDigit(4, 4, ZOOM, '#ffd34a');
    for (const [x, y] of [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]]) ctx.fillRect(9 + x, 6 + y, 1, 1);
  }

  // Edge arrows with counts of live groundhogs left/right of the view; flash red when any is in trouble.
  function drawOffscreen(cx: number, cy: number, vw: number, t: number): void {
    for (const side of [-1, 1] as const) {
      let n = 0;
      let ySum = 0;
      let danger = false;
      for (const g of game.groundhogs) {
        if (g.state === 'saved' || g.state === 'dead' || g.state === 'exiting') continue;
        const sx = g.x - cx;
        if (side < 0 ? sx >= -4 : sx <= vw + 4) continue;
        n++;
        ySum += g.y;
        if (g.state === 'splatting' || g.state === 'drowning' || g.state === 'poofing' || g.fallDist > 24) danger = true;
      }
      if (n === 0) continue;
      const y = Math.max(17, Math.min(VIEW_H - 14, Math.round((ySum / n - 5 - cy) * zoom))); // clear of the 2x badge
      const flash = danger && (t >> 2) % 2 === 0;
      const fg = flash ? '#ff5a4a' : '#fff4d6';
      const label = String(n);
      const w = label.length * 4 + 9;
      const x0 = side < 0 ? 1 : VIEW_W - 1 - w;
      ctx.fillStyle = 'rgba(26,14,7,0.78)';
      ctx.fillRect(x0, y - 4, w, 11);
      ctx.fillStyle = fg;
      // arrow head
      const ax = side < 0 ? x0 + 2 : x0 + w - 3;
      for (let i = 0; i < 4; i++) ctx.fillRect(ax + (side < 0 ? i : -i), y + 1 - i, 1, i * 2 + 1);
      let dx = side < 0 ? x0 + 7 : x0 + 2;
      for (const ch of label) {
        drawDigit(dx, y - 1, Number(ch), fg);
        dx += 4;
      }
    }
  }

  function drawDigit(x: number, y: number, d: number, color: string): void {
    const rows = DIGITS[d];
    ctx.fillStyle = color;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if ((rows[r] >> (2 - c)) & 1) ctx.fillRect(x + c, y + r, 1, 1);
  }

  function drawCursor(x: number, y: number, onHog: boolean): void {
    const dark = '#1a0e07';
    if (onHog) {
      // corner brackets around the target
      const r = 6;
      const corners: [number, number, number, number][] = [
        [-r, -r, 1, 1],
        [r, -r, -1, 1],
        [-r, r, 1, -1],
        [r, r, -1, -1],
      ];
      for (const col of [dark, '#9be35a']) {
        const o = col === dark ? 1 : 0;
        ctx.fillStyle = col;
        for (const [cxo, cyo, dx, dy] of corners) {
          const px = x + cxo;
          const py = y + cyo;
          ctx.fillRect(Math.min(px, px + dx * 3) - o, py - o, 4 + o * 2, 1 + o * 2);
          ctx.fillRect(px - o, Math.min(py, py + dy * 3) - o, 1 + o * 2, 4 + o * 2);
        }
      }
      ctx.fillStyle = '#9be35a';
      ctx.fillRect(x, y, 1, 1);
    } else {
      // plus with a hollow centre
      for (const col of [dark, '#fff3d6']) {
        const o = col === dark ? 1 : 0;
        ctx.fillStyle = col;
        ctx.fillRect(x - 6 - o, y - o, 4 + o * 2, 1 + o * 2);
        ctx.fillRect(x + 3 - o, y - o, 4 + o * 2, 1 + o * 2);
        ctx.fillRect(x - o, y - 6 - o, 1 + o * 2, 4 + o * 2);
        ctx.fillRect(x - o, y + 3 - o, 1 + o * 2, 4 + o * 2);
      }
    }
  }

  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    bag.dispose();
    hud.destroy();
  };
}


// Pointer capture is best effort (touches are implicitly captured anyway).
function capture(el: Element, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    // pointer already gone
  }
}

const GONE_OR_DYING: ReadonlySet<string> = new Set(['saved', 'dead', 'splatting', 'drowning', 'poofing', 'exiting']);

// 3x5 pixel digits, rows as 3-bit masks
const DIGITS: number[][] = [
  [7, 5, 5, 5, 7], [2, 6, 2, 2, 7], [7, 1, 7, 4, 7], [7, 1, 3, 1, 7], [5, 5, 7, 1, 1],
  [7, 4, 7, 1, 7], [7, 4, 7, 5, 7], [7, 1, 1, 2, 2], [7, 5, 7, 5, 7], [7, 5, 7, 1, 7],
];
