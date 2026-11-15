// A cross-shaped D-pad plus one action button for phones. Feeds the same Input as the keyboard.
import type { Input, Key } from './kit.tsx';

function Btn({ input, k, label, cls }: { input: Input; k: Key; label: string; cls: string }) {
  return (
    <button
      type="button"
      className={`gh-btn ${cls}`}
      aria-label={k}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        input.press(k);
      }}
      onPointerUp={() => input.release(k)}
      onPointerCancel={() => input.release(k)}
      onLostPointerCapture={() => input.release(k)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

export function GhPad({ input, action, glow }: { input: Input; action: string; glow?: boolean }) {
  return (
    <div className="gh-pad">
      <div className="gh-dpad">
        <Btn input={input} k="up" label="▲" cls="up" />
        <Btn input={input} k="left" label="◀" cls="left" />
        <Btn input={input} k="right" label="▶" cls="right" />
        <Btn input={input} k="down" label="▼" cls="down" />
      </div>
      <Btn input={input} k="action" label={action} cls={`act ${glow ? 'glow' : ''}`} />
    </div>
  );
}
