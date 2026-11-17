// Phishing Invaders: shoot down scam messages, let the real ones through.
import { achieve, charge, money, unlock } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const phishing: MiniGameDef = {
  id: 'phishing',
  title: 'Phishing Invaders',
  how: 'Slide left and right (arrows, A/D, or drag) and fire with SPACE or a tap. Blast the scam messages (fake prizes, fake package fees, “urgent” bank alerts with weird links) but let real messages from your boss, your bank, and your mom land safely.',
  stakes: 'Let a scam through and it can cost you money. Shoot a real message and you miss something important.',
  art: 'apartment',
  apply: (s, r) => {
    unlock(s, 'scams');
    if (r.score >= 0.7) {
      achieve(s, 'scamdodger');
      return { text: 'Inbox zero. Every scam blocked, every real message read. Your phone has never been cleaner.' };
    }
    const lost = r.score >= 0.4 ? 25 : 120;
    charge(s, lost, 'Scam charge');
    return {
      text: `A scam slipped through. ${r.score >= 0.4 ? 'A sketchy “subscription”' : 'A fake bank alert'} cost you ${money(lost)} before you caught it.`,
      tip: 'Real companies don’t ask for passwords or payments by text. When in doubt, go to the official app or website yourself.',
    };
  },
};
