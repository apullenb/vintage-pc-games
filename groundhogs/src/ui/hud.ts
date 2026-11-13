// Status line + carved toolbar for the play screen.
import type { GameAPI, Groundhog, LevelDef, SkillId } from '../types';
import { SKILLS, SKILL_LABELS } from '../types';
import { LEVELS, skillIconCanvas } from './assets';
import { Bag, fmtTime, h, pct, pixelSvg, setText } from './dom';
import { FS_ICONS, fullscreenButtonWanted, isFullscreen, toggleFullscreen } from './fullscreen';
import { hogLabel } from './names';
import { isTouchDevice } from './scale';

export interface HudHandlers {
  rate(delta: number): void;
  skill(s: SkillId): void;
  pause(): void;
  fast(): void;
  nuke(): void; // each press; caller handles the two-press confirm
  restart(): void;
  menu(): void; // each press; caller confirms while a level is live
  mute(): void;
  zoom(): void;
}

export type Armed = 'nuke' | 'menu' | null;

export interface HudState {
  selected: SkillId | null;
  paused: boolean;
  fast: boolean;
  muted: boolean;
  nuked: boolean;
  armed: Armed; // control waiting for its confirming second press
  zoomed: boolean;
  hover: Groundhog | null;
  under: number; // live groundhogs under the cursor
}

const ICONS = {
  pause: ['##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##'],
  fast: ['#...#...', '##..##..', '###.###.', '########', '###.###.', '##..##..', '#...#...'],
  nuke: ['..###..', '.#####.', '#######', '.#####.', '...#...', '..###..', '.#####.'],
  restart: ['..###.#.', '.#...##.', '#...###.', '#.......', '#......#', '.#....#.', '..####..'],
  sound: ['...#....', '..##.#..', '####..#.', '####..#.', '####..#.', '..##.#..', '...#....'],
  muted: ['...#....', '..##....', '####.#.#', '####..#.', '####.#.#', '..##....', '...#....'],
  zoomIn: ['..###...', '.#...#..', '#..#..#.', '#.###.#.', '#..#..#.', '.#...#..', '..###.#.', '......##'],
  zoomOut: ['..###...', '.#...#..', '#.....#.', '#.###.#.', '#.....#.', '.#...#..', '..###.#.', '......##'],
};

const REPEAT_FIRST = 350;
const REPEAT_MIN = 40;

// Hotkey label for skill slot i: 1-9 then 0.
export function skillKeyLabel(i: number): string {
  return i < 9 ? String(i + 1) : i === 9 ? '0' : '';
}

export class Hud {
  readonly status: HTMLDivElement;
  readonly toolbar: HTMLDivElement; // desktop: one row under the view
  readonly side: HTMLDivElement; // compact: column beside the view
  readonly skillbar: HTMLDivElement; // compact: skills under the view
  private wells: { rate: HTMLElement; skills: HTMLElement; controls: HTMLElement; nuke: HTMLElement; map: HTMLElement };
  private fsBtn: HTMLButtonElement | null = null;
  private zoomBtn: HTMLButtonElement;
  private zoomShown: boolean | null = null;
  private fsShown: boolean | null = null;
  private compact: boolean | null = null;
  private pressWord = isTouchDevice() ? 'TAP' : 'PRESS';
  private handlers: HudHandlers;
  private bag = new Bag();
  private whoEl: HTMLSpanElement;
  private flagsEl: HTMLSpanElement;
  private levelName: string;
  private outEl: HTMLElement;
  private homeEl: HTMLElement;
  private needEl: HTMLElement;
  private timeEl: HTMLElement;
  private rateEl: HTMLElement;
  private rateDn: HTMLButtonElement;
  private skillEls = new Map<SkillId, { btn: HTMLButtonElement; count: HTMLSpanElement }>();
  private pauseBtn: HTMLButtonElement;
  private fastBtn: HTMLButtonElement;
  private nukeBtn: HTMLButtonElement;
  private nukeLabel: HTMLSpanElement;
  private menuBtn: HTMLButtonElement;
  private muteBtn: HTMLButtonElement;
  private mutedShown: boolean | null = null;
  private repeatTimer = 0;

