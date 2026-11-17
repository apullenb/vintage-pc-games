import { describe, expect, it } from 'vitest';
import { BOSS_AT, bossName, buildSchedule, GAME_LEN, MINIS, phishScore, REALS, SCAMS } from './phishData.ts';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// The pixel font (plus the extra glyphs the game adds).
const OK = /^[A-Z0-9 \-:$%!.\/&'+#?,@_()=*<>"]*$/;

describe('phishing messages', () => {
  it('fit on a card and only use characters the pixel font can draw', () => {
    for (const m of [...SCAMS, ...REALS]) {
      expect(m.from.length, m.from).toBeLessThanOrEqual(15);
      expect(m.l1.length, m.l1).toBeLessThanOrEqual(17);
      expect(m.l2.length, m.l2).toBeLessThanOrEqual(17);
      for (const s of [m.from, m.l1, m.l2, m.why]) if (s !== '{BOSS}') expect(s, s).toMatch(OK);
    }
    for (const s of MINIS) {
      expect(s.length).toBeLessThanOrEqual(13);
      expect(s).toMatch(OK);
    }
    expect(SCAMS.every((m) => m.scam)).toBe(true);
    expect(REALS.every((m) => !m.scam)).toBe(true);
  });
  it('shortens long boss names to fit the sender line', () => {
    expect(bossName('Dee (foreman)')).toBe('DEE (FOREMAN)');
    expect(bossName('Library supervisor').length).toBeLessThanOrEqual(15);
  });
});

describe('phishing schedule', () => {
  it('opens with an obvious scam then Mom, mixes in real messages, and fits before the boss', () => {
    for (let seed = 1; seed < 50; seed++) {
      const sc = buildSchedule(rng(seed), 'Store manager');
      expect(sc[0].msg.scam).toBe(true);
      expect(sc[1].msg.from).toBe('MOM');
      const pre = sc.filter((s) => s.wave <= 3);
      expect(pre.every((s) => s.at < BOSS_AT)).toBe(true);
      // everything lands before the hard stop (the slowest fall is about 9s)
      expect(sc.every((s) => s.at + (216 + 24) / s.speed < GAME_LEN - 1)).toBe(true);
      const reals = sc.filter((s) => !s.msg.scam).length;
      expect(reals).toBeGreaterThanOrEqual(8);
      expect(sc.length - reals).toBeGreaterThanOrEqual(15);
      // waves speed up
      expect(sc.find((s) => s.wave === 3)!.speed).toBeGreaterThan(sc.find((s) => s.wave === 1)!.speed);
      expect(sc.some((s) => s.msg.from === 'STORE MANAGER')).toBe(sc.some((s) => s.msg.why === 'REAL BOSS'));
    }
  });
});

describe('phishing score', () => {
  it('is calibrated: perfect ~1, attentive ~0.6-0.8, spraying at everything ~0.2-0.4, idle 0', () => {
    expect(phishScore({ scamsHit: 30, scamsMissed: 0, realShot: 0, realSaved: 10, linksClicked: 0 })).toBe(1);
    const attentive = phishScore({ scamsHit: 25, scamsMissed: 5, realShot: 2, realSaved: 8, linksClicked: 2 });
    expect(attentive).toBeGreaterThan(0.6);
    expect(attentive).toBeLessThan(0.8);
    const spray = phishScore({ scamsHit: 29, scamsMissed: 1, realShot: 10, realSaved: 0, linksClicked: 1 });
    expect(spray).toBeGreaterThan(0.2);
    expect(spray).toBeLessThan(0.4);
    expect(phishScore({ scamsHit: 0, scamsMissed: 28, realShot: 0, realSaved: 10, linksClicked: 3 })).toBe(0);
  });
});
