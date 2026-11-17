// College: majors, classes, the semester calendar, grade math, and what grades lead to.
// Everything here reads or writes `s.school`. Old saves without it get a safe default.
import { achieve, charge, clamp, energy, inc, log, money, num, rand, rep, round2, setFlag, unlock, xp } from '../engine/core.ts';
import type { ArtId, CourseRec, GameState, MajorId, School, Step, TermGrade, TermRec } from '../engine/types.ts';
import type { Activity } from './types.ts';

// ---------- classes ----------
export interface Course {
  id: string;
  name: string;
  short: string; // fits a phone row
  credits: number;
  diff: number; // 0.8 easy .. 1.3 brutal
  hw: [string, string]; // the two assignments each term
}

const C = (id: string, name: string, short: string, credits: number, diff: number, hw: [string, string]): Course => ({ id, name, short, credits, diff, hw });

export const COURSES: Record<string, Course> = Object.fromEntries(
  [
    // gen eds
    C('eng', 'English Composition', 'English', 3, 0.9, ['Personal essay', 'Research paper']),
    C('psych', 'Intro to Psychology', 'Psych', 4, 0.95, ['Essay: why we procrastinate', 'Memory experiment write-up']),
    C('alg', 'College Algebra', 'Algebra', 4, 1.05, ['Problem set: functions', 'Problem set: logarithms']),
    C('film', 'Intro to Film', 'Film', 4, 0.8, ['Review of a movie you hated', 'Shot-by-shot breakdown']),
    C('speech', 'Public Speaking', 'Speech', 3, 0.9, ['Five-minute persuasive speech', 'Group presentation']),
    C('soc', 'Intro to Sociology', 'Sociology', 4, 0.9, ['Field notes: the dining hall', 'Essay on social media']),
    C('stats', 'Statistics', 'Stats', 4, 1.1, ['Problem set: probability', 'Survey data project']),
    C('art', 'Art History', 'Art Hist', 4, 0.85, ['Museum visit report', 'Compare two paintings']),
    // nursing
    C('anat1', 'Anatomy & Physiology I', 'A&P I', 4, 1.25, ['Label all 27 bones in the hand', 'Lab report: the beating heart']),
    C('chem', 'Chemistry for Health Sciences', 'Chemistry', 4, 1.2, ['Problem set: moles and molarity', 'Titration lab (don’t drink it)']),
    C('anat2', 'Anatomy & Physiology II', 'A&P II', 4, 1.25, ['Kidney diagram', 'Lab report: blood typing']),
    C('micro', 'Microbiology', 'Microbio', 4, 1.2, ['Petri dish lab (it’s growing)', 'Case study: an outbreak']),
    C('nutr', 'Nutrition', 'Nutrition', 4, 1.0, ['Three-day food diary', 'Meal plan for a patient']),
    C('dev', 'Lifespan Development', 'Lifespan', 3, 0.95, ['Interview a grandparent', 'Essay: toddlers vs. teens']),
    // computer science
    C('calc1', 'Calculus I', 'Calc I', 4, 1.3, ['Problem set: limits', 'Problem set: derivatives']),
    C('cs1', 'Intro to Programming', 'Programming', 4, 1.15, ['Code a tip calculator', 'Code a tiny text game']),
    C('calc2', 'Calculus II', 'Calc II', 4, 1.3, ['Problem set: integrals', 'Problem set: series (why)']),
    C('ds', 'Data Structures', 'Data Struct', 4, 1.2, ['Build a linked list', 'Build a hash table']),
    C('disc', 'Discrete Math', 'Discrete', 4, 1.2, ['Proofs by induction', 'Graph theory set']),
    // business
    C('econ1', 'Microeconomics', 'Micro Econ', 4, 1.05, ['Supply and demand graphs', 'Essay: why concerts cost $300']),
    C('bus', 'Intro to Business', 'Business', 4, 0.9, ['Pitch a business idea', 'Company case study']),
    C('econ2', 'Macroeconomics', 'Macro Econ', 4, 1.05, ['Inflation problem set', 'Fed policy memo']),
    C('acct', 'Financial Accounting', 'Accounting', 4, 1.15, ['Balance a balance sheet', 'Income statement project']),
    // education
    C('cdev', 'Child Development', 'Child Dev', 4, 0.95, ['Playground observation', 'Stages of development chart']),
    C('teach', 'Intro to Teaching', 'Teaching', 4, 0.85, ['Teaching philosophy essay', 'Mini lesson plan']),
    C('mathed', 'Math for Teachers', 'Math Ed', 4, 1.0, ['Fractions, three ways', 'Lesson: long division']),
    C('edpsy', 'Educational Psychology', 'Ed Psych', 4, 0.95, ['Learning theory essay', 'Motivation case study']),
    C('field', 'Classroom Observation', 'Field Obs', 4, 0.85, ['Observation log, week 1', 'Observation log, week 2']),
    C('kidlit', 'Children’s Literature', 'Kid Lit', 4, 0.85, ['Picture book review', 'Read-aloud lesson']),
  ].map((c) => [c.id, c]),
);

