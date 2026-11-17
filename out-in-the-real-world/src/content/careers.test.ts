import { describe, expect, it } from 'vitest';
import { choose, finishMinigame, payBills, proceed, sceneChoices, startWeek } from '../engine/engine.ts';
import type { GameState, PathId } from '../engine/types.ts';
import { acceptOffer, careerWeek, courseSession, currentCourse, enroll } from './careers.ts';
import { COURSE_BY_ID, COURSES } from './courses.ts';
import { LISTING_BY_ID, boardFor, boardPeriod, fitFor, offerWage } from './jobs.ts';
import { shiftKind } from './minigames/shift.ts';
import { newState } from './paths.ts';
import { hasSkill } from './skills.ts';

const fresh = (path: PathId = 'home'): GameState => newState('T', { skin: 0, hair: 0, hairStyle: 0, shirt: 0 }, path, 42);
const L = LISTING_BY_ID;

// Plays the queue until it's empty: picks choices whose label matches `want` (else the first open one).
function drive(s: GameState, want: RegExp[] = [], seen: string[] = []): GameState {
  for (let i = 0; i < 400 && s.queue.length; i++) {
    const h = s.queue[0];
    if (h.t === 'scene') {
      if (h.result) {
        s = proceed(s);
        continue;
      }
      seen.push(`${h.id}:${h.step}`);
      const cs = sceneChoices(s, h).filter((c) => !c.locked);
      const c = cs.find((x) => want.some((w) => w.test(x.label))) ?? cs[0];
      s = choose(s, c.i, c.pay > 0 ? 'checking' : undefined);
    } else if (h.t === 'minigame') s = h.result ? proceed(s) : finishMinigame(s, { score: 0.7, played: true });
    else if (h.t === 'billsDue') s = payBills(s, Object.fromEntries(h.bills.map((b) => [b.id, { amount: b.amount, method: 'checking' as const }])));
    else s = proceed(s);
  }
  return s;
}

function week(s: GameState, slots: Partial<GameState['plan']['slots']>, want: RegExp[] = [], seen: string[] = []): GameState {
  const plan = { slots: { weekday: 'work', evening: 'rest', saturday: 'rest', sunday: 'rest', ...slots }, food: s.plan.food };
  return drive(startWeek(s, plan), want, seen);
}

describe('requirements', () => {
  it('names missing skills, license, car, experience and reference', () => {
    const s = fresh('home');
    expect(fitFor(s, L.pharmtech).hard).toEqual(['Pharmacy Tech (CPhT)']);
    expect(fitFor(s, L.pharmtech).ok).toBe(false);
    s.skills = ['cpht'];
    expect(fitFor(s, L.pharmtech).ok).toBe(true);
    // Electrician's helper: OSHA 10, a license, and a car (no bus out there).
    const h = fitFor(s, L.ehelper).hard;
    expect(h).toContain('OSHA 10 Safety');
    expect(h).toContain('Driver’s license');
    s.transport = 'bus';
    expect(fitFor(s, L.ehelper).hard).toContain('A car (no bus goes there)');
    // Soft requirements: experience and a reference. A referral gets you past them, not past a certification.
    const w = fresh('work');
    w.skills = ['warehouse', 'leadership'];
    w.car = { name: 'Civic', condition: 80, value: 5000, insurance: 120 };
    expect(fitFor(w, L.whsup).soft.length).toBe(2);
    expect(fitFor(w, L.whsup).ok).toBe(false);
    w.flags.referral = 'whsup';
    expect(fitFor(w, L.whsup).ok).toBe(true);
    w.skills = ['warehouse'];
    expect(fitFor(w, L.whsup).ok).toBe(false);
  });

  it('keeps apprentices and full-time-student schedules out of the wrong jobs', () => {
    const t = fresh('trade');
    expect(fitFor(t, L.barista).ok).toBe(false);
    const c = fresh('college');
    expect(fitFor(c, L.barista).ok).toBe(true); // 20 hrs/week fits around classes
    expect(fitFor(c, L.stocker).ok).toBe(false);
  });

  it('pays bilingual hires more', () => {
    const s = fresh('home');
    expect(offerWage(s, L.reception)).toBe(17);
    s.skills = ['spanish'];
    expect(offerWage(s, L.reception)).toBe(18.5);
  });
});

