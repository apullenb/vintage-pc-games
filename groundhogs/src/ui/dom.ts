// Small DOM helpers shared by screens.

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function button(cls: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

// Avoids DOM writes when unchanged (called every frame).
export function setText(el: HTMLElement, s: string): void {
  if (el.textContent !== s) el.textContent = s;
}

export function fmtTime(sec: number): string {
  const t = Math.max(0, Math.ceil(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function pct(n: number, total: number): number {
  return total > 0 ? Math.floor((n * 100) / total) : 0;
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
