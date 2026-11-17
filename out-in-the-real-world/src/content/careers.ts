// Courses, the job hunt, and changing jobs: the rules. Scenes live in scenes/jobs.ts, listings in jobs.ts.
import { achieve, charge, earn, energy, inc, log, minigame, money, num, rand, rep, round2, scene, setFlag, unlock, xp } from '../engine/core.ts';
import type { GameState, MiniResult, SlotId, Step } from '../engine/types.ts';
import { COURSE_BY_ID, type Course } from './courses.ts';
import { LISTING_BY_ID, SCHEDULE_DRAIN, boardFor, fitFor, hasCar, jobFrom, jobValue, listingValue, tenure, tuitionAfter, type Listing } from './jobs.ts';
import { addSkill, hasSkill, skillName } from './skills.ts';
import type { Activity } from './types.ts';

// ---------- courses ----------
export function currentCourse(s: GameState): Course | null {
  const id = s.flags.course;
  return typeof id === 'string' && COURSE_BY_ID[id] ? COURSE_BY_ID[id] : null;
}

export function courseProgress(s: GameState): number {
  return num(s, 'courseProg');
}

// What you pay up front (some employers cover a course outright).
export function courseCost(s: GameState, c: Course): number {
  return c.free && c.free(s.path) ? 0 : c.cost;
}

export function enroll(s: GameState, c: Course, paid = courseCost(s, c)): void {
  s.flags.course = c.id;
  s.flags.courseProg = 0;
  s.flags.courseStart = s.week;
  s.flags.coursePaid = paid;
  if (c.monthly) s.subs.push({ id: 'course', label: `${c.name} (monthly)`, cost: c.monthly });
  unlock(s, 'invest-in-yourself');
  log(s, `Enrolled: ${c.name}${paid ? ` (${money(paid)})` : ''}.`, 'info');
}

function endCourse(s: GameState): void {
  s.flags.course = '';
  s.flags.courseProg = 0;
  s.subs = s.subs.filter((x) => x.id !== 'course');
}

export function dropCourse(s0: GameState): GameState {
  const s = structuredClone(s0);
  const c = currentCourse(s);
  if (!c) return s;
  endCourse(s);
  log(s, `Dropped ${c.name}. No refund.`, 'bad');
  return s;
}

function completeCourse(s: GameState, c: Course): string {
  endCourse(s);
  inc(s, 'coursesDone');
  addSkill(s, c.skill, `You finished ${c.name}.`);
  achieve(s, 'certified');
  let text = `\n\nCOURSE COMPLETE! New skill on your resume: ${skillName(c.skill)}. Check the job board.`;
  // Employer tuition help: paid back when you finish, if you've been there long enough. Leave soon after and you owe it back.
  const after = tuitionAfter(s);
  const paid = num(s, 'coursePaid');
  if (after !== null && paid > 0 && s.job) {
    if (tenure(s) >= after) {
      earn(s, paid);
      s.flags.clawback = paid;
      s.flags.clawbackUntil = s.week + 12;
      unlock(s, 'tuition-help');
      text += `\n\n${s.job.place} reimbursed your ${money(paid)} tuition! Catch: leave within 12 weeks and you pay it back.`;
    } else {
      text += `\n\n${s.job.place} only reimburses tuition after ${after} weeks on the job. You were ${after - tenure(s)} weeks short.`;
    }
  }
  return text;
}

// One study session for your course: career progress like studying, plus course progress.
export function courseSession(s: GameState, r: MiniResult): { text: string; tip?: string } {
  const c = currentCourse(s);
  const gain = Math.round(4 + r.score * 5);
  xp(s, gain);
  energy(s, -8);
  if (s.path === 'work') rep(s, 1);
  inc(s, 'studySessions');
  if (!c) return { text: `Career progress +${gain}.` };
  const units = r.score >= 0.85 ? 2 : r.score < 0.25 ? 0 : 1;
  const prog = Math.min(c.sessions, courseProgress(s) + units);
  s.flags.courseProg = prog;
  const note = units === 2 ? ' You aced the quiz and skipped ahead a module.' : units === 0 ? ' You failed the module quiz. Retake it next session.' : '';
  let text = `${c.name}: ${prog}/${c.sessions} sessions done.${note} Career progress +${gain}.`;
  if (prog >= c.sessions) text += completeCourse(s, c);
  return { text, tip: units === 0 ? 'Short, regular study sessions beat one giant cram. Sleep helps too.' : undefined };
}

