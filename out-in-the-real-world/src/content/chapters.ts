// Six chapters of the first year on your own, each with missions and a deadline.
import { badDebt, charge, creditScore, log, money, num, rep } from '../engine/core.ts';
import type { GameState, PathId } from '../engine/types.ts';
import type { Chapter, Task } from './types.ts';
import { gpaText, liveGpa } from './college.ts';

export const CHAPTERS: Chapter[] = [
  {
    title: 'Out the Door',
    subtitle: 'Weeks 1–6 · Summer after graduation',
    weeks: 6,
    art: 'bedroom',
    intro: (s) =>
      `The cap is tossed. The cake is gone. Starting now, ${s.name}, the paperwork has your name on it. First up: a real bank account and a driver’s license.`,
  },
  {
    title: 'Wheels & Teeth',
    subtitle: 'Weeks 7–12 · Late summer',
    weeks: 6,
    art: 'carlot',
    intro: (s) =>
      ({
        home: 'Your mom needs her car back for her new job. You need a way to get to work. Also, she says you haven’t been to the dentist since junior year.',
        college: 'Classes are rolling. You’re living on the bus schedule. And there’s a tooth in the back that’s been… talking to you.',
        trade: 'Your carpool buddy Marco is switching crews. Job sites move every week, and you need a reliable ride. Also, when did you last see a dentist?',
        work: 'The bus to the warehouse runs late twice a week, and your supervisor has noticed. And you can’t remember your last dental cleaning.',
      })[s.path] + ' A real adult also keeps a cushion of cash. Time to start an emergency fund.',
  },
  {
    title: 'Home Sweet Home',
    subtitle: 'Weeks 13–18 · Fall',
    weeks: 6,
    art: 'apartment',
    intro: (s) =>
      ({
        home: 'Your parents sat you down. “You’re an adult now. Rent is going up to $350, or you can look for your own place.” Time to run the numbers.',
        college: 'Everyone’s signing leases for next year in October. Seriously, October. If you wait, all that’s left are the places nobody wanted.',
        trade: 'Your landlord is selling the house. You have until the end of the chapter to find somewhere new to live.',
        work: 'Theo is moving in with their partner at the end of the month. You can’t cover $1,450 rent alone. Find a new roommate or a new place.',
      })[s.path] + ' And it’s time to figure out where your money actually goes: make a budget.',
  },
  {
    title: 'Credit Where It’s Due',
    subtitle: 'Weeks 19–24 · Winter & tax season',
    weeks: 6,
    art: 'bank',
    intro: () =>
      'Your first W-2 arrived in the mail, so it’s tax time. Meanwhile, the landlords and car dealers keep asking the same question: “What’s your credit score?” Time to build one, carefully.',
  },
  {
    title: 'Curveballs',
    subtitle: 'Weeks 25–30 · Spring',
    weeks: 6,
    art: 'street',
    intro: () =>
      'Things have been going okay. Maybe too okay. Life has a way of testing whether you were ready. Keep your housing paid and your debt under control, no matter what happens.',
  },
  {
    title: 'Level Up',
    subtitle: 'Weeks 31–36 · One year later',
    weeks: 6,
    art: 'stage',
    intro: (s) =>
      ({
        home: 'A pharmacy tech position just opened at Fresh Fields. Better pay, real benefits. If you’ve been building skills, this is your shot.',
        college: 'Finals are coming. Pass with a B average and you keep your scholarship. Fall short and next year gets a lot more expensive.',
        trade: 'The Year 1 apprentice exam is at the end of this chapter. Pass it and your wage goes up. Fail it and you repeat the year.',
        work: 'ParcelPoint is promoting someone to Team Lead. They want someone reliable who finished their training.',
      })[s.path] + ' Rae is also planning a road trip to the coast to celebrate one year out. Can you make it work?',
  },
];

export function chapterStartWeek(ch: number): number {
  let w = 1;
  for (let i = 0; i < ch; i++) w += CHAPTERS[i].weeks;
  return w;
}

export function chapterOf(week: number): number {
  let w = 1;
  for (let i = 0; i < CHAPTERS.length; i++) {
    w += CHAPTERS[i].weeks;
    if (week < w) return i;
  }
  return CHAPTERS.length - 1;
}

