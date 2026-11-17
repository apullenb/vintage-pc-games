// Opening scenes, first day at work (benefits!), chapter intros.
import { CHAPTERS } from '../chapters.ts';
import { log, money, num, scene, setFlag, unlock } from '../../engine/core.ts';
import type { GameState } from '../../engine/types.ts';
import type { Scene } from '../types.ts';

const raeStep = {
  text: 'Your phone buzzes. It’s Rae, your best friend since 4th grade:\n\n“ok we are officially ADULTS now 😳 promise me one thing: a road trip to the coast before next summer. you, me, the ocean.”',
  speaker: 'rae' as const,
  choices: [
    {
      label: 'Promise. 🌊',
      result: 'Rae: “HOLDING YOU TO IT.”\n\nYou’ll need money and a free weekend. Future you’s problem.',
    },
  ],
};

export const STORY: Scene[] = [
  {
    id: 'intro-home',
    title: 'Graduation + 2 days',
    art: 'bedroom',
    kind: 'story',
    steps: {
      start: {
        text: (s) =>
          `7:30 AM, Monday. Your mom knocks on your door.\n\n“Congratulations, graduate. Here’s the deal, ${s.name}: rent is $200 a month, due on the 1st. Dinner’s at six. Curfew is midnight, because it’s still my house. And your first shift at Fresh Fields is in an hour.”`,
        speaker: 'mom',
        choices: [{ label: 'Deal. Thanks, Mom.', next: 'rae' }],
      },
      rae: raeStep,
    },
  },
  {
    id: 'intro-college',
    title: 'Move-in day',
    art: 'dorm',
    kind: 'story',
    steps: {
      start: {
        text: (s) =>
          `Hollis Hall, room 214. Your roommate has already claimed the good bed. Your parents hug you in the parking lot.\n\n“We’re proud of you, ${s.name}. Your meal plan is paid for this term. Everything else—books, your phone, fun—is on you now. Don’t forget the FAFSA!”`,
        speaker: 'mom',
        choices: [{ label: 'Bye… (don’t cry, don’t cry)', next: 'rae', do: (s) => scene(s, 'col-major') }],
      },
      rae: raeStep,
    },
  },
  {
    id: 'intro-trade',
    title: 'First day on the crew',
    art: 'jobsite',
    kind: 'story',
    steps: {
      start: {
        text: (s) =>
          `Your new landlord hands you a key to a small room on Alder Street: $650 a month, utilities included.\n\nAt Brightline Electric, your foreman Dee looks you over. “You’re ${s.name}? Good. Be on time, bring your own tools by next month, and don’t touch anything that hums. Marco will drive you to sites until you sort out a car.”`,
        speaker: 'boss',
        choices: [{ label: '“Yes, ma’am.”', next: 'rae' }],
      },
      rae: raeStep,
    },
  },
  {
    id: 'intro-work',
    title: 'Moving day',
    art: 'apartment',
    kind: 'story',
    steps: {
      start: {
        text: (s) =>
          `You and your roommate Theo carry the last box up three flights of stairs. The 2-bedroom on Pine Ave is $1,450 a month. Your half is $725, plus about $60 in utilities.\n\nTheo: “We’re doing it, ${s.name}! No parents, no rules. Also I already ate your pizza.”\n\nYour first shift at the ParcelPoint warehouse is Monday.`,
        speaker: 'roommate',
        choices: [{ label: 'Freedom! (and a lot of bills)', next: 'rae' }],
      },
      rae: raeStep,
    },
  },
  {
    id: 'firstday',
    title: 'Paperwork on day one',
    art: (s) => s.job?.art ?? 'office',
    kind: 'story',
    steps: {
      start: {
        text: (s) =>
          `Before your first ${s.path === 'college' ? 'library shift' : 'shift'} at ${s.job?.place}, someone from HR hands you a clipboard.\n\n“Okay! W-4, direct deposit${s.job?.healthOffered ? ', and your benefits elections. Benefits are a big one, so take your time' : ''}.”`,
        speaker: 'hr',
        choices: [{ label: 'Let’s do this.', next: 'w4' }],
      },
      w4: {
        text: 'FORM W-4 tells your employer how much federal income tax to take out of each paycheck (“withholding”). You’re single, one job, no kids.',
        speaker: 'hr',
        choices: [
          {
            label: 'Fill it out honestly (standard withholding)',
            hint: '✓ You’ll likely get a refund at tax time',
            bot: 2,
            do: (s) => unlock(s, 'w4'),
            next: (s) => (s.job?.healthOffered ? 'health' : 'healthfree'),
            tip: 'If too much tax gets withheld during the year, you get the extra back as a refund when you file. Too little and you owe.',
            result: 'Done. Federal tax will come out of every paycheck.',
          },
          {
            label: 'Write “EXEMPT” so no federal tax comes out',
            hint: '✓ Bigger paychecks now · ✗ You’ll owe it all in April',
            bot: -2,
            do: (s) => {
              setFlag(s, 'w4exempt');
              unlock(s, 'w4');
            },
            next: (s) => (s.job?.healthOffered ? 'health' : 'healthfree'),
            result: 'HR raises an eyebrow but takes the form. No federal income tax will be withheld… for now.',
            tip: 'Claiming exempt is only allowed if you expect to owe zero tax. Otherwise you’ll owe it all at tax time, maybe with penalties.',
          },
        ],
      },
      healthfree: {
        text: (s) =>
          `${s.job?.place} doesn’t offer health insurance to ${s.path === 'college' ? 'student workers' : 'part-time staff'}.\n\nGood news: by law, you can stay on your parents’ health insurance until you turn 26. Your parents already have you covered.`,
        speaker: 'hr',
        choices: [
          {
            label: 'Good to know!',
            do: (s) => {
              s.health = 'parents';
              s.dental = true;
              unlock(s, 'health-insurance');
            },
            next: 'deposit',
          },
        ],
      },
      health: {
        text: (s) =>
          `HEALTH INSURANCE. The ${s.job?.place} plan costs ${money(s.job?.premium ?? 0)} per paycheck (the company pays the rest).\n\nWith it: doctor visits are $35, and the most you’d pay for an ER visit is $500.\nWithout it: you pay full price. An urgent care visit is about $200. An ER visit can be $3,000 or more.\n\nYour parents’ insurance dropped dependent coverage when your mom switched jobs, so this is your call.`,
        speaker: 'hr',
        choices: [
          {
            label: (s) => `Enroll in the health plan (−${money(s.job?.premium ?? 0)}/paycheck)`,
            hint: '✓ Big medical bills are capped · ✗ Smaller paychecks, every time',
            bot: 2,
            do: (s) => {
              s.health = 'employer';
              unlock(s, 'health-insurance');
              unlock(s, 'premium');
            },
            next: 'dental',
            result: 'Enrolled. Your insurance card arrives in two weeks.',
          },
          {
            label: 'Skip it and keep the money',
            hint: (s) => `✓ +${money(s.job?.premium ?? 0)} per paycheck · ✗ One accident could cost thousands`,
            bot: -1,
            do: (s) => {
              s.health = 'none';
              unlock(s, 'health-insurance');
            },
            next: 'dental',
            result: 'No insurance. More money each paycheck… as long as nothing happens.',
            tip: 'Medical debt is one of the most common reasons young adults fall behind. Many people only learn their insurance matters after they need it.',
          },
        ],
      },
      dental: {
        text: (s) => `DENTAL: ${money(s.job?.dentalPremium ?? 0)} per paycheck. Cleanings are free, and fillings are 80% covered.`,
        speaker: 'hr',
        choices: [
          {
            label: (s) => `Add dental (−${money(s.job?.dentalPremium ?? 0)}/paycheck)`,
            hint: '✓ Free checkups · ✓ Cheap fillings',
            bot: 2,
            do: (s) => {
              s.dental = true;
            },
            next: (s) => (s.job && s.job.match > 0 ? 'retire' : 'deposit'),
          },
          {
            label: 'No dental',
            hint: '✓ Slightly bigger paychecks · ✗ Full price at the dentist',
            bot: -1,
            next: (s) => (s.job && s.job.match > 0 ? 'retire' : 'deposit'),
          },
        ],
      },
      retire: {
        text: (s) =>
          `401(k) RETIREMENT. If you put 4% of your pay into your 401(k), ${s.job?.place} adds another 4% for free. That’s called a “match.”\n\nYou can’t touch it until you’re much older, but it grows the whole time.`,
        speaker: 'hr',
        choices: [
          {
            label: 'Contribute 4% and get the match',
            hint: '✓ Free money from your employer · ✗ About $46 less per paycheck',
            bot: 2,
            do: (s) => {
              s.retirePct = 0.04;
              unlock(s, '401k');
            },
            next: 'deposit',
            result: 'Done. Every paycheck, 4% goes in and ParcelPoint adds 4% more.',
          },
          {
            label: 'Not now, I need every dollar',
            hint: '✓ Bigger paychecks · ✗ Leaving free money on the table',
            bot: -1,
            do: (s) => unlock(s, '401k'),
            next: 'deposit',
          },
        ],
      },
      deposit: {
        text: 'Last thing: direct deposit. Your paycheck lands in your checking account every other Friday.',
        speaker: 'hr',
        choices: [
          {
            label: 'Sign and start working',
            do: (s) => {
              unlock(s, 'direct-deposit');
              log(s, 'Started your new job. Paydays are every other week.', 'info');
            },
            result: (s) =>
              `Welcome to ${s.job?.place}!\n\nEach week, plan your four time slots: one weekday, one evening, and the weekend. Watch your energy, and check your missions before the deadline.`,
          },
        ],
      },
    },
  },
  {
    id: 'chapter-intro',
    title: (s: GameState) => `Chapter ${s.chapter + 1}: ${CHAPTERS[s.chapter].title}`,
    art: (s) => CHAPTERS[s.chapter].art,
    kind: 'story',
    steps: {
      start: {
        text: (s) => CHAPTERS[s.chapter].intro(s),
        choices: [
          {
            label: 'Let’s go',
            do: (s) => {
              if (s.chapter === 4) s.flags.rentMissedCh5 = num(s, 'rentMissed');
            },
          },
        ],
      },
    },
  },
];
