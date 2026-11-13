import { VIEW_W } from '../types';

// Logical frame every menu screen fits in.
export const FRAME_W = 488;
export const FRAME_H = 340;

let scale = 1;

export function currentScale(): number {
  return scale;
}

// #app content box: viewport minus safe-area padding (notches).
export function availableSize(): { w: number; h: number } {
  const app = document.getElementById('app');
  if (!app) return { w: window.innerWidth, h: window.innerHeight };
  const cs = getComputedStyle(app);
  const w = app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  let h = app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  // phone soft keyboard shrinks only the visual viewport
  const vv = window.visualViewport;
  if (vv && vv.height < h) h = vv.height;
  return { w, h };
}

// Integer once 2x fits; below that fractional so phones fill the screen.
export function fitScale(fit: number): number {
  return fit >= 2 ? Math.floor(fit) : Math.max(0.5, Math.floor(fit * 100) / 100);
}

function apply(): void {
  const { w, h } = availableSize();
  scale = fitScale(Math.min((w - 8) / FRAME_W, (h - 8) / FRAME_H));
  document.documentElement.style.setProperty('--s', String(scale));
}

// Calls fn on resize, rotation and mobile URL-bar/keyboard changes; returns an unsubscribe.
export function onLayoutChange(fn: () => void): () => void {
  const vv = window.visualViewport;
  window.addEventListener('resize', fn);
  window.addEventListener('orientationchange', fn);
  vv?.addEventListener('resize', fn);
  return () => {
    window.removeEventListener('resize', fn);
    window.removeEventListener('orientationchange', fn);
    vv?.removeEventListener('resize', fn);
  };
}

// Sets --s (CSS scale) on :root; every UI size is calc(var(--px) * n).
export function initScale(): void {
  apply();
  onLayoutChange(apply);
}

// Backing-store factor for a VIEW_W-wide canvas shown at cssW px.
// Integer scales stay 1:1 + pixelated; fractional ones render at a higher integer res and downsample.
export function canvasRes(cssW: number): { k: number; smooth: boolean } {
  const f = cssW / VIEW_W;
  if (Math.abs(f - Math.round(f)) < 0.01 && f >= 1) return { k: 1, smooth: false };
  return { k: Math.min(4, Math.max(1, Math.ceil(f * (window.devicePixelRatio || 1)))), smooth: true };
}

export function isTouchDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}
