// What you can do with each time slot of the week.
import { charge, energy, inc, log, minigame, money, num, rep, scene, xp } from '../engine/core.ts';
import type { GameState, SlotId } from '../engine/types.ts';
import type { Activity } from './types.ts';

const ANY: SlotId[] = ['weekday', 'evening', 'saturday', 'sunday'];
const FREE: SlotId[] = ['evening', 'saturday', 'sunday'];

const hasLicense = (s: GameState): boolean => !!s.flags.license;
const taskOpen = (s: GameState, id: string, ch: number): boolean => s.chapter === ch && !s.tasksDone[id];

export function studyName(s: GameState): string {
  switch (s.path) {
    case 'college':
      return 'Study';
    case 'trade':
      return 'Study electrical code';
    case 'work':
      return 'Online training module';
    default:
      return s.flags.certEnrolled ? 'Pharmacy tech coursework' : 'Free online course';
  }
}

const LIST: Activity[] = [
  {
    id: 'work',
    name: 'Work',
    icon: 'work',
    slots: ['weekday'],
    desc: (s) => (s.job ? `${s.job.title} at ${s.job.place}. ${s.job.hours} hrs/week at ${money(s.job.wage)}/hr.` : 'No job right now.'),
    hint: () => 'Earn your regular pay · Showing up builds your boss’s trust',
    avail: (s) => (s.job && s.path !== 'college' ? true : 'No job'),
    hide: (s) => s.path === 'college' || !s.job,
    run: (s) => {
      rep(s, 1);
    },
  },
  {
    id: 'class',
    name: 'Go to class',
    icon: 'class',
    slots: ['weekday'],
    desc: 'Lectures, labs, and a professor who takes attendance.',
    hint: () => '+Grades · Skipping costs you',
    hide: (s) => s.path !== 'college' || s.flags.enrolled === false,
    run: (s) => {
      xp(s, 2);
    },
  },
  {
    id: 'rest',
    name: 'Rest & recharge',
    icon: 'rest',
    slots: ANY,
    desc: 'Sleep in, watch something, do nothing. It counts.',
    hint: () => '+10 energy · Free',
    run: (s) => {
      energy(s, 10);
    },
  },
  {
    id: 'shift',
    name: 'Pick up an extra shift',
    icon: 'money',
    slots: FREE,
    desc: (s) => (s.job ? `Extra hours at ${s.job.place}.` : 'No job.'),
    hint: (s) => {
      const h = s.path === 'college' ? 4 : 6;
      return `+${money(h * (s.job?.wage ?? 0))} on your next paycheck (before taxes) · −12 energy · Counts toward promotions`;
    },
    avail: (s) => (s.job ? true : 'You need a job'),
    hide: (s) => !s.job,
    run: (s) => {
      const h = s.path === 'college' ? 4 : 6;
      s.hoursThisPeriod += h;
      energy(s, -12);
      inc(s, 'extraShifts');
      // Covering shifts is how people get noticed: a little boss trust and on-the-job learning every time.
      rep(s, 1);
      if (s.path !== 'college') xp(s, 1);
      log(s, `Extra shift: +${h} hours on your next paycheck.`, 'good');
      minigame(s, 'shift');
    },
  },
  {
    id: 'friends',
    name: 'Hang out with Rae & friends',
    icon: 'friends',
    slots: ['evening', 'saturday'],
    desc: 'Tacos, games, a drive to nowhere. You remember why life is fun.',
    hint: (s) => (num(s, 'friendTime') % 2 === 0 ? '+12–22 energy · About $50 · Laser tag night!' : '+18 energy · About $50'),
    run: (s) => {
      charge(s, 50, 'Night out');
      const tag = num(s, 'friendTime') % 2 === 0;
      energy(s, tag ? 12 : 18);
      inc(s, 'friendTime');
      log(s, tag ? 'Laser tag and tacos with Rae and the crew (−$50).' : 'Hung out with Rae and the crew (−$50: food, gas, a movie). Worth it.', 'good');
      if (tag) minigame(s, 'lasertag');
    },
  },
  {
    id: 'callhome',
    name: 'Call home',
    icon: 'phone',
    slots: ['evening', 'sunday'],
    desc: 'Catch up, vent, get advice you pretend not to need.',
    hint: () => '+6 energy · Free · Sometimes useful advice',
    hide: (s) => s.housing.kind === 'parents',
    run: (s) => {
      energy(s, 6);
      inc(s, 'calls');
      log(s, 'Called home. Grandma says hi and to wear a jacket.');
    },
  },
  {
    id: 'study',
    name: (s) => studyName(s),
    icon: 'study',
    slots: FREE,
    desc: (s) =>
      ({
        college: 'Library, flashcards, office hours.',
        trade: 'Ohm’s law, wiring diagrams, the code book.',
        work: 'Free company training. Managers notice who finishes them.',
        home: 'Build skills for a better job.',
      })[s.path],
    hint: (s) => `+Career progress (mini-game) · −8 energy${s.path === 'work' ? ' · Boss notices' : ''}`,
    run: (s) => {
      minigame(s, 'flashcards');
    },
  },
  {
    id: 'mealprep',
    name: 'Grocery shop & meal prep',
    icon: 'food',
    slots: ['sunday'],
    desc: 'Cook a week of meals. Takes your Sunday, saves a lot of money.',
    hint: () => 'Unlocks the cheap, healthy food plan (mini-game) · Takes the slot',
    hide: (s) => s.housing.kind === 'parents' || s.housing.kind === 'dorm',
    run: (s) => {
      log(s, 'Spent Sunday meal-prepping. Containers everywhere.');
      minigame(s, 'grocery');
    },
  },
  {
    id: 'gig',
    name: (s) => (s.car ? 'Food delivery gig' : 'Bike delivery gig'),
    icon: 'money',
    slots: ['saturday', 'sunday'],
    desc: (s) => (s.car ? 'Deliver burritos in your own car. Tips vary. Gas doesn\u2019t.' : 'Deliver food on your bike. Great for your legs, less great in the rain.'),
    hint: (s) => (s.car ? '+$35\u2013120 in tips (mini-game) \u00b7 \u2212$12 gas \u00b7 \u221212 energy' : '+$20\u201375 in tips (mini-game) \u00b7 \u221214 energy'),
    run: (s) => {
      minigame(s, 'delivery', { vehicle: s.car ? 'car' : 'bike' });
    },
  },
  {
    id: 'yardgig',
    name: 'Mow lawns for neighbors',
    icon: 'money',
    slots: ['saturday', 'sunday'],
    desc: 'Borrow the neighbor\u2019s mower, knock on doors, cut grass for cash.',
    hint: () => '+$25\u201380 cash (mini-game) \u00b7 \u221212 energy',
    hide: (s) => s.housing.kind === 'dorm',
    run: (s) => {
      minigame(s, 'lawn');
    },
  },
  {
    id: 'jobhunt',
    name: 'Job hunt',
    icon: 'search',
    slots: ANY,
    desc: 'Applications, follow-up emails, an interview if you’re lucky.',
    hint: () => 'Chance to get hired · −6 energy',
    hide: (s) => !!s.job,
    run: (s) => {
      energy(s, -6);
      scene(s, 'jobhunt');
    },
  },
  // ---------- mission activities ----------
  {
    id: 'bank',
    name: 'Shop for a bank account',
    icon: 'bank',
    slots: ['weekday', 'saturday'],
    task: 't-bank',
    desc: 'Your teen account is about to start charging adult fees. Compare your options.',
    hint: () => 'Mission · Banks are open weekdays and Saturday mornings',
    hide: (s) => s.bank !== 'teen',
    run: (s) => scene(s, 'task-bank'),
  },
  {
    id: 'docs',
    name: 'Gather DMV documents',
    icon: 'docs',
    slots: ['evening', 'sunday'],
    task: 't-license',
    desc: 'Birth certificate, Social Security card, two proofs of address. Where are they?',
    hint: () => 'Mission · You can’t get a license without these',
    hide: (s) => !!s.flags.docs || hasLicense(s),
    run: (s) => scene(s, 'task-docs'),
  },
  {
    id: 'dmvbook',
    name: 'Book a DMV appointment online',
    icon: 'phone',
    slots: ['evening'],
    task: 't-license',
    desc: 'Walk-ins wait for hours. Appointments are faster, but you have to book ahead.',
    hint: () => 'Mission · Schedules a weekday DMV visit',
    hide: (s) => hasLicense(s) || s.appointments.some((a) => a.kind === 'dmv'),
    run: (s) => scene(s, 'task-dmvbook'),
  },
  {
    id: 'dmv',
    name: 'Walk in at the DMV',
    icon: 'car',
    slots: ['weekday'],
    task: 't-license',
    desc: 'No appointment. Take a number and hope.',
    hint: () => 'Mission · Long wait, might not get seen · Costs a workday',
    hide: (s) => hasLicense(s) || s.appointments.some((a) => a.kind === 'dmv'),
    run: (s) => scene(s, 'task-dmv', { walkin: 1 }),
  },
  {
    id: 'fafsa',
    name: 'Work on the FAFSA',
    icon: 'docs',
    slots: ['evening', 'saturday', 'sunday'],
    task: 't-fafsa',
    desc: 'The Free Application for Federal Student Aid. It decides how much help you get.',
    hint: () => 'Mission · Deadline at the end of this chapter',
    hide: (s) => s.path !== 'college' || !!s.flags.fafsa,
    run: (s) => scene(s, 'task-fafsa'),
  },
  {
    id: 'tools',
    name: 'Buy your tool kit',
    icon: 'tools',
    slots: ['saturday', 'evening'],
    task: 't-tools',
    desc: 'Apprentices bring their own hand tools. Your foreman gave you a list.',
    hint: () => 'Mission · Required by end of chapter',
    hide: (s) => s.path !== 'trade' || (!!s.flags.tools && s.flags.tools !== 'loaner'),
    run: (s) => scene(s, 'task-tools'),
  },
  {
    id: 'carshop',
    name: 'Figure out transportation',
    icon: 'car',
    slots: ['saturday'],
    task: 't-transport',
    desc: 'Car lots, bus maps, and a lot of math.',
    hint: () => 'Mission · Compare cars, bus, and bike',
    hide: (s) => !!s.flags.transportSet || s.chapter < 1,
    run: (s) => scene(s, 'task-transport'),
  },
  {
    id: 'dentistcall',
    name: 'Call the dentist',
    icon: 'tooth',
    slots: ['evening'],
    task: 't-dentist',
    desc: 'Book a cleaning and checkup. They only see patients on weekdays and some Saturdays.',
    hint: () => 'Mission · Schedules an appointment',
    hide: (s) => s.chapter < 1 || !!s.flags.dentistDone || s.appointments.some((a) => a.kind === 'dentist'),
    run: (s) => scene(s, 'task-dentistcall'),
  },
  {
    id: 'housing',
    name: (s) => (s.path === 'home' ? 'Look at apartments' : s.path === 'work' ? 'Find a new roommate or place' : 'Apartment hunt'),
    icon: 'home',
    slots: ['saturday', 'sunday'],
    task: 't-housing',
    desc: 'Listings, tours, applications, deposits.',
    hint: () => 'Mission · Big decision with long-term costs',
    hide: (s) => !taskOpen(s, 't-housing', 2) || !!s.flags.housingDone,
    run: (s) => scene(s, 'task-housing'),
  },
  {
    id: 'budget',
    name: 'Make a budget',
    icon: 'chart',
    slots: ['evening', 'sunday'],
    task: 't-budget',
    desc: 'Add up what comes in and what goes out. Decide where it all goes.',
    hint: () => 'Mission · Sets up automatic savings',
    hide: (s) => !!s.flags.budget || s.chapter < 2,
    run: (s) => scene(s, 'task-budget'),
  },
  {
    id: 'cardapply',
    name: 'Apply for a credit card',
    icon: 'card',
    slots: ['evening'],
    task: 't-card',
    desc: 'Compare card offers. Read the fine print.',
    hint: (s) => (s.chapter >= 3 ? 'Mission · Builds credit if used carefully' : 'Builds credit if used carefully · Hard inquiry'),
    hide: (s) => !!s.card || num(s, 'cardDeniedWeek') === s.week,
    run: (s) => scene(s, 'task-card'),
  },
  {
    id: 'taxes',
    name: 'Do your taxes',
    icon: 'docs',
    slots: ['evening', 'saturday'],
    task: 't-taxes',
    desc: 'Your W-2 came in the mail. Time to file.',
    hint: () => 'Mission · Deadline at end of chapter',
    hide: (s) => s.chapter < 3 || !!s.flags.taxesFiled,
    run: (s) => scene(s, 'task-taxes'),
  },
  {
    id: 'career',
    name: (s) =>
      ({
        home: 'Apply for pharmacy tech jobs',
        college: 'Meet with your academic advisor',
        trade: 'Schedule your apprentice exam',
        work: 'Ask about the Team Lead opening',
      })[s.path],
    icon: 'star',
    slots: ['evening', 'saturday'],
    task: 't-career',
    desc: 'Take the next step up.',
    hint: () => 'Mission · Needs enough career progress',
    hide: (s) => s.chapter !== 5 || !!s.flags.careerBooked || !!s.flags.careerDone,
    run: (s) => scene(s, 'task-career'),
  },
];

export const ACTIVITIES: Record<string, Activity> = Object.fromEntries(LIST.map((a) => [a.id, a]));

export function activityFor(id: string): Activity {
  return ACTIVITIES[id] ?? ACTIVITIES.rest;
}

export function activitiesFor(s: GameState, slot: SlotId): { a: Activity; ok: true | string }[] {
  return LIST.filter((a) => a.slots.includes(slot) && !(a.hide && a.hide(s))).map((a) => ({ a, ok: a.avail ? a.avail(s, slot) : true }));
}
