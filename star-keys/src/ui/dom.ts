// Small DOM helpers shared by screens.

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Mouse clicks drop focus so a later Space/Enter keeps typing instead of re-clicking.
export function button(cls: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', (e) => {
    if (e.detail > 0) b.blur();
    onClick();
  });
  return b;
}

// Avoids DOM writes when unchanged (called every frame).
export function setText(el: HTMLElement, s: string): void {
  if (el.textContent !== s) el.textContent = s;
}

export function fmtTime(sec: number): string {
  const t = Math.max(0, Math.round(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// Inline SVG from a '#'-bitmap, for chunky pixel icons.
export function pixelSvg(rows: string[], cls = 'picon'): string {
  const w = Math.max(...rows.map((r) => r.length));
  let rects = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  });
  const size = `width:calc(var(--px) * ${w});height:calc(var(--px) * ${rows.length})`;
  return `<svg class="${cls}" viewBox="0 0 ${w} ${rows.length}" style="${size}" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${rects}</svg>`;
}

export const ICONS = {
  star: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '##...##'],
  pause: ['##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##'],
  play: ['#....', '##...', '###..', '####.', '###..', '##...', '#....'],
  sound: ['...#....', '..##..#.', '####...#', '####.#.#', '####...#', '..##..#.', '...#....'],
  mute: ['...#....', '..##....', '####.#.#', '####..#.', '####.#.#', '..##....', '...#....'],
  keys: ['#########', '#.#.#.#.#', '#########', '##.#.#.##', '#########', '#..###..#', '#########'],
  phone: ['#####', '#...#', '#...#', '#...#', '#...#', '#####', '##.##'],
  fsEnter: ['##...##', '#.....#', '.......', '.......', '.......', '#.....#', '##...##'],
  fsExit: ['.#...#.', '##...##', '.......', '.......', '.......', '##...##', '.#...#.'],
};

// Collects listeners/timers so a screen can tear down in one call.
export class Bag {
  private fns: (() => void)[] = [];
  on<T extends Event>(target: EventTarget, type: string, fn: (e: T) => void, opts?: AddEventListenerOptions): void {
    const l = fn as EventListener;
    target.addEventListener(type, l, opts);
    this.fns.push(() => target.removeEventListener(type, l, opts));
  }
  add(fn: () => void): void {
    this.fns.push(fn);
  }
  dispose(): void {
    for (const f of this.fns.splice(0)) f();
  }
}

// Pixel stars row (earned ones lit).
export function starsHtml(n: number, of = 3, cls = 'stars'): string {
  let s = `<span class="${cls}">`;
  for (let i = 0; i < of; i++) s += `<span class="st${i < n ? ' on' : ''}">${pixelSvg(ICONS.star)}</span>`;
  return s + '</span>';
}