const only = (...p: PathId[]): PathId[] => p;

export const CAREER_NEED: Record<PathId, { xp: number; rep: number }> = {
  home: { xp: 60, rep: 55 },
  college: { xp: 100, rep: 0 },
  trade: { xp: 75, rep: 50 },
  work: { xp: 45, rep: 70 },
};

export const TASKS: Task[] = [
  // ----- Chapter 1 -----
  {
    id: 't-bank',
    chapter: 0,
    title: 'Set up a real bank account',
    desc: 'Your teen account starts charging $15/month in week 8. Compare banks and switch.',
    how: 'Shop for a bank account (weekday or Saturday)',
    done: (s) => s.bank !== 'teen',
    failText: 'Your teen account becomes an adult account with a $15 monthly fee.',
  },
  {
    id: 't-license',
    chapter: 0,
    title: 'Get your driver’s license',
    desc: 'Gather your documents, then pass the written and road tests at the DMV.',
    how: 'Gather documents (evening), then book or walk in at the DMV (weekday)',
    done: (s) => !!s.flags.license,
    progress: (s) => (s.flags.license ? 'Licensed' : s.flags.docs ? 'Documents ready' : 'Need documents'),
    failText: 'No license yet. You can still get one later, but you can’t buy a car until you do.',
  },
  {
    id: 't-fafsa',
    chapter: 0,
    paths: only('college'),
    title: 'Submit the FAFSA',
    desc: 'Apply for financial aid before the priority deadline, or pay more out of pocket.',
    how: 'Work on the FAFSA (evening or weekend), usually two sessions',
    done: (s) => !!s.flags.fafsa,
    progress: (s) => (s.flags.fafsa ? 'Submitted' : s.flags.fafsaInfo ? 'Ready to submit' : 'Need parents’ tax info'),
    failText: 'You missed the priority deadline. Less aid means a $400/month tuition payment plan.',
    onFail: (s) => {
      s.subs.push({ id: 'tuitionplan', label: 'Tuition payment plan', cost: 400 });
    },
  },
  {
    id: 't-tools',
    chapter: 0,
    paths: only('trade'),
    title: 'Buy your tool kit',
    desc: 'Apprentices bring their own hand tools to the job site.',
    how: 'Buy your tool kit (Saturday or evening)',
    done: (s) => !!s.flags.tools,
    failText: 'Your foreman lends you tools and is NOT thrilled about it. Boss rating −10.',
    onFail: (s) => {
      rep(s, -10);
      s.flags.tools = 'loaner';
    },
  },
  {
    id: 't-nooverdraft1',
    chapter: 0,
    optional: true,
    title: 'Bonus: Zero overdraft fees',
    desc: 'Get through the chapter without overdrawing your account.',
    how: 'Watch your balance before you pay',
    done: (s) => num(s, 'overdrafts') === 0,
  },
  // ----- Chapter 2 -----
  {
    id: 't-transport',
    chapter: 1,
    title: 'Sort out reliable transportation',
    desc: (s) =>
      ({
        home: 'Mom needs her car back. Buy a car, or commit to the bus or a bike.',
        college: 'Decide: keep riding the bus, get a bike, or buy a car.',
        trade: 'Marco is leaving your crew. Job sites need a car, or an expensive ride.',
        work: 'Late buses are hurting your boss rating. Car, bike, or stick with the bus?',
      })[s.path],
    how: 'Figure out transportation (Saturday)',
    done: (s) => !!s.flags.transportSet,
    failText: (s) =>
      s.path === 'trade'
        ? 'You’re stuck paying coworkers $60/week for rides.'
        : s.path === 'home'
          ? 'Mom takes her car back. You’re on the bus ($65/month).'
          : 'You keep doing what you were doing, late buses and all.',
    onFail: (s) => {
      s.flags.transportSet = true;
      if (s.path === 'trade') s.subs.push({ id: 'rides', label: 'Rides to job sites', cost: 240 });
      if (s.path === 'home') {
        s.transport = 'bus';
        s.subs.push({ id: 'buspass', label: 'Monthly bus pass', cost: 65 });
      }
    },
  },
  {
    id: 't-dentist',
    chapter: 1,
    title: 'Get a dental checkup',
    desc: 'A cleaning and checkup catches small problems before they become big, expensive ones.',
    how: 'Call the dentist (evening) to book an appointment, then go',
    done: (s) => !!s.flags.dentistDone,
    progress: (s) => {
      const a = s.appointments.find((x) => x.kind === 'dentist');
      return s.flags.dentistDone ? 'Done' : a ? `Booked: week ${a.week}, ${a.slot}` : 'Not booked';
    },
    failText: 'Skipped. That twinge in your back molar isn’t going anywhere…',
    onFail: (s) => {
      s.flags.toothRisk = 2;
    },
  },
  {
    id: 't-efund',
    chapter: 1,
    title: 'Build a $500 emergency fund',
    desc: 'Money in savings you don’t touch unless something goes wrong.',
    how: 'Save on payday, or move cash to savings anytime',
    done: (s) => s.stats.savings >= 500,
    progress: (s) => `${money(s.stats.savings)} / $500`,
    failText: 'No cushion. The next surprise goes on a card or overdraws your account.',
  },
  {
    id: 't-1k',
    chapter: 1,
    optional: true,
    title: 'Bonus: $1,000 saved',
    desc: 'Double the goal.',
    how: 'Save more',
    done: (s) => s.stats.savings >= 1000,
    progress: (s) => `${money(s.stats.savings)} / $1,000`,
  },
  // ----- Chapter 3 -----
  {
    id: 't-housing',
    chapter: 2,
    title: (s) =>
      ({
        home: 'Decide: move out or pay more rent',
        college: 'Sign a lease for next year',
        trade: 'Find a new place to live',
        work: 'Replace Theo (or move)',
      })[s.path],
    desc: 'Compare rent, deposits, commute, and roommates before you sign anything.',
    how: 'Apartment hunt (weekend)',
    done: (s) => !!s.flags.housingDone,
    failText: (s) =>
      s.path === 'home' ? 'Your parents decide for you: rent is now $350.' : 'You wait too long and take the last place available: $200/month more than it should be.',
    onFail: (s) => {
      s.flags.housingDone = true;
      if (s.path === 'home') s.housing.rent = 350;
      else if (s.path === 'college') s.flags.badLease = true;
      else {
        s.housing.rent += 200;
        s.housing.name = 'Last-minute studio by the freeway';
        s.housing.roommate = false;
        charge(s, 600, 'Last-minute deposit');
      }
    },
  },
  {
    id: 't-budget',
    chapter: 2,
    title: 'Make a monthly budget',
    desc: 'Know your income, your bills, and what’s left. Then decide on purpose.',
    how: 'Make a budget (evening or Sunday)',
    done: (s) => !!s.flags.budget,
    failText: 'No budget. You keep wondering where your money went.',
  },
  {
    id: 't-renters',
    chapter: 2,
    optional: true,
    title: 'Bonus: Get renters insurance',
    desc: 'About $15/month protects your stuff from theft, fire, and floods.',
    how: 'Watch for the offer on payday',
    done: (s) => !!s.flags.rentersIns || s.housing.kind === 'parents' || s.housing.kind === 'dorm',
  },
  // ----- Chapter 4 -----
  {
    id: 't-card',
    chapter: 3,
    title: 'Get a credit card & pay on time',
    desc: 'Open a card, use it for small things, and pay the statement on bills day.',
    how: 'Apply for a credit card (evening), then pay on bills day',
    done: (s) => !!s.card && num(s, 'cardOnTime') >= 1 && s.credit.late === 0,
    progress: (s) => (!s.card ? 'No card yet' : s.credit.onTime ? `${s.credit.onTime} on-time payment${s.credit.onTime > 1 ? 's' : ''}` : 'Waiting for first statement'),
    failText: 'Without credit history, your next apartment or car will cost more (bigger deposits, higher interest).',
    onFail: (s) => {
      s.flags.thinCredit = true;
    },
  },
  {
    id: 't-taxes',
    chapter: 3,
    title: 'File your taxes',
    desc: 'You probably had too much withheld, so there may be a refund waiting.',
    how: 'Do your taxes (evening or Saturday)',
    done: (s) => !!s.flags.taxesFiled,
    failText: 'You missed the deadline. $90 late penalty, and your refund is stuck.',
    onFail: (s) => {
      charge(s, 90, 'IRS late penalty');
      log(s, 'IRS late-filing penalty: $90.', 'bad');
    },
  },
  {
    id: 't-credit680',
    chapter: 3,
    optional: true,
    title: 'Bonus: Credit score 680+',
    desc: 'A good score unlocks better rates.',
    how: 'On-time payments, low balance',
    done: (s) => (creditScore(s) ?? 0) >= 680,
    progress: (s) => `${creditScore(s) ?? 'No score'}`,
  },
  // ----- Chapter 5 -----
  {
    id: 't-survive',
    chapter: 4,
    title: 'Handle the curveball, keep your housing',
    desc: 'Whatever life throws at you, don’t miss a housing payment this chapter.',
    how: 'Pay housing on bills day',
    done: (s) => num(s, 'rentMissed') === num(s, 'rentMissedCh5') && !!s.flags.curveballDone,
    failText: 'Your landlord marks you as a late payer. Next lease will be harder.',
  },
  {
    id: 't-debt',
    chapter: 4,
    title: 'Keep credit card debt under $300',
    desc: 'Card interest is 25–30% a year. Pay it down.',
    how: 'Pay more than the minimum on bills day',
    done: (s) => (s.card?.balance ?? 0) < 300,
    progress: (s) => `Card: ${money(s.card?.balance ?? 0)}`,
    failText: 'The interest keeps snowballing.',
  },
  {
    id: 't-fund5',
    chapter: 4,
    optional: true,
    title: 'Bonus: Still have $500+ saved',
    desc: 'Come out the other side with your cushion intact.',
    how: 'Rebuild savings',
    done: (s) => s.stats.savings >= 500,
    progress: (s) => `${money(s.stats.savings)} / $500`,
  },
  // ----- Chapter 6 -----
  {
    id: 't-career',
    chapter: 5,
    title: (s) =>
      ({
        home: 'Land the pharmacy tech job',
        college: 'Finish the year with a 3.0 GPA',
        trade: 'Pass the Year 1 apprentice exam',
        work: 'Earn the Team Lead promotion',
      })[s.path],
    desc: (s) => {
      const n = CAREER_NEED[s.path];
      if (s.path === 'college') return 'A 3.0 GPA after spring finals keeps your scholarship. Grades post in week 36.';
      return `Needs career progress ${n.xp}+${n.rep ? ` and boss rating ${n.rep}+` : ''}. Then take your shot.`;
    },
    how: (s) => (s.path === 'college' ? 'Go to class, do assignments well, study before finals (week 35)' : 'Build progress, then take the next step (evening or Saturday)'),
    done: (s) => !!s.flags.careerDone,
    progress: (s) =>
      s.path === 'college' ? `GPA ${gpaText(liveGpa(s))} / 3.00` : `Progress ${s.stats.xp}/${CAREER_NEED[s.path].xp}${CAREER_NEED[s.path].rep ? ` · Boss ${s.stats.rep}/${CAREER_NEED[s.path].rep}` : ''}`,
    failText: 'Not this time. You’ll get another shot next year.',
  },
  {
    id: 't-final-fund',
    chapter: 5,
    title: 'Finish the year with $1,000 saved',
    desc: 'The classic first emergency fund.',
    how: 'Save on payday',
    done: (s) => s.stats.savings >= 1000,
    progress: (s) => `${money(s.stats.savings)} / $1,000`,
    failText: 'You start year two without a real cushion.',
  },
  {
    id: 't-roadtrip',
    chapter: 5,
    optional: true,
    title: 'Bonus: Go on Rae’s road trip',
    desc: 'Rae’s planning a weekend at the coast. Have the money and the time.',
    how: 'Watch for Rae’s invite',
    done: (s) => !!s.flags.roadTrip,
  },
];

export function tasksFor(s: GameState, ch: number): Task[] {
  return TASKS.filter((t) => t.chapter === ch && (!t.paths || t.paths.includes(s.path)) && !(t.hide && t.hide(s)));
}

export const lowDebt = (s: GameState): boolean => badDebt(s) < 300;