// ---------- majors ----------
export interface Major {
  id: MajorId;
  name: string;
  level: string; // how hard, in a word
  hint: string; // tradeoffs shown when picking
  pick: string; // result line after picking
  fall: string[];
  spring: string[];
  need: number; // study sessions to be fully prepped for an exam
  fees: [number, string][]; // [fall, spring] lab/course fees
  job: { title: string; place: string; wage: number; art: ArtId };
  intern: { title: string; bar: number }; // summer internship and the GPA it takes
  outlook: string; // job outlook in one line
  pay: number; // typical starting salary after graduating
}

export const MAJORS: Record<MajorId, Major> = {
  nursing: {
    id: 'nursing',
    name: 'Nursing',
    level: 'Hard',
    hint: '✓ Hospitals are always hiring · ✗ Hardest science classes · ✗ $180 for scrubs and lab gear',
    pick: 'You check “Nursing.” The advisor nods like you just enlisted.',
    fall: ['anat1', 'chem', 'psych', 'eng'],
    spring: ['anat2', 'micro', 'nutr', 'dev'],
    need: 4,
    fees: [
      [180, 'Scrubs, a stethoscope, and a lab kit'],
      [120, 'Microbiology lab fee'],
    ],
    job: { title: 'Patient Transport Aide', place: 'State U Medical Center', wage: 18, art: 'clinic' },
    intern: { title: 'summer nurse externship', bar: 3.0 },
    outlook: 'Registered nurses are in demand almost everywhere.',
    pay: 77000,
  },
  cs: {
    id: 'cs',
    name: 'Computer Science',
    level: 'Hard',
    hint: '✓ Strong pay outlook · ✗ Math-heavy (Calculus, twice) · ✗ $90 for homework software',
    pick: 'Computer Science. Your roommate immediately asks you to fix their printer. It begins.',
    fall: ['calc1', 'cs1', 'eng', 'psych'],
    spring: ['calc2', 'ds', 'disc', 'speech'],
    need: 4,
    fees: [
      [90, 'Calculus homework software'],
      [0, ''],
    ],
    job: { title: 'IT Help Desk Tech', place: 'State U Tech Services', wage: 18, art: 'office' },
    intern: { title: 'summer software internship', bar: 3.3 },
    outlook: 'Entry-level developers earn a lot, and competition for those jobs is tough.',
    pay: 80000,
  },
  business: {
    id: 'business',
    name: 'Business',
    level: 'Medium',
    hint: '✓ Medium workload · ✓ Internships come easier · ✗ $60 financial calculator',
    pick: 'Business. You already own a quarter-zip. You were born for this.',
    fall: ['econ1', 'bus', 'alg', 'eng'],
    spring: ['econ2', 'acct', 'stats', 'speech'],
    need: 3,
    fees: [
      [60, 'Financial calculator'],
      [0, ''],
    ],
    job: { title: 'Marketing Assistant', place: 'State U Athletics', wage: 17.5, art: 'office' },
    intern: { title: 'summer business internship', bar: 2.7 },
    outlook: 'Business grads work everywhere. Internships decide who gets hired first.',
    pay: 62000,
  },
  education: {
    id: 'education',
    name: 'Education',
    level: 'Medium',
    hint: '✓ Lighter classes · ✓ Teachers can get loans forgiven · ✗ Lower starting pay',
    pick: 'Education. Your third-grade teacher would be proud. Probably cry, actually.',
    fall: ['cdev', 'teach', 'mathed', 'eng'],
    spring: ['edpsy', 'field', 'kidlit', 'speech'],
    need: 3,
    fees: [
      [0, ''],
      [55, 'Fingerprinting and a background check for classroom visits'],
    ],
    job: { title: 'After-School Tutor', place: 'Hillcrest Elementary', wage: 17, art: 'library' },
    intern: { title: 'summer camp teaching job', bar: 2.5 },
    outlook: 'Schools need teachers. The pay is modest, and Public Service Loan Forgiveness can help.',
    pay: 46000,
  },
  undeclared: {
    id: 'undeclared',
    name: 'Undeclared',
    level: 'Easy',
    hint: '✓ Easy intro classes now · ✗ Must declare by spring · ✗ Can cost an extra semester',
    pick: 'Undeclared. Freedom! The advisor writes “DECLARE BY SPRING” on your form in red pen.',
    fall: ['eng', 'psych', 'alg', 'film'],
    spring: ['speech', 'soc', 'stats', 'art'],
    need: 2,
    fees: [
      [0, ''],
      [0, ''],
    ],
    job: { title: 'Writing Center Tutor', place: 'State U Writing Center', wage: 17, art: 'library' },
    intern: { title: 'summer internship', bar: 3.0 },
    outlook: 'You can still go anywhere. You just haven’t picked where.',
    pay: 55000,
  },
};
export const MAJOR_IDS: MajorId[] = ['nursing', 'cs', 'business', 'education', 'undeclared'];

