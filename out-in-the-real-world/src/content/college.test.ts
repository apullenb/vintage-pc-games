import { describe, expect, it } from 'vitest';
import { newState } from './paths.ts';
import {
  COURSES,
  DEANS_BONUS,
  MAJORS,
  MAJOR_IDS,
  RETAKE_COST,
  RETAKE_FEE,
  TERMS,
  closeTerm,
  collegeWeek,
  coursePct,
  creditsEarned,
  dueIn,
  ensureSchool,
  examPct,
  freeSkips,
  gpa,
  gpaOf,
  gradesView,
  hwWeeks,
  letterOf,
  liveGpa,
  major,
  newSchool,
  onTime,
  onTrackToGraduate,
  participation,
  pickMajor,
  pointsOf,
  semestersLeft,
  startingPay,
  termOf,
} from './college.ts';
import { finalScore } from '../engine/score.ts';
import { begin, choose, finishMinigame, sceneChoices } from '../engine/engine.ts';
import { rng } from '../minigames/cardsFx.ts';
import { MAJOR_CARDS, buildRounds, ROUNDS } from '../minigames/cardsDeck.ts';
import type { CourseRec, GameState } from '../engine/types.ts';

const LOOK = { skin: 0, hair: 0, hairStyle: 0, shirt: 0 };
const student = (m: (typeof MAJOR_IDS)[number] = 'business'): GameState => {
  const s = newState('T', LOOK, 'college', 3);
  s.school = newSchool(s, m);
  return s;
};
const rec = (over: Partial<CourseRec>): CourseRec => ({ id: 'eng', held: 0, missed: 0, hw: [], mid: null, fin: null, bonus: 0, ...over });

