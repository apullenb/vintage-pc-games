// Courses, applications, interviews, offers, and first days at a new job.
import { achieve, charge, log, minigame, money, num, rep, schedule, unlock } from '../../engine/core.ts';
import type { GameState } from '../../engine/types.ts';
import { acceptOffer, clearlyBetter, courseCost, currentValue, enroll, pendingJob, walkedOut } from '../careers.ts';
import { COURSES, type Course } from '../courses.ts';
import { LISTING_BY_ID, SCHEDULE_LABEL, boardFor, fitFor, hasCar, listingValue, offerWage, reference, type Listing } from '../jobs.ts';
import { hasSkill, skillName } from '../skills.ts';
import type { Choice, Data, GameEvent, Scene } from '../types.ts';

const MAX_LISTINGS = 14;

const listingOf = (id: unknown): Listing | undefined => LISTING_BY_ID[String(id ?? '')];
const offerListing = (s: GameState): Listing | undefined => listingOf(s.flags.offerFor);
const interviewListing = (s: GameState): Listing | undefined => listingOf(s.flags.interviewFor);

function perMonth(wage: number, hours: number): number {
  return Math.round(wage * hours * 4.33);
}

function benefitsLine(l: Listing): string {
  if (!l.health) return 'No health plan';
  return `Health plan (${money(l.premium)}/check)${l.match ? `, ${Math.round(l.match * 100)}% 401(k) match` : ''}`;
}

// Listings in the order shown on the application screen: your pick first.
function applyList(s: GameState): Listing[] {
  const all = boardFor(s);
  const pick = listingOf(s.flags.applyTo);
  return pick && all.includes(pick) ? [pick, ...all.filter((l) => l !== pick)] : all;
}

// ---------- course catalog ----------
function courseChoice(c: Course): Choice {
  return {
    label: c.name,
    hint: (s) => {
      const cost = courseCost(s, c);
      const price = cost === 0 ? (c.cost ? '✓ Free (your employer pays)' : '✓ Free') : c.monthly ? `✗ ${money(c.monthly)}/month while enrolled` : `✗ ${money(cost)}`;
      const speed = `${c.sessions} sessions${c.sessions >= 5 ? ' (slow)' : c.sessions <= 2 ? ' (quick)' : ''}`;
      return [`✓ Earns: ${skillName(c.skill)}`, price, speed, c.saturday ? 'Saturdays only' : ''].filter(Boolean).join(' · ');
    },
    pay: (s) => courseCost(s, c),
    hide: (s) => hasSkill(s, c.skill),
    req: (s) => (c.needsLicense && !s.flags.license ? 'Needs a driver’s license first' : true),
    bot: (s) => courseBot(s, c),
    do: (s, d, m) => {
      enroll(s, c);
      if (m === 'card') log(s, `${c.name} went on your credit card.`, 'info');
      // Orientation is short: start the first session tonight (hands-on classes wait for Saturday).
      d.now = !c.saturday || d.slot === 'saturday' ? 1 : 0;
      if (d.now) minigame(s, 'flashcards', { course: c.id });
    },
    result: (_s, d) => `Enrolled in ${c.name}. ${c.desc}\n\n${d.now ? 'First session starts now.' : 'First hands-on class is Saturday.'}`,
    tip: 'Free courses cost time. Paid ones cost money. Either way, finish it: half a certificate is worth zero.',
  };
}

// What a sensible player would study: the skill that unlocks a clearly better job on their path.
function courseBot(s: GameState, c: Course): number {
  const want: Record<string, Record<string, number>> = {
    home: { cpht: 5, service: 2 },
    work: { lead: 5, 'excel-free': 1 },
    college: {},
    trade: { osha10: 2 },
  };
  return want[s.path][c.id] ?? 0;
}

