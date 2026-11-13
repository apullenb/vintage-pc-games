// On-screen QWERTY: finger-tinted keys, next-key glow, hit flashes, tap-to-type, hand guide.
import { h } from './dom';
import type { Finger, KeyDef } from './fingers';
import { FINGER_COLOR, FINGER_NAME, fingerOf, fingerOfKey, keyName, locate, ROWS, shiftFor } from './fingers';

export interface KeyboardOpts {
  onType?: (ch: string) => void; // set = tappable
  legend?: boolean; // hand guide + next-key hint
}

// Two pixel hands: [finger, x, y, w, h] in a 64x22 box.
const HAND: [Finger, number, number, number, number][] = [
  ['L5', 2, 8, 4, 8],
  ['L4', 7, 4, 4, 12],
  ['L3', 12, 2, 4, 14],
  ['L2', 17, 4, 4, 12],
  ['thumb', 22, 13, 6, 4],
];

function handsSvg(): string {
  let s = '<svg class="hands" viewBox="0 0 64 22" shape-rendering="crispEdges" aria-hidden="true">';
  for (const mirror of [false, true]) {
    const px = mirror ? 64 - 2 - 22 : 2;
    s += `<rect class="palm" x="${px}" y="15" width="20" height="7"/>`;
    for (const [f, x, y, w, hh] of HAND) {
      const id = mirror && f !== 'thumb' ? (('R' + f.slice(1)) as Finger) : f;
      const fx = mirror ? 64 - x - w : x;
      s += `<rect class="fg" data-f="${id}" x="${fx}" y="${y}" width="${w}" height="${hh}" fill="${FINGER_COLOR[id]}"/>`;
    }
  }
  return s + '</svg>';
}

export class Keyboard {
  readonly el: HTMLDivElement;
  private readonly keys = new Map<string, HTMLDivElement>();
  private readonly hint: HTMLElement | null = null;
  private readonly hands: SVGElement | null = null;
  private nextEls: Element[] = [];
  private shiftOn = false;
  private caps = false;
  private cur: string | null | undefined = undefined; // char shown by setNext
  private readonly opts: KeyboardOpts;

  constructor(opts: KeyboardOpts = {}) {
    this.opts = opts;
    this.el = h('div', 'kb');
    const board = h('div', 'kb-board');
    for (const row of ROWS) {
      const r = h('div', 'kb-row');
      for (const key of row) r.append(this.makeKey(key));
      board.append(r);
    }
    this.el.append(board);
    if (opts.legend) {
      const legend = h('div', 'kb-legend');
      legend.innerHTML = handsSvg();
      this.hands = legend.querySelector('svg');
      this.hint = h('div', 'kb-hint');
      legend.append(this.hint);
      this.el.append(legend);
    }
    if (opts.onType) {
      this.el.classList.add('tappable');
      board.addEventListener('pointerdown', (e) => this.onPointer(e));
    }
  }

  private makeKey(key: KeyDef): HTMLDivElement {
    const el = h('div', 'key');
    el.style.gridColumn = `span ${key.span}`;
    if (key.kind === 'gap') {
      el.className = 'key gap';
      return el;
    }
    el.dataset.k = key.id;
    const f = key.base ? fingerOf(key.base) : fingerOfKey(key.id);
    el.style.setProperty('--fc', FINGER_COLOR[f]);
    if (key.kind) el.classList.add(key.kind === 'shiftL' || key.kind === 'shiftR' ? 'shift' : key.kind);
    if (key.label) {
      el.append(h('span', 'lbl', key.label));
    } else if (key.shift === key.base.toUpperCase() && key.base !== key.shift) {
      el.append(h('span', 'cap', key.shift));
    } else {
      el.classList.add('sym');
      el.append(h('span', 'up', key.shift), h('span', 'dn', key.base));
    }
    if (key.id === 'f' || key.id === 'j') el.classList.add('bump');
    this.keys.set(key.id, el);
    return el;
  }