// ---------- the calendar ----------
export interface Term {
  name: 'Fall' | 'Spring';
  start: number;
  end: number;
  mid: number;
  fin: number;
  report: number; // grades post
}
export const TERMS: Term[] = [
  { name: 'Fall', start: 1, end: 17, mid: 9, fin: 17, report: 18 },
  { name: 'Spring', start: 19, end: 35, mid: 27, fin: 35, report: 36 },
];
export const DEGREE_CREDITS = 120; // a four-year bachelor’s degree
export const FULL_LOAD = 15; // credits per semester to finish in four years (each semester here is 15)
export const DEGREE_TERMS = 8; // semesters in four years
export const INTERN_WEEK = 31;
export const SUMMER_WEEK = 33;

export function termOf(week: number): number | null {
  const i = TERMS.findIndex((t) => week >= t.start && week <= t.end);
  return i < 0 ? null : i;
}

// Assignments are due every other week (even weeks), rotating through your four classes.
export function hwWeeks(term: number): number[] {
  const t = TERMS[term];
  const out: number[] = [];
  for (let w = t.start + 1; w < t.end; w += 2) if (w !== t.mid) out.push(w);
  return out;
}

export type Due =
  | { kind: 'hw'; term: number; k: number; course: number }
  | { kind: 'exam'; term: number; exam: 'midterm' | 'final' }
  | { kind: 'report'; term: number };

export function dueIn(week: number): Due | null {
  for (let i = 0; i < TERMS.length; i++) {
    const t = TERMS[i];
    if (week === t.mid) return { kind: 'exam', term: i, exam: 'midterm' };
    if (week === t.fin) return { kind: 'exam', term: i, exam: 'final' };
    if (week === t.report) return { kind: 'report', term: i };
    const k = hwWeeks(i).indexOf(week);
    if (k >= 0) return { kind: 'hw', term: i, k, course: k % 4 };
  }
  return null;
}

// ---------- grade math ----------
export const WEIGHTS = { att: 0.1, hw: 0.3, mid: 0.25, fin: 0.35 };
export const LETTERS: [number, string, number][] = [
  [93, 'A', 4],
  [90, 'A-', 3.7],
  [87, 'B+', 3.3],
  [83, 'B', 3],
  [80, 'B-', 2.7],
  [77, 'C+', 2.3],
  [73, 'C', 2],
  [70, 'C-', 1.7],
  [67, 'D+', 1.3],
  [63, 'D', 1],
  [60, 'D-', 0.7],
  [0, 'F', 0],
];
export function letterOf(pct: number): string {
  const p = Math.round(pct);
  return (LETTERS.find(([min]) => p >= min) ?? LETTERS[LETTERS.length - 1])[1];
}
export function pointsOf(pct: number): number {
  const p = Math.round(pct);
  return (LETTERS.find(([min]) => p >= min) ?? LETTERS[LETTERS.length - 1])[2];
}
// Credit-weighted grade point average.
export function gpaOf(items: { pct: number; credits: number }[]): number | null {
  const cr = items.reduce((a, i) => a + i.credits, 0);
  if (!cr) return null;
  return Math.round((items.reduce((a, i) => a + pointsOf(i.pct) * i.credits, 0) / cr) * 100) / 100;
}
export const gpaText = (g: number | null): string => (g === null ? '—' : g.toFixed(2));

// Free absences per class each semester before participation drops.
export function freeSkips(sc: School): number {
  return sc.probation ? 1 : 3;
}
export function participation(c: CourseRec, free: number): number | null {
  if (!c.held) return null;
  return clamp(100 - 12 * Math.max(0, c.missed - free), 0, 100);
}
export function hwAvg(c: CourseRec): number | null {
  return c.hw.length ? c.hw.reduce((a, b) => a + b, 0) / c.hw.length : null;
}
// Weighted percentage over what has been graded so far, plus office-hours points.
export function coursePct(c: CourseRec, free: number): number | null {
  const parts: [number | null, number][] = [
    [participation(c, free), WEIGHTS.att],
    [hwAvg(c), WEIGHTS.hw],
    [c.mid, WEIGHTS.mid],
    [c.fin, WEIGHTS.fin],
  ];
  let w = 0;
  let sum = 0;
  for (const [v, wt] of parts) {
    if (v === null) continue;
    w += wt;
    sum += v * wt;
  }
  if (!w) return null;
  return clamp(Math.round((sum / w + c.bonus) * 10) / 10, 0, 100);
}