// ---------- the application ----------
function listingChoice(i: number): Choice {
  const at = (s: GameState): Listing | undefined => applyList(s)[i];
  return {
    label: (s) => {
      const l = at(s)!;
      return `${s.flags.applyTo === l.id ? '★ ' : ''}${l.title} · ${l.place} · ${money(offerWage(s, l), true)}/hr`;
    },
    hint: (s) => {
      const l = at(s)!;
      if (l.scam) return '✓ No experience needed · ✓ Work from home';
      const f = fitFor(s, l);
      const miss = [...f.hard, ...(s.flags.referral === l.id ? [] : f.soft)];
      return miss.length ? `✗ Missing: ${miss.join(', ')}` : `✓ You meet the requirements${s.flags.referral === l.id ? ' · ✓ Rae referred you' : ''}`;
    },
    hide: (s) => !at(s),
    bot: (s) => {
      const l = at(s)!;
      if (l.scam) return -5;
      return fitFor(s, l).ok && clearlyBetter(s, l) ? 3 + listingValue(s, l) / 1000 : -2;
    },
    do: (s, d) => {
      const l = at(s)!;
      d.job = l.id;
      delete s.flags.applyTo;
      if (l.scam) {
        d.out = 'scam';
        return;
      }
      const f = fitFor(s, l);
      if (!f.ok) {
        d.out = 'reject';
        d.miss = [...f.hard, ...f.soft].join(', ');
        return;
      }
      d.out = 'invite';
      s.flags.interviewFor = l.id;
    },
    next: (_s, d) => String(d.out),
  };
}

const slotFree = (s: GameState, week: number, slot: 'weekday' | 'evening'): boolean => !s.appointments.some((a) => a.week === week && a.slot === slot);

function bookInterview(s: GameState, slot: 'weekday' | 'evening'): void {
  let week = s.week + 1;
  while (!slotFree(s, week, slot)) week++;
  const l = interviewListing(s);
  s.flags.intDay = slot === 'weekday' ? 1 : 0;
  if (slot === 'weekday') schedule(s, { week, slot: 'weekday', kind: 'jobint', label: `Interview: ${l?.title ?? 'new job'}` });
  else schedule(s, { week, slot: 'evening', kind: 'jobint', label: `Video interview: ${l?.title ?? 'new job'}` });
}

// ---------- the interview ----------
type Family = 'service' | 'safety' | 'office';
function familyOf(l: Listing | undefined): Family {
  if (!l) return 'service';
  if (l.art === 'warehouse' || l.art === 'road' || l.art === 'jobsite') return 'safety';
  if (l.art === 'office') return 'office';
  return 'service';
}

const add = (n: number) => (_s: GameState, d: Data) => void (d.pts = Number(d.pts ?? 0) + n);

const Q2: Record<Family, { q: string; good: string; ok: string; bad: string }> = {
  service: {
    q: '“A customer is yelling about a price that rang up wrong. What do you do?”',
    good: 'Listen, apologize, fix what I can, and get a manager for the rest',
    ok: 'Give them a discount so they’ll leave',
    bad: 'Point out that the sign was very clear',
  },
  safety: {
    q: '“You see a coworker skip a safety step to hit their numbers. What do you do?”',
    good: 'Say something, and tell a lead if it keeps happening',
    ok: 'Stay out of it, but keep my distance',
    bad: 'Skip it too. Numbers are numbers',
  },
  office: {
    q: '“You find a mistake you made last week. Nobody’s noticed. Now what?”',
    good: 'Tell my boss, fix it, and explain how I’ll catch it next time',
    ok: 'Fix it quietly and move on',
    bad: 'Hope it stays unnoticed',
  },
};

// Interview extras: how you showed up, who vouched for you, and what's already on your resume.
function bonus(s: GameState): { pts: number; notes: string[] } {
  const l = interviewListing(s);
  const notes: string[] = [];
  let pts = 0;
  if (num(s, 'intDay') === 1) {
    pts += 1;
    notes.push('✓ Showed up in person');
  }
  if (l && s.flags.referral === l.id) {
    pts += 1;
    notes.push('✓ Rae’s referral');
  }
  if (l?.prefer && hasSkill(s, l.prefer)) {
    pts += 1;
    notes.push(`✓ Bonus skill: ${skillName(l.prefer)}`);
  }
  if (reference(s) >= 75) {
    pts += 1;
    notes.push('✓ Glowing reference');
  }
  if (s.flags.burned) {
    pts -= 1;
    notes.push('✗ They called a boss you quit on');
  }
  if (s.stats.energy < 25) {
    pts -= 1;
    notes.push('✗ You looked exhausted');
  }
  return { pts, notes };
}

const OFFER_AT = 5;