  constructor(level: LevelDef, minimap: HTMLCanvasElement, handlers: HudHandlers) {
    this.handlers = handlers;

    // status line
    this.status = h('div', 'status');
    this.whoEl = h('span', 'who');
    this.flagsEl = h('span', 'flags');
    const stats = h('span', 'stats');
    const stat = (label: string): HTMLElement => {
      const wrap = h('span', 'stat');
      const v = h('b');
      wrap.append(h('i', '', label), v);
      stats.append(wrap);
      return v;
    };
    const lvl = stat('LEVEL');
    lvl.textContent = String(LEVELS.indexOf(level) + 1);
    lvl.parentElement!.title = level.name;
    this.levelName = `${LEVELS.indexOf(level) + 1}. ${level.name.toUpperCase()}`;
    this.outEl = stat('OUT');
    this.homeEl = stat('HOME');
    this.needEl = stat('NEED');
    this.timeEl = stat('TIME');
    this.status.append(this.whoEl, this.flagsEl, stats);

    // toolbar
    this.toolbar = h('div', 'toolbar');

    const rateWell = h('div', 'well rate');
    this.rateDn = this.tool('rate-btn', '-', 'Release slower [F1 / -]');
    const rateUp = this.tool('rate-btn', '+', 'Release faster [F2 / =]');
    const rateBox = h('div', 'rate-box');
    this.rateEl = h('b');
    rateBox.append(h('i', '', 'RATE'), this.rateEl);
    this.holdRepeat(this.rateDn, () => this.handlers.rate(-1));
    this.holdRepeat(rateUp, () => this.handlers.rate(1));
    const rateStack = h('div', 'rate-stack');
    rateStack.append(rateUp, this.rateDn);
    rateWell.append(rateBox, rateStack);

    const skillWell = h('div', 'well skills');
    SKILLS.forEach((s, i) => {
      const btn = h('button', 'skill');
      btn.type = 'button';
      const key = skillKeyLabel(i);
      btn.title = key ? `${SKILL_LABELS[s]} [${key}]` : SKILL_LABELS[s];
      btn.dataset.skill = s;
      const count = h('span', 'count', String(level.skills[s] ?? 0));
      btn.append(skillIconCanvas(s), count);
      this.bag.on(btn, 'click', () => this.handlers.skill(s));
      this.skillEls.set(s, { btn, count });
      skillWell.append(btn);
    });

    // 3x2 grid: pause / fast / restart, then MENU (2 wide) / mute
    const ctrlWell = h('div', 'well controls');
    this.pauseBtn = this.tool('ctl', ICONS.pause, 'Pause [P]', () => this.handlers.pause());
    this.fastBtn = this.tool('ctl', ICONS.fast, 'Fast forward [F]', () => this.handlers.fast());
    const restartBtn = this.tool('ctl', ICONS.restart, 'Restart [R]', () => this.handlers.restart());
    this.menuBtn = this.tool('ctl menu', 'MENU', 'Back to level select [Esc] (press twice mid-level)', () => this.handlers.menu());
    this.muteBtn = this.tool('ctl', ICONS.sound, 'Sound [M]', () => this.handlers.mute());
    ctrlWell.append(this.pauseBtn, this.fastBtn, restartBtn, this.menuBtn, this.muteBtn);

    const nukeWell = h('div', 'well nuke-well');
    this.nukeBtn = this.tool('nuke', ICONS.nuke, 'Nuke: give up and retry [N twice]', () => this.handlers.nuke());
    this.nukeLabel = h('span', 'nuke-label', 'NUKE');
    this.nukeBtn.append(this.nukeLabel);
    nukeWell.append(this.nukeBtn);

    const mapWell = h('div', 'well map');
    mapWell.title = 'Map: click or drag to look around';
    mapWell.append(minimap);

    this.zoomBtn = this.tool('ctl zoom', ICONS.zoomIn, 'Zoom 2x [Z] (or double-tap empty ground)', () => this.handlers.zoom());
    if (fullscreenButtonWanted()) {
      this.fsBtn = this.tool('ctl fs', FS_ICONS.enter, 'Fullscreen', () => toggleFullscreen());
    }

    this.wells = { rate: rateWell, skills: skillWell, controls: ctrlWell, nuke: nukeWell, map: mapWell };
    this.side = h('div', 'side');
    this.skillbar = h('div', 'skillbar');
    for (const c of [this.toolbar, this.side, this.skillbar, this.status]) {
      // keep focus off buttons so Space/Enter never re-trigger them; no long-press menus
      this.bag.on<MouseEvent>(c, 'mousedown', (e) => e.preventDefault());
      this.bag.on<Event>(c, 'contextmenu', (e) => e.preventDefault());
    }
    this.setCompact(false);
    this.bag.add(() => clearTimeout(this.repeatTimer));
  }

  private tool(cls: string, content: string | string[], title: string, onClick?: () => void): HTMLButtonElement {
    const b = h('button', cls);
    b.type = 'button';
    b.title = title;
    if (Array.isArray(content)) b.innerHTML = pixelSvg(content);
    else b.textContent = content;
    if (onClick) this.bag.on(b, 'click', onClick);
    return b;
  }

