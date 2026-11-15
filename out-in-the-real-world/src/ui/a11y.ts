// Accessibility preferences that come from the device rather than the player.
export function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// Larger reading text is a class on <html> so every screen (title, modals) picks it up.
export function applyBigText(on: boolean): void {
  document.documentElement.classList.toggle('big-text', on);
}