function offerText(s: GameState): string {
  const l = offerListing(s);
  if (!l) return 'The offer fell through.';
  const wage = num(s, 'offerWage') || l.wage;
  const now = s.job ? perMonth(s.job.wage, s.job.hours) : 0;
  const then = perMonth(wage, l.hours);
  const diff = then - now;
  const vs = s.job ? `\n\nVs. ${s.job.place}: ${diff >= 0 ? '+' : '−'}${money(Math.abs(diff))}/month before taxes.` : '';
  return `“We’d like to offer you the job.”\n\n${l.title}, ${l.place}\n${money(wage, true)}/hr · ${l.hours} hrs/week (${money(then)}/month)\n${benefitsLine(l)}\n${SCHEDULE_LABEL[l.schedule]} · ${l.bus ? `${l.commute} min by bus` : `${l.commute} min drive, no bus`}${l.perk ? `\n${l.perk}` : ''}${vs}`;
}

function counterRaise(s: GameState): number {
  const l = offerListing(s);
  if (!l || !s.job) return 0;
  const gap = (num(s, 'offerWage') || l.wage) - s.job.wage;
  if (s.stats.rep >= 70) return Math.max(0.5, Math.min(1.5, Math.round(gap * 4) / 4));
  if (s.stats.rep >= 60) return 0.75;
  return 0;
}

