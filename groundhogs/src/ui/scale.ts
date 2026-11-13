import { VIEW_H, VIEW_W } from '../types';

// Logical frame every screen fits in: play view + borders + status + toolbar.
export const FRAME_W = VIEW_W + 8;
export const FRAME_H = VIEW_H + 66;

let scale = 1;

export function currentScale(): number {
  return scale;
}

// #app content box: viewport minus safe-area padding (notches).
export function availableSize(): { w: number; h: number } {
  const app = document.getElementById('app');
  if (!app) return { w: window.innerWidth, h: window.innerHeight };
  const cs = getComputedStyle(app);
  return {
    w: app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    h: app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
  };
}

// How many times the logical frame fits (fractional).
export function frameFit(): number {
  const { w, h } = availableSize();
  return Math.min((w - 8) / FRAME_W, (h - 8) / FRAME_H);
}

// Integer once 2x fits; below that fractional so phones fill the screen.
function apply(): void {
  const fit = frameFit();
  scale = fit >= 2 ? Math.floor(fit) : Math.max(0.5, Math.floor(fit * 100) / 100);
  document.documentElement.style.setProperty('--s', String(scale));
}

// Calls fn on resize, rotation and mobile URL-bar changes; returns an unsubscribe.
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
// Integer scales stay 1:1 + pixelated; fractional ones render at a higher
// integer res and let the browser downsample, avoiding uneven pixels.
export function canvasRes(cssW: number): { k: number; smooth: boolean } {
  const f = cssW / VIEW_W;
  if (Math.abs(f - Math.round(f)) < 0.01 && f >= 1) return { k: 1, smooth: false };
  return { k: Math.min(4, Math.max(1, Math.ceil(f * (window.devicePixelRatio || 1)))), smooth: true };
}

export function isTouchDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}