  private onPointer(e: PointerEvent): void {
    const el = (e.target as Element).closest<HTMLDivElement>('.key');
    e.preventDefault(); // keep focus where it is (phone keyboard input)
    if (!el || !el.dataset.k) return;
    const id = el.dataset.k;
    el.animate([{ transform: 'translateY(var(--kpress))' }, { transform: 'none' }], { duration: 120 });
    if (id === 'shiftL' || id === 'shiftR') {
      this.shiftOn = !this.shiftOn;
      this.syncShift();
      return;
    }
    if (id === 'caps') {
      this.caps = !this.caps;
      this.syncShift();
      return;
    }
    const loc = locate(id);
    if (!loc) return;
    const k = loc.key;
    const isLetter = k.base !== k.shift && k.shift === k.base.toUpperCase();
    const up = isLetter ? this.shiftOn !== this.caps : this.shiftOn;
    const ch = up ? k.shift : k.base;
    if (this.shiftOn) {
      this.shiftOn = false;
      this.syncShift();
    }
    this.opts.onType?.(ch);
  }

  private syncShift(): void {
    this.keys.get('shiftL')?.classList.toggle('on', this.shiftOn);
    this.keys.get('shiftR')?.classList.toggle('on', this.shiftOn);
    this.keys.get('caps')?.classList.toggle('on', this.caps);
    this.el.classList.toggle('upper', this.shiftOn !== this.caps);
  }

  keyEl(ch: string): HTMLDivElement | undefined {
    const loc = locate(ch);
    return loc ? this.keys.get(loc.key.id) : undefined;
  }

  // Glow the key (and the right Shift) for the expected char.
  setNext(ch: string | null): void {
    if (ch === this.cur) return;
    this.cur = ch;
    for (const e of this.nextEls) e.classList.remove('next');
    this.nextEls = [];
    if (ch !== null) {
      const el = this.keyEl(ch);
      if (el) this.nextEls.push(el);
      const sh = shiftFor(ch);
      const sEl = sh ? this.keys.get(sh) : undefined;
      if (sEl) this.nextEls.push(sEl);
    }
    const f = ch !== null ? fingerOf(ch) : null;
    if (this.hands) {
      for (const r of this.hands.querySelectorAll('.fg')) r.classList.toggle('on', r.getAttribute('data-f') === f);
      if (ch !== null && shiftFor(ch)) {
        const sf = shiftFor(ch) === 'shiftL' ? 'L5' : 'R5';
        this.hands.querySelector(`[data-f="${sf}"]`)?.classList.add('on');
      }
    }
    if (this.hint) {
      if (ch === null || !f) {
        this.hint.textContent = '';
      } else {
        const shift = shiftFor(ch) ? ` + ${shiftFor(ch) === 'shiftL' ? 'left' : 'right'} shift` : '';
        this.hint.innerHTML = '';
        const key = h('b', 'kb-hint-key', keyName(ch));
        key.style.setProperty('--fc', FINGER_COLOR[f]);
        this.hint.append(key, h('span', '', `${FINGER_NAME[f]}${shift}`));
      }
    }
    for (const e of this.nextEls) e.classList.add('next');
  }

  flash(ch: string, ok: boolean): void {
    const el = this.keyEl(ch);
    if (!el) return;
    el.classList.remove('hit-ok', 'hit-bad');
    void el.offsetWidth; // restart the animation
    el.classList.add(ok ? 'hit-ok' : 'hit-bad');
  }

  mark(chars: Iterable<string>, cls: string): void {
    for (const c of chars) this.keyEl(c)?.classList.add(cls);
  }

  // Dim every typing key not in `chars`.
  dimExcept(chars: string): void {
    const keep = new Set<string>();
    for (const c of chars) {
      const loc = locate(c);
      if (loc) keep.add(loc.key.id);
    }
    for (const [id, el] of this.keys) {
      const typing = id.length === 1;
      if (typing && !keep.has(id)) el.classList.add('dim');
    }
  }

  badge(ch: string, text: string): void {
    const el = this.keyEl(ch);
    if (el) el.append(h('i', 'badge', text));
  }
}
