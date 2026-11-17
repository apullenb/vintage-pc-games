// Phishing Invaders: the messages (scams and the real ones), the wave schedule and scoring.
// Pure data and functions so it can be unit tested. Text uses the pixel font's character set
// (A-Z 0-9 and - : $ % ! . / & ' + # ? , @ _ ( ) = * < > ").

export type Channel = 'sms' | 'email' | 'dm' | 'app';
export interface Msg {
  ch: Channel;
  from: string; // <= 15 chars
  l1: string; // <= 17 chars
  l2: string; // <= 17 chars
  scam: boolean;
  why: string; // the tiny lesson shown when it's hit or lands
  flag: 0 | 1 | 2; // which line holds the red flag (0 = sender)
  move?: 'zig' | 'rush'; // zigzags, or speeds up as it falls (urgency!)
  hp?: number;
}

export const SCAMS: Msg[] = [
  { ch: 'email', from: 'ALERT@BANKK.CO', l1: 'ACCOUNT LOCKED!', l2: 'CLICK: BIT.LY/X9Z', scam: true, why: 'WEIRD LINK!', flag: 2, move: 'rush' },
  { ch: 'sms', from: '+1 555-0199', l1: 'YOU WON A $500', l2: 'GIFT CARD!! TAP>', scam: true, why: 'TOO GOOD = FAKE', flag: 1 },
  { ch: 'sms', from: 'USPS-DLVR.CO', l1: 'PKG ON HOLD. PAY', l2: '$1.99 FEE TODAY', scam: true, why: 'NOT USPS.COM!', flag: 0 },
  { ch: 'dm', from: '@CRYPTO_KING99', l1: 'TURN $50 INTO', l2: '$5,000 THIS WEEK', scam: true, why: 'GET-RICH SCAM!', flag: 2, move: 'zig', hp: 2 },
  { ch: 'sms', from: '+1 347-555-0110', l1: 'HI ITS YOUR BOSS', l2: 'BUY 3 GIFT CARDS', scam: true, why: 'BOSS? WEIRD #!', flag: 2 },
  { ch: 'email', from: 'NETFLX-BILLING', l1: 'PAYMENT FAILED!', l2: 'UPDATE CARD NOW', scam: true, why: 'FAKE DOMAIN!', flag: 0 },
  { ch: 'sms', from: 'IRS-REFUND.NET', l1: 'TAX REFUND $812', l2: 'VERIFY SSN HERE', scam: true, why: "IRS DOESN'T TEXT", flag: 2 },
  { ch: 'dm', from: '@JOBS4U_NOW', l1: 'EARN $900/DAY', l2: 'FROM HOME! DM ME', scam: true, why: 'TOO GOOD = FAKE', flag: 1, move: 'zig' },
  { ch: 'email', from: 'APPLEID-HELP.RU', l1: 'ID SUSPENDED!!', l2: 'LOG IN IN 1 HOUR', scam: true, why: 'URGENCY TRICK!', flag: 2, move: 'rush' },
  { ch: 'sms', from: '+1 212-555-0187', l1: 'URGENT: YOUR ACCT', l2: 'CLOSES TONIGHT!', scam: true, why: 'URGENCY TRICK!', flag: 1, move: 'rush' },
  { ch: 'sms', from: 'TOLL-PAY-OR.COM', l1: 'UNPAID TOLL $4.15', l2: 'PAY NOW OR FINE', scam: true, why: 'FAKE TOLL TEXT', flag: 0 },
  { ch: 'email', from: 'FREE-IPHONE.WIN', l1: 'CLAIM YOUR PRIZE', l2: 'JUST PAY SHIPPING', scam: true, why: 'PRIZE = SCAM', flag: 1, move: 'zig' },
  { ch: 'sms', from: '+1 646-555-0144', l1: 'HI HONEY NEW #!', l2: 'SEND $200 PLS', scam: true, why: 'IMPOSTER!', flag: 0 },
  { ch: 'email', from: 'VENM0-ALERTS', l1: 'YOU GOT $350!', l2: 'CONFIRM W/ PIN', scam: true, why: 'NEVER SHARE A PIN', flag: 2 },
  { ch: 'dm', from: '@REAL_RAE_2', l1: 'IS THIS U IN', l2: 'THIS VID?? LOL', scam: true, why: 'HACKED ACCOUNT', flag: 0, move: 'zig' },
  { ch: 'email', from: 'HR@PAYR0LL.BIZ', l1: 'UPDATE DIRECT', l2: 'DEPOSIT INFO NOW', scam: true, why: 'FAKE PAYROLL', flag: 0 },
];

