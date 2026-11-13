// Typing input: physical keys via keydown, phone soft keyboards via a hidden <input>.
import { Bag } from './dom';

export interface TypingOpts {
  onChar(ch: string): void;
  onEscape(): void;
  enabled(): boolean; // false while paused / finished
  onDeviceKeyboard(active: boolean): void;
}

const DEDUPE_MS = 80; // same char from keydown and input = one keystroke

export class TypingInput {
  readonly field: HTMLInputElement;
  private readonly bag = new Bag();
  private readonly opts: TypingOpts;
  private lastKey = '';
  private lastKeyAt = 0;
  private composed = ''; // composition text already fed
  private fed = false;

  constructor(host: HTMLElement, opts: TypingOpts) {
    this.opts = opts;
    const f = document.createElement('input');
    f.className = 'device-input';
    f.type = 'text';
    f.setAttribute('autocomplete', 'off');
    f.setAttribute('autocorrect', 'off');
    f.setAttribute('autocapitalize', 'off');
    f.setAttribute('spellcheck', 'false');
    f.setAttribute('enterkeyhint', 'next');
    f.setAttribute('aria-label', 'Type here');
    f.tabIndex = -1;
    this.field = f;
    host.append(f);

    this.bag.on<KeyboardEvent>(window, 'keydown', (e) => this.onKeyDown(e));
    this.bag.on<InputEvent>(f, 'beforeinput', (e) => this.onBeforeInput(e));
    this.bag.on<InputEvent>(f, 'input', (e) => this.onInput(e));
    this.bag.on(f, 'compositionend', () => this.reset());
    this.bag.on(f, 'focus', () => opts.onDeviceKeyboard(true));
    this.bag.on(f, 'blur', () => opts.onDeviceKeyboard(false));
  }

  get deviceActive(): boolean {
    return document.activeElement === this.field;
  }

  focusDevice(): void {
    this.field.focus({ preventScroll: true });
  }

  blurDevice(): void {
    this.field.blur();
  }

  dispose(): void {
    this.bag.dispose();
    this.field.remove();
  }

  private feed(ch: string, fromKey: boolean): void {
    const now = performance.now();
    if (fromKey) {
      this.lastKey = ch;
      this.lastKeyAt = now;
    } else if (ch === this.lastKey && now - this.lastKeyAt < DEDUPE_MS) {
      this.lastKey = '';
      return;
    }
    this.opts.onChar(ch);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (!e.repeat) this.opts.onEscape();
      e.preventDefault();
      return;
    }
    const altGr = e.getModifierState?.('AltGraph');
    if ((e.ctrlKey || e.metaKey || e.altKey) && !altGr) return;
    if (e.key.length !== 1) return; // Shift, Tab, Dead, Unidentified (soft keyboards) ...
    if (!this.opts.enabled()) {
      // paused: let Space/Enter work menu buttons, but never type into the hidden field
      if (document.activeElement === this.field) e.preventDefault();
      return;
    }
    e.preventDefault(); // no page scroll on space, no quick-find on ' and /
    if (e.repeat) return;
    let ch = e.key;
    // some synthetic/remote keyboards report Shift+o as 'o'
    if (e.shiftKey && ch >= 'a' && ch <= 'z' && !e.getModifierState?.('CapsLock')) ch = ch.toUpperCase();
    this.feed(ch, true);
  }

  private onBeforeInput(e: InputEvent): void {
    if (!this.opts.enabled()) {
      if (e.cancelable) e.preventDefault();
      return;
    }
    if (e.inputType === 'insertText' && e.data) {
      for (const ch of e.data) this.feed(ch, false);
      this.composed = '';
      if (e.cancelable) e.preventDefault();
      else this.fed = true; // the input event that follows is already handled
      return;
    }
    if (e.inputType !== 'insertCompositionText' && e.cancelable) e.preventDefault();
  }

  // Composition (Android IMEs): feed only what was appended since last time.
  private onInput(e: InputEvent): void {
    if (this.fed) {
      this.fed = false;
      this.field.value = '';
      return;
    }
    const v = this.field.value;
    if (this.opts.enabled() && v.startsWith(this.composed) && v.length > this.composed.length) {
      for (const ch of v.slice(this.composed.length)) this.feed(ch, false);
    }
    this.composed = v;
    if (!e.isComposing) this.reset();
  }

  private reset(): void {
    this.composed = '';
    this.field.value = '';
  }
}