// ---------- scenes ----------
export const JOB_SCENES: Scene[] = [
  {
    id: 'course-pick',
    title: 'Online courses',
    art: (s) => s.housing.art,
    kind: 'task',
    steps: {
      start: {
        text: (s) => {
          const perk = s.job?.place === 'ParcelPoint' || (s.job?.id && LISTING_BY_ID[s.job.id]?.tuition) ? `\n\n${s.job.place} pays back tuition for courses you finish once you’ve been there long enough.` : '';
          return `A dozen tabs open. One course at a time: you have a job and a life. Free ones take longer. Paid ones cost money.${perk}`;
        },
        choices: [
          ...COURSES.map(courseChoice),
          { label: 'Not now', hint: 'Close the tabs, keep your evening', bot: 0.5, result: 'You bookmark three courses. That counts as something, right?' },
        ],
      },
    },
  },
  {
    id: 'job-apply',
    title: 'Job applications',
    art: 'office',
    kind: 'task',
    steps: {
      start: {
        text: (s) => {
          const pick = listingOf(s.flags.applyTo);
          return pick
            ? `Cover letter open. Resume updated. Time to apply for ${pick.title} at ${pick.place}… or something else on the board.`
            : 'You scroll the job board with a snack and low expectations. Which one?';
        },
        choices: [
          ...Array.from({ length: MAX_LISTINGS }, (_, i) => listingChoice(i)),
          { label: 'Never mind', hint: 'Keep the job you have', bot: 0, result: 'You close the laptop. Maybe next week.' },
        ],
      },
      reject: {
        text: (_s, d) => {
          const l = listingOf(d.job);
          return `Two days later:\n\n“Thank you for applying for ${l?.title ?? 'the position'}. We’re moving forward with candidates who have: ${d.miss}. Please apply again in the future.”`;
        },
        speaker: 'hr',
        choices: [
          {
            label: 'Ouch. Noted.',
            result: 'At least they told you what’s missing. That’s a to-do list.',
            tip: 'A rejection that names the requirements is useful. Take the course, get the license, then apply again.',
          },
        ],
      },
      invite: {
        text: (_s, d) => {
          const l = listingOf(d.job);
          return `An email!\n\n“Thanks for applying to ${l?.place}. We’d like to interview you for ${l?.title}. Does next week work?”`;
        },
        speaker: 'hr',
        choices: [
          {
            label: 'In person, next weekday',
            hint: (s) => (s.job && s.path !== 'college' ? `✓ Better impression · ✗ A day off work (−${money(8 * s.job.wage)})` : '✓ Better impression · ✓ You’re free anyway'),
            bot: 2,
            do: (s) => bookInterview(s, 'weekday'),
            result: 'It’s on your calendar. Iron something.',
          },
          {
            label: 'Video call, next evening',
            hint: '✓ No lost pay · ✗ Uses an evening · ✗ Harder to stand out on a laggy call',
            bot: 1,
            do: (s) => bookInterview(s, 'evening'),
            result: 'It’s on your calendar. Clean the part of your room the camera can see.',
            tip: 'For video interviews: test your camera, sit facing a window, and look at the lens, not your own face.',
          },
        ],
      },
      scam: {
        text: (_s, d) => {
          const l = listingOf(d.job);
          return `Twenty minutes later:\n\n“${l?.scam?.pitch ?? ''}”`;
        },
        choices: [
          {
            label: (_s, d) => (listingOf(d.job)?.scam?.fee ? `Pay the ${money(listingOf(d.job)?.scam?.fee ?? 0)} and get started` : 'Deposit the check and buy the gift cards'),
            hint: '✓ Easy money!',
            bot: -5,
            do: (s, d) => {
              const l = listingOf(d.job);
              const lost = l?.scam?.fee || 400;
              charge(s, lost, 'Job “starter fee”');
              if (!l?.scam?.fee) charge(s, 35, 'Returned check fee');
              unlock(s, 'job-scam');
              s.flags.jobScammed = num(s, 'jobScammed') + 1;
            },
            result: (_s, d) =>
              listingOf(d.job)?.scam?.fee
                ? 'The “company” stops answering. The website is gone. So is your money.\n\nRed flags: hired with no interview, and you paid them.'
                : 'A week later the check bounces. The bank takes back the deposit, and the gift cards you bought with your own money are long gone. −$400, plus a $35 fee.',
            tip: 'Real jobs pay you. They never charge a fee to start, send you checks to “forward,” or pay in gift cards.',
          },
          {
            label: 'Something’s off. Report the listing',
            hint: '✓ Keep your money · ✓ Help the next person',
            bot: 4,
            do: (s, d) => {
              unlock(s, 'job-scam');
              achieve(s, 'redflag');
              const l = listingOf(d.job);
              d.flags = (l?.scam?.flags ?? []).join(' · ');
            },
            result: (_s, d) => `You report it to the job site. Two days later the listing is gone.\n\nRed flags: ${d.flags}.`,
            tip: 'If a job pays way above normal, hires you without a real interview, or asks you for money, it’s a scam.',
          },
        ],
      },
    },
  },
  {
    id: 'appt-jobint',
    title: (s) => `Interview: ${interviewListing(s)?.title ?? offerListing(s)?.title ?? 'new job'}`,
    art: 'interview',
    speaker: 'hr',
    kind: 'appt',
    steps: {
      start: {
        text: (s) => {
          const l = interviewListing(s);
          if (!l) return 'The interview got canceled. They “went another direction.”';
          return `${num(s, 'intDay') ? `You’re at ${l.place}, ten minutes early.` : 'Camera on. Your face is lit like a hostage video.'} The hiring manager smiles.\n\n“So, ${s.name}. Tell me a little about yourself.”`;
        },
        choices: [
          { label: 'Keep it short: your job, what you’ve learned, why this role', bot: 3, hide: (s) => !interviewListing(s), do: (_s, d) => void (d.pts = 2), next: 'q2' },
          { label: 'Start from kindergarten', bot: -1, hide: (s) => !interviewListing(s), do: (_s, d) => void (d.pts = 0), next: 'q2' },
          { label: '“Well, what do you want to know?”', bot: 0, hide: (s) => !interviewListing(s), do: (_s, d) => void (d.pts = 1), next: 'q2' },
          { label: 'Oh well', hide: (s) => !!interviewListing(s), do: (s) => void delete s.flags.interviewFor },
        ],
      },
      q2: {
        text: (s) => Q2[familyOf(interviewListing(s))].q,
        choices: [
          { label: (s) => Q2[familyOf(interviewListing(s))].ok, bot: 0, do: add(1), next: 'q3' },
          { label: (s) => Q2[familyOf(interviewListing(s))].good, bot: 3, do: add(2), next: 'q3' },
          { label: (s) => Q2[familyOf(interviewListing(s))].bad, bot: -2, do: add(0), next: 'q3' },
        ],
      },
      q3: {
        text: '“Last thing. Any questions for us?”',
        choices: [
          { label: '“How soon can I take vacation?”', bot: -2, do: add(0), next: 'verdict' },
          { label: '“What does a great first 90 days look like here?”', bot: 3, do: add(2), next: 'verdict' },
          { label: '“What’s the pay schedule?”', bot: 0, do: add(1), next: 'verdict' },
          { label: '“Nope, I’m good!”', bot: -1, do: add(0), next: 'verdict' },
        ],
      },
      verdict: {
        text: (s, d) => {
          const b = bonus(s);
          const total = Number(d.pts ?? 0) + b.pts;
          return `“Thanks for coming in. We’ll be in touch.”\n\nYour answers: ${Number(d.pts ?? 0)}/6${b.notes.length ? `\n${b.notes.join('\n')}` : ''}\n\n${total >= OFFER_AT ? 'That went… well? Your phone buzzes the next morning.' : 'You replay every answer on the way home.'}`;
        },
        choices: [
          {
            label: 'Check your email',
            do: (s, d) => {
              const l = interviewListing(s);
              const total = Number(d.pts ?? 0) + bonus(s).pts;
              delete s.flags.interviewFor;
              unlock(s, 'job-interview');
              if (l && total >= OFFER_AT) {
                s.flags.offerFor = l.id;
                s.flags.offerWage = offerWage(s, l);
                d.offer = 1;
              } else d.offer = 0;
            },
            next: (_s, d) => (d.offer ? 'offer' : 'nooffer'),
          },
        ],
      },
      nooffer: {
        text: '“We’ve decided to go with another candidate. We’ll keep your resume on file.”',
        speaker: 'hr',
        choices: [
          {
            label: 'On to the next one',
            result: 'It stings. You had the skills; the interview didn’t show it.',
            tip: 'Practice out loud. Answer with a real example: the problem, what you did, and how it turned out.',
          },
        ],
      },
      offer: {
        text: (s) => offerText(s),
        speaker: 'hr',
        choices: [
          {
            label: 'Accept and give two weeks’ notice',
            hint: '✓ Leave on good terms (your boss stays a reference) · ✗ Two more weeks at the old pay',
            hide: (s) => !s.job || !offerListing(s),
            bot: (s) => (offerListing(s) && clearlyBetter(s, offerListing(s)!) ? 3 : -2),
            do: (s, d) => {
              const l = offerListing(s)!;
              const was = s.job!.place;
              acceptOffer(s, true);
              if (walkedOut(s)) {
                d.walked = 1;
                s.job = null;
                if (s.health === 'employer') s.health = 'none';
                log(s, `${was} walked you out the day you gave notice. Two weeks with no paycheck.`, 'bad');
              }
              d.start = num(s, 'newJobAt');
              d.place = l.place;
              d.was = was;
            },
            result: (_s, d) =>
              d.walked
                ? `Your manager reads the letter, sighs, and says, “Let’s make today your last day.” Ouch. You start at ${d.place} in week ${d.start}. No paycheck until then.`
                : `Your manager reads the letter. “I’m bummed, but congrats. You did this right.” You start at ${d.place} in week ${d.start}.`,
            tip: 'Two weeks’ notice is a courtesy, not a law, but it protects your reference. Some employers end things on the spot, so have a little cash saved first.',
          },
          {
            label: (s) => (s.job ? 'Quit today and start Monday' : 'Accept and start Monday'),
            hint: (s) => (s.job ? '✓ Higher pay sooner · ✗ Burns the bridge: no reference from your boss' : '✓ A paycheck again!'),
            hide: (s) => !offerListing(s),
            bot: (s) => (!s.job ? 4 : -1),
            do: (s, d) => {
              d.place = offerListing(s)!.place;
              acceptOffer(s, false);
            },
            result: (_s, d) => `Done. You start at ${d.place} on Monday. New badge, new coworkers, new everything.`,
          },
          {
            label: 'Negotiate the pay',
            hint: '✓ Up to $1.50/hr more (mini-game) · ✗ Takes nerve',
            hide: (s) => !!s.flags.offerNeg || !offerListing(s),
            bot: -1,
            do: (s) => {
              s.flags.offerNeg = true;
              minigame(s, 'haggle', { item: 'raise', offer: 1 });
            },
          },
          {
            label: 'Tell your boss about the offer',
            hint: '✓ They might raise your pay to keep you · ✗ Now they know you’re looking',
            hide: (s) => !s.job || !!s.flags.offerCounter || !offerListing(s) || s.path === 'college',
            bot: -1,
            do: (s, d) => {
              s.flags.offerCounter = true;
              d.raise = counterRaise(s);
              if (!d.raise) rep(s, -3);
            },
            next: (_s, d) => (d.raise ? 'counter' : 'offer'),
            result: (_s, d) => (d.raise ? '' : `“We can’t match that. Good luck.” Your boss is a little cooler toward you now.`),
          },
          {
            label: 'Decline politely',
            hint: '✓ Keep your seniority and your schedule',
            bot: (s) => (offerListing(s) && clearlyBetter(s, offerListing(s)!) ? -1 : 2),
            do: (s) => void delete s.flags.offerFor,
            result: '“Understood. Best of luck!” You keep doing what you’re doing.',
          },
        ],
      },
      counter: {
        text: (s, d) => `Your boss leans back. “I don’t want to lose you. I can do ${money(Number(d.raise), true)} more an hour, starting next paycheck.”\n\nThat would make it ${money((s.job?.wage ?? 0) + Number(d.raise), true)}/hr at ${s.job?.place}.`,
        speaker: 'boss',
        choices: [
          {
            label: 'Stay and take the raise',
            hint: '✓ More pay, same seniority · ✗ Turn down the new job',
            bot: 1,
            do: (s, d) => {
              if (s.job) s.job.wage = Math.round((s.job.wage + Number(d.raise)) * 100) / 100;
              delete s.flags.offerFor;
              unlock(s, 'raise');
              achieve(s, 'raise');
            },
            result: 'You stay. Your next paycheck is bigger, and your boss knows you have options.',
            tip: 'A competing offer is the strongest raise argument there is. Only use it if you’d really take the other job.',
          },
          {
            label: 'Thanks, but I’m taking the new job',
            hint: '✗ Your boss is annoyed you asked',
            bot: 1,
            do: (s) => rep(s, -5),
            next: 'offer',
          },
        ],
      },
    },
  },
  {
    id: 'job-benefits',
    title: (s) => `First day at ${s.job?.place ?? 'work'}`,
    art: (s) => s.job?.art ?? 'office',
    speaker: 'hr',
    kind: 'story',
    steps: {
      start: {
        text: (s) => `New badge. New locker. New HR person with a clipboard.\n\n“W-4, direct deposit, and${s.job?.healthOffered ? ' benefits. Your old plan doesn’t follow you, so pick again' : ' that’s about it'}.”`,
        choices: [{ label: 'Let’s do this', next: (s) => (s.job?.healthOffered ? 'health' : 'nohealth') }],
      },
      nohealth: {
        text: (s) =>
          s.health === 'parents'
            ? `${s.job?.place} doesn’t offer health insurance. You’re still on your parents’ plan, so you’re covered.`
            : `${s.job?.place} doesn’t offer health insurance. Unless you buy your own plan, you’re uninsured.`,
        choices: [
          {
            label: 'Got it',
            next: (s) => (s.retirePct > 0 ? 'retire' : null),
            tip: 'Lost your job’s health plan? Changing jobs counts as a “life event,” so you can sign up for a marketplace plan right away.',
          },
        ],
      },
      health: {
        text: (s) => `HEALTH PLAN: ${money(s.job?.premium ?? 0)} per paycheck. Doctor visits $35, ER capped at $500.${s.health === 'parents' ? '\n\nOr stay on your parents’ plan (you’re under 26).' : ''}`,
        choices: [
          {
            label: (s) => `Enroll (−${money(s.job?.premium ?? 0)}/paycheck)`,
            hint: '✓ Big bills capped · ✗ Smaller paychecks',
            bot: (s) => (s.health === 'parents' ? 0 : 2),
            do: (s) => {
              s.health = 'employer';
              unlock(s, 'health-insurance');
            },
            next: (s) => (s.job?.dentalPremium ? 'dental' : s.job?.match || s.retirePct ? 'retire' : null),
          },
          {
            label: 'Stay on my parents’ plan',
            hint: '✓ Free to you · ✗ Ends at 26',
            hide: (s) => s.health !== 'parents',
            bot: 3,
            next: (s) => (s.job?.match || s.retirePct ? 'retire' : null),
          },
          {
            label: 'Skip it',
            hint: '✓ Bigger paychecks · ✗ One accident could cost thousands',
            hide: (s) => s.health === 'parents',
            bot: -1,
            do: (s) => {
              s.health = 'none';
            },
            next: (s) => (s.job?.match || s.retirePct ? 'retire' : null),
          },
        ],
      },
      dental: {
        text: (s) => `DENTAL: ${money(s.job?.dentalPremium ?? 0)} per paycheck. Cleanings free, fillings 80% covered.`,
        choices: [
          { label: 'Add dental', bot: 2, do: (s) => void (s.dental = true), next: (s) => (s.job?.match || s.retirePct ? 'retire' : null) },
          { label: 'No dental', bot: -1, do: (s) => void (s.dental = false), next: (s) => (s.job?.match || s.retirePct ? 'retire' : null) },
        ],
      },
      retire: {
        text: (s) =>
          s.job?.match
            ? `401(k): put in 4% and ${s.job.place} adds ${Math.round(s.job.match * 100)}% of your pay.${s.retirePct ? ' Your old 401(k) stays yours.' : ''}`
            : `No 401(k) match here. Your old 401(k) stays yours. Keep putting 4% into a retirement account anyway?`,
        choices: [
          {
            label: (s) => (s.job?.match ? 'Contribute 4% and get the match' : 'Keep saving 4%'),
            hint: (s) => (s.job?.match ? '✓ Free money' : '✓ Still grows for decades · ✗ No free match'),
            bot: (s) => (s.job?.match ? 3 : 1),
            do: (s) => {
              s.retirePct = 0.04;
              unlock(s, '401k');
            },
          },
          {
            label: 'Not right now',
            hint: '✓ Bigger paychecks',
            bot: 0,
            do: (s) => {
              s.retirePct = 0;
            },
          },
        ],
      },
    },
  },
  {
    id: 'ev-referral',
    title: 'Rae knows a guy',
    art: 'street',
    speaker: 'rae',
    kind: 'event',
    steps: {
      start: {
        text: (s) => {
          const l = referralPick(s);
          return l
            ? `Rae texts: “My cousin works at ${l.place}. They’re hiring a ${l.title}. Want me to pass your resume along? Gets you out of the pile.”`
            : 'Rae texts a meme about job hunting. Relatable.';
        },
        choices: [
          {
            label: 'Yes! Send it',
            hint: (s) => {
              const l = referralPick(s);
              const hard = l ? fitFor(s, l).hard : [];
              return `✓ Skips the experience and reference checks · ✓ Helps the interview${hard.length ? ` · ✗ Still need: ${hard.join(', ')}` : ''}`;
            },
            hide: (s) => !referralPick(s),
            bot: 2,
            do: (s) => {
              const l = referralPick(s)!;
              s.flags.referral = l.id;
              unlock(s, 'networking');
            },
            result: `“Done. She said she’ll flag it.” It’s on your job board now. Apply soon.`,
            tip: 'Lots of jobs are filled through someone who knows someone. Tell friends what kind of work you want.',
          },
          { label: 'I’m good for now', bot: 0, result: '“Cool cool. Offer stands.”' },
        ],
      },
    },
  },
];