// ---------- the school record ----------
export function freshCourse(id: string): CourseRec {
  return { id, held: 0, missed: 0, hw: [], mid: null, fin: null, bonus: 0 };
}

export function newSchool(s: GameState, major: MajorId): School {
  const term = s.week > TERMS[0].report ? 1 : 0;
  const m = MAJORS[major];
  return {
    major,
    term,
    courses: (term ? m.spring : m.fall).map(freshCourse),
    done: [],
    prepAt: num(s, 'studySessions'),
    examAt: num(s, 'studySessions'),
    extraPrep: 0,
    skipsSeen: num(s, 'skips'),
    probation: false,
    failed: 0,
  };
}

// The school record, created on first use (old saves start Undeclared).
export function ensureSchool(s: GameState): School | null {
  if (s.path !== 'college') return null;
  if (!s.school) s.school = newSchool(s, 'undeclared');
  return s.school;
}

export function pickMajor(s: GameState, id: MajorId): void {
  const sc = ensureSchool(s);
  if (!sc) return;
  const was = sc.major;
  sc.major = id;
  if (was === 'undeclared' && id !== 'undeclared' && sc.done.length > 0) sc.lateDeclare = true;
  // Swap in this major's classes if nothing but attendance has been graded yet.
  const m = MAJORS[id];
  const ids = sc.term ? m.spring : m.fall;
  if (sc.courses.every((c) => !c.hw.length && c.mid === null)) {
    sc.courses = ids.map((cid, i) => ({ ...freshCourse(cid), held: sc.courses[i]?.held ?? 0, missed: sc.courses[i]?.missed ?? 0 }));
  }
}

export const courseOf = (c: CourseRec): Course => COURSES[c.id] ?? COURSES.eng;

// Rough difficulty of the current classes (for prep hints).
export function termDiff(sc: School): number {
  return sc.courses.reduce((a, c) => a + courseOf(c).diff, 0) / Math.max(1, sc.courses.length);
}

// Study sessions since the last exam (office hours and cramming count too).
export function examPrep(s: GameState, sc: School): number {
  return Math.max(0, num(s, 'studySessions') - sc.examAt) + sc.extraPrep;
}
export function hwPrep(s: GameState, sc: School): number {
  return Math.max(0, num(s, 'studySessions') - sc.prepAt);
}

// ---------- readable helpers (for the UI and for whatever comes after college) ----------
export function major(s: GameState): MajorId | null {
  return s.path === 'college' ? (s.school?.major ?? 'undeclared') : null;
}
export function majorName(s: GameState): string {
  const m = major(s);
  return m ? MAJORS[m].name : '';
}
export function termGpa(s: GameState): number | null {
  const sc = s.school;
  if (!sc) return null;
  const free = freeSkips(sc);
  const items: { pct: number; credits: number }[] = [];
  for (const c of sc.courses) {
    const p = coursePct(c, free);
    if (p !== null) items.push({ pct: p, credits: courseOf(c).credits });
  }
  return gpaOf(items);
}
// Cumulative GPA over finished semesters (what goes on a transcript).
export function gpa(s: GameState): number | null {
  const sc = s.school;
  if (!sc) return null;
  return gpaOf(sc.done.flatMap((t) => t.grades));
}
// Live GPA: finished semesters plus the one in progress (what the HUD shows).
export function liveGpa(s: GameState): number | null {
  const sc = s.school;
  if (!sc) return null;
  const free = freeSkips(sc);
  const items: { pct: number; credits: number }[] = sc.done.flatMap((t) => t.grades);
  if (!sc.done.some((t) => t.name === TERMS[sc.term]?.name)) {
    for (const c of sc.courses) {
      const p = coursePct(c, free);
      if (p !== null) items.push({ pct: p, credits: courseOf(c).credits });
    }
  }
  return gpaOf(items);
}
export function creditsEarned(s: GameState): number {
  const sc = s.school;
  if (!sc) return 0;
  return sc.done.reduce((a, t) => a + t.earned, 0) + (sc.extraCredits ?? 0);
}
export function creditsAttempted(s: GameState): number {
  return s.school ? s.school.done.reduce((a, t) => a + t.attempted, 0) : 0;
}
// Semesters still needed for a 120-credit degree at a full load (a late major adds one).
export function semestersLeft(s: GameState): number {
  const sc = s.school;
  const left = Math.max(0, DEGREE_CREDITS - creditsEarned(s));
  return Math.ceil(left / FULL_LOAD) + (sc?.lateDeclare ? 1 : 0);
}
// Good standing: still enrolled, GPA at least 2.0, not suspended, and a major once fall is over.
export function onTrackToGraduate(s: GameState): boolean {
  const sc = s.school;
  if (!sc || s.flags.enrolled === false || s.flags.suspended) return false;
  const g = gpa(s) ?? liveGpa(s) ?? 0;
  return g >= 2.0 && (sc.major !== 'undeclared' || sc.done.length === 0);
}
// Graduating in four years (failed classes and a late major push it back; summer credits pull it in).
export function onTime(s: GameState): boolean {
  return onTrackToGraduate(s) && semestersLeft(s) <= DEGREE_TERMS - (s.school?.done.length ?? 0);
}
// Expected starting salary after graduating (better grades and an internship help).
export function startingPay(s: GameState): number {
  const m = major(s);
  if (!m) return 0;
  const g = gpa(s) ?? 0;
  const sc = s.school;
  let pay = MAJORS[m].pay;
  if (g >= 3.5) pay *= 1.06;
  else if (g < 2.5) pay *= 0.92;
  if (sc?.internship) pay *= 1.05;
  return Math.round(pay / 500) * 500;
}