describe('job board', () => {
  it('shows 8–14 listings that stay put for a period, then refresh', () => {
    const s = fresh('home');
    s.flags.boardSalt = 1234;
    const ids = (w: number) => {
      s.week = w;
      return boardFor(s).map((l) => l.id);
    };
    for (let w = 1; w <= 36; w++) {
      expect(ids(w).length).toBeGreaterThanOrEqual(8);
      expect(ids(w).length).toBeLessThanOrEqual(14);
    }
    expect(ids(2)).toEqual(ids(4));
    expect(boardPeriod(4)).not.toBe(boardPeriod(5));
    expect(ids(4)).not.toEqual(ids(5));
    // Scams show up sometimes, and there are always jobs that need no skills.
    const all = Array.from({ length: 36 }, (_, i) => ids(i + 1)).flat();
    expect(all.some((id) => L[id].scam)).toBe(true);
    for (let w = 1; w <= 36; w += 4) expect(ids(w).filter((id) => !L[id].needs.skills && !L[id].scam).length).toBeGreaterThanOrEqual(3);
  });

  it('new kinds of jobs get a matching extra-shift game', () => {
    const s = fresh('home');
    for (const [id, kind] of [['pharmtech', 'home'], ['teller', 'home'], ['helpdesk', 'college'], ['driver', 'work'], ['forklift', 'work'], ['ehelper', 'trade']] as const) {
      s.job = { ...s.job!, art: L[id].art };
      expect(shiftKind(s), id).toBe(kind);
    }
  });
});

describe('online courses', () => {
  it('finishing every session grants the skill', () => {
    const s = fresh('home');
    enroll(s, COURSE_BY_ID.cpht);
    expect(currentCourse(s)?.id).toBe('cpht');
    // A flunked quiz doesn't count; an aced one counts double.
    courseSession(s, { score: 0.1, played: true });
    expect(s.flags.courseProg).toBe(0);
    courseSession(s, { score: 0.9, played: true });
    expect(s.flags.courseProg).toBe(2);
    for (let i = 0; i < 3; i++) courseSession(s, { score: 0.6, played: true });
    expect(hasSkill(s, 'cpht')).toBe(false);
    const out = courseSession(s, { score: 0.6, played: true });
    expect(out.text).toContain('COURSE COMPLETE');
    expect(hasSkill(s, 'cpht')).toBe(true);
    expect(currentCourse(s)).toBeNull();
    expect(s.flags.coursesDone).toBe(1);
  });

  it('runs through the flashcards mini-game from the activity', () => {
    let s = fresh('home');
    s.flags.license = true;
    enroll(s, COURSE_BY_ID.servsafe);
    s.stats.cash = 2000;
    s = week(s, { evening: 'course', saturday: 'course' });
    expect(hasSkill(s, 'servsafe')).toBe(true);
  });

  it('ParcelPoint pays tuition back after 12 weeks, and wants it back if you leave early', () => {
    const s = fresh('work');
    s.flags.tenurePlace = 'ParcelPoint';
    s.flags.tenure = 13;
    s.stats.cash = 1000;
    enroll(s, COURSE_BY_ID.lead);
    s.flags.courseProg = 2;
    courseSession(s, { score: 0.6, played: true });
    expect(s.stats.cash).toBe(1075);
    expect(s.flags.clawback).toBe(75);
    s.flags.offerFor = 'dispatcher';
    s.flags.offerWage = 19;
    acceptOffer(s, false);
    expect(s.stats.cash).toBe(1000);
  });

  it('every course has six short flashcards that don’t give the answer away', () => {
    for (const c of COURSES) {
      expect(c.cards.length, c.id).toBe(6);
      for (const [label, clue] of c.cards) {
        expect(label.length, label).toBeLessThanOrEqual(20);
        expect(clue.length, clue).toBeLessThanOrEqual(85);
        expect(clue.toLowerCase(), label).not.toContain(label.toLowerCase());
      }
    }
  });
});

