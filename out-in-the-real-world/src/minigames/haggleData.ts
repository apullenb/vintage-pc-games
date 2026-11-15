// Haggle: the moves you can make, what the other side says, and how a round is scored.

export interface Tactic {
  id: string;
  label: string;
  hint: string;
  base: number; // share of the price (or raise) this move is worth when it lands
  cost: number; // patience it burns (rapport moves restore it instead)
  risky?: boolean; // a bluff: backfires if they're already annoyed
  rapport?: boolean; // reusable, calms them down
  tells: string[]; // things they say that this move answers
  win: string; // their line when it lands
}

export interface Side {
  who: string;
  opener: string;
  soft: string;
  pushy: string;
  bluffCalled: string;
  done: string;
  tactics: Tactic[];
}

export const CAR: Side = {
  who: 'Dealer',
  opener: 'So, you like her? $2,400 and she’s all yours.',
  soft: 'That’s it? Not really moving me.',
  pushy: 'Whoa. Easy there, kid.',
  bluffCalled: 'Then go. Door’s right there.',
  done: 'That’s it. I’m done haggling.',
  tactics: [
    {
      id: 'mech',
      label: 'Mechanic’s report',
      hint: '“Needs tires soon.” Answers “perfect shape” talk.',
      base: 0.033,
      cost: 18,
      tells: ['She runs like a dream. Not a thing wrong with her.', 'Those tires? They’ve got years left in ’em.'],
      win: '…Tires, huh. Okay. Fair point.',
    },
    {
      id: 'comps',
      label: 'Show cheaper listings',
      hint: 'Similar cars online for less. Answers “best deal in town.”',
      base: 0.03,
      cost: 16,
      tells: ['You won’t find a better deal in this whole town.', 'Honestly, this is already under book value.'],
      win: 'Those are older models… but fine. I hear you.',
    },
    {
      id: 'cash',
      label: 'Offer cash today',
      hint: 'A seller who needs a quick sale loves cash.',
      base: 0.03,
      cost: 12,
      tells: ['I gotta move some cars before the month ends.', 'Financing paperwork is such a headache, you know?'],
      win: 'Cash today? Now you’re talking.',
    },
    {
      id: 'walk',
      label: 'Walk toward the door',
      hint: 'Calls a bluff. Backfires if they’re already annoyed.',
      base: 0.042,
      cost: 26,
      risky: true,
      tells: ['I’ve got another buyer coming at three.', 'A price like this won’t last, kid.'],
      win: 'Whoa, whoa! Come back. Let’s talk.',
    },
    {
      id: 'chat',
      label: 'Friendly small talk',
      hint: 'Calms them down. A small win.',
      base: 0.009,
      cost: -22,
      rapport: true,
      tells: ['Long day. Everybody’s been lowballing me.', 'Sorry. It’s been a crazy week on the lot.'],
      win: 'Ha. Yeah. You’re alright, kid.',
    },
  ],
};

export const RAISE: Side = {
  who: 'Boss',
  opener: 'You wanted to talk? What’s up?',
  soft: 'Mm-hm. Anything else?',
  pushy: 'Okay, watch the tone.',
  bluffCalled: 'Then maybe you should take it.',
  done: 'I think we’re done here.',
  tactics: [
    {
      id: 'wins',
      label: 'List your wins',
      hint: 'Specific things you did. Answers “what have you done?”',
      base: 0.033,
      cost: 16,
      tells: ['So… remind me what you’ve been working on?', 'Raises are for people who go above and beyond.'],
      win: 'You did train the new hires. That’s true.',
    },
    {
      id: 'market',
      label: 'Show what others pay',
      hint: 'Job posts with higher pay. Answers “that’s the going rate.”',
      base: 0.03,
      cost: 18,
      tells: ['Honestly, your pay is pretty standard for this job.', 'Budgets are tight. Everybody gets the same.'],
      win: 'Huh. I didn’t know they were paying that.',
    },
    {
      id: 'reliable',
      label: 'Mention reliability',
      hint: 'Never late, covers shifts. For when they need people.',
      base: 0.03,
      cost: 12,
      tells: ['Half the crew called out again this week.', 'I need people I can actually count on.'],
      win: 'You haven’t missed a shift. I noticed.',
    },
    {
      id: 'offer',
      label: 'Mention another offer',
      hint: 'Bold. Backfires if they’re already annoyed.',
      base: 0.042,
      cost: 26,
      risky: true,
      tells: ['You’re happy here, right?', 'We’d really hate to lose good people.'],
      win: 'Let’s not do anything hasty. Okay.',
    },
    {
      id: 'chat',
      label: 'Thank them first',
      hint: 'Warms them up. A small win.',
      base: 0.009,
      cost: -22,
      rapport: true,
      tells: ['Make it quick. It’s been a crazy day.', 'Sorry, I’ve only got five minutes.'],
      win: 'Thanks. That’s… nice to hear, actually.',
    },
  ],
};