// ---------- weekly upkeep (called by the engine at the start of the events step) ----------
const sceneStep = (id: string, data?: Record<string, number | string>): Step => ({ t: 'scene', id, step: 'start', data });

export function collegeWeek(s: GameState): { steps: Step[]; quiet: boolean } {
  const out = { steps: [] as Step[], quiet: false };
  if (s.path !== 'college' || s.flags.enrolled === false) return out;
  const fresh = !s.school;
  const sc = ensureSchool(s)!;
  if (fresh && s.week <= TERMS[0].end) out.steps.push(sceneStep('col-major'));
  const w = s.week;

  // A semester that never closed (e.g. a save from mid-break) closes now.
  if (sc.term === 0 && w > TERMS[0].report) closeTerm(s, sc);

  // Attendance: the engine counts every skipped weekday.
  const skips = num(s, 'skips');
  const missed = skips > sc.skipsSeen;
  sc.skipsSeen = skips;
  const t = termOf(w);
  if (t !== null && t === sc.term) {
    for (const c of sc.courses) {
      c.held++;
      if (missed) c.missed++;
    }
    const over = (sc.courses[0]?.missed ?? 0) - freeSkips(sc);
    if (missed && over > 0) log(s, `Absences are now costing you participation points (${over} over the limit).`, 'bad');
  }

  // Lab and course fees.
  const m = MAJORS[sc.major];
  if (w === 3 || w === 20) {
    const [amt, what] = m.fees[w === 3 ? 0 : 1];
    if (amt > 0) {
      charge(s, amt, `${m.name} fees`);
      log(s, `${what}: ${money(amt)}. Your major has opinions about your budget.`, 'bad');
    }
  }

  const due = dueIn(w);
  if (due?.kind === 'hw' && due.term === sc.term) out.steps.push(sceneStep('col-hw', { k: due.k, c: due.course }));
  if (due?.kind === 'exam' && due.term === sc.term) {
    out.steps.push(sceneStep('col-exam', { exam: due.exam }));
    out.quiet = true;
  }
  if (due?.kind === 'report' && due.term === sc.term && !sc.done.some((r) => r.name === TERMS[due.term].name)) {
    const rec = closeTerm(s, sc);
    out.steps.push(sceneStep('col-report'));
    if (due.term === 0 && rec.gpa >= 3.5 && s.job && s.job.wage < MAJORS.undeclared.job.wage) out.steps.push(sceneStep('col-job'));
    out.quiet = true;
  }
  if (w === INTERN_WEEK && !sc.internship && (liveGpa(s) ?? 0) >= MAJORS[sc.major].intern.bar) out.steps.push(sceneStep('col-intern'));
  if (w === SUMMER_WEEK && !sc.extraCredits && (liveGpa(s) ?? 0) >= 2.0) out.steps.push(sceneStep('col-summer'));
  return out;
}

// ---------- assignments ----------
export type HwMode = 'well' | 'rush';
// Expected score before the luck of the draw.
export function hwScore(s: GameState, sc: School, course: number, mode: HwMode): number {
  const diff = courseOf(sc.courses[course] ?? sc.courses[0]).diff;
  const p = Math.min(2, hwPrep(s, sc));
  const e = s.stats.energy;
  if (mode === 'well') return clamp(76 + 8 * p + (e - 50) / 6 - (diff - 1) * 30 * (1 - 0.25 * p), 0, 100);
  return clamp(60 + 5 * p + (e - 50) / 6 - (diff - 1) * 30, 0, 100);
}

export function turnIn(s: GameState, course: number, score: number): void {
  const sc = s.school;
  if (!sc) return;
  const c = sc.courses[course];
  if (c) c.hw.push(Math.round(clamp(score, 0, 100)));
  sc.prepAt = num(s, 'studySessions');
}

export function noise(s: GameState, n: number): number {
  return (rand(s) * 2 - 1) * n;
}