// The job Rae's friend can help with: a better one where only experience or a reference is in the way.
export function referralPick(s: GameState): Listing | null {
  if (pendingJob(s) || s.path === 'trade') return null;
  const now = currentValue(s);
  const opts = boardFor(s).filter((l) => !l.scam && listingValue(s, l) > now && s.flags.referral !== l.id && (l.bus || hasCar(s)));
  opts.sort((a, b) => {
    const fa = fitFor(s, a);
    const fb = fitFor(s, b);
    return fa.hard.length - fb.hard.length || fb.soft.length - fa.soft.length || listingValue(s, b) - listingValue(s, a);
  });
  return opts[0] ?? null;
}

export const JOB_EVENTS: GameEvent[] = [
  { id: 'ev-referral', weight: (s: GameState) => (num(s, 'friendTime') >= 2 && !s.flags.referral && referralPick(s) ? 1.4 : 0), cooldown: 10, minWeek: 7 },
];

// Haggling over an offer: the result goes back into the offer.
export function negotiated(s: GameState, raise: number): string {
  const l = offerListing(s);
  if (l && raise > 0) s.flags.offerWage = Math.round(((num(s, 'offerWage') || l.wage) + raise) * 100) / 100;
  s.queue.unshift({ t: 'scene', id: 'appt-jobint', step: 'offer' });
  return raise > 0 ? `“Fair. We can do ${money(num(s, 'offerWage'), true)} an hour.” +${money(raise, true)}/hr before you even start!` : '“That’s our best offer.” The number stays put, but the offer’s still on the table.';
}