export const ROUNDS = 4;
export const MAX_GAIN = 0.25; // a perfect negotiation: 25% off, or the top raise

// The delivery meter for a round: a sweet spot that moves and narrows.
export interface Meter {
  c: number; // sweet spot center
  w: number; // half width
  speed: number; // sweeps per second
}
export function meterFor(round: number, r: () => number = Math.random): Meter {
  return { c: 0.56 + r() * 0.16, w: 0.11 - round * 0.012, speed: 0.95 + round * 0.22 };
}
export type Zone = 'soft' | 'ok' | 'sweet' | 'perfect' | 'pushy';
export function zoneAt(m: Meter, p: number): Zone {
  if (p > m.c + m.w) return 'pushy';
  if (Math.abs(p - m.c) <= m.w * 0.35) return 'perfect';
  if (p >= m.c - m.w) return 'sweet';
  if (p >= m.c - m.w - 0.2) return 'ok';
  return 'soft';
}
export const QUALITY: Record<Zone, number> = { soft: 0.3, ok: 0.6, sweet: 1, perfect: 1.15, pushy: 0 };
const SHOWED_UP = 0.015; // any calm, clear ask moves things a little

export interface RoundResult {
  gain: number;
  patience: number; // change
  outcome: 'win' | 'soft' | 'pushy' | 'called' | 'ok';
}

// One move: tactic t, delivered at meter position p, against their current patience.
export function resolve(t: Tactic, matched: boolean, zone: Zone, p: number, patience: number, mult = 1): RoundResult {
  if (zone === 'pushy') return { gain: -0.008, patience: -(Math.abs(t.cost) * 1.2 + 18), outcome: 'pushy' };
  if (t.risky && patience < 45) return { gain: -0.01, patience: -15, outcome: 'called' };
  const q = QUALITY[zone];
  const gain = (t.base * (matched ? 1.6 : 1) * q + SHOWED_UP) * mult;
  const patienceDelta = t.rapport ? 22 * q : -t.cost * (0.6 + 0.8 * p);
  return { gain, patience: patienceDelta, outcome: zone === 'soft' ? 'soft' : matched && q >= 1 ? 'win' : 'ok' };
}

export const scoreOf = (gain: number): number => Math.max(0, Math.min(1, gain / MAX_GAIN));
export const PATIENCE_OUT = 0.7; // run out their patience and you keep only part of what you'd won
export const startPatience = (raise: boolean, rep: number): number => (raise ? Math.max(50, Math.min(95, Math.round(40 + rep * 0.6))) : 85);
export const repMult = (raise: boolean, rep: number): number => (raise ? 0.8 + rep / 250 : 1);

// What's on their mind this round. Annoyed people need calming first.
export function pickTell(side: Side, used: Set<string>, patience: number, r: () => number = Math.random): Tactic {
  const open = side.tactics.filter((t) => !t.rapport && !used.has(t.id));
  const calm = side.tactics.find((t) => t.rapport)!;
  return patience < 50 && r() < 0.65 ? calm : open.length ? open[Math.floor(r() * open.length)] : calm;
}