// ---------- exams ----------
// Exam grade: the mini-game score blended with prep, attendance, energy, and how hard the class is.
export function examPct(m: number, prep: number, need: number, attRate: number, energyNow: number, diff: number): number {
  const p = Math.min(1, prep / Math.max(1, need));
  const tired = energyNow < 35 ? (35 - energyNow) * 0.6 : 0;
  return clamp(38 + 32 * m + 20 * p + 10 * attRate - (diff - 1) * 40 * (1 - 0.5 * p) - tired, 0, 100);
}

export function gradeExam(s: GameState, score: number, exam: 'midterm' | 'final'): string {
  const sc = ensureSchool(s);
  if (!sc) return '';
  const prep = examPrep(s, sc);
  const need = MAJORS[sc.major].need;
  const lines: string[] = [];
  for (const c of sc.courses) {
    const att = c.held ? (c.held - c.missed) / c.held : 1;
    const pct = Math.round(clamp(examPct(score, prep, need, att, s.stats.energy, courseOf(c).diff) + noise(s, 4), 0, 100));
    if (exam === 'midterm') c.mid = pct;
    else c.fin = pct;
    lines.push(`${courseOf(c).short}: ${pct}% (${letterOf(pct)})`);
  }
  sc.examAt = num(s, 'studySessions');
  sc.extraPrep = 0;
  energy(s, -10);
  xp(s, Math.round(2 + score * 4));
  inc(s, 'examsTaken');
  const avg = sc.courses.reduce((a, c) => a + ((exam === 'midterm' ? c.mid : c.fin) ?? 0), 0) / Math.max(1, sc.courses.length);
  const quip = avg >= 88 ? 'You walk out feeling like a genius.' : avg >= 75 ? 'Not bad. Not great. Very survivable.' : avg >= 62 ? 'Some of those questions were in a different language.' : 'You recognized your name on the page. That’s about it.';
  return `${exam === 'midterm' ? 'Midterm' : 'Final'} grades:\n${lines.join('\n')}\n\n${quip}${prep < need ? ` (You studied ${Math.floor(prep)} of the ${need} sessions this major really needs.)` : ''}`;
}

// ---------- semester end ----------
export const RETAKE_COST = 1100; // tuition for a 3–4 credit class, added to your loans
export const RETAKE_FEE = 50;
export const DEANS_BONUS = 250;

export function closeTerm(s: GameState, sc: School): TermRec {
  const free = freeSkips(sc);
  const last = sc.term >= TERMS.length - 1;
  const name = TERMS[Math.min(sc.term, TERMS.length - 1)].name;
  const grades: TermGrade[] = sc.courses.map((c) => {
    const pct = coursePct(c, free) ?? 0;
    return { id: c.id, pct, letter: letterOf(pct), credits: courseOf(c).credits };
  });
  const attempted = grades.reduce((a, g) => a + g.credits, 0);
  const earned = grades.filter((g) => g.letter !== 'F').reduce((a, g) => a + g.credits, 0);
  const rec: TermRec = { name, gpa: gpaOf(grades) ?? 0, grades, attempted, earned };
  sc.done.push(rec);
  unlock(s, 'sap');

  // Failed classes: you pay to take them again.
  const fails = grades.filter((g) => g.letter === 'F').length;
  if (fails) {
    sc.failed += fails;
    const add = fails * (RETAKE_COST + RETAKE_FEE);
    const loan = s.loans.find((l) => l.kind === 'student' && l.apr === 0);
    if (loan) loan.balance = round2(loan.balance + add);
    else s.loans.push({ name: 'Student loan', balance: add, apr: 0, payment: 0, kind: 'student', deferred: true });
    log(s, `Failed ${fails} class${fails > 1 ? 'es' : ''}. Retaking ${fails > 1 ? 'them' : 'it'} (tuition plus a ${money(RETAKE_FEE)} retake fee each) adds ${money(add)} to your loans.`, 'bad');
    inc(s, 'failedClasses', fails);
  }
  // Dean's List.
  if (rec.gpa >= 3.5) {
    achieve(s, 'deanslist');
    s.stats.cash = round2(s.stats.cash + DEANS_BONUS);
    inc(s, 'deansList');
    log(s, `Dean’s List! A ${money(DEANS_BONUS)} scholarship bonus lands in your account.`, 'good');
    rep(s, 5);
  }
  // Probation and good standing.
  const cum = gpa(s) ?? 0;
  if (rec.gpa < 2.0) {
    if (sc.probation) setFlag(s, 'suspended');
    sc.probation = true;
    unlock(s, 'academic-probation');
    log(s, 'Academic probation: GPA under 2.0. Fewer skips allowed, and the clock is ticking.', 'bad');
  } else if (sc.probation && cum >= 2.0) {
    sc.probation = false;
    log(s, 'Off academic probation. Your advisor actually smiles.', 'good');
  }
  if (cum >= 3.5) sc.honors = true;

  // Year end: the scholarship rides on a 3.0.
  if (last) {
    if (cum >= 3.0) {
      setFlag(s, 'careerDone');
      achieve(s, 'levelup');
    } else setFlag(s, 'scholarshipCut');
  }
  // Next semester.
  if (!last) {
    sc.term++;
    const m = MAJORS[sc.major];
    sc.courses = (sc.term ? m.spring : m.fall).map(freshCourse);
    sc.examAt = num(s, 'studySessions');
    sc.prepAt = num(s, 'studySessions');
    sc.extraPrep = 0;
  }
  return rec;
}