// ---------- applying ----------
export function pendingJob(s: GameState): string | null {
  for (const k of ['newJobId', 'offerFor', 'interviewFor']) {
    const v = s.flags[k];
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

// Pick a listing to apply to this week (from the job board). Pure, for the UI.
export function setApplyTarget(s0: GameState, id: string | null): GameState {
  const s = structuredClone(s0);
  s.flags.applyTo = id ?? '';
  return s;
}

export function currentValue(s: GameState): number {
  return s.job ? jobValue(s.job) : 0;
}

// A listing worth jumping for: you qualify, it needs a skill you earned, and it's clearly better.
export function clearlyBetter(s: GameState, l: Listing): boolean {
  if (l.scam || !l.needs.skills?.length) return false;
  return listingValue(s, l) >= currentValue(s) * 1.12 + 20;
}

export function bestTarget(s: GameState): Listing | null {
  if (pendingJob(s)) return null;
  const ok = boardFor(s).filter((l) => fitFor(s, l).ok && clearlyBetter(s, l));
  ok.sort((a, b) => listingValue(s, b) - listingValue(s, a));
  return ok[0] ?? null;
}

// ---------- changing jobs ----------
// Seniority doesn't transfer. Run when you leave (or lose) a job.
function leaveJob(s: GameState): void {
  if (num(s, 'clawbackUntil') > s.week && num(s, 'clawback') > 0) {
    charge(s, num(s, 'clawback'), 'Tuition payback');
    log(s, `You left before 12 weeks were up, so you owe back the ${money(num(s, 'clawback'))} tuition help.`, 'bad');
  }
  s.flags.clawback = 0;
  s.flags.clawbackUntil = 0;
  s.flags.extraShifts = 0;
  for (const k of ['promo1', 'promo2', 'seen:ev-promo1', 'seen:ev-promo2']) delete s.flags[k];
}

function queueScene(s: GameState, id: string): void {
  const i = s.queue.findIndex((q) => q.t === 'events');
  const st: Step = { t: 'scene', id, step: 'start' };
  if (i < 0) s.queue.unshift(st);
  else s.queue.splice(i, 0, st);
}

export function startJob(s: GameState, l: Listing, wage: number): void {
  const old = s.job;
  if (old) leaveJob(s);
  // Hours already worked this pay period get paid at the old rate.
  if (old && s.hoursThisPeriod > 0 && wage > 0) s.hoursThisPeriod = round2((s.hoursThisPeriod * old.wage) / wage);
  s.job = jobFrom(l, wage);
  s.stats.rep = 50;
  s.flags.tenurePlace = l.place;
  s.flags.tenure = 0;
  if (s.health === 'employer') {
    s.health = 'none';
    s.dental = false;
  }
  // Landlords will take an offer letter as proof of income.
  s.flags.avgPaycheck = Math.max(num(s, 'avgPaycheck'), Math.round(wage * l.hours * 2));
  for (const k of ['newJobId', 'newJobWage', 'newJobAt', 'offerFor', 'offerWage', 'offerNeg', 'offerCounter', 'applyTo']) delete s.flags[k];
  if (s.flags.referral === l.id) delete s.flags.referral;
  inc(s, 'jobChanges');
  achieve(s, 'newjob');
  if (l.career?.includes(s.path) && !s.flags.careerDone) {
    setFlag(s, 'careerDone');
    achieve(s, 'levelup');
    log(s, `Career milestone reached: ${l.title}!`, 'good');
  }
  log(s, `First week as ${l.title} at ${l.place}: ${money(wage, true)}/hr, ${l.hours} hrs/week.`, 'good');
  queueScene(s, 'job-benefits');
}

// Accept the offer on the table. Notice: the switch happens in two weeks, and your boss becomes a reference.
export function acceptOffer(s: GameState, notice: boolean): void {
  const l = LISTING_BY_ID[String(s.flags.offerFor ?? '')];
  if (!l) return;
  const wage = num(s, 'offerWage') || l.wage;
  if (s.job && notice) {
    s.flags.refRep = s.stats.rep;
    s.flags.newJobId = l.id;
    s.flags.newJobWage = wage;
    s.flags.newJobAt = s.week + 2;
    delete s.flags.offerFor;
    unlock(s, 'two-weeks-notice');
    return;
  }
  if (s.job) {
    // Quitting without notice: the old boss won't vouch for you, and people talk.
    s.flags.refRep = 0;
    s.flags.burned = 1;
    log(s, `You quit ${s.job.place} with no notice. Don’t list them as a reference.`, 'bad');
  }
  startJob(s, l, wage);
}

// Some bosses end it the day you give notice.
export function walkedOut(s: GameState): boolean {
  return !!s.job && rand(s) < 0.12;
}

// ---------- every week ----------
export function careerWeek(s: GameState): void {
  if (!s.skills) s.skills = [];
  // Seeds the job board without touching the game's random stream.
  if (!num(s, 'boardSalt')) s.flags.boardSalt = 1 + ((s.seed >>> 0) % 999983);
  // Older saves bought the pharmacy course before courses existed: that's the CPhT course.
  if (s.flags.certEnrolled && !s.flags.certMigrated && !currentCourse(s) && !hasSkill(s, 'cpht')) {
    s.flags.course = 'cpht';
    s.flags.courseProg = 0;
  }
  s.flags.certMigrated = true;
  // Tenure: weeks at this job. Experience: weeks at any job.
  if (s.flags.tenurePlace === undefined) {
    s.flags.tenurePlace = s.job?.place ?? '';
    s.flags.tenure = s.job ? s.week - 1 : 0;
    s.flags.expWeeks = s.job ? s.week - 1 : 0;
  }
  const place = s.job?.place ?? '';
  if (place !== s.flags.tenurePlace) {
    leaveJob(s);
    s.flags.tenurePlace = place;
    s.flags.tenure = 0;
  }
  // Notice period over: the new job starts.
  const next = LISTING_BY_ID[String(s.flags.newJobId ?? '')];
  if (next && s.week >= num(s, 'newJobAt')) startJob(s, next, num(s, 'newJobWage') || next.wage);
  if (s.job) {
    inc(s, 'tenure');
    inc(s, 'expWeeks');
    const t = num(s, 'tenure');
    const art = s.job.art;
    if (t >= 8 && (art === 'grocery' || art === 'bank' || art === 'clinic' || art === 'library')) addSkill(s, 'service', `${t} weeks of dealing with the public will do that.`);
    if (t >= 8 && art === 'warehouse') addSkill(s, 'warehouse', `${t} weeks on the floor taught you how a warehouse really runs.`);
    if (s.flags.promo1 === true || (s.flags.careerDone && s.path === 'work' && /Lead/.test(s.job.title))) addSkill(s, 'leadership', 'Running a shift counts as leadership experience.');
    // New schedules and longer commutes wear on you.
    const drain = s.job.schedule ? SCHEDULE_DRAIN[s.job.schedule] : 0;
    if (drain) energy(s, -drain);
    if ((s.job.commute ?? 0) >= 30) {
      energy(s, -2);
      if (s.transport === 'car' || s.transport === 'borrow') {
        charge(s, 10, 'Extra gas');
        log(s, 'Longer commute: $10 more in gas.');
      }
    }
  }
  // Monthly course fees: unpaid means canceled.
  const c = currentCourse(s);
  if (c?.monthly) {
    if (!s.subs.some((x) => x.id === 'course')) {
      endCourse(s);
      log(s, `${c.name} was canceled for nonpayment. Your progress is gone.`, 'bad');
    } else if (s.week % 4 === 0) inc(s, 'coursePaid', c.monthly);
  }
  // A new skill just opened doors.
  if (num(s, 'newSkillWeek') === s.week - 1) {
    const fits = boardFor(s).filter((l) => !l.scam && fitFor(s, l).ok && l.needs.skills?.length).length;
    if (fits) log(s, `Your new skill qualifies you for ${fits} job${fits > 1 ? 's' : ''} on the job board.`, 'tip');
  }
}

// ---------- activities ----------
const FREE: SlotId[] = ['evening', 'saturday', 'sunday'];

export const CAREER_ACTIVITIES: Activity[] = [
  {
    id: 'course',
    name: (s) => {
      const c = currentCourse(s);
      return c ? `Course: ${c.name}` : 'Take an online course';
    },
    icon: 'study',
    slots: FREE,
    desc: (s) => {
      const c = currentCourse(s);
      return c ? `${c.provider}. Session ${courseProgress(s) + 1} of ${c.sessions}.` : 'Free community-college classes or paid certifications. Finish one and earn a job skill.';
    },
    hint: (s) => (currentCourse(s) ? '+1 session (mini-game) · −8 energy · +Career progress' : 'Browse courses: free to $350 · Each one earns a skill'),
    avail: (s, slot) => (currentCourse(s)?.saturday && slot !== 'saturday' ? 'Hands-on class meets Saturdays' : true),
    run: (s, slot) => {
      const c = currentCourse(s);
      if (c) minigame(s, 'flashcards', { course: c.id });
      else scene(s, 'course-pick', { slot });
    },
  },
  {
    id: 'apply',
    name: (s) => {
      const l = LISTING_BY_ID[String(s.flags.applyTo ?? '')];
      return l ? `Apply: ${l.title}` : 'Apply for a job';
    },
    icon: 'search',
    slots: FREE,
    desc: (s) => {
      const l = LISTING_BY_ID[String(s.flags.applyTo ?? '')];
      return l ? `${l.place}, ${money(l.wage, true)}/hr. Cover letter, application, follow-up email.` : 'Pick from the job board (briefcase button up top), then fill out applications.';
    },
    hint: () => '−5 energy · Interviews get scheduled next week',
    avail: (s) => (pendingJob(s) ? 'Finish the job you’re already in the running for' : true),
    hide: (s) => s.path === 'trade',
    run: (s) => {
      energy(s, -5);
      scene(s, 'job-apply');
    },
  },
];

export { hasCar };