describe('grade math', () => {
  it('maps percentages to letters and grade points', () => {
    expect([100, 93, 92.4, 90, 89.5, 87, 85, 80, 77, 73, 70, 67, 63, 60, 59].map(letterOf)).toEqual(['A', 'A', 'A-', 'A-', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']);
    expect(pointsOf(95)).toBe(4);
    expect(pointsOf(84)).toBe(3);
    expect(pointsOf(71)).toBe(1.7);
    expect(pointsOf(40)).toBe(0);
  });

  it('weights attendance 10%, assignments 30%, midterm 25%, final 35%', () => {
    const c = rec({ held: 17, missed: 0, hw: [80, 90], mid: 70, fin: 90 });
    // 100*.1 + 85*.3 + 70*.25 + 90*.35 = 84.5
    expect(coursePct(c, 3)).toBeCloseTo(84.5, 1);
    expect(letterOf(coursePct(c, 3)!)).toBe('B');
  });

  it('only counts what has been graded so far, plus office-hours points', () => {
    expect(coursePct(rec({}), 3)).toBeNull();
    expect(coursePct(rec({ held: 4 }), 3)).toBe(100);
    // attendance 100 (w .1) + hw 70 (w .3) => 77.5
    expect(coursePct(rec({ held: 4, hw: [70] }), 3)).toBeCloseTo(77.5, 1);
    expect(coursePct(rec({ held: 4, hw: [70], bonus: 4 }), 3)).toBeCloseTo(81.5, 1);
  });

  it('skips past the free limit cost participation', () => {
    expect(participation(rec({ held: 10, missed: 3 }), 3)).toBe(100);
    expect(participation(rec({ held: 10, missed: 5 }), 3)).toBe(76);
    expect(participation(rec({ held: 10, missed: 5 }), 1)).toBe(52);
  });

  it('GPA is weighted by credits', () => {
    expect(gpaOf([])).toBeNull();
    expect(gpaOf([{ pct: 95, credits: 4 }, { pct: 75, credits: 4 }])).toBe(3);
    // A (4.0) x 3 credits + C (2.0) x 1 credit = 3.5
    expect(gpaOf([{ pct: 95, credits: 3 }, { pct: 74, credits: 1 }])).toBe(3.5);
  });

  it('exam grades blend the mini-game, prep, attendance, energy and difficulty', () => {
    const prepped = examPct(0.75, 4, 4, 1, 70, 1.25);
    const crammed = examPct(0.75, 0, 4, 1, 70, 1.25);
    const tired = examPct(0.75, 4, 4, 1, 10, 1.25);
    const easy = examPct(0.75, 4, 4, 1, 70, 0.85);
    expect(prepped).toBeGreaterThan(80);
    expect(crammed).toBeLessThan(prepped - 15);
    expect(tired).toBeLessThan(prepped - 10);
    expect(easy).toBeGreaterThan(prepped);
    expect(examPct(1, 9, 3, 1, 100, 0.8)).toBeLessThanOrEqual(100);
  });
});

describe('semester schedule', () => {
  it('fall is weeks 1–17 and spring 19–35, with a break between', () => {
    expect(termOf(1)).toBe(0);
    expect(termOf(17)).toBe(0);
    expect(termOf(18)).toBeNull();
    expect(termOf(19)).toBe(1);
    expect(termOf(35)).toBe(1);
    expect(termOf(36)).toBeNull();
  });

  it('assignments every other week, two per class; midterms, finals, then report cards', () => {
    expect(hwWeeks(0)).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
    expect(hwWeeks(1)).toEqual([20, 22, 24, 26, 28, 30, 32, 34]);
    for (const t of [0, 1]) {
      const per = [0, 0, 0, 0];
      for (const w of hwWeeks(t)) {
        const d = dueIn(w);
        expect(d?.kind).toBe('hw');
        if (d?.kind === 'hw') per[d.course]++;
      }
      expect(per).toEqual([2, 2, 2, 2]);
    }
    expect(dueIn(9)).toEqual({ kind: 'exam', term: 0, exam: 'midterm' });
    expect(dueIn(17)).toEqual({ kind: 'exam', term: 0, exam: 'final' });
    expect(dueIn(27)).toEqual({ kind: 'exam', term: 1, exam: 'midterm' });
    expect(dueIn(35)).toEqual({ kind: 'exam', term: 1, exam: 'final' });
    expect(dueIn(18)).toEqual({ kind: 'report', term: 0 });
    expect(dueIn(36)).toEqual({ kind: 'report', term: 1 });
  });

  it('every major takes four real classes a semester, 15 credits each', () => {
    for (const id of MAJOR_IDS) {
      for (const list of [MAJORS[id].fall, MAJORS[id].spring]) {
        expect(list.length).toBe(4);
        for (const c of list) expect(COURSES[c], c).toBeTruthy();
        expect(list.reduce((a, c) => a + COURSES[c].credits, 0)).toBe(15);
      }
    }
  });

  it('the weekly hook queues assignments, exams and the report card, and tracks attendance', () => {
    const s = student('nursing');
    s.week = 2;
    let r = collegeWeek(s);
    expect(r.steps.map((x) => (x.t === 'scene' ? x.id : x.t))).toContain('col-hw');
    expect(s.school!.courses[0].held).toBe(1);
    s.flags.skips = 1;
    s.week = 3;
    collegeWeek(s);
    expect(s.school!.courses[0].missed).toBe(1);
    s.week = 9;
    r = collegeWeek(s);
    expect(r.quiet).toBe(true);
    expect(r.steps[0]).toMatchObject({ id: 'col-exam', data: { exam: 'midterm' } });
    s.week = 18;
    r = collegeWeek(s);
    expect(r.steps.some((x) => x.t === 'scene' && x.id === 'col-report')).toBe(true);
    expect(s.school!.done.length).toBe(1);
    expect(s.school!.term).toBe(1);
    expect(s.school!.courses.map((c) => c.id)).toEqual(MAJORS.nursing.spring);
  });

  it('lab fees depend on the major', () => {
    const n = student('nursing');
    n.week = 3;
    const before = n.stats.cash;
    collegeWeek(n);
    expect(before - n.stats.cash).toBe(180);
    const e = student('education');
    e.week = 3;
    const eb = e.stats.cash;
    collegeWeek(e);
    expect(e.stats.cash).toBe(eb);
  });
});

function finishTerm(s: GameState, pct: number): void {
  for (const c of s.school!.courses) {
    c.held = 17;
    c.hw = [pct, pct];
    c.mid = pct;
    c.fin = pct;
  }
  closeTerm(s, s.school!);
}

describe('consequences', () => {
  it('a 3.5+ semester is the Dean’s List: achievement and a scholarship bonus', () => {
    const s = student();
    const cash = s.stats.cash;
    finishTerm(s, 95);
    expect(s.school!.done[0].gpa).toBe(4);
    expect(s.achievements).toContain('deanslist');
    expect(s.stats.cash).toBe(cash + DEANS_BONUS);
    expect(s.school!.honors).toBe(true);
  });

  it('under 2.0 after fall means probation and fewer free skips; recovering lifts it', () => {
    const s = student();
    finishTerm(s, 66);
    expect(s.school!.probation).toBe(true);
    expect(freeSkips(s.school!)).toBe(1);
    expect(s.handbook).toContain('academic-probation');
    finishTerm(s, 92);
    expect(gpa(s)).toBeGreaterThanOrEqual(2);
    expect(s.school!.probation).toBe(false);
  });

  it('two bad semesters in a row means suspension', () => {
    const s = student();
    finishTerm(s, 62);
    finishTerm(s, 62);
    expect(s.flags.suspended).toBe(true);
    expect(onTrackToGraduate(s)).toBe(false);
  });

  it('a failed class adds a retake to your loans and costs credits', () => {
    const s = student();
    const loans = s.loans.reduce((a, l) => a + l.balance, 0);
    for (const c of s.school!.courses) {
      c.held = 17;
      c.hw = [90, 90];
      c.mid = 90;
      c.fin = 90;
    }
    s.school!.courses[0].hw = [0, 0];
    s.school!.courses[0].mid = 30;
    s.school!.courses[0].fin = 30;
    closeTerm(s, s.school!);
    expect(s.school!.done[0].grades[0].letter).toBe('F');
    expect(s.school!.failed).toBe(1);
    expect(s.loans.reduce((a, l) => a + l.balance, 0)).toBe(loans + RETAKE_COST + RETAKE_FEE);
    expect(s.school!.done[0].earned).toBe(15 - 4);
  });

  it('a 3.0 for the year keeps the scholarship (the college mission); under 3.0 cuts it', () => {
    const good = student();
    finishTerm(good, 88);
    finishTerm(good, 85);
    expect(gpa(good)).toBeGreaterThanOrEqual(3);
    expect(good.flags.careerDone).toBe(true);
    expect(good.flags.scholarshipCut).toBeUndefined();
    const meh = student();
    finishTerm(meh, 80);
    finishTerm(meh, 78);
    expect(meh.flags.careerDone).toBeUndefined();
    expect(meh.flags.scholarshipCut).toBe(true);
  });

  it('undeclared students declare in spring, which costs a semester', () => {
    const s = student('undeclared');
    finishTerm(s, 90);
    pickMajor(s, 'cs');
    expect(s.school!.major).toBe('cs');
    expect(s.school!.lateDeclare).toBe(true);
    expect(s.school!.courses.map((c) => c.id)).toEqual(MAJORS.cs.spring);
    finishTerm(s, 90);
    expect(creditsEarned(s)).toBe(30);
    expect(semestersLeft(s)).toBe(7);
    expect(onTime(s)).toBe(false);
  });

  it('graduation hooks: credits, GPA, major, pace and starting pay', () => {
    const s = student('nursing');
    expect(major(s)).toBe('nursing');
    expect(liveGpa(s)).toBeNull();
    finishTerm(s, 95);
    finishTerm(s, 95);
    expect(creditsEarned(s)).toBe(30);
    expect(semestersLeft(s)).toBe(6);
    expect(onTime(s)).toBe(true);
    expect(startingPay(s)).toBeGreaterThan(MAJORS.nursing.pay);
    s.school!.extraCredits = 3;
    expect(creditsEarned(s)).toBe(33);
    expect(major(newState('T', LOOK, 'work', 1))).toBeNull();
  });

  it('final epilogue mentions the major and GPA', () => {
    const s = student('education');
    finishTerm(s, 92);
    finishTerm(s, 92);
    const ep = finalScore(s).epilogue.join(' ');
    expect(ep).toContain('teacher');
    expect(ep).toContain('GPA');
  });
});

describe('old saves and wiring', () => {
  it('a save without school data defaults to Undeclared and still shows grades', () => {
    const s = newState('T', LOOK, 'college', 1);
    s.week = 5;
    expect(gradesView(s)?.major).toBe('Undeclared');
    const r = collegeWeek(s);
    expect(s.school?.major).toBe('undeclared');
    expect(r.steps.some((x) => x.t === 'scene' && x.id === 'col-major')).toBe(true);
    expect(ensureSchool(newState('T', LOOK, 'trade', 1))).toBeNull();
  });

  it('move-in asks for a major, and an exam runs the flashcards in exam mode', () => {
    let s = begin(newState('T', LOOK, 'college', 11));
    const seen: string[] = [];
    for (let i = 0; i < 20 && s.queue[0]?.t === 'scene'; i++) {
      const h = s.queue[0];
      if (h.t !== 'scene') break;
      seen.push(h.id);
      if (h.result) {
        s = { ...s, queue: s.queue.slice(1) };
        if (h.resultNext) s.queue.unshift({ t: 'scene', id: h.id, step: h.resultNext, data: h.data });
        continue;
      }
      const c = sceneChoices(s, h).find((x) => !x.locked)!;
      s = choose(s, h.id === 'col-major' ? 1 : c.i); // Computer Science
    }
    expect(seen).toContain('col-major');
    expect(s.school?.major).toBe('cs');
    // Jump to midterms.
    s.queue = [{ t: 'scene', id: 'col-exam', step: 'start', data: { exam: 'midterm' } }];
    s = choose(s, 1); // review and sleep
    expect(s.queue[0]).toMatchObject({ t: 'minigame', id: 'flashcards', data: { exam: 'midterm' } });
    s = finishMinigame(s, { score: 0.8, played: true });
    expect(s.school!.courses.every((c) => c.mid !== null)).toBe(true);
  });

  it('degree cards are short, never give the answer away, and fill exams', () => {
    for (const cards of Object.values(MAJOR_CARDS)) {
      expect(cards.length).toBeGreaterThanOrEqual(6);
      for (const c of cards) {
        expect(c.label.length, c.label).toBeLessThanOrEqual(20);
        expect(c.clue.length, c.clue).toBeLessThanOrEqual(85);
        expect(c.clue.toLowerCase(), c.label).not.toContain(c.label.toLowerCase());
      }
    }
    const s = student('cs');
    const exam = buildRounds(s, rng(5), ROUNDS, { exam: true });
    expect(exam.length).toBe(ROUNDS);
    const ids = new Set(MAJOR_CARDS.cs.map((c) => c.id));
    expect(exam.filter((r) => ids.has(r.answer.id)).length).toBeGreaterThanOrEqual(6);
    for (const r of exam) expect(new Set(r.options.map((o) => o.label)).size).toBe(3);
    const study = buildRounds(s, rng(5));
    expect(study.filter((r) => r.answer.kind === 'path').length).toBe(4);
  });
});

// Keep TERMS referenced for readers of this file: the year is two semesters.
it('two semesters a year', () => expect(TERMS.length).toBe(2));