// ---------- office hours ----------
export const OFFICE_BONUS = 2;
export const OFFICE_CAP = 6;

export function weakestCourse(sc: School): number {
  const free = freeSkips(sc);
  let best = -1;
  let low = Infinity;
  sc.courses.forEach((c, i) => {
    if (c.bonus >= OFFICE_CAP) return;
    const p = coursePct(c, free) ?? 100;
    const score = p - courseOf(c).diff * 5; // ties go to the harder class
    if (score < low) {
      low = score;
      best = i;
    }
  });
  return best;
}

export const COLLEGE_ACTIVITIES: Activity[] = [
  {
    id: 'officehours',
    name: 'Go to office hours',
    icon: 'class',
    slots: ['evening'],
    desc: 'The professor is right there, with snacks, and nobody ever comes.',
    hint: (s) => {
      const sc = s.school;
      const i = sc ? weakestCourse(sc) : -1;
      return i < 0 ? 'Professors notice · −5 energy' : `+${OFFICE_BONUS}% in ${courseOf(sc!.courses[i]).short} · Counts as half a study session · −5 energy`;
    },
    hide: (s) => s.path !== 'college' || s.flags.enrolled === false || termOf(s.week) === null,
    run: (s) => {
      const sc = ensureSchool(s);
      if (!sc) return;
      energy(s, -5);
      rep(s, 2);
      xp(s, 1);
      sc.extraPrep += 0.5;
      inc(s, 'officeHours');
      const i = weakestCourse(sc);
      if (i < 0) {
        log(s, 'Office hours: you mostly talked about the professor’s dog. Still counts.', 'good');
        return;
      }
      const c = sc.courses[i];
      c.bonus = Math.min(OFFICE_CAP, c.bonus + OFFICE_BONUS);
      log(s, `Office hours for ${courseOf(c).name}: the professor walks you through it. +${OFFICE_BONUS}% in the class.`, 'good');
    },
  },
];

// ---------- the grades screen ----------
export interface CourseView {
  name: string;
  short: string;
  credits: number;
  pct: number | null;
  letter: string;
  att: number | null;
  hw: number | null;
  hwCount: number;
  mid: number | null;
  fin: number | null;
  bonus: number;
  diff: string;
}
export interface GradesView {
  major: string;
  level: string;
  term: string;
  live: number | null;
  termGpa: number | null;
  cum: number | null;
  credits: number;
  courses: CourseView[];
  upcoming: { week: number; label: string }[];
  missed: number;
  free: number;
  probation: boolean;
  prep: number;
  need: number;
  past: TermRec[];
  scholarship: string;
}

const diffWord = (d: number): string => (d >= 1.2 ? 'Hard' : d >= 1.0 ? 'Medium' : 'Easy');

export function upcoming(s: GameState, n = 4): { week: number; label: string }[] {
  const sc = s.school;
  if (!sc) return [];
  const out: { week: number; label: string }[] = [];
  for (let w = s.week; w <= TERMS[TERMS.length - 1].report && out.length < n; w++) {
    const d = dueIn(w);
    if (!d) continue;
    if (d.kind === 'hw' && d.term === sc.term) {
      const c = sc.courses[d.course];
      if (c) out.push({ week: w, label: `${courseOf(c).short}: ${courseOf(c).hw[d.k < 4 ? 0 : 1]}` });
    } else if (d.kind === 'exam' && d.term === sc.term) out.push({ week: w, label: d.exam === 'midterm' ? 'Midterm exams' : 'Final exams' });
    else if (d.kind === 'report' && d.term === sc.term) out.push({ week: w, label: 'Grades post' });
  }
  return out;
}