// The real ones. {BOSS} is replaced with your boss's name.
export const REALS: Msg[] = [
  { ch: 'sms', from: 'MOM', l1: 'DINNER SUNDAY?', l2: 'BRING TUPPERWARE', scam: false, why: 'REAL: MOM', flag: 0 },
  { ch: 'email', from: 'DR. PARK DENTAL', l1: 'CLEANING TUE 3PM', l2: 'REPLY C=CONFIRM', scam: false, why: 'REAL REMINDER', flag: 0 },
  { ch: 'app', from: 'YOUR BANK APP', l1: 'STATEMENT READY', l2: 'VIEW IN THE APP', scam: false, why: 'REAL BANK APP', flag: 0 },
  { ch: 'sms', from: '{BOSS}', l1: 'SHIFT MOVED TO', l2: 'TUES 9AM. THX!', scam: false, why: 'REAL BOSS', flag: 0 },
  { ch: 'dm', from: 'RAE', l1: 'MOVIE FRI? I GOT', l2: 'THE TICKETS', scam: false, why: 'REAL FRIEND', flag: 0 },
  { ch: 'sms', from: 'LANDLORD', l1: 'WATER OFF 9-11AM', l2: 'FOR REPAIRS', scam: false, why: 'REAL LANDLORD', flag: 0 },
  { ch: 'app', from: 'PINE PHARMACY', l1: 'YOUR RX IS READY', l2: 'FOR PICKUP', scam: false, why: 'REAL PHARMACY', flag: 0 },
  { ch: 'app', from: 'WORK SCHEDULE', l1: 'NEXT WEEK IS', l2: 'POSTED IN APP', scam: false, why: 'REAL WORK APP', flag: 0 },
  { ch: 'sms', from: 'GRANDMA', l1: 'SO PROUD OF YOU', l2: 'LOVE YOU!!', scam: false, why: 'REAL: GRANDMA', flag: 0 },
  { ch: 'email', from: 'DMV.OREGON.GOV', l1: 'APPOINTMENT SET', l2: 'THU 10:30AM', scam: false, why: 'REAL .GOV SITE', flag: 0 },
];

// Chain-letter minis the boss spits out (one line each).
export const MINIS = ['CLAIM $$$ NOW', 'FWD TO 10 PPL', 'WIN A CRUISE!', 'FWD:FWD:PRIZE', 'ACT NOW!!!', 'FREE $1,000!', 'U R SELECTED', 'FWD: LUCKY U!'];

export function bossName(name: string): string {
  const n = name.toUpperCase().replace(/[^A-Z0-9 .'()-]/g, '');
  return n.length <= 15 ? n : n.split(' ')[0].slice(0, 15);
}

export interface Spawn {
  at: number; // seconds after GO
  msg: Msg;
  speed: number; // px/s fall speed
  wave: number;
}

export const WAVES = [
  { start: 0, gap: 2.1, speed: 15, scams: 4, reals: 2 },
  { start: 13, gap: 1.5, speed: 20, scams: 7, reals: 2 },
  { start: 27, gap: 1.15, speed: 25, scams: 9, reals: 3 },
];
export const BOSS_AT = 43;
export const GAME_LEN = 62; // hard stop

// The whole schedule for one run. The first two messages teach: one obvious scam, then Mom.
export function buildSchedule(r: () => number, boss: string): Spawn[] {
  const pickN = <T,>(src: T[], n: number): T[] => {
    const a = [...src];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, n);
  };
  const reals = REALS.map((m) => (m.from === '{BOSS}' ? { ...m, from: bossName(boss) || 'YOUR BOSS' } : m));
  const easy = SCAMS[1];
  const mom = reals[0];
  const scamPool = pickN(SCAMS.filter((m) => m !== easy), 16);
  const realPool = pickN(reals.filter((m) => m !== mom), 9);
  const out: Spawn[] = [];
  WAVES.forEach((w, wi) => {
    const first = wi === 0 ? [easy, mom] : [];
    const rest: Msg[] = [];
    for (let i = first.length ? 1 : 0; i < w.scams; i++) rest.push(scamPool.shift() ?? SCAMS[i % SCAMS.length]);
    for (let i = first.length ? 1 : 0; i < w.reals; i++) rest.push(realPool.shift() ?? reals[i % reals.length]);
    const msgs = [...first, ...pickN(rest, rest.length)];
    msgs.forEach((m, i) => out.push({ at: w.start + i * w.gap + (i ? (r() - 0.5) * 0.4 : 0), msg: m, speed: w.speed, wave: wi + 1 }));
  });
  // a few real messages still come in during the boss fight
  const bossReals = realPool.splice(0, 3);
  bossReals.forEach((m, i) => out.push({ at: BOSS_AT + 1.5 + i * 3, msg: m, speed: 28, wave: 4 }));
  return out.sort((a, b) => a.at - b.at);
}

export interface PhishStats {
  scamsHit: number;
  scamsMissed: number;
  realShot: number;
  realSaved: number;
  linksClicked: number;
}

// Blocking scams matters most, but shooting your real messages drags the whole thing down, so
// spraying at everything doesn't pay. All right = 1.0; ~85% on both = ~0.75; spray-and-pray ~0.35.
export function phishScore(st: PhishStats): number {
  const scams = st.scamsHit + st.scamsMissed;
  const reals = st.realShot + st.realSaved;
  if (!scams && !reals) return 0;
  const scamAcc = scams ? st.scamsHit / scams : 1;
  const realAcc = reals ? st.realSaved / reals : 1;
  const raw = Math.pow(scamAcc, 0.85) * (0.35 + 0.65 * realAcc) - Math.min(0.1, 0.02 * st.linksClicked);
  return Math.round(Math.max(0, Math.min(1, raw)) * 1000) / 1000;
}