describe('applying and getting hired', () => {
  it('rejects you politely, naming what you’re missing', () => {
    let s = fresh('home');
    s.flags.boardSalt = 99;
    s.flags.applyTo = 'pharmtech';
    const seen: string[] = [];
    s = week(s, { evening: 'apply' }, [/Pharmacy Technician/], seen);
    expect(seen).toContain('job-apply:reject');
    expect(s.log.some((l) => /CPhT/.test(l.text) || /Job applications/.test(l.text))).toBe(true);
    expect(s.job?.place).toBe('Fresh Fields Market');
    expect(s.flags.interviewFor).toBeUndefined();
  });

  it('interview, offer, two weeks’ notice, then the new job (rep reset, new wage, bigger stubs)', () => {
    let s = fresh('home');
    s.flags.boardSalt = 99;
    s.week = 10;
    s.skills = ['cpht'];
    s.stats.rep = 72;
    s.flags.promo1 = true;
    s.flags.extraShifts = 6;
    s.health = 'parents';
    const want = [/Pharmacy Technician/, /In person/, /Keep it short/, /Listen, apologize/, /first 90 days/, /two weeks/, /Stay on my parents/, /Contribute 4%/];
    const seen: string[] = [];
    s = week(s, { evening: 'apply' }, want, seen);
    expect(seen).toContain('job-apply:invite');
    expect(s.appointments.some((a) => a.kind === 'jobint' && a.week === 11 && a.slot === 'weekday')).toBe(true);
    s = week(s, {}, want, seen);
    expect(seen).toContain('appt-jobint:offer');
    expect(s.flags.newJobId).toBe('pharmtech');
    expect(s.flags.refRep).toBeGreaterThanOrEqual(70);
    const startAt = Number(s.flags.newJobAt);
    expect(startAt).toBe(13);
    if (!s.job) return; // walked out on the spot (it happens): still starts in week 13
    expect(s.job.place).toBe('Fresh Fields Market');
    s = week(s, {}, want, seen);
    s = week(s, {}, want, seen);
    expect(s.job?.place).toBe('CareRx Pharmacy');
    expect(s.job?.wage).toBe(19.5);
    expect(s.job?.hours).toBe(36);
    expect(s.stats.rep).toBeLessThan(60);
    expect(s.flags.promo1).toBeUndefined();
    expect(s.flags.extraShifts).toBe(0);
    expect(s.flags.careerDone).toBe(true);
    expect(seen).toContain('job-benefits:start');
    expect(Number(s.flags.avgPaycheck)).toBeGreaterThanOrEqual(19.5 * 36 * 2);
  });

  it('quitting without notice starts you right away but burns the reference', () => {
    const s = fresh('home');
    s.stats.rep = 80;
    s.flags.offerFor = 'reception';
    s.flags.offerWage = 17;
    acceptOffer(s, false);
    expect(s.job?.place).toBe('Lakeside Family Clinic');
    expect(s.stats.rep).toBe(50);
    expect(s.flags.burned).toBe(1);
    expect(s.flags.refRep).toBe(0);
  });

  it('scam listings cost money if you play along', () => {
    let s = fresh('home');
    s.stats.cash = 500;
    s.flags.boardSalt = 1;
    // Find a week whose board has a scam.
    for (let w = 1; w <= 36 && !boardFor(s).some((l) => l.scam); w++) s.week = w;
    const scam = boardFor(s).find((l) => l.scam)!;
    s.flags.applyTo = scam.id;
    const seen: string[] = [];
    s = week(s, { evening: 'apply' }, [new RegExp(scam.title), /Pay the|Deposit the check/], seen);
    expect(seen).toContain('job-apply:scam');
    expect(s.handbook).toContain('job-scam');
    expect(s.stats.cash).toBeLessThan(500 - 40);
  });
});

describe('old saves', () => {
  it('a save from before skills existed loads and plays', () => {
    let s = fresh('home');
    delete (s as Partial<GameState>).skills;
    s.flags.certEnrolled = true;
    s.week = 7;
    s = week(s, {});
    expect(s.skills).toEqual([]);
    expect(currentCourse(s)?.id).toBe('cpht');
    expect(Number(s.flags.tenure)).toBe(7);
    expect(hasSkill(s, 'service')).toBe(false);
    s = week(s, {});
    expect(hasSkill(s, 'service')).toBe(true); // 8+ weeks at the register
  });

  it('careerWeek is safe to run on any state', () => {
    const s = fresh('college');
    delete (s as Partial<GameState>).skills;
    s.job = null;
    careerWeek(s);
    expect(s.skills).toEqual([]);
  });
});