export function gradesView(s: GameState): GradesView | null {
  if (s.path !== 'college') return null;
  const sc = s.school ?? newSchool(s, 'undeclared');
  const free = freeSkips(sc);
  const m = MAJORS[sc.major];
  const courses: CourseView[] = sc.courses.map((c) => {
    const co = courseOf(c);
    const pct = coursePct(c, free);
    return {
      name: co.name,
      short: co.short,
      credits: co.credits,
      pct,
      letter: pct === null ? '—' : letterOf(pct),
      att: participation(c, free),
      hw: hwAvg(c),
      hwCount: c.hw.length,
      mid: c.mid,
      fin: c.fin,
      bonus: c.bonus,
      diff: diffWord(co.diff),
    };
  });
  const cum = gpa({ ...s, school: sc });
  const live = liveGpa({ ...s, school: sc });
  const finished = sc.done.some((r) => r.name === TERMS[TERMS.length - 1].name);
  return {
    major: m.name,
    level: m.level,
    term: finished ? 'Year complete' : `${TERMS[sc.term].name} semester`,
    live,
    termGpa: finished ? null : termGpa({ ...s, school: sc }),
    cum,
    credits: creditsEarned({ ...s, school: sc }),
    courses: finished ? [] : courses,
    upcoming: finished ? [] : upcoming({ ...s, school: sc }),
    missed: sc.courses[0]?.missed ?? 0,
    free,
    probation: sc.probation,
    prep: Math.floor(examPrep(s, sc) * 2) / 2,
    need: m.need,
    past: sc.done,
    scholarship: finished ? (s.flags.careerDone ? 'Scholarship renewed' : 'Scholarship cut') : (live ?? 4) >= 3.0 ? 'On track to keep your scholarship (3.0)' : 'Below the 3.0 your scholarship needs',
  };
}

// ---------- the epilogue ----------
export function collegeEpilogue(s: GameState): string[] {
  const sc = s.school;
  const out: string[] = [];
  if (!sc) {
    out.push(s.flags.careerDone ? 'Sophomore year starts with your scholarship intact.' : 'Your scholarship shrank, but you’re still enrolled and studying smarter.');
    return out;
  }
  const m = MAJORS[sc.major];
  const g = gpa(s) ?? 0;
  const keep = !!s.flags.careerDone;
  const pay = `$${startingPay(s).toLocaleString('en-US')}`;
  switch (sc.major) {
    case 'nursing':
      out.push(keep ? `Sophomore nursing student, ${gpaText(g)} GPA. Clinicals start next year, and hospitals are already asking when you graduate.` : `A ${gpaText(g)} GPA is under the nursing program’s cutoff. You can retake classes and reapply next year.`);
      break;
    case 'cs':
      out.push(keep ? `Computer Science, ${gpaText(g)} GPA. You survived Calculus twice. New developers start around ${pay}.` : `Calculus won this round (${gpaText(g)} GPA). You’re retaking it this summer, armed with more coffee.`);
      break;
    case 'business':
      out.push(keep ? `Business major, ${gpaText(g)} GPA. You can now say “synergy” with a straight face. Grads like you start around ${pay}.` : `Business major, ${gpaText(g)} GPA. Next year, more studying and fewer “networking events.”`);
      break;
    case 'education':
      out.push(keep ? `Future teacher, ${gpaText(g)} GPA. Starting pay is about ${pay}, but 10 years of teaching can get your federal loans forgiven.` : `Future teacher, ${gpaText(g)} GPA. You need a 3.0 to student-teach. Next year’s the year.`);
      break;
    default:
      out.push(keep ? `Still undeclared, ${gpaText(g)} GPA. Great grades, no plan. Your advisor sighs lovingly.` : `Still undeclared with a ${gpaText(g)} GPA. Picking a direction is next.`);
  }
  out.push(keep ? 'Your scholarship renews for sophomore year.' : 'Your GPA missed 3.0, so your scholarship gets cut. Next year means more loans.');
  if (num(s, 'deansList') > 0) out.push(`Dean’s List ${num(s, 'deansList') > 1 ? 'both semesters' : 'once'}. Your grandma has the email printed and framed.`);
  if (sc.internship) out.push(`Your ${sc.internship} starts in June. Real experience, on a real résumé.`);
  if (sc.lateDeclare) out.push(`Declaring ${m.name} late put you a semester behind. That’s about $5,000 more before you graduate.`);
  if (sc.failed > 0) out.push(`You’re retaking ${sc.failed} class${sc.failed > 1 ? 'es' : ''}. That added ${money(sc.failed * (RETAKE_COST + RETAKE_FEE))} to your loans.`);
  if (s.flags.suspended) out.push('Two semesters under a 2.0 means academic suspension. You’ll sit out a term and lose federal aid until you appeal.');
  else if (sc.probation) out.push('You’re still on academic probation. One more rough semester and you lose federal aid.');
  out.push(`Credits earned: ${creditsEarned(s)} of ${DEGREE_CREDITS}. ${!onTrackToGraduate(s) ? 'Graduation is further off than you planned.' : onTime(s) ? `On track to graduate in ${semestersLeft(s)} more semesters.` : `At this pace, that’s ${semestersLeft(s)} more semesters, not ${DEGREE_TERMS - (sc.done.length)}.`}`);
  return out;
}