  // Press-and-hold auto-repeat with acceleration.
  private holdRepeat(btn: HTMLButtonElement, fn: () => void): void {
    const stop = (): void => clearTimeout(this.repeatTimer);
    this.bag.on<PointerEvent>(btn, 'pointerdown', (e) => {
      if (e.button !== 0) return;
      stop();
      fn();
      let delay = REPEAT_FIRST;
      const loop = (): void => {
        this.repeatTimer = window.setTimeout(() => {
          fn();
          delay = Math.max(REPEAT_MIN, delay * 0.75);
          loop();
        }, delay);
      };
      loop();
    });
    for (const t of ['pointerup', 'pointerleave', 'pointercancel']) this.bag.on(btn, t, stop);
  }

  // Desktop: everything in the toolbar row. Compact (phones): skills under the view, the rest in a side column.
  setCompact(on: boolean): void {
    if (this.compact === on) return;
    this.compact = on;
    const w = this.wells;
    if (on) {
      this.skillbar.append(w.skills);
      this.side.append(w.rate, w.controls, w.nuke, w.map);
      w.controls.append(this.zoomBtn);
      if (this.fsBtn) w.controls.append(this.fsBtn);
    } else {
      this.toolbar.append(w.rate, w.skills, w.controls, w.nuke, w.map);
      this.status.append(this.zoomBtn);
      if (this.fsBtn) this.status.append(this.fsBtn);
    }
  }

  update(game: GameAPI, st: HudState): void {
    const lv = game.level;
    // status
    setText(this.whoEl, st.hover ? `${hogLabel(st.hover)}${st.under > 1 ? ` x${st.under}` : ''}` : st.under > 0 ? `x${st.under}` : this.levelName);
    setText(
      this.flagsEl,
      st.armed === 'nuke'
        ? `NUKE? ${this.pressWord} AGAIN`
        : st.armed === 'menu'
          ? `LEAVE? ${this.pressWord} AGAIN`
          : st.paused
            ? 'PAUSED'
            : st.fast
              ? 'FAST x3'
              : '',
    );
    setText(this.outEl, String(game.alive));
    const home = pct(game.saved, lv.count);
    const need = pct(lv.required, lv.count);
    setText(this.homeEl, `${home}%`);
    this.homeEl.classList.toggle('ok', game.saved >= lv.required);
    setText(this.needEl, `${need}%`);
    setText(this.timeEl, fmtTime(game.timeLeft));
    this.timeEl.classList.toggle('low', game.timeLeft < 30 && game.status === 'playing');

    // toolbar
    setText(this.rateEl, String(game.releaseRate));
    this.rateDn.disabled = game.releaseRate <= lv.releaseRate;
    for (const [s, { btn, count }] of this.skillEls) {
      const n = game.skillsLeft[s] ?? 0;
      setText(count, String(n));
      btn.disabled = n <= 0;
      btn.classList.toggle('selected', st.selected === s);
    }
    this.pauseBtn.classList.toggle('on', st.paused);
    this.fastBtn.classList.toggle('on', st.fast);
    this.nukeBtn.disabled = st.nuked || game.status !== 'playing';
    this.nukeBtn.classList.toggle('armed', st.armed === 'nuke');
    setText(this.nukeLabel, st.armed === 'nuke' ? 'SURE?' : 'NUKE');
    this.menuBtn.classList.toggle('armed', st.armed === 'menu');
    setText(this.menuBtn, st.armed === 'menu' ? 'SURE?' : 'MENU');
    if (this.zoomShown !== st.zoomed) {
      this.zoomShown = st.zoomed;
      this.zoomBtn.innerHTML = pixelSvg(st.zoomed ? ICONS.zoomOut : ICONS.zoomIn);
      this.zoomBtn.classList.toggle('on', st.zoomed);
      this.zoomBtn.title = st.zoomed ? 'Zoom out [Z] (or double-tap empty ground)' : 'Zoom 2x [Z] (or double-tap empty ground)';
    }
    const fs = isFullscreen();
    if (this.fsBtn && this.fsShown !== fs) {
      this.fsShown = fs;
      this.fsBtn.innerHTML = pixelSvg(fs ? FS_ICONS.exit : FS_ICONS.enter);
      this.fsBtn.title = fs ? 'Exit fullscreen' : 'Fullscreen';
    }
    if (this.mutedShown !== st.muted) {
      this.mutedShown = st.muted;
      this.muteBtn.innerHTML = pixelSvg(st.muted ? ICONS.muted : ICONS.sound);
      this.muteBtn.classList.toggle('on', st.muted);
    }
  }

  destroy(): void {
    this.bag.dispose();
  }
}
