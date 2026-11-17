// Phishing Invaders: shoot down scam messages, let the real ones through.
import { achieve, charge, money, rep, unlock } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const phishing: MiniGameDef = {
  id: 'phishing',
  title: 'Phishing Invaders',
  how: 'Slide left and right (arrows or A/D, or drag on a phone) and fire with SPACE (hold for auto) or a tap. Blast the scam messages: fake prizes, fake package fees, “urgent” bank alerts, weird links and misspelled senders. Let the real ones from your boss, your bank app and your mom land in your inbox. Dodge the phishing links scams drop, and watch out for the giant chain letter at the end.',
  stakes: 'Let scams through and they can cost you money. Shoot a real message and you miss something important.',
  art: 'apartment',
  apply: (s, r) => {
    unlock(s, 'scams');
    const st = r.stats;
    const missed = st ? st.scamsMissed : r.score >= 0.4 ? 2 : 6;
    const shotReal = st ? st.realShot : 0;
    const parts: string[] = [];
    if (r.score >= 0.7 && missed <= 2) {
      achieve(s, 'scamdodger');
      parts.push('Inbox zero. Scams blocked, real messages read. Your phone has never been cleaner.');
    } else {
      const lost = Math.max(15, Math.min(120, missed * 15));
      charge(s, lost, 'Scam charge');
      parts.push(`${missed > 1 ? `${missed} scams` : 'A scam'} slipped through. ${r.score >= 0.4 ? 'A sketchy “subscription”' : 'A fake bank alert'} cost you ${money(lost)} before you caught it.`);
    }
    if (shotReal >= 2) {
      rep(s, -2);
      parts.push('You also deleted the text about your shift moving. Your boss noticed.');
    }
    return {
      text: parts.join(' '),
      tip: 'Real companies don’t ask for passwords, PINs or payments by text. Red flags: urgency, prizes, gift cards, odd links and misspelled senders. When in doubt, open the official app or website yourself.',
    };
  },
};
