// Random life events and their consequences. Every choice trades money, time, energy, or risk.
import { LICENSE_REINSTATE, achieve, chance, charge, minigame, earn, energy, inc, log, missWork, money, num, openCredit, rep, schedule, setFlag, unlock, xp } from '../../engine/core.ts';
import type { GameState, SlotId } from '../../engine/types.ts';
import type { Choice, Scene } from '../types.ts';
import { CARD_USE } from './tasks.ts';

export function medCost(s: GameState, kind: 'urgent' | 'er' | 'rx'): number {
  const table = {
    urgent: { none: 210, employer: 35, parents: 35, school: 20 },
    er: { none: 3200, employer: 500, parents: 750, school: 600 },
    rx: { none: 85, employer: 10, parents: 10, school: 10 },
  };
  return table[kind][s.health];
}

const insured = (s: GameState): boolean => s.health !== 'none';
// Driving events need a car you're actually driving (a suspended license parks it).
const hasCar = (s: GameState): boolean => !!s.car && !s.flags.licenseSuspended;
const ownPlace = (s: GameState): boolean => s.housing.kind !== 'parents' && s.housing.kind !== 'dorm';

const ok = (label: string, extra: Partial<Choice> = {}): Choice => ({ label, ...extra });

export const LEAK_DAMAGE = 900; // a burst pipe upstairs: what your stuff is worth
const NO_INSURANCE_FINE = 300; // a ticket for driving without proof of insurance

export const EVENT_SCENES: Scene[] = [
  // ====================== HEALTH ======================
  {
    id: 'ev-sick',
    title: 'You’re sick',
    art: (s) => s.housing.art,
    kind: 'event',
    steps: {
      start: {
        text: 'You’ve been running on empty, and now your body is making you pay. Fever, sore throat, the works.',
        choices: [
          {
            label: (s) => `Urgent care visit (${money(medCost(s, 'urgent') + medCost(s, 'rx'))} with ${insured(s) ? 'insurance' : 'NO insurance'})`,
            pay: (s) => medCost(s, 'urgent') + medCost(s, 'rx'),
            hint: '✓ Back on your feet fast (+20 energy)',
            bot: (s) => (insured(s) ? 3 : 1),
            do: (s) => {
              energy(s, 20);
              unlock(s, 'copay');
            },
            result: (s) => (insured(s) ? 'Strep throat. Antibiotics. Your insurance covered most of it.' : 'Strep throat. Antibiotics. Without insurance, that was the full price.'),
            tip: 'A copay is the fixed amount you pay for a visit when you have insurance. Without insurance, you pay the whole bill.',
          },
          {
            label: 'Call out and rest',
            hint: (s) => `✓ Free · ✗ ${s.job && s.path !== 'college' ? 'Lose a day of pay' : 'Miss class'} · ✓ +12 energy`,
            bot: 2,
            do: (s) => {
              missWork(s, 'Sick day');
              energy(s, 12);
            },
            result: 'Soup, sleep, and bad TV. You feel human again by Sunday.',
          },
          {
            label: 'Tough it out and go in anyway',
            hint: '✓ No lost pay · ✗ −10 energy · ✗ Coworkers are not thrilled',
            bot: -2,
            do: (s) => {
              energy(s, -10);
              rep(s, -3);
            },
            result: 'You cough through your whole shift. Your boss sends you home early anyway.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-burnout',
    title: 'Burnout',
    art: (s) => s.housing.art,
    kind: 'event',
    steps: {
      start: {
        text: 'You hit zero. Your alarm goes off and you just… can’t. You sleep through your shift, miss texts, and feel awful.',
        choices: [
          {
            label: 'Take a real break',
            do: (s) => {
              missWork(s, 'Burnout');
              missWork(s, 'Burnout');
              rep(s, -4);
              energy(s, 45);
              inc(s, 'burnouts');
              unlock(s, 'burnout');
            },
            result: 'Two missed days and an awkward talk with your boss. But you’re recovering.',
            tip: 'Rest isn’t lazy. Schedule it like anything else, or your body will schedule it for you.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-injury',
    title: 'Ow.',
    art: 'clinic',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          `${s.transport === 'bike' ? 'A car door opens right in front of your bike.' : s.path === 'trade' ? 'You slip off a ladder on a job site.' : s.path === 'work' ? 'A pallet jack rolls over your foot.' : 'You miss the last step on the stairs.'} Something is definitely broken.\n\nER visit: ${insured(s) ? `${money(medCost(s, 'er'))} (your insurance caps it)` : `${money(medCost(s, 'er'))}. You have NO insurance.`}`,
        speaker: 'doctor',
        choices: [
          {
            label: (s) => `Go to the ER (${money(medCost(s, 'er'))})`,
            pay: (s) => medCost(s, 'er'),
            bot: 2,
            do: (s) => {
              missWork(s, 'Injury');
              energy(s, -10);
              unlock(s, 'deductible');
              inc(s, 'medicalBills', medCost(s, 'er'));
            },
            result: (s) =>
              insured(s)
                ? 'Cast, painkillers, and a bill you can actually handle. Insurance did its job.'
                : 'Cast, painkillers, and a bill you’ll remember for years.',
          },
          {
            label: 'Ask for a payment plan ($150/month)',
            hide: (s) => insured(s),
            bot: 1,
            do: (s) => {
              missWork(s, 'Injury');
              energy(s, -10);
              hospitalPlan(s, medCost(s, 'er'));
            },
            result: 'The hospital billing office sets up $150/month. No interest, but it’ll take almost two years.',
            tip: 'Hospitals often offer interest-free payment plans or financial assistance. Always ask before putting medical bills on a credit card.',
          },
          {
            label: 'Wrap it up and skip the ER',
            hint: '✓ Free · ✗ It heals wrong · ✗ −25 energy',
            bot: -3,
            do: (s) => {
              energy(s, -25);
              rep(s, -5);
              setFlag(s, 'badHeal');
            },
            result: 'It heals… crooked. It aches every time it rains.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-toothache',
    title: 'Toothache',
    art: 'dentist',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          num(s, 'toothRisk') >= 2
            ? 'That back molar is now throbbing so hard you can feel your heartbeat in your jaw. You can’t chew. You can’t sleep.'
            : 'That back molar twinges every time you drink something cold.',
        speaker: 'dentist',
        choices: [
          {
            label: (s) => {
              const big = num(s, 'toothRisk') >= 2;
              return `Emergency dentist: ${big ? 'root canal + crown' : 'filling'} (${money(toothCost(s))})`;
            },
            pay: (s) => toothCost(s),
            bot: 2,
            do: (s) => {
              if (num(s, 'toothRisk') >= 2) missWork(s, 'Root canal');
              s.flags.toothRisk = 0;
              setFlag(s, 'dentistDone');
            },
            result: (s) => (s.dental ? 'Fixed. Dental insurance covered a big chunk.' : 'Fixed. Your wallet is now also in pain.'),
            tip: 'A $165 cleaning catches problems early. A root canal and crown can cost over $1,500 without insurance.',
          },
          {
            label: 'Ibuprofen and hope',
            hint: '✓ Free today · ✗ It WILL get worse',
            bot: -3,
            do: (s) => {
              s.flags.toothRisk = num(s, 'toothRisk') + 1;
              energy(s, -10);
            },
            result: 'The pain dulls. For now.',
          },
        ],
      },
    },
  },

  // ====================== CAR ======================
  {
    id: 'ev-tire',
    title: 'Low tire',
    art: 'road',
    kind: 'event',
    steps: {
      start: {
        text: 'Your tire pressure light keeps coming on. At the shop: “Tread’s worn down to nothing, and there’s a nail in it. You need a new tire: $150.”',
        speaker: 'mechanic',
        choices: [
          {
            label: 'Replace it now: $150',
            pay: 150,
            hint: '✓ Safe, done · ✗ $150 today',
            bot: 3,
            do: (s) => {
              if (s.car) s.car.condition = Math.min(100, s.car.condition + 8);
              s.flags.tireBad = 0;
            },
            result: 'New tire. Smooth ride. That nagging light is off.',
          },
          {
            label: 'Patch it for $25 and hope',
            pay: 25,
            hint: '✓ Cheap · ✗ Worn tread can still blow out',
            bot: 0,
            do: (s) => {
              s.flags.tireBad = 1;
            },
            result: 'Patched. The mechanic says, “That tread won’t last.”',
          },
          {
            label: 'Wait and save up for it',
            hint: '✓ No money now · ✗ Each week risks a blowout: tow + tire + missed work',
            bot: -2,
            do: (s) => {
              s.flags.tireBad = 2;
            },
            result: 'You add air and tell yourself you’ll deal with it on payday.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-blowout',
    title: 'BLOWOUT',
    art: 'road',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          `BANG. Thump-thump-thump. That tire finally gave out on the highway on your way to ${s.path === 'college' ? 'class' : 'work'}.\n\nTow: ${s.flags.roadside ? '$0 (roadside assistance!)' : '$110'}. New tire: $150. And you’re very late.`,
        speaker: 'mechanic',
        choices: [
          {
            label: (s) => `Pay for the ${s.flags.roadside ? 'tire' : 'tow + tire'}: ${money(s.flags.roadside ? 150 : 260)}`,
            pay: (s) => (s.flags.roadside ? 150 : 260),
            bot: 2,
            do: (s) => {
              missWork(s, 'Blowout');
              rep(s, -3);
              s.flags.tireBad = 0;
              inc(s, 'blowouts');
            },
            result: 'Waiting for the tow truck, you do the math: replacing it when the shop said so would have cost $150 and zero missed work.',
            tip: 'Putting off maintenance usually costs more later, plus the time you lose when it breaks.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-ticket',
    title: 'Pulled over',
    art: 'night',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          `Blue and red lights in your mirror. “Do you know how fast you were going? 47 in a 35.”\n\nThe ticket: $175 fine + 3 points on your license. Points make your car insurance go up.${s.flags.uninsuredCar ? `\n\n“Proof of insurance?” You don’t have any: your policy lapsed. That’s a second ticket, ${money(NO_INSURANCE_FINE)}, due now.` : ''}`,
        speaker: 'cop',
        choices: [
          {
            label: 'Pay the fine online: $175',
            pay: 175,
            hint: '✓ Done quickly · ✗ Points: insurance +$25/month',
            bot: 0,
            do: (s) => {
              noInsuranceTicket(s);
              addPoints(s);
            },
            result: 'Paid. Then your insurance company finds out.',
            tip: 'A moving violation can raise insurance rates for 3+ years. That often costs more than the ticket.',
          },
          {
            label: 'Take a traffic safety class: $60 (two weekend slots)',
            pay: 60,
            hint: '✓ Fine reduced, no points · ✗ Costs next weekend',
            bot: 3,
            do: (s) => {
              noInsuranceTicket(s);
              schedule(s, { week: s.week + 1, slot: 'saturday', kind: 'court', label: 'Traffic school' });
              schedule(s, { week: s.week + 1, slot: 'sunday', kind: 'court', label: 'Traffic school' });
              setFlag(s, 'trafficSchool');
              charge(s, 50, 'Reduced fine');
            },
            result: 'Signed up. Two days of driving videos from 1997. No points on your record.',
          },
          {
            label: 'Fight it in court (a weekday)',
            hint: '✓ Might get reduced · ✗ Costs a day of work · ✗ Might lose',
            bot: 1,
            do: (s) => {
              noInsuranceTicket(s);
              schedule(s, { week: s.week + 2, slot: 'weekday', kind: 'court', label: 'Traffic court' });
            },
            result: 'Court date set.',
          },
          {
            label: 'Ignore it',
            hint: '✗ Late fees, license suspension',
            bot: -5,
            do: (s) => {
              noInsuranceTicket(s);
              setFlag(s, 'ticketIgnored', s.week);
            },
            result: 'You stuff it in the glovebox. Out of sight…',
          },
        ],
      },
    },
  },
  {
    id: 'appt-court',
    title: (s) => (s.flags.trafficSchool ? 'Traffic school' : 'Traffic court'),
    art: 'office',
    kind: 'appt',
    steps: {
      start: {
        text: (s) =>
          s.flags.trafficSchool
            ? 'Hour 6 of “RED MEANS STOP.” The instructor shows a crash test video for the fourth time.'
            : 'The judge looks tired. The officer showed up. “How do you plead?”',
        speaker: (s: GameState) => (s.flags.trafficSchool ? 'advisor' : 'cop'),
        choices: [
          {
            label: 'Finish the class',
            hide: (s) => !s.flags.trafficSchool,
            do: (s) => {
              energy(s, -5);
              if (num(s, 'trafficDays') >= 1) setFlag(s, 'trafficSchool', false);
              inc(s, 'trafficDays');
            },
            result: 'Done with this session.',
          },
          {
            label: '“Guilty, with an explanation. I’d like a reduction.”',
            hide: (s) => !!s.flags.trafficSchool,
            bot: 2,
            do: (s, d) => {
              d.won = chance(s, 0.6) ? 1 : 0;
              charge(s, d.won ? 90 : 215, 'Traffic court');
              if (!d.won) addPoints(s);
            },
            result: (_s, d) => (d.won ? 'Reduced to a non-moving violation: $90, no points.' : 'Denied. $175 fine + $40 court costs, and the points stay.'),
          },
        ],
      },
    },
  },
  {
    id: 'ev-ticketlate',
    title: 'Notice from the court',
    art: 'office',
    kind: 'event',
    steps: {
      start: {
        text: 'FINAL NOTICE: The unpaid ticket is now $350 with late fees. If you don’t pay, your license will be suspended: no driving, not even to work, until you pay it plus a reinstatement fee.',
        speaker: 'cop',
        choices: [
          {
            label: 'Pay $350',
            pay: 350,
            bot: 2,
            do: (s) => {
              setFlag(s, 'ticketIgnored', false);
              addPoints(s);
            },
            result: 'Paid. Ignoring that ticket cost you double.',
            tip: 'Ignored tickets turn into late fees, suspended licenses, and sometimes warrants.',
          },
          {
            label: 'Ignore it again',
            hint: `✗ License suspended · ✗ Collections on your credit · ✗ ${money(LICENSE_REINSTATE)} to get it back`,
            bot: -5,
            do: (s) => {
              setFlag(s, 'ticketIgnored', false);
              setFlag(s, 'license', false);
              setFlag(s, 'licenseSuspended', s.week);
              s.credit.collections++;
              unlock(s, 'collections');
            },
            result: 'Your license is suspended, and the debt goes to collections, which tanks your credit score. Your car stays parked: driving now is a crime. Until you pay, it’s the bus.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-checkengine',
    title: 'Check engine light',
    art: 'road',
    kind: 'event',
    steps: {
      start: {
        text: 'The little orange engine light comes on and stays on. The car seems… fine?',
        speaker: 'mechanic',
        choices: [
          {
            label: 'Get it diagnosed and fixed: $180',
            pay: 180,
            hint: '✓ Catch it early',
            bot: 3,
            do: (s) => {
              if (s.car) s.car.condition = Math.min(100, s.car.condition + 20);
            },
            result: 'Bad oxygen sensor. Fixed. The light goes off.',
          },
          {
            label: 'Put a piece of tape over the light',
            hint: '✓ Free · ✗ Whatever it is, it’s still happening',
            bot: -3,
            do: (s) => {
              if (s.car) s.car.condition = Math.max(0, s.car.condition - 18);
            },
            result: 'Problem solved. (Problem not solved.)',
          },
        ],
      },
    },
  },
  {
    id: 'ev-breakdown',
    title: 'Breakdown',
    art: 'road',
    kind: 'event',
    steps: {
      start: {
        text: (s) => `Your car shudders, clunks, and dies at a stoplight. The mechanic’s verdict: ${repairCost(s) > 1000 ? 'transmission' : 'alternator and belts'}. ${money(repairCost(s))} to fix.`,
        speaker: 'mechanic',
        choices: [
          {
            label: (s) => `Fix it: ${money(repairCost(s))}`,
            pay: (s) => repairCost(s),
            bot: 1,
            do: (s) => {
              missWork(s, 'Car in the shop');
              if (s.car) s.car.condition = 70;
              inc(s, 'carRepairs');
            },
            result: 'Fixed. That one hurt.',
          },
          {
            label: 'File a claim on your extended warranty ($100 deductible)',
            hide: (s) => !s.flags.carWarranty,
            hint: '✓ It’s what you’ve been paying for · ✗ Only if they approve it',
            bot: 3,
            do: (s, d) => {
              const cost = repairCost(s);
              d.denied = num(s, 'oilSkipped') > 0 ? 1 : 0;
              missWork(s, 'Car in the shop');
              if (s.car) s.car.condition = 70;
              inc(s, 'carRepairs');
              charge(s, d.denied ? cost : 100, d.denied ? 'Repair (warranty denied)' : 'Warranty deductible');
              unlock(s, 'extended-warranty');
            },
            result: (_s, d) =>
              d.denied
                ? 'DENIED. “No proof of regular oil changes.” You skipped one, and they found it. You pay the whole repair yourself.'
                : 'Approved! You pay the $100 deductible and the warranty covers the rest. This time the fine print was on your side.',
            tip: 'Warranties can deny claims if you can’t prove regular maintenance. Keep every oil change receipt.',
          },
          {
            label: (s) => `Sell it for scrap (${money(Math.round((s.car?.value ?? 0) * 0.2))}) and take the bus`,
            bot: 0,
            hide: (s) => s.loans.some((l) => l.kind === 'car' && l.balance > 0),
            do: (s) => {
              earn(s, Math.round((s.car?.value ?? 0) * 0.2));
              s.car = null;
              s.transport = 'bus';
              missWork(s, 'Car died');
              s.subs.push({ id: 'buspass', label: 'Monthly bus pass', cost: 65 });
            },
            result: 'Goodbye, old friend. Hello, bus pass.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-repo',
    title: 'Repossessed',
    art: 'night',
    kind: 'event',
    steps: {
      start: {
        text: 'You walk outside. Your car is gone. A tow truck took it at 3 AM after two missed loan payments. You still owe what’s left on the loan.',
        choices: [
          {
            label: 'Oh no.',
            do: (s) => {
              s.car = null;
              s.transport = 'bus';
              s.credit.late += 2;
              s.subs.push({ id: 'buspass', label: 'Monthly bus pass', cost: 65 });
              const l = s.loans.find((x) => x.kind === 'car');
              if (l) {
                l.balance = Math.max(0, l.balance - 3500);
                l.name = 'Car loan (after repo)';
              }
              unlock(s, 'repossession');
            },
            result: 'They sold it at auction for less than you owe. You still have to pay the rest of the loan, and you don’t even have a car.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-parking',
    title: 'Parking ticket',
    art: 'street',
    kind: 'event',
    steps: {
      start: {
        text: 'An orange envelope under your wiper. $45. The meter ran out 6 minutes ago.',
        choices: [
          { label: 'Pay it: $45', pay: 45, bot: 2, result: 'Paid. Six minutes cost you three hours of work.' },
          { label: 'Ignore it', bot: -3, do: (s) => setFlag(s, 'parkingIgnored', s.week), result: 'It goes in the glovebox with the others.' },
        ],
      },
    },
  },
  {
    id: 'ev-parkinglate',
    title: 'Collections letter',
    art: 'office',
    kind: 'event',
    steps: {
      start: {
        text: 'A collections agency writes: the $45 parking ticket is now $130.',
        choices: [
          {
            label: 'Pay $130',
            pay: 130,
            bot: 2,
            do: (s) => setFlag(s, 'parkingIgnored', false),
            result: 'Paid. A $45 ticket became $130.',
          },
          {
            label: 'Ignore it',
            bot: -4,
            do: (s) => {
              setFlag(s, 'parkingIgnored', false);
              s.credit.collections++;
              unlock(s, 'collections');
            },
            result: 'It goes on your credit report as a collection. Your score drops hard.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-gasprice',
    title: 'Gas prices jump',
    art: 'road',
    kind: 'event',
    steps: {
      start: {
        text: 'Gas just jumped 80 cents a gallon. Filling up costs $15 more this week.',
        choices: [
          { label: 'Pay at the pump', do: (s) => void charge(s, 15, 'Gas spike'), result: 'Ouch. Nothing to do but pay it.' },
          {
            label: 'Combine errands and skip a trip',
            bot: 2,
            do: (s) => energy(s, -3),
            result: 'You plan your errands like a military operation. No extra gas spent.',
          },
        ],
      },
    },
  },

  // ====================== MONEY & ADMIN ======================
  {
    id: 'ev-subtrial',
    title: 'Mystery charge',
    art: (s) => s.housing.art,
    kind: 'event',
    steps: {
      start: {
        text: 'Checking your bank app, you spot: STREAMFLIX $15.99. Oh right, that “free trial” from two months ago. It’s been charging you.',
        choices: [
          {
            label: 'Cancel it right now',
            bot: 3,
            do: (s) => charge(s, 16, 'StreamFlix'),
            result: 'Canceled (after 4 screens of “Are you SURE?”). You still lost $16.',
            tip: 'Set a reminder when you start a free trial. Companies count on you forgetting.',
          },
          {
            label: 'Keep it: it’s your only fun',
            hint: '✓ +1 energy/week · ✗ $16/month forever',
            bot: -1,
            do: (s) => {
              charge(s, 16, 'StreamFlix');
              s.subs.push({ id: 'streamflix', label: 'StreamFlix', cost: 16 });
            },
            result: 'You keep it. Another bill on the pile.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-scam',
    title: 'Text message',
    art: (s) => s.housing.art,
    kind: 'event',
    steps: {
      start: {
        text: '📱 “USPS: Your package is on hold due to an incomplete address. Pay $1.99 redelivery fee: usps-redeliver-help.co”\n\nYou ARE waiting on a package…',
        choices: [
          {
            label: 'Tap the link and pay $1.99',
            bot: -5,
            do: (s) => {
              const stolen = Math.min(400, Math.max(0, s.stats.cash));
              s.stats.cash -= stolen;
              setFlag(s, 'scammed', stolen);
              energy(s, -12);
              unlock(s, 'scams');
            },
            result: (s) =>
              `Two hours later: ${money(num(s, 'scammed'))} in charges you didn’t make. You spend the evening on hold with your bank. They freeze your card and open a fraud claim. It may take weeks to get the money back.`,
            tip: 'The real USPS never texts you asking for payment. Never pay through a link in a text. Go to the official website yourself.',
          },
          {
            label: 'Delete it and report it as junk',
            bot: 3,
            do: (s) => {
              unlock(s, 'scams');
              achieve(s, 'scamdodger');
            },
            result: 'Deleted. Your real package shows up the next day.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-fraudrefund',
    title: 'Fraud claim resolved',
    art: 'bank',
    kind: 'event',
    steps: {
      start: {
        text: (s) => `Your bank finished the fraud investigation. The ${money(num(s, 'scammed'))} is back in your account.`,
        speaker: 'banker',
        choices: [
          {
            label: 'Phew',
            do: (s) => {
              earn(s, num(s, 'scammed'));
              setFlag(s, 'scammed', 0);
            },
            result: 'Lesson learned the hard way.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-jury',
    title: 'Jury duty',
    art: 'office',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          s.flags.juryPostponed
            ? 'The court didn’t forget. Your postponed jury summons is back: next week, a weekday. No more postponements. Your employer doesn’t pay for it. The court pays $15.'
            : 'An official envelope: you’ve been summoned for jury duty next week (a weekday). Your employer doesn’t pay for it. The court pays $15.',
        choices: [
          {
            label: 'Serve',
            hint: '✓ Civic duty · ✗ One weekday',
            bot: 1,
            do: (s) => {
              schedule(s, { week: freeWeek(s, 'weekday', s.week + 1), slot: 'weekday', kind: 'jury', label: 'Jury duty' });
              unlock(s, 'jury-duty');
            },
            result: 'You’ll serve next week.',
          },
          {
            label: 'Request a postponement online',
            hint: '✓ Pick a better time · ✗ It comes back in a few months, and you only get one',
            hide: (s) => !!s.flags.juryPostponed,
            bot: 2,
            do: (s) => {
              setFlag(s, 'juryPostponed', s.week);
              unlock(s, 'jury-duty');
            },
            result: 'Postponed. Allowed once. When the new date comes, you have to go. Ignoring a summons can mean a fine.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-friendloan',
    title: 'Can I borrow…',
    art: 'party',
    kind: 'event',
    steps: {
      start: {
        text: '“Hey… I hate asking. I’m $200 short on rent. I’ll pay you back in two weeks, I swear.” — your friend Devon',
        choices: [
          {
            label: 'Lend $200',
            pay: 200,
            methods: ['checking', 'savings'],
            hint: '✓ Help a friend · ✗ Might never see it again',
            bot: 0,
            do: (s, d) => {
              d.back = chance(s, 0.5) ? 1 : 0;
              if (d.back) setFlag(s, 'devonRepay', s.week + 2);
              energy(s, 5);
            },
            result: 'Devon is SO grateful. Two weeks, they said…',
            tip: 'Only lend what you could afford to never get back.',
          },
          {
            label: 'Give $40, no strings attached',
            pay: 40,
            bot: 2,
            do: (s) => energy(s, 6),
            result: 'You can’t do $200, but this helps a little. Devon understands.',
          },
          {
            label: '“I’m sorry, I really can’t.”',
            bot: 1,
            do: (s) => energy(s, -4),
            result: 'It’s awkward. But you were honest.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-devonrepay',
    title: 'Devon came through',
    art: 'party',
    kind: 'event',
    steps: {
      start: {
        text: 'Devon sends you $200 with a thank-you GIF. Restoring faith in humanity.',
        choices: [ok('🙌', { do: (s) => earn(s, 200) })],
      },
    },
  },
  {
    id: 'ev-grandma',
    title: 'A card from Grandma',
    art: (s) => s.housing.art,
    kind: 'event',
    steps: {
      start: {
        text: 'A card from Grandma: “Proud of you, sweetheart. Don’t spend it all in one place. Love, Grandma.” There’s a $50 check inside.',
        speaker: 'grandma',
        choices: [
          { label: 'Deposit it in savings', bot: 2, do: (s) => void (s.stats.savings += 50), result: 'Saved. Grandma would approve.' },
          { label: 'Pizza night!', bot: -1, do: (s) => energy(s, 8), result: 'Pizza for the whole floor. Legend.' },
        ],
      },
    },
  },
  {
    id: 'ev-cardoffer',
    title: 'You’re pre-approved!',
    art: (s) => s.housing.art,
    kind: 'event',
    steps: {
      start: {
        text: 'A shiny envelope: “CONGRATULATIONS! You’re PRE-APPROVED for a Platinum card with a $1,000 limit! 0% intro APR!”\n\nThe fine print: 0% for 3 months, then 29.24%. $95 annual fee.',
        choices: [
          {
            label: 'Apply',
            hint: '✓ Starts your credit history · ✗ $95 fee · ✗ 29% APR later',
            bot: -1,
            do: (s) => {
              s.card = { name: 'Platinum Card', kind: 'rewards', limit: 1000, apr: 0.2924, balance: 95, deposit: 0, openedWeek: s.week };
              s.credit.firstWeek ??= s.week;
              s.credit.inquiries.push(s.week);
              unlock(s, 'apr');
              unlock(s, 'credit-score');
            },
            next: 'use',
          },
          { label: 'Shred it', bot: 2, result: 'Shredded. You’ll pick a card on your own terms.' },
        ],
      },
      use: CARD_USE,
    },
  },
  {
    id: 'ev-promoend',
    title: 'Deferred interest',
    art: 'bank',
    kind: 'event',
    steps: {
      start: {
        text: (s) => `Your ToolTown 0% promo ended with a balance still on it. Surprise: ALL the interest from the past 6 months gets added at once. +${money(Math.round((s.card?.balance ?? 0) * 0.15))}.`,
        speaker: 'banker',
        choices: [
          {
            label: 'That’s… legal?',
            do: (s) => {
              if (s.card) s.card.balance += Math.round(s.card.balance * 0.15);
              setFlag(s, 'promoUntil', 0);
            },
            result: 'Yep. It’s called deferred interest, and it’s why “0% if paid in full” deals are tricky.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-phone',
    title: 'Cracked screen',
    art: 'street',
    kind: 'event',
    steps: {
      start: {
        text: 'Your phone slips out of your pocket and lands face-down on concrete. The screen is a spiderweb. Half the touchscreen doesn’t work.',
        choices: [
          {
            label: 'Screen repair: $129',
            pay: 129,
            hint: '✓ Phone works again',
            bot: 2,
            result: 'Good as new (it’s not, but close).',
          },
          {
            label: 'Live with it',
            hint: '✓ Free · ✗ You’ll miss texts and shift changes',
            bot: -1,
            do: (s) => setFlag(s, 'brokenPhone'),
            result: 'You can still make calls… mostly.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-missedtext',
    title: 'Missed shift change',
    art: (s) => s.job?.art ?? 'office',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          s.flags.phoneCut
            ? 'Your boss changed your shift by text. Your phone service is cut off for an unpaid bill, so it never came through. You showed up two hours late.'
            : 'Your boss changed your shift by text. Your cracked screen didn’t register it. You showed up two hours late.',
        speaker: 'boss',
        choices: [
          {
            label: 'Apologize and fix the phone ($129)',
            pay: 129,
            bot: 2,
            hide: (s) => !s.flags.brokenPhone,
            do: (s) => {
              rep(s, -4);
              setFlag(s, 'brokenPhone', false);
            },
            result: 'Fixed. Your boss accepts the apology, barely.',
          },
          {
            label: (s) => `Apologize and pay the phone bill now (${money(phoneBill(s))} with the late fee)`,
            pay: (s) => phoneBill(s),
            bot: 2,
            hide: (s) => !s.flags.phoneCut,
            do: (s) => {
              rep(s, -4);
              setFlag(s, 'phoneCut', false);
            },
            result: 'Service back on. Your boss accepts the apology, barely.',
            tip: 'Your phone is how work, landlords, and job offers reach you. Keep that bill near the top of the list.',
          },
          { label: 'Apologize', do: (s) => rep(s, -6), result: 'Boss rating took a hit.' },
        ],
      },
    },
  },
  {
    id: 'ev-laptop',
    title: 'Laptop died',
    art: 'dorm',
    kind: 'event',
    steps: {
      start: {
        text: 'Blue screen. Then black screen. Then nothing. Your laptop is dead the week a paper is due.',
        choices: [
          { label: 'New laptop: $550', pay: 550, hint: '✓ Fast, reliable', bot: 0, result: 'New laptop. You back everything up this time.' },
          { label: 'Refurbished laptop: $220', pay: 220, hint: '✓ Good enough', bot: 2, result: 'Refurbished and works fine.' },
          {
            label: 'Use the library computers',
            hint: '✓ Free · ✗ −3 energy every week',
            bot: -1,
            do: (s) => {
              setFlag(s, 'noLaptop');
              xp(s, -4);
            },
            result: 'You get very familiar with the library’s hours.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-bikestolen',
    title: 'Bike stolen',
    art: 'street',
    kind: 'event',
    steps: {
      start: {
        text: 'Your bike is gone. Just the cut lock is left, still attached to the rack. Rude.',
        choices: [
          {
            label: (s) => (s.flags.rentersIns ? 'File a renters insurance claim' : 'Buy another used bike: $150'),
            pay: (s) => (s.flags.rentersIns ? 0 : 150),
            bot: 2,
            result: (s) => (s.flags.rentersIns ? 'Renters insurance covers it! New bike, $0.' : 'New bike. Better lock.'),
          },
          {
            label: 'Switch to the bus ($65/month)',
            bot: 0,
            do: (s) => {
              s.transport = 'bus';
              s.subs.push({ id: 'buspass', label: 'Monthly bus pass', cost: 65 });
            },
            result: 'Bus life.',
          },
        ],
      },
    },
  },

  // ====================== WORK ======================
  {
    id: 'ev-cover',
    title: 'Can you cover?',
    art: (s) => s.job?.art ?? 'office',
    kind: 'event',
    steps: {
      start: {
        text: 'Your boss texts: “Hey, can you cover a shift Saturday? Kayla called out.”',
        speaker: 'boss',
        choices: [
          {
            label: 'Sure, I’ll be there',
            hint: (s) => `✓ +${money(6 * (s.job?.wage ?? 0))} pay · ✓ Boss rating · ✗ −12 energy`,
            bot: (s) => (s.stats.energy > 45 ? 2 : -1),
            do: (s) => {
              s.hoursThisPeriod += 6;
              rep(s, 4);
              energy(s, -12);
            },
            result: 'Your boss sends a thumbs up. You’ll remember this, Kayla.',
          },
          {
            label: '“Sorry, I have plans.”',
            bot: (s) => (s.stats.energy > 45 ? 0 : 2),
            do: (s) => rep(s, -1),
            result: '“No worries.” (It’s a little bit of worries.)',
            tip: 'It’s okay to say no sometimes. Protecting your rest is part of being reliable long-term.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-raise',
    title: 'Ask for a raise?',
    art: (s) => s.job?.art ?? 'office',
    kind: 'event',
    steps: {
      start: {
        text: 'It’s been a few months. You’ve been reliable. Coworker Jess says she just got a $1/hour raise… because she asked.',
        speaker: 'boss',
        choices: [
          {
            label: 'Ask for a $1/hour raise',
            hint: '\u2713 More money every paycheck \u00b7 Mini-game \u00b7 Works best with a good boss rating',
            bot: 2,
            do: (s) => minigame(s, 'haggle', { item: 'raise' }),
          },
          { label: 'Don’t rock the boat', bot: -1, result: 'You stay quiet. Jess is now making more than you.' },
        ],
      },
    },
  },
  {
    id: 'ev-latebus',
    title: 'Running late',
    art: 'street',
    kind: 'event',
    steps: {
      start: {
        text: (s) => `Your alarm didn\u2019t go off. It\u2019s 7:52. The bus to ${s.path === 'college' ? 'campus' : 'work'} leaves the corner at 7:55.`,
        choices: [
          { label: 'RUN!', hint: '\u2713 Free \u00b7 Mini-game', bot: 3, do: (s) => minigame(s, 'busdash') },
          {
            label: 'Call a rideshare: $22',
            pay: 22,
            hint: '\u2713 On time \u00b7 \u2717 $22 for a 10-minute ride',
            bot: -1,
            result: 'You arrive on time and $22 poorer. The driver\u2019s air freshener was intense.',
          },
          {
            label: 'Text your boss that you\u2019ll be late',
            hint: '\u2717 Boss rating drops',
            bot: -2,
            do: (s) => rep(s, -3),
            result: '\u201cOk.\u201d Just \u201cok.\u201d With a period. That\u2019s bad.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-promo1',
    title: 'Moving up',
    art: (s) => s.job?.art ?? 'office',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          `Your boss pulls you aside. \u201cYou keep picking up shifts and you actually show up. I noticed. I want to make you ${promoTitle(s, 1)}. It\u2019s $1.50 more an hour, and a little more responsibility.\u201d`,
        speaker: 'boss',
        choices: [
          {
            label: (s) => `Take it: ${promoTitle(s, 1)}`,
            hint: '\u2713 +$1.50/hour \u00b7 \u2713 Looks great on a resume \u00b7 \u2717 More responsibility (\u22124 energy)',
            bot: 3,
            do: (s) => {
              if (s.job) {
                s.job.wage = Math.round((s.job.wage + 1.5) * 100) / 100;
                s.job.title = promoTitle(s, 1);
              }
              setFlag(s, 'promo1');
              energy(s, -4);
              xp(s, 4);
              achieve(s, 'promoted');
            },
            result: 'New title, new name tag, bigger paycheck. Your mom posts about it.',
            tip: 'Reliability is the fastest way up in most jobs: showing up, covering shifts, and doing it well.',
          },
          {
            label: 'Not yet, I need my free time',
            hint: '\u2713 Keep your schedule \u00b7 \u2717 Leave money on the table',
            bot: -1,
            do: (s) => setFlag(s, 'promo1', 'declined'),
            result: '\u201cOkay. The offer stands if you change your mind.\u201d (It doesn\u2019t, really.)',
          },
        ],
      },
    },
  },
  {
    id: 'ev-promo2',
    title: 'Another step up',
    art: (s) => s.job?.art ?? 'office',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          `\u201cYou\u2019ve become the person everyone calls when something goes wrong. Corporate approved a bump for you: ${promoTitle(s, 2)}, another $1.50 an hour, and more hours if you want them.\u201d`,
        speaker: 'boss',
        choices: [
          {
            label: 'Take the raise AND the extra hours',
            hint: '\u2713 +$1.50/hr and +4 hrs/week \u00b7 \u2717 Less free time (\u22126 energy now, more drain weekly)',
            bot: (s) => (s.stats.energy > 50 ? 3 : 1),
            do: (s) => {
              if (s.job) {
                s.job.wage = Math.round((s.job.wage + 1.5) * 100) / 100;
                s.job.hours += 4;
                s.job.title = promoTitle(s, 2);
              }
              setFlag(s, 'promo2');
              energy(s, -6);
              xp(s, 5);
            },
            result: 'Bigger paychecks, longer weeks. You\u2019re officially \u201cthe reliable one.\u201d',
          },
          {
            label: 'Take the raise, keep my hours',
            hint: '\u2713 +$1.50/hr \u00b7 \u2713 Same schedule',
            bot: (s) => (s.stats.energy > 50 ? 2 : 3),
            do: (s) => {
              if (s.job) {
                s.job.wage = Math.round((s.job.wage + 1.5) * 100) / 100;
                s.job.title = promoTitle(s, 2);
              }
              setFlag(s, 'promo2');
              xp(s, 5);
            },
            result: 'More money for the same hours. Nice.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-fired',
    title: 'Let go',
    art: 'office',
    kind: 'event',
    steps: {
      start: {
        text: (s) => `Your manager calls you into the office. “We’ve talked about attendance and reliability. I’m sorry, ${s.name}. Today is your last day.”`,
        speaker: 'boss',
        choices: [
          {
            label: 'Pack your things',
            do: (s) => {
              s.job = null;
              if (s.health === 'employer') s.health = 'none';
              inc(s, 'firings');
              unlock(s, 'unemployment');
            },
            result: 'No more paychecks. No more health insurance. You need to find a new job, fast (Job hunt is now on your schedule menu).',
          },
        ],
      },
    },
  },
  {
    id: 'ev-bonus',
    title: 'Attendance bonus',
    art: (s) => s.job?.art ?? 'office',
    kind: 'event',
    steps: {
      start: {
        text: 'Perfect attendance this quarter! Here’s a $100 bonus.',
        speaker: 'boss',
        choices: [
          { label: 'Save it', bot: 2, do: (s) => void (s.stats.savings += 100), result: 'Into savings.' },
          { label: 'Spend it on a fun weekend', do: (s) => energy(s, 12), result: 'Great weekend.' },
        ],
      },
    },
  },
  {
    id: 'ev-mentor',
    title: 'A good mentor',
    art: (s) => s.job?.art ?? 'office',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          s.path === 'college'
            ? 'Your econ professor notices your question in class and invites you to office hours.'
            : 'An older coworker offers to show you the ropes after your shift.',
        choices: [
          {
            label: 'Stay late and learn',
            bot: (s) => (s.stats.energy > 35 ? 2 : 0),
            do: (s) => {
              xp(s, 6);
              energy(s, -6);
              rep(s, 2);
            },
            result: 'Two hours of real wisdom. +6 career progress.',
          },
          { label: 'Too tired, maybe next time', do: (s) => energy(s, 2), result: 'Next time.' },
        ],
      },
    },
  },

  // ====================== HOME LIFE ======================
  {
    id: 'ev-curfew',
    title: 'House rules',
    art: 'bedroom',
    kind: 'event',
    steps: {
      start: {
        text: 'You came home at 1:15 AM. Your mom was waiting in the dark, like a movie villain. “My house, my rules.”',
        speaker: 'mom',
        choices: [
          {
            label: 'Apologize and offer to do extra chores',
            bot: 2,
            do: (s) => energy(s, -4),
            result: 'You mow the lawn. Peace restored.',
          },
          {
            label: 'Argue that you’re an adult now',
            hint: (s) => (num(s, 'momArguments') >= 1 ? '✗ −10 energy · ✗ Mom’s patience is running out' : '✗ −10 energy · ✗ Mom keeps score'),
            bot: -1,
            do: (s, d) => {
              energy(s, -10);
              const n = inc(s, 'momArguments');
              // Second blowup: if you're an adult, you can pay adult rent.
              if (n >= 2 && !s.flags.adultRent && s.housing.kind === 'parents') {
                setFlag(s, 'adultRent');
                s.housing.rent += 50;
                d.rent = 1;
              }
            },
            result: (s, d) =>
              d.rent
                ? `“Fine. Adults pay adult rent.” Your rent to your parents is now ${money(s.housing.rent)} a month.`
                : 'It goes badly. Very quiet dinner tonight.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-roomfood',
    title: 'Who ate my food',
    art: 'apartment',
    kind: 'event',
    steps: {
      start: {
        text: 'The leftovers you were saving for lunch are gone. Your roommate’s plate is in the sink.',
        speaker: 'roommate',
        choices: [
          {
            label: 'Talk to them about it, calmly',
            bot: 2,
            do: (s) => {
              energy(s, -2);
              earn(s, 10);
            },
            result: 'Awkward, but it works. They Venmo you $10.',
          },
          { label: 'Leave a passive-aggressive note', bot: -1, do: (s) => energy(s, -6), result: 'They leave a note back. This could escalate.' },
          { label: 'Buy a mini-fridge for your room: $90', pay: 90, do: (s) => energy(s, 3), result: 'Problem solved with money. Not the cheapest way.' },
        ],
      },
    },
  },
  {
    id: 'ev-samrent',
    title: 'Sam is short',
    art: 'apartment',
    kind: 'event',
    steps: {
      start: {
        text: '“Hey roomie… tips were slow this month. Can you cover my half of rent? I’ll pay you back. When I can.”',
        speaker: 'roommate',
        choices: [
          {
            label: 'Cover Sam’s half: $725',
            pay: 725,
            hint: '✓ You don’t get evicted together · ✗ $725',
            bot: 1,
            result: 'Covered. Sam promises it won’t happen again.',
          },
          {
            label: 'Refuse. The landlord charges you both a late fee.',
            bot: 0,
            do: (s) => {
              charge(s, 75, 'Late fee');
              s.credit.late++;
            },
            result: 'You both get a late fee. Your name is on the lease too, so it’s on your record.',
            tip: 'On a shared lease, you’re usually each responsible for the WHOLE rent. Choose roommates carefully.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-heat',
    title: 'Heat wave',
    art: 'apartment',
    kind: 'event',
    steps: {
      start: {
        text: 'It’s 98°F inside. The AC is running nonstop.',
        choices: [
          { label: 'Keep the AC blasting (+$60 utilities)', do: (s) => void charge(s, 60, 'Utility spike'), result: 'Cool and comfy. Expensive.' },
          { label: 'Fans and cold showers', bot: 2, do: (s) => energy(s, -8), result: 'Sweaty, cranky, but you saved $60.' },
          { label: 'Spend afternoons at the library', bot: 1, do: (s) => xp(s, 2), result: 'Free AC, plus some reading.' },
        ],
      },
    },
  },
  {
    id: 'ev-package',
    title: 'Package stolen',
    art: 'street',
    kind: 'event',
    steps: {
      start: {
        text: 'Your new work boots were “delivered”… and gone from the doorstep. $110.',
        choices: [
          {
            label: 'Contact the seller and request a replacement',
            bot: 2,
            do: (s, d) => {
              d.ok = chance(s, 0.6) ? 1 : 0;
              if (!d.ok) charge(s, 110, 'Replacement boots');
            },
            result: (_s, d) => (d.ok ? 'They send a replacement. Customer service win.' : 'They refuse. You buy them again.'),
            tip: 'Ship valuable packages to a locker, a pickup point, or your workplace.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-concert',
    title: 'Concert!',
    art: 'party',
    kind: 'event',
    steps: {
      start: {
        text: 'Rae got tickets to see your favorite band this Saturday: $85. “YOU HAVE TO COME.”',
        speaker: 'rae',
        choices: [
          {
            label: 'Go!',
            pay: 85,
            hint: '✓ +25 energy · ✗ $85',
            bot: (s) => (s.stats.energy < 40 && s.stats.savings > 300 ? 2 : -1),
            do: (s) => {
              energy(s, 25);
              inc(s, 'friendTime');
            },
            result: 'You lose your voice singing. Best night in months.',
          },
          { label: 'Skip it, save the money', bot: (s) => (s.stats.energy < 40 ? 0 : 2), do: (s) => energy(s, -3), result: 'You watch their stories. FOMO is real.' },
        ],
      },
    },
  },
  {
    id: 'ev-wedding',
    title: 'Cousin’s wedding',
    art: 'party',
    kind: 'event',
    steps: {
      start: {
        text: 'Your cousin is getting married in two weeks. There’s a registry. Gifts start at $40. The wedding is on a Saturday.',
        speaker: 'mom',
        choices: [
          {
            label: 'Go and bring a gift: $40',
            pay: 40,
            bot: 1,
            do: (s) => {
              energy(s, 10);
              schedule(s, { week: s.week + 2, slot: 'saturday', kind: 'trip', label: 'Cousin’s wedding' });
            },
            result: 'RSVP sent. Family will be there. Questions about your future will be there.',
          },
          {
            label: 'Send a nice card',
            bot: 1,
            do: (s) => energy(s, -2),
            result: 'A heartfelt card. Your mom says it’s “fine.”',
          },
        ],
      },
    },
  },
  {
    id: 'appt-trip',
    title: (s) => (s.flags.roadTripBooked ? 'Road trip!' : 'Family wedding'),
    art: (s) => (s.flags.roadTripBooked ? 'beach' : 'party'),
    kind: 'appt',
    steps: {
      start: {
        text: (s) =>
          s.flags.roadTripBooked
            ? 'Rae’s playlist. Gas station snacks. Then the ocean comes into view and you both scream.\n\nOne year ago you were tossing your cap. Look at you now.'
            : 'You dance badly. Your aunt tells everyone you’re “doing so well.” Free cake.',
        speaker: (s: GameState) => (s.flags.roadTripBooked ? 'rae' : 'mom'),
        choices: [
          {
            label: (s) => (s.flags.roadTripBooked ? 'Rent tubes and float the river' : '❤️'),
            do: (s) => {
              energy(s, s.flags.roadTripBooked ? 12 : 10);
              if (s.flags.roadTripBooked) {
                setFlag(s, 'roadTrip');
                achieve(s, 'roadtrip');
                minigame(s, 'river');
              }
            },
          },
        ],
      },
    },
  },
  {
    id: 'ev-roaches',
    title: 'Uninvited roommates',
    art: (s) => s.housing.art,
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          num(s, 'roaches')
            ? 'They\u2019re BACK. More of them this time. One ran across your toothbrush.'
            : 'You flip on the kitchen light at midnight. Something brown and fast runs under the fridge. Where there\u2019s one\u2026',
        choices: [
          { label: 'Grab the spray and go to war', hint: '\u2713 $12 for spray \u00b7 Mini-game', pay: 12, bot: 2, do: (s) => minigame(s, 'roaches') },
          {
            label: 'Email the landlord (in writing)',
            hint: '\u2713 Free, it\u2019s their job \u00b7 \u2717 Takes a couple of weeks',
            bot: 1,
            hide: (s) => s.housing.kind === 'parents',
            do: (s) => {
              energy(s, -6);
              setFlag(s, 'roaches', 0);
              unlock(s, 'pests');
            },
            result: 'Two weeks later, an exterminator shows up. Problem solved, but they were a long two weeks.',
            tip: 'Put repair and pest requests in writing (email or text) so there\u2019s a record.',
          },
          {
            label: 'Hire an exterminator: $150',
            pay: 150,
            hint: '\u2713 Fast and thorough \u00b7 \u2717 Expensive',
            bot: -1,
            do: (s) => setFlag(s, 'roaches', 0),
            result: 'A guy in a jumpsuit sprays everything. Gone by morning.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-inbox',
    title: '214 unread',
    art: (s) => s.housing.art,
    kind: 'event',
    steps: {
      start: {
        text: 'Your phone is a disaster: 214 unread emails and texts. Somewhere in there is a message from your boss about next week\u2019s schedule. Also somewhere in there: scams.',
        choices: [
          { label: 'Clean it out', hint: '\u2713 Catch the scams \u00b7 Mini-game', bot: 3, do: (s) => minigame(s, 'phishing') },
          {
            label: 'Select all \u2192 delete',
            hint: '\u2713 Fast \u00b7 \u2717 You\u2019ll miss the real stuff',
            bot: -2,
            do: (s) => rep(s, -3),
            result: 'Satisfying. Until you show up for a shift that was moved to Tuesday.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-furnish',
    title: 'An empty apartment',
    art: 'apartment',
    kind: 'event',
    steps: {
      start: {
        text: 'Your new place echoes. You own one chair, a lamp, and a box labeled \u201cmisc cables.\u201d You need a bed, a table, and somewhere to sit.',
        choices: [
          {
            label: 'Hit the thrift stores and garage sales (about $150)',
            hint: '\u2713 Cheap if you hunt well \u00b7 Mini-game',
            bot: 3,
            do: (s) => {
              setFlag(s, 'needFurniture', false);
              minigame(s, 'thrift', { budget: 150, goal: 'furniture' });
            },
          },
          {
            label: 'Buy it all new at a big-box store: $650',
            pay: 650,
            hint: '\u2713 Everything matches \u00b7 \u2717 Expensive',
            bot: -2,
            do: (s) => {
              setFlag(s, 'needFurniture', false);
              energy(s, 6);
            },
            result: 'It arrives flat-packed. You spend a whole Sunday with an Allen wrench and 400 tiny screws.',
          },
          {
            label: 'Air mattress for now: $40',
            pay: 40,
            hint: '\u2713 Cheap \u00b7 \u2717 \u22122 energy every week (your back)',
            bot: 0,
            do: (s) => {
              setFlag(s, 'needFurniture', false);
              setFlag(s, 'airMattress');
            },
            result: 'It slowly deflates every night. You wake up on the floor. Every. Night.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-float',
    title: 'River day',
    art: 'beach',
    kind: 'event',
    steps: {
      start: {
        text: 'Rae: \u201cMy cousin is floating the river Saturday!! Tubes are $20 to rent. It\u2019s going to be 95 degrees. COME.\u201d',
        speaker: 'rae',
        choices: [
          { label: 'I\u2019m in! ($20)', pay: 20, hint: '\u2713 Big energy boost \u00b7 Mini-game', bot: (s) => (s.stats.energy < 70 ? 2 : 0), do: (s) => minigame(s, 'river') },
          { label: 'Can\u2019t this time', bot: 0, do: (s) => energy(s, -3), result: 'You watch the photos come in all afternoon.' },
        ],
      },
    },
  },
  {
    id: 'off-clothes',
    title: 'Winter is coming',
    art: 'street',
    kind: 'offer',
    steps: {
      start: {
        text: 'It\u2019s getting cold, and your hoodie isn\u2019t cutting it. You also need a couple of work-appropriate outfits that aren\u2019t from 10th grade.',
        choices: [
          {
            label: 'Thrift hunt (about $80)',
            hint: '\u2713 Cheap if you hunt well \u00b7 Mini-game',
            bot: 3,
            do: (s) => {
              setFlag(s, 'coatBought');
              minigame(s, 'thrift', { budget: 80, goal: 'clothes' });
            },
          },
          {
            label: 'Buy new at the mall: $220',
            pay: 220,
            hint: '\u2713 Easy \u00b7 \u2717 Pricey',
            bot: -1,
            do: (s) => {
              setFlag(s, 'coatBought');
              energy(s, 4);
            },
            result: 'New coat, new clothes, lighter wallet.',
          },
          {
            label: 'Layer up and tough it out',
            hint: '\u2713 Free \u00b7 \u2717 \u22128 energy \u00b7 \u2717 You\u2019ll catch more winter colds',
            bot: -2,
            do: (s) => {
              setFlag(s, 'noCoat');
              energy(s, -8);
            },
            result: 'Three shirts and a scarf. You can\u2019t feel your toes.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-overdrawn',
    title: 'Account overdrawn',
    art: 'bank',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          `A letter from your bank: your checking account has been NEGATIVE (${money(s.stats.cash)}) for weeks. If it isn\u2019t brought back above zero, they\u2019ll close it and send the debt to collections.`,
        speaker: 'banker',
        choices: [
          {
            label: 'Cover it from savings',
            req: (s) => (s.stats.savings >= -s.stats.cash ? true : 'Not enough saved'),
            bot: 3,
            do: (s) => {
              const a = -s.stats.cash;
              s.stats.savings = Math.round((s.stats.savings - a) * 100) / 100;
              s.stats.cash = 0;
            },
            result: 'Back to zero. Phew.',
          },
          {
            label: 'Wait for payday',
            bot: -1,
            do: (s) => {
              s.credit.collections++;
              charge(s, 50, 'Account closing fee');
              unlock(s, 'collections');
            },
            result: 'The bank closes your account and sends the balance to collections. That drops your credit score hard, and it stays on your report for years.',
            tip: 'An overdrawn account that stays negative can get you reported to ChexSystems, which can stop you from opening a new bank account for up to 5 years.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-rentlate',
    title: 'Late rent',
    art: (s) => s.housing.art,
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          s.housing.kind === 'parents'
            ? 'Your mom: “Rent was due on the 1st. That’s our deal. If it happens again, we need a serious talk about whether you’re ready for this.”'
            : 'A notice is taped to your door: PAY RENT OR QUIT. You were charged a $75 late fee. If you miss next month too, the landlord can start an eviction.',
        speaker: (s: GameState) => (s.housing.kind === 'parents' ? 'mom' : 'landlord'),
        choices: [
          {
            label: 'Pay what I owe now',
            pay: (s) => s.housing.rent,
            hide: (s) => s.housing.rent <= 0,
            bot: 3,
            do: (s) => {
              s.housing.missed = 0;
            },
            result: 'Caught up. Rent always comes first.',
            tip: 'Housing comes first in a budget. Then utilities, food, and transportation to work. Then everything else.',
          },
          { label: 'I’ll catch up next month', bot: -3, result: 'One more missed payment and you’re out.' },
        ],
      },
    },
  },

  // ====================== MONEY TRAPS ======================
  {
    id: 'ev-paydayloan',
    title: 'Short on cash',
    art: 'street',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          `Your account says ${money(s.stats.cash)}. ${s.housing.rent > 0 ? 'Rent' : 'Your phone bill'} is due soon, and payday feels very far away.\n\nOn the corner, a neon sign: “CASH TODAY! NO CREDIT CHECK!” Borrow $300 now, pay back $345 on your next payday.`,
        choices: [
          {
            label: 'Take the payday loan: $300 now, $345 in 2 weeks',
            hint: '✓ Cash in 10 minutes · ✗ $45 fee for 2 weeks (≈391% APR) · ✗ All due at once',
            bot: -3,
            do: (s) => {
              earn(s, 300);
              setFlag(s, 'paydayDue', s.week + 2);
              unlock(s, 'payday-loan');
            },
            result: 'The clerk counts out fifteen $20 bills. It feels like relief. It’s really a $45 fee to borrow your own next paycheck for two weeks.',
            tip: '$15 per $100 sounds small. Stretched over a year, it’s about 391% APR. Most payday borrowers can’t repay in two weeks and end up paying the fee again and again.',
          },
          {
            label: 'Credit union small-dollar loan: $300 at 28% APR',
            hide: (s) => s.bank !== 'creditunion',
            hint: '✓ Pay it back over 6 months · ✓ Builds credit · ✗ $20 application fee',
            bot: 2,
            do: (s) => {
              earn(s, 300);
              charge(s, 20, 'Loan application fee');
              s.loans.push({ name: 'Credit union PAL', balance: 300, apr: 0.28, payment: 55, kind: 'personal' });
              openCredit(s);
              unlock(s, 'payday-loan');
            },
            result: 'Approved the same day. $55 a month for six months, at a rate that won’t eat you alive. Being a member pays off.',
            tip: 'Federal credit unions offer Payday Alternative Loans (PALs) with APRs capped at 28%.',
          },
          {
            label: 'Sell stuff you don’t use (old game console, hoodies)',
            hint: '✓ No debt · ✗ An evening of listing and haggling (−4 energy)',
            bot: 2,
            do: (s) => {
              earn(s, 180);
              energy(s, -4);
            },
            result: 'The buyer haggles, flakes twice, then finally shows up. $180, zero debt.',
          },
          {
            label: 'Call and ask for a few extra days on the bill',
            hint: '✓ Free · ✗ They might say no (late fee)',
            bot: 1,
            do: (s, d) => {
              d.ok = chance(s, 0.65) ? 1 : 0;
              energy(s, -3);
              if (!d.ok) charge(s, 40, 'Late fee');
            },
            result: (_s, d) => (d.ok ? '“Thanks for calling ahead. Friday’s fine.” Asking cost you nothing.' : '“Sorry, policy is policy.” A $40 late fee, but no new debt.'),
            tip: 'Call BEFORE a bill is late. Landlords, utilities, and phone companies often give extensions to people who ask early.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-paydaydue',
    title: 'Payday loan due',
    art: 'street',
    kind: 'event',
    steps: {
      start: {
        text: (s) => {
          const r = num(s, 'paydayRolls');
          return `The payday lender texts: “Reminder! $345 will be withdrawn from your account on Friday 🙂”${r ? `\n\nYou’ve rolled it over ${r} time${r > 1 ? 's' : ''}. You’ve paid ${money(45 * r)} in fees and still owe the full $345.` : ''}`;
        },
        choices: [
          {
            label: 'Pay it off: $345',
            pay: 345,
            methods: ['checking', 'savings'],
            hint: '✓ Free of it',
            bot: 3,
            do: (s) => setFlag(s, 'paydayDue', 0),
            result: (s) => `Paid off. That $300 loan cost you ${money(45 * (num(s, 'paydayRolls') + 1))} in fees.`,
          },
          {
            label: 'Roll it over: just pay the $45 fee',
            pay: 45,
            methods: ['checking', 'savings'],
            hide: (s) => num(s, 'paydayRolls') >= 2,
            hint: '✓ Only $45 today · ✗ You still owe $345 in two more weeks',
            bot: -3,
            do: (s) => {
              inc(s, 'paydayRolls');
              setFlag(s, 'paydayDue', s.week + 2);
            },
            result: 'Another $45 for another two weeks. This is how a $300 loan turns into hundreds in fees.',
            tip: 'Rolling over is the trap. The fee never touches what you borrowed.',
          },
          {
            label: 'Let them pull it from your account',
            hint: '✗ If your balance is short, overdraft fees pile on',
            bot: -1,
            do: (s) => {
              charge(s, 345, 'Payday loan withdrawal');
              setFlag(s, 'paydayDue', 0);
            },
            result: (s) => (s.stats.cash < 0 ? 'The withdrawal sends your account below zero. Overdraft fee on top of the loan fee.' : 'They take it. Your account is a lot lighter.'),
          },
        ],
      },
    },
  },
  {
    id: 'ev-bnpl',
    title: 'Pay in 4!',
    art: 'street',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          `${s.housing.kind === 'dorm' ? 'The dorm mattress is a vinyl gym mat pretending to be a bed.' : 'Your hand-me-down mattress has a spring that’s been stabbing you since 9th grade.'} You wake up sore every day.\n\nA decent new one is $240. At checkout, a bright button: “Pay in 4 interest-free payments of $60! 🎉”`,
        choices: [
          {
            label: 'Buy it outright: $240',
            pay: 240,
            hint: '✓ Real sleep (+10 energy) · ✓ Nothing owed later',
            bot: (s) => (s.stats.cash + s.stats.savings > 900 ? 2 : 0),
            do: (s) => energy(s, 10),
            result: 'You sleep nine hours straight. Your back sends a thank-you note.',
          },
          {
            label: 'Pay in 4: $60 today, $180 over the next 6 weeks',
            pay: 60,
            methods: ['checking', 'savings'],
            hint: '✓ Only $60 today · ✗ Payments auto-pull from your account · ✗ Late fees if you’re short',
            bot: 0,
            do: (s) => {
              energy(s, 10);
              s.loans.push({ name: 'Pay-in-4 plan', balance: 180, apr: 0, payment: 120, kind: 'personal' });
              unlock(s, 'bnpl');
            },
            result: 'Easy. Too easy. Now you see that same button everywhere: sneakers, concert tickets, even groceries.',
            tip: 'Buy now, pay later is fine for a planned purchase you could afford anyway. It’s risky when it makes things feel cheaper than they are, or when several plans stack up at once.',
          },
          {
            label: 'Get a $40 foam topper instead',
            pay: 40,
            hint: '✓ Cheap fix (+5 energy) · ✗ Still a bad mattress underneath',
            bot: (s) => (s.stats.cash + s.stats.savings > 900 ? 1 : 2),
            do: (s) => energy(s, 5),
            result: 'Not luxury. But the spring has been defeated.',
          },
          {
            label: 'Keep sleeping on it',
            hint: '✓ Free · ✗ −6 energy',
            bot: -1,
            do: (s) => energy(s, -6),
            result: 'Boing. Ow.',
          },
        ],
      },
    },
  },

  // ====================== CAR (DMV & ACCIDENTS) ======================
  {
    id: 'ev-fenderbender',
    title: 'Crunch',
    art: 'street',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          `Backing out of a parking spot, you feel a sickening CRUNCH. You tapped a parked SUV. Nobody’s hurt, but their bumper is dented and cracked.\n\nThe owner walks out of the store, surprisingly calm. Their body shop quote comes the next day: $680.${s.flags.uninsuredCar ? '\n\nAnd your car insurance lapsed. Uh-oh.' : ''}`,
        choices: [
          {
            label: 'Exchange info and file an insurance claim',
            hide: (s) => !!s.flags.uninsuredCar,
            hint: '✓ $0 out of pocket · ✗ At-fault claim: insurance +$35/month for years',
            bot: 1,
            do: (s) => {
              if (s.car) s.car.insurance += 35;
              unlock(s, 'at-fault-claim');
              log(s, 'Your car insurance went up $35/month after the at-fault claim.', 'bad');
            },
            result: 'Your insurance pays for the bumper. Then your renewal notice arrives: +$35 a month.',
            tip: 'Liability insurance pays for damage you cause to others. But an at-fault claim can raise your premium for 3 to 5 years.',
          },
          {
            label: 'Pay them $680 yourself and get a signed release',
            pay: 680,
            hint: '✓ No claim, no rate hike · ✓ In writing · ✗ $680 now',
            bot: (s) => (s.stats.cash + s.stats.savings > 1500 || s.flags.uninsuredCar ? 2 : 0),
            do: (s) => unlock(s, 'at-fault-claim'),
            result: 'You both sign a short note: “Paid in full, no further claims.” Painful, but it’s over.',
            tip: '$35 a month for three years is $1,260. For small damage, paying it yourself can be cheaper. Always get it in writing.',
          },
          {
            label: 'Venmo them $300 on the spot. Handshake deal.',
            pay: 300,
            hint: '✓ Cheaper, fast · ✗ No paperwork. Nothing stops them asking for more',
            bot: -2,
            do: (s) => setFlag(s, 'fenderHandshake', s.week),
            result: '“Yeah, that’s probably fine,” they say. Probably.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-fenderback',
    title: 'About that bumper…',
    art: 'office',
    kind: 'event',
    steps: {
      start: {
        text: 'A letter from the SUV owner’s insurance company. The “little dent” hid $1,900 of damage: parking sensors inside the bumper. They paid their customer, and now they want the rest from you: $1,600.\n\nYou have no signed release. And you never told your own insurance company.',
        choices: [
          {
            label: 'Report it to your insurer now',
            hide: (s) => !!s.flags.uninsuredCar || !s.car,
            hint: '✓ They’ll probably cover it · ✗ Reported late: insurance +$45/month',
            bot: 2,
            do: (s) => {
              setFlag(s, 'fenderHandshake', 0);
              if (s.car) s.car.insurance += 45;
              unlock(s, 'at-fault-claim');
              log(s, 'Your car insurance went up $45/month after the late claim.', 'bad');
            },
            result: 'Your agent sighs. “You were supposed to report it right away.” They cover it this time. Your premium jumps $45 a month.',
            tip: 'Most policies require you to report any accident quickly, even if you don’t plan to file a claim.',
          },
          {
            label: 'Ask for a payment plan: $100/month',
            hint: '✓ Nothing due today · ✗ $1,600 of debt',
            bot: 1,
            do: (s) => {
              setFlag(s, 'fenderHandshake', 0);
              s.loans.push({ name: 'Accident damages', balance: 1600, apr: 0, payment: 100, kind: 'personal' });
            },
            result: 'They agree to $100 a month. Sixteen months of paying for a $300 handshake.',
          },
          {
            label: 'Pay $1,600',
            pay: 1600,
            bot: 0,
            do: (s) => setFlag(s, 'fenderHandshake', 0),
            result: 'Paid. The “cheap” deal cost you $1,900 in the end.',
          },
          {
            label: 'Ignore it',
            bot: -4,
            do: (s) => {
              setFlag(s, 'fenderHandshake', 0);
              s.credit.collections++;
              unlock(s, 'collections');
            },
            result: 'It goes to collections and lands on your credit report. In some states, unpaid accident damages can even get your license suspended.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-registration',
    title: 'Registration renewal',
    art: 'dmv',
    kind: 'event',
    steps: {
      start: {
        text: 'A DMV envelope: your car’s registration expires at the end of the month. Renewal: $95. But first, your county requires an emissions test: $30.\n\nThe online renewal portal is available “24/7*”.\n*Except nights, weekends, and whenever it isn’t.',
        speaker: 'clerk',
        choices: [
          {
            label: 'Get the emissions test, then renew online: $125',
            pay: 125,
            hint: (s) => ((s.car?.condition ?? 100) < 40 ? '✓ Legal for another year · ✗ That check engine light could fail you' : '✓ Legal for another year'),
            bot: 3,
            do: (s, d) => {
              unlock(s, 'registration');
              energy(s, -3);
              d.fail = (s.car?.condition ?? 100) < 40 ? 1 : 0;
              if (d.fail && s.car) {
                charge(s, 180, 'Oxygen sensor repair');
                s.car.condition = Math.min(100, s.car.condition + 12);
              }
            },
            result: (_s, d) =>
              d.fail
                ? 'FAILED. A check engine light is an automatic fail. One $180 oxygen sensor later, you pass, and the portal accepts your payment on the third try.'
                : 'Passed! The portal crashes once, but your new sticker shows up in the mail a week later.',
            tip: 'Registration is a yearly bill. Put it in your budget so it isn’t a surprise.',
          },
          {
            label: 'Deal with it later. There’s probably a grace period.',
            hint: '✓ $125 stays in your pocket · ✗ Expired tags are a ticket waiting to happen',
            bot: -3,
            do: (s) => {
              setFlag(s, 'regExpired', s.week);
              unlock(s, 'registration');
            },
            result: 'You put the envelope on the counter. Then under the mail. Then… where did it go?',
          },
        ],
      },
    },
  },
  {
    id: 'ev-expiredtag',
    title: 'Expired tags',
    art: 'night',
    kind: 'event',
    steps: {
      start: {
        text: 'Lights in your mirror. “Your registration expired last month.” Ticket: $150. The DMV adds a $25 late fee when you finally renew, on top of the $125.\n\nThe officer adds: “Renew within 10 days and bring proof to the court. They’ll cut it to a $25 fix-it fee.”',
        speaker: 'cop',
        choices: [
          {
            label: 'Renew right away and show proof: $175 total',
            pay: 175,
            hint: '✓ Ticket cut to $25 · ✗ An evening in line at the courthouse (−4 energy)',
            bot: 3,
            do: (s) => {
              setFlag(s, 'regExpired', 0);
              energy(s, -4);
            },
            result: 'Renewed, proof shown, fine reduced. The clerk stamps it like it’s the most boring thing in the world. For them, it is.',
            tip: 'Tickets for things like expired tags or a broken taillight are often “correctable.” Fix the problem fast, show proof, and the fine shrinks.',
          },
          {
            label: 'Pay the full ticket and renew: $300',
            pay: 300,
            bot: 0,
            do: (s) => setFlag(s, 'regExpired', 0),
            result: 'Paid in full. Putting it off cost you $175 extra.',
          },
        ],
      },
    },
  },

  // ====================== BILLS, PAPERWORK & IDENTITY ======================
  {
    id: 'ev-medbill',
    title: 'Medical bill',
    art: 'clinic',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          `A bill from Northside Clinic for that 10-minute visit about a cough last month: $412${insured(s) ? ' (your share, after insurance)' : ''}.\n\nIt lists a “Level 5 comprehensive visit” (the most complicated kind) and a chest X-ray. You never had an X-ray.`,
        speaker: 'doctor',
        choices: [
          {
            label: 'Call billing and ask for an itemized bill',
            hint: '✓ Billing errors are common · ✗ An evening on hold (−5 energy)',
            bot: 3,
            do: (s, d) => {
              energy(s, -5);
              unlock(s, 'itemized-bill');
              d.fixed = chance(s, 0.75) ? 1 : 0;
              charge(s, d.fixed ? 85 : 310, 'Corrected medical bill');
              if (d.fixed) achieve(s, 'auditor');
            },
            result: (_s, d) =>
              d.fixed
                ? 'After 40 minutes of hold music: “You’re right. The X-ray belonged to another patient, and the visit was coded wrong.” New bill: $85.'
                : 'The charges check out. But they offer a 25% discount for paying today: $310.',
            tip: 'Always ask for an itemized bill and check every line. Fixing an error is usually just a phone call.',
          },
          {
            label: 'Just pay it: $412',
            pay: 412,
            bot: -1,
            result: 'Paid. Did you just pay for someone else’s X-ray? You’ll never know.',
          },
          {
            label: 'Toss it in a drawer',
            hint: '✗ It won’t go away',
            bot: -3,
            do: (s) => {
              energy(s, -8);
              charge(s, 412, 'Medical collections');
              unlock(s, 'itemized-bill');
            },
            result: 'Two months later, a collection agency starts calling. Every. Single. Day. You pay the full $412 to make it stop. Too late to dispute anything now.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-shorted',
    title: 'Something’s off',
    art: (s) => s.job?.art ?? 'office',
    kind: 'event',
    steps: {
      start: {
        text: (s) => {
          const h = (s.job?.hours ?? 0) * 2;
          return `You check your last pay stub against the schedule screenshots on your phone. You worked ${h} hours. The stub says ${h - shortBy(s)}.\n\nThat’s ${money(shortBy(s) * (s.job?.wage ?? 0))} missing.`;
        },
        speaker: 'hr',
        choices: [
          {
            label: 'Email payroll with your screenshots',
            hint: '✓ Get paid what you earned · ✓ A paper trail',
            bot: 3,
            do: (s) => {
              s.hoursThisPeriod += shortBy(s);
              rep(s, 1);
              unlock(s, 'pay-errors');
              achieve(s, 'auditor');
            },
            result: '“Thanks for flagging! A punch didn’t sync. We’ll add it to your next check.” Polite plus proof gets it fixed fast.',
            tip: 'Keep your own record of the hours you work. Payroll makes mistakes, and you’re the one who has to catch them.',
          },
          {
            label: 'Complain about it in the break room',
            hint: '✓ Gets fixed eventually · ✗ Your boss hears about it secondhand',
            bot: 0,
            do: (s) => {
              s.hoursThisPeriod += shortBy(s);
              rep(s, -3);
              unlock(s, 'pay-errors');
            },
            result: 'Three coworkers check their stubs. Two were shorted too. It gets fixed, but your manager is annoyed they heard it through gossip.',
          },
          {
            label: 'Don’t make waves',
            hint: '✗ That money is just gone',
            bot: -2,
            result: (s) => `You let it go. That’s ${money(shortBy(s) * (s.job?.wage ?? 0))} of work you did for free.`,
          },
        ],
      },
    },
  },
  {
    id: 'ev-idtheft',
    title: 'Not your account',
    art: (s) => s.housing.art,
    kind: 'event',
    steps: {
      start: {
        text: 'A letter from Zoom Wireless: “Welcome to Zoom! Your new account ending in 4471 has a balance of $1,140 for 2 phones.”\n\nYou have never heard of Zoom Wireless. Someone opened an account in your name.',
        choices: [
          {
            label: 'Report it at IdentityTheft.gov and freeze your credit',
            hint: '✓ Fraud wiped off your record · ✓ Freezing is free · ✗ Two evenings of phone trees (−10 energy)',
            bot: 3,
            do: (s) => {
              energy(s, -10);
              setFlag(s, 'creditFrozen');
              unlock(s, 'credit-freeze');
              achieve(s, 'lockeddown');
            },
            result: 'You file the report, freeze your credit at Equifax, Experian, and TransUnion, and send Zoom the report. Account closed. Nothing on your record. Now nobody can open credit in your name, not even you, until you “thaw” it.',
            tip: 'A credit freeze is free and is the strongest protection against identity theft. Thaw it for a day when you apply for credit.',
          },
          {
            label: 'Call Zoom and tell them it isn’t you',
            hint: '✓ Quicker · ✗ Without an official report, they might not believe you',
            bot: 0,
            do: (s, d) => {
              energy(s, -5);
              d.ok = chance(s, 0.5) ? 1 : 0;
              if (!d.ok) {
                s.credit.collections++;
                unlock(s, 'collections');
              }
              unlock(s, 'credit-freeze');
            },
            result: (_s, d) =>
              d.ok
                ? 'A helpful rep flags the account as fraud and closes it. Lucky.'
                : '“We’ll need an identity theft report.” You never get around to it. A month later, the $1,140 shows up as a collection on YOUR credit report.',
          },
          {
            label: 'Ignore it. It’s not your bill.',
            hint: '✗ To the credit bureaus, it is',
            bot: -4,
            do: (s) => {
              s.credit.collections++;
              unlock(s, 'collections');
            },
            result: 'Zoom sends it to collections. It lands on your credit report, and your score drops hard for a debt you never made.',
          },
        ],
      },
    },
  },

  // ====================== WORK & HEALTH ======================
  {
    id: 'ev-hourscut',
    title: 'Hours cut',
    art: (s) => s.job?.art ?? 'office',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          `${s.path === 'work' ? 'Peak shipping season is over.' : 'The store is dead after the holidays.'} Your manager posts the new schedule: everyone loses 8 hours a week for the next month.\n\nThat’s about ${money(8 * (s.job?.wage ?? 0) * 0.85 * 4)} less take-home pay.`,
        speaker: 'boss',
        choices: [
          {
            label: 'Ask to cross-train in another department',
            hint: '✓ Only lose 4 hours · ✓ New skills, boss notices · ✗ −3 energy',
            bot: 3,
            do: (s) => {
              cutHours(s, 4);
              xp(s, 3);
              rep(s, 2);
              energy(s, -3);
            },
            result: 'You learn the returns desk. Half your hours are back, and now you’re the person who can cover two departments.',
            tip: 'Being able to do more than one job makes you the last person whose hours get cut.',
          },
          {
            label: 'Take the free time and tighten your budget',
            hint: '✓ +5 energy · ✗ Lose 8 hours a week for a month',
            bot: 1,
            do: (s) => {
              cutHours(s, 8);
              energy(s, 5);
            },
            result: 'More naps, fewer dollars. Your emergency fund suddenly feels very important.',
          },
          {
            label: '“This is so unfair.”',
            hint: '✗ Still lose 8 hours · ✗ Boss rating drops',
            bot: -2,
            do: (s) => {
              cutHours(s, 8);
              rep(s, -4);
            },
            result: 'Your manager shrugs. “It’s everybody.” Now it’s everybody, and you’re the one who complained.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-hoursback',
    title: 'Hours are back',
    art: (s) => s.job?.art ?? 'office',
    kind: 'event',
    steps: {
      start: {
        text: 'Business picked back up. Your manager restores everyone’s hours on the new schedule.',
        speaker: 'boss',
        choices: [
          ok('Finally', {
            do: (s) => {
              if (s.job && s.job.place === s.flags.hoursCutPlace) s.job.hours = Math.max(s.job.hours, num(s, 'hoursCutFrom'));
              setFlag(s, 'hoursBackAt', 0);
            },
            result: 'Full paychecks again.',
          }),
        ],
      },
    },
  },
  {
    id: 'ev-wisdom',
    title: 'Wisdom teeth',
    art: 'dentist',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          `Your jaw has ached for a week. The X-ray shows four wisdom teeth coming in sideways.\n\nOral surgeon: ${money(wisdomCost(s))}${s.dental ? ' with your dental insurance' : ' (no dental insurance)'}. The local dental school clinic does it for $1,100, with a 3-week wait.`,
        speaker: 'dentist',
        choices: [
          {
            label: (s) => `Book the oral surgeon: ${money(wisdomCost(s))}`,
            pay: (s) => wisdomCost(s),
            hint: '✓ Done next week · ✗ A day off to recover',
            bot: (s) => (s.dental ? 3 : 0),
            do: (s) => schedule(s, { week: freeWeek(s, 'weekday', s.week + 1), slot: 'weekday', kind: 'oralsurgery', label: 'Wisdom teeth out' }),
            result: 'Booked. The receptionist hands you a sheet titled “What to Expect.” You decide not to read it.',
          },
          {
            label: 'Dental school clinic: $1,100',
            pay: 1100,
            hide: (s) => s.dental,
            hint: '✓ About 40% cheaper · ✓ Supervised by experienced dentists · ✗ 3-week wait',
            bot: 3,
            do: (s) => schedule(s, { week: freeWeek(s, 'weekday', s.week + 3), slot: 'weekday', kind: 'oralsurgery', label: 'Wisdom teeth out' }),
            result: 'Booked with a fourth-year dental student and their very watchful professor.',
            tip: 'Dental schools and community health centers often do the same work for much less. Ask before you pay full price.',
          },
          {
            label: (s) => `Surgeon’s in-house payment plan: ${money(wisdomCost(s))}, 0% for 12 months`,
            hint: '✓ Nothing due today · ✗ $160/month · ✗ Another bill',
            bot: 1,
            do: (s) => {
              s.loans.push({ name: 'Oral surgery plan', balance: wisdomCost(s), apr: 0, payment: 160, kind: 'personal' });
              schedule(s, { week: freeWeek(s, 'weekday', s.week + 1), slot: 'weekday', kind: 'oralsurgery', label: 'Wisdom teeth out' });
              unlock(s, 'payment-plan');
            },
            result: 'Signed. You read the fine print twice. It really is 0%, not a deferred-interest card. Good.',
            tip: 'Many “no interest” medical financing offers are deferred-interest credit cards. Miss the payoff date and ALL the interest hits at once. An in-house plan is safer.',
          },
          {
            label: 'Wait and see',
            hint: '✓ Free for now · ✗ Wisdom teeth rarely fix themselves',
            bot: -2,
            do: (s) => {
              setFlag(s, 'toothRisk', num(s, 'toothRisk') + 1);
              energy(s, -6);
            },
            result: 'You chew on the other side and hope for the best.',
          },
        ],
      },
    },
  },
  {
    id: 'appt-oralsurgery',
    title: 'Wisdom teeth out',
    art: 'dentist',
    kind: 'appt',
    steps: {
      start: {
        text: '“Count backward from ten.” You make it to seven. You wake up with chipmunk cheeks and a strong opinion about the color blue that you cannot explain.',
        speaker: 'dentist',
        choices: [
          {
            label: 'Ice cream and rest',
            do: (s) => {
              energy(s, -12);
              setFlag(s, 'toothRisk', 0);
            },
            result: 'Three days of pudding. Then it’s over for good.',
          },
        ],
      },
    },
  },

  // ====================== TAXES ======================
  {
    id: 'ev-1099',
    title: 'Your 1099',
    art: 'office',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          `An email from the delivery app: “Your 1099 tax form is ready.” You earned ${money(num(s, 'gigTax'))} delivering. Nobody took taxes out.\n\nGig workers owe income tax plus self-employment tax. Your estimate${s.flags.gigMiles ? ' (after your mileage deduction)' : ''}: ${money(gigOwed(s))}.${s.flags.gigSetAside ? '\n\nGood news: you set money aside for exactly this.' : ''}`,
        speaker: 'taxpro',
        choices: [
          {
            label: (s) => `Pay it with your return: ${money(gigOwed(s))}`,
            pay: (s) => gigOwed(s),
            hint: (s) => (s.flags.gigSetAside ? '✓ Already saved for it · ✓ Done' : '✓ Done, no penalties'),
            bot: 3,
            do: (s) => {
              unlock(s, 'self-employment-tax');
              achieve(s, 'selfemployed');
            },
            result: (s) => (s.flags.gigMiles ? 'Paid. That mileage log cut your bill nearly in half.' : 'Paid. Next time: track your miles. Every mile you drive for work lowers your taxes.'),
            tip: 'Set aside about 25% of gig income for taxes, and log every work mile. The mileage deduction is huge for drivers.',
          },
          {
            label: 'IRS payment plan: $40/month',
            hint: '✓ Nothing big due today · ✗ $22 setup fee · ✗ Interest and penalties',
            bot: 1,
            do: (s) => {
              charge(s, 22, 'IRS payment plan fee');
              s.loans.push({ name: 'IRS payment plan', balance: gigOwed(s), apr: 0.1, payment: 40, kind: 'personal' });
              unlock(s, 'self-employment-tax');
            },
            result: 'Set up online in 15 minutes. You’ll be paying last year’s taxes for a while.',
          },
          {
            label: 'Leave it off your return. It was cash, basically.',
            hint: '✓ $0 today · ✗ The app sent the IRS a copy',
            bot: -4,
            do: (s) => {
              setFlag(s, 'gigOwed', gigOwed(s));
              setFlag(s, 'irsUnreported', s.week);
              unlock(s, 'self-employment-tax');
            },
            result: 'You file without it. Nobody will notice. (Narrator: the computer noticed.)',
          },
        ],
      },
    },
  },
  {
    id: 'ev-irsletter',
    title: 'Letter from the IRS',
    art: 'office',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          s.flags.irsUnreported
            ? `A real IRS letter, by mail: Notice CP2000. “The income you reported does not match our records.” The delivery app reported ${money(num(s, 'gigTax'))}. You didn’t.\n\nProposed amount due (tax, 20% penalty, and interest): ${money(irsBill(s))}.`
            : `A real IRS letter, by mail. Your tax return doesn’t match what your employer and your parents reported. That “close enough” answer wasn’t.\n\nAmount due with interest: ${money(irsBill(s))}.`,
        speaker: 'taxpro',
        choices: [
          {
            label: (s) => `Respond and pay: ${money(irsBill(s))}`,
            pay: (s) => irsBill(s),
            bot: 2,
            do: (s) => clearIrs(s),
            result: 'Paid and done. The IRS sends a polite letter confirming it. It’s the most relieved you’ve ever felt reading mail.',
            tip: 'The real IRS contacts you by mail first, never by text, DM, or a demand for gift cards. If you get a notice, respond by the deadline.',
          },
          {
            label: 'Set up a payment plan: $40/month',
            hint: '✓ Affordable · ✗ $22 setup fee · ✗ Interest keeps running',
            bot: 1,
            do: (s) => {
              const owed = irsBill(s);
              clearIrs(s);
              charge(s, 22, 'IRS payment plan fee');
              s.loans.push({ name: 'IRS payment plan', balance: owed, apr: 0.1, payment: 40, kind: 'personal' });
            },
            result: 'Set up online. Slow and steady.',
          },
          {
            label: 'Ignore it. Probably a scam.',
            hint: '✗ Real IRS letters don’t go away',
            bot: -4,
            do: (s) => {
              const owed = Math.round(irsBill(s) * 1.3);
              clearIrs(s);
              energy(s, -6);
              charge(s, owed, 'IRS levy');
            },
            result: 'It wasn’t a scam. More letters. More penalties. Then the IRS takes it straight from your bank account. Ignoring it cost you 30% more.',
            tip: 'Not sure if an IRS letter is real? Look up the notice number at IRS.gov, or call the number listed on IRS.gov (not the one in the letter).',
          },
        ],
      },
    },
  },

  // ====================== SCHOOL ======================
  {
    id: 'ev-accesscode',
    title: 'Access code required',
    art: 'campus',
    kind: 'event',
    steps: {
      start: {
        text: 'Spring syllabus, page 4: “All homework is completed in MathLab Plus (20% of your grade).”\n\nThe bookstore sells the access code bundled with a new textbook: $210. In small print: “Used codes will not work.”',
        speaker: 'advisor',
        choices: [
          {
            label: 'Buy the bookstore bundle: $210',
            pay: 210,
            hint: '✓ Easy · ✗ Priciest option',
            bot: -1,
            do: (s) => xp(s, 2),
            result: 'Shrink-wrapped book, scratch-off code. You will never open the book.',
          },
          {
            label: 'Use the free trial, then buy just the code from the publisher: $95',
            pay: 95,
            hint: '✓ Less than half the price · ✓ Library has the textbook · ✗ A little hassle (−2 energy)',
            bot: 3,
            do: (s) => {
              xp(s, 2);
              energy(s, -2);
            },
            result: 'Two weeks free, then $95 straight from the publisher. The library’s reserve copy of the book is fine.',
            tip: 'Access codes are often cheaper straight from the publisher, and most come with a 2-week free trial. Some schools bill “inclusive access” to your account automatically. You can usually opt out by a deadline.',
          },
          {
            label: 'Skip the online homework',
            hint: '✓ Free · ✗ Lose 20% of your grade (−6 progress)',
            bot: -3,
            do: (s) => xp(s, -6),
            result: 'Every zero in the gradebook stares at you.',
          },
        ],
      },
    },
  },

  // ====================== HOUSING ======================
  {
    id: 'ev-deposit',
    title: 'Deposit deductions',
    art: 'apartment',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          `Your old landlord mailed back ${money(oldDeposit(s) - 375)} of your ${money(oldDeposit(s))} security deposit, with a list:\n• Carpet cleaning: $150\n• Repaint walls: $175\n• “General wear and tear”: $50\n\nThe carpet was stained when you moved in. ${s.flags.moveInPhotos ? 'And you have the dated move-in photos to prove it.' : 'You think. You don’t have any photos.'}`,
        speaker: 'landlord',
        choices: [
          {
            label: 'Send a written demand letter citing your state’s deposit law',
            hint: (s) => (s.flags.moveInPhotos ? '✓ Your photos prove it · ✗ −3 energy' : '✓ Normal wear and tear can’t be deducted · ✗ No proof of the rest'),
            bot: 3,
            do: (s, d) => {
              energy(s, -3);
              unlock(s, 'deposit-return');
              d.back = s.flags.moveInPhotos ? 375 : 50;
              earn(s, oldDeposit(s) - 375 + d.back);
              if (s.flags.moveInPhotos) achieve(s, 'depositback');
            },
            result: (_s, d) =>
              d.back === 375
                ? 'You attach the photos. A week later, a check for the full $375 arrives with no note. You don’t need a note.'
                : 'They drop the “general wear and tear” charge ($50), since that’s illegal to deduct. For the rest, it’s your word against theirs.',
            tip: 'Landlords can’t deduct for normal wear and tear: faded paint, worn carpet, small nail holes. Photos on move-in day are your best evidence.',
          },
          {
            label: 'File in small claims court: $45 (a weekday in 2 weeks)',
            pay: 45,
            hint: (s) => (s.flags.moveInPhotos ? '✓ Strong case · ✓ Win back the fee too · ✗ A day off work' : '✗ A coin flip without photos · ✗ A day off work'),
            bot: (s) => (s.flags.moveInPhotos ? 1 : 0),
            do: (s) => {
              earn(s, oldDeposit(s) - 375);
              unlock(s, 'deposit-return');
              schedule(s, { week: freeWeek(s, 'weekday', s.week + 2), slot: 'weekday', kind: 'smallclaims', label: 'Small claims court' });
            },
            result: 'Filed. No lawyer needed. You’ll tell your story to a judge.',
          },
          {
            label: 'Let it go',
            bot: -1,
            do: (s) => {
              earn(s, oldDeposit(s) - 375);
              unlock(s, 'deposit-return');
            },
            result: 'You cash the partial check. $375 is a lot to just let go.',
          },
        ],
      },
    },
  },
  {
    id: 'appt-smallclaims',
    title: 'Small claims court',
    art: 'office',
    kind: 'appt',
    steps: {
      start: {
        text: (s) =>
          `The judge has 40 cases today and gives yours four minutes. The landlord brought a folder.${s.flags.moveInPhotos ? ' You brought dated photos of every stain.' : ' You brought… your honest face.'}`,
        speaker: 'landlord',
        choices: [
          {
            label: 'Make your case',
            do: (s, d) => {
              d.won = s.flags.moveInPhotos || chance(s, 0.4) ? 1 : 0;
              if (d.won) {
                earn(s, 375 + 45);
                if (s.flags.moveInPhotos) achieve(s, 'depositback');
              }
            },
            result: (_s, d) => (d.won ? 'Judgment for you: $375 plus your $45 filing fee. The landlord pays by check, glaring.' : '“Without evidence of the move-in condition, I find for the landlord.” You lose the $45 fee too.'),
            tip: 'Small claims court is built for regular people. No lawyer needed, just organized evidence.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-overage',
    title: 'Out of data',
    art: 'street',
    kind: 'event',
    steps: {
      start: {
        text: 'It’s the 21st. Your phone flashes: “You’ve used 100% of your data. Speeds are now reduced.” Maps takes four minutes to load. Your shift app won’t open.',
        choices: [
          {
            label: 'Buy a 2 GB add-on: $10',
            pay: 10,
            hint: '✓ Back online · ✗ $10',
            bot: 2,
            result: 'Back to normal. Still cheaper than a bigger plan every month.',
          },
          {
            label: 'Survive on Wi-Fi until it resets',
            hint: '✓ Free · ✗ −4 energy · ✗ Might miss a message from work',
            bot: 0,
            do: (s, d) => {
              energy(s, -4);
              d.missed = s.job && chance(s, 0.35) ? 1 : 0;
              if (d.missed) rep(s, -3);
            },
            result: (_s, d) => (d.missed ? 'You miss your manager’s “can you come in early?” text until you’re back on Wi-Fi. Not great.' : 'Library Wi-Fi, café Wi-Fi, the Wi-Fi from the bus stop near the coffee shop. You survive.'),
          },
          {
            label: 'Upgrade to unlimited (+$15/month)',
            hint: '✓ Never again · ✗ $180 a year',
            bot: 0,
            do: (s) => {
              const p = s.subs.find((x) => x.id === 'phone');
              if (p) p.cost += 15;
              setFlag(s, 'dataTight', false);
            },
            result: 'Unlimited. Your phone bill is now a little less limited too.',
          },
        ],
      },
    },
  },

  // ====================== CONSEQUENCES THAT COME BACK ======================
  {
    id: 'appt-jury',
    title: 'Jury duty',
    art: 'office',
    kind: 'appt',
    steps: {
      start: {
        text: 'Room 4B, 8 a.m. Ninety people, one coffee machine. By 2 p.m. you’re picked for a short civil trial about a fender bender. You take it seriously. It’s weirdly interesting.',
        choices: [
          {
            label: 'Collect your $15 and go home',
            do: (s) => {
              earn(s, 15);
              energy(s, -4);
              setFlag(s, 'juryServed');
              setFlag(s, 'juryPostponed', 0);
              achieve(s, 'civic');
            },
            result: (s) => `$15 for the day${s.job && s.path !== 'college' ? `, against ${money(8 * s.job.wage)} of pay you missed` : ''}. Some states require employers to pay for jury days; yours doesn’t.`,
            tip: 'Jury duty is required. You can usually postpone once, but ignoring a summons can mean a fine or a court date of your own.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-reinstate',
    title: 'Suspended license',
    art: 'dmv',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          `It’s been ${s.week - num(s, 'licenseSuspended')} weeks of buses and begging rides while your ${s.car?.name ?? 'car'} sits in the lot (still insured, still costing you).\n\nTo get your license back: pay the $350 ticket and the DMV’s $75 reinstatement fee.`,
        speaker: 'clerk',
        choices: [
          {
            label: `Pay it all and get your license back: ${money(LICENSE_REINSTATE)}`,
            pay: LICENSE_REINSTATE,
            bot: 3,
            do: (s) => {
              setFlag(s, 'licenseSuspended', 0);
              setFlag(s, 'license', true);
              addPoints(s);
              unlock(s, 'insurance-points');
            },
            result: 'Reinstated. You can drive again, with points on your record and a bigger insurance bill. A $175 ticket ended up costing over $425.',
            tip: 'A suspended license costs more than the ticket: fees, lost time, and higher insurance for years. Pay or contest tickets on time.',
          },
          {
            label: 'Keep taking the bus for now',
            hint: '✓ Nothing today · ✗ Still paying bus fares on top of car insurance',
            bot: -1,
            result: 'Another week of bus transfers.',
          },
          {
            label: 'Drive anyway. Who’s going to check?',
            hint: '✗ If you’re pulled over: a big fine and your car gets towed',
            bot: -5,
            do: (s, d) => {
              d.caught = chance(s, 0.5) ? 1 : 0;
              if (d.caught) {
                charge(s, 750, 'Driving on a suspended license');
                missWork(s, 'Court date');
                s.credit.collections++;
              }
            },
            result: (_s, d) =>
              d.caught
                ? 'Pulled over two days later for a broken taillight. Driving on a suspended license: a $500 fine, a $250 tow and impound, and a court date. Your license is still suspended.'
                : 'Nobody checks. This time. Your heart rate spikes every time you see a police car.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-multimeter',
    title: 'Dead multimeter',
    art: 'jobsite',
    kind: 'event',
    speaker: 'boss',
    steps: {
      start: {
        text: 'Dee: “Test that circuit before you touch it.” You pull out the multimeter from your used kit. The screen stays blank. New batteries don’t help. It’s dead.\n\nDee is watching.',
        speaker: 'boss',
        choices: [
          {
            label: 'Buy a new one at the supply house: $65',
            pay: 65,
            hint: '✓ Back to work · ✓ You don’t borrow tools again',
            bot: 3,
            do: (s) => setFlag(s, 'toolsBroken', false),
            result: 'New meter, tested on a known circuit, in your pouch by lunch. Dee nods.',
            tip: 'A used tool kit is a great deal, but test every tool when you buy it. A safety tool that doesn’t work is worse than none.',
          },
          {
            label: 'Borrow Dee’s for now',
            hint: '✗ Boss rating drops · ✗ Still need your own',
            bot: -1,
            do: (s) => rep(s, -4),
            result: '“Third time this month.” Dee hands it over. Slowly.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-leak',
    title: 'Water everywhere',
    art: 'apartment',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          `A pipe burst in the unit upstairs overnight. Water came through your ceiling: your laptop, your bed, and half your clothes are soaked. About ${money(LEAK_DAMAGE)} of stuff.\n\nThe landlord’s insurance fixes the ceiling. Not your things.${s.flags.rentersIns ? '\n\nYou have renters insurance.' : ''}`,
        speaker: 'landlord',
        choices: [
          {
            label: 'File a renters insurance claim ($250 deductible)',
            pay: 250,
            hide: (s) => !s.flags.rentersIns,
            bot: 3,
            do: (s) => {
              energy(s, -4);
              unlock(s, 'deductible');
              achieve(s, 'covered');
            },
            result: `The adjuster approves it in a week. You pay the $250 deductible; the policy covers the rest of the ${money(LEAK_DAMAGE)}. At $15 a month, that coverage just paid for years of itself.`,
            tip: 'Renters insurance covers your belongings from fire, theft, and water damage, plus liability if you damage someone else’s place. It’s usually $10–20 a month.',
          },
          {
            label: `Replace what you need: ${money(LEAK_DAMAGE)}`,
            pay: LEAK_DAMAGE,
            hide: (s) => !!s.flags.rentersIns,
            bot: 1,
            do: (s) => energy(s, -6),
            result: 'A new mattress and a refurbished laptop. Your emergency fund takes the hit.',
            tip: 'Renters insurance would have covered this for a $250 deductible. Most landlords’ policies only cover the building.',
          },
          {
            label: 'Dry out what you can and make do',
            hint: '✓ Free · ✗ −12 energy · ✗ Sleeping on a damp mattress',
            hide: (s) => !!s.flags.rentersIns,
            bot: -1,
            do: (s) => {
              energy(s, -12);
              xp(s, -2);
            },
            result: 'Fans running for days. The mattress smells like a basement now.',
          },
        ],
      },
    },
  },
];

// Catching whatever's going around: same choices as being run down, different cause.
const SICK = EVENT_SCENES.find((x) => x.id === 'ev-sick')!;
EVENT_SCENES.push({
  id: 'ev-flu',
  title: 'Something’s going around',
  art: (s) => s.housing.art,
  kind: 'event',
  steps: {
    start: {
      text: (s) =>
        `Half your ${s.path === 'college' && !s.phase2 ? 'lecture hall' : 'coworkers'} have been coughing for a week, and now it’s your turn: fever, chills, the works.${s.flags.noCoat ? ' Walking around all winter without a real coat didn’t help.' : ''}`,
      choices: SICK.steps.start.choices,
    },
  },
});


// Pulled over with no insurance: a separate ticket on top of whatever you were stopped for.
function noInsuranceTicket(s: GameState): void {
  if (!s.flags.uninsuredCar) return;
  charge(s, NO_INSURANCE_FINE, 'No-insurance ticket');
  log(s, `Driving without insurance: a ${money(NO_INSURANCE_FINE)} ticket.`, 'bad');
  unlock(s, 'car-insurance');
}

// A hospital's interest-free payment plan: a real balance you pay down, not a bill that never ends.
export function hospitalPlan(s: GameState, amount: number): void {
  s.loans.push({ name: 'Hospital payment plan', balance: amount, apr: 0, payment: 150, kind: 'personal' });
  unlock(s, 'payment-plan');
}

function phoneBill(s: GameState): number {
  return (s.subs.find((x) => x.id === 'phone')?.cost ?? 45) + 10;
}

const ALDER = 'Rented room on Alder St.';

// Did the player move out of the place they started in (and so get a deposit back)?
function movedOut(s: GameState): boolean {
  if (s.path === 'trade') return s.housing.name !== ALDER;
  if (s.path === 'work') return /studio/i.test(s.housing.name);
  return false;
}

function oldDeposit(s: GameState): number {
  return s.path === 'work' ? 725 : 650;
}

function shortBy(s: GameState): number {
  return (s.job?.hours ?? 0) >= 24 ? 8 : 4;
}

function cutHours(s: GameState, n: number): void {
  if (!s.job) return;
  setFlag(s, 'hoursCutFrom', s.job.hours);
  setFlag(s, 'hoursCutPlace', s.job.place);
  setFlag(s, 'hoursBackAt', s.week + 4);
  s.job.hours = Math.max(0, s.job.hours - n);
  unlock(s, 'hours-cut');
}

function wisdomCost(s: GameState): number {
  return s.dental ? 650 : 1900;
}

function gigOwed(s: GameState): number {
  return Math.round(num(s, 'gigTax') * (s.flags.gigMiles ? 0.13 : 0.25));
}

function irsBill(s: GameState): number {
  return s.flags.irsUnreported ? Math.round(num(s, 'gigOwed') * 1.2 + 15) : 160;
}

function clearIrs(s: GameState): void {
  setFlag(s, 'irsUnreported', 0);
  setFlag(s, 'taxMistake', false);
  unlock(s, 'irs-notice');
}

// First week (from `from`) with nothing already booked in that slot.
function freeWeek(s: GameState, slot: SlotId, from: number): number {
  let w = from;
  while (s.appointments.some((a) => a.week === w && a.slot === slot)) w++;
  return w;
}

function toothCost(s: GameState): number {
  const big = num(s, 'toothRisk') >= 2;
  if (s.dental) return big ? 450 : 50;
  return big ? 1450 : 220;
}

function repairCost(s: GameState): number {
  return (s.car?.condition ?? 0) < 15 ? 1600 : 750;
}

// A moving violation: points on your record, and your insurer raises your rate.
export function addPoints(s: GameState): void {
  inc(s, 'ticketPoints');
  if (s.car) s.car.insurance += 25;
  unlock(s, 'insurance-points');
  log(s, 'Your car insurance went up $25/month because of the ticket.', 'bad');
}

// Weights for random events.
export const EVENTS = [
  { id: 'ev-tire', weight: (s: GameState) => (hasCar(s) && !s.flags.tireBad && !s.flags.tireDone ? 3 : 0), once: true, minWeek: 3 },
  { id: 'ev-blowout', weight: (s: GameState) => (hasCar(s) ? [0, 4, 8][num(s, 'tireBad')] ?? 0 : 0) },
  { id: 'ev-ticket', weight: (s: GameState) => (hasCar(s) ? 1.5 : 0), cooldown: 12 },
  { id: 'ev-ticketlate', weight: (s: GameState) => (num(s, 'ticketIgnored') && s.week - num(s, 'ticketIgnored') >= 3 ? 20 : 0) },
  { id: 'ev-parking', weight: (s: GameState) => (hasCar(s) || s.transport === 'borrow' ? 1 : 0), cooldown: 10 },
  { id: 'ev-parkinglate', weight: (s: GameState) => (num(s, 'parkingIgnored') && s.week - num(s, 'parkingIgnored') >= 4 ? 20 : 0) },
  { id: 'ev-checkengine', weight: (s: GameState) => (hasCar(s) && (s.car?.condition ?? 100) < 70 ? 2 : 0), cooldown: 8 },
  { id: 'ev-breakdown', weight: (s: GameState) => (hasCar(s) && (s.car?.condition ?? 100) < 35 ? 4 : 0), cooldown: 6 },
  { id: 'ev-gasprice', weight: (s: GameState) => (hasCar(s) ? 1 : 0), cooldown: 10 },
  { id: 'ev-subtrial', weight: 1, once: true, minWeek: 5 },
  { id: 'ev-scam', weight: 1, once: true, minWeek: 4 },
  { id: 'ev-roaches', weight: (s: GameState) => (s.housing.kind === 'parents' ? 0.3 : num(s, 'roaches') && s.week - num(s, 'roaches') >= 3 ? 6 : 0.9), cooldown: 6, minWeek: 5 },
  { id: 'ev-inbox', weight: 0.9, cooldown: 12, minWeek: 6 },
  { id: 'ev-furnish', weight: (s: GameState) => (s.flags.needFurniture === true ? 40 : 0) },
  { id: 'ev-float', weight: (s: GameState) => (s.week >= 3 && s.week <= 14 ? 1.2 : 0), once: true },
  { id: 'ev-fraudrefund', weight: (s: GameState) => (num(s, 'scammed') > 0 ? 6 : 0) },
  // A postponed summons comes back about 12 weeks later, with no second postponement.
  { id: 'ev-jury', weight: (s: GameState) => (s.flags.juryServed ? 0 : num(s, 'juryPostponed') ? (s.week - num(s, 'juryPostponed') >= 12 ? 25 : 0) : 0.6), minWeek: 10 },
  { id: 'ev-friendloan', weight: 0.8, once: true, minWeek: 6 },
  { id: 'ev-devonrepay', weight: (s: GameState) => (num(s, 'devonRepay') && s.week >= num(s, 'devonRepay') && !s.flags['seen:ev-devonrepay'] ? 30 : 0), once: true },
  { id: 'ev-grandma', weight: 0.7, once: true, minWeek: 8 },
  { id: 'ev-cardoffer', weight: (s: GameState) => (!s.card ? 0.8 : 0), once: true, minWeek: 6 },
  { id: 'ev-promoend', weight: (s: GameState) => (num(s, 'promoUntil') && s.week >= num(s, 'promoUntil') && (s.card?.balance ?? 0) > 0 ? 50 : 0) },
  { id: 'ev-phone', weight: 0.8, once: true, minWeek: 5 },
  { id: 'ev-missedtext', weight: (s: GameState) => ((s.flags.brokenPhone || s.flags.phoneCut) && s.job ? (s.flags.phoneCut ? 4 : 2) : 0), cooldown: 6 },
  { id: 'ev-laptop', weight: (s: GameState) => (s.path === 'college' ? 1 : 0), once: true, minWeek: 8 },
  { id: 'ev-bikestolen', weight: (s: GameState) => (s.transport === 'bike' ? 1 : 0), once: true },
  { id: 'ev-cover', weight: (s: GameState) => (s.job && s.path !== 'college' ? 1.4 : 0), cooldown: 4 },
  // Reliability is the whole pitch: bosses don't promote people who blow off shifts.
  { id: 'ev-promo1', weight: (s: GameState) => (s.job && s.path !== 'college' && !s.phase2 && !s.flags.promo1 && !s.flags.careerDone && num(s, 'tenure') >= 10 && num(s, 'extraShifts') >= 4 && s.stats.rep >= 68 && reliable(s) ? 40 : 0), once: true },
  { id: 'ev-promo2', weight: (s: GameState) => (s.job && s.path !== 'college' && !s.phase2 && s.flags.promo1 === true && !s.flags.careerDone && num(s, 'tenure') >= 20 && num(s, 'extraShifts') >= 9 && s.stats.rep >= 78 && reliable(s) ? 40 : 0), once: true },
  { id: 'ev-raise', weight: (s: GameState) => (s.job && s.path !== 'college' && s.week >= 14 ? 1.2 : 0), once: true },
  { id: 'ev-bonus', weight: (s: GameState) => (s.job && s.path !== 'college' && num(s, 'daysOff') === 0 && s.week >= 10 ? 1.5 : 0), once: true },
  { id: 'ev-mentor', weight: 0.8, cooldown: 10 },
  { id: 'ev-injury', weight: (s: GameState) => (s.path === 'trade' || s.path === 'work' || s.transport === 'bike' ? (s.flags.boots ? 0.4 : 0.9) : 0.35), cooldown: 15, minWeek: 5 },
  { id: 'ev-toothache', weight: (s: GameState) => (num(s, 'toothRisk') > 0 ? 2.5 * num(s, 'toothRisk') : 0), cooldown: 3 },
  { id: 'ev-curfew', weight: (s: GameState) => (s.housing.kind === 'parents' ? 1.2 : 0), cooldown: 6 },
  { id: 'ev-roomfood', weight: (s: GameState) => (s.housing.roommate && ownPlace(s) ? 1 : 0), cooldown: 10 },
  { id: 'ev-samrent', weight: (s: GameState) => (s.flags.roommate === 'sam' ? 3 : 0), cooldown: 8 },
  { id: 'ev-heat', weight: (s: GameState) => (ownPlace(s) && s.week < 14 ? 1 : 0), once: true },
  { id: 'ev-package', weight: 0.5, once: true, minWeek: 10 },
  { id: 'ev-concert', weight: 1, cooldown: 12, minWeek: 4 },
  { id: 'ev-wedding', weight: 0.6, once: true, minWeek: 14 },
  { id: 'ev-latebus', weight: (s: GameState) => (s.transport === 'bus' && (s.job || s.path === 'college') ? 1.3 : 0), cooldown: 5, minWeek: 2 },
  { id: 'ev-overdrawn', weight: (s: GameState) => (s.stats.cash < -150 ? 25 : 0), cooldown: 6 },
  // Money traps
  { id: 'ev-paydayloan', weight: (s: GameState) => (s.job && s.stats.cash < 150 && s.stats.savings < 250 ? 3 : 0), minWeek: 4, cooldown: 10 },
  { id: 'ev-paydaydue', weight: (s: GameState) => (num(s, 'paydayDue') && s.week >= num(s, 'paydayDue') ? 40 : 0) },
  { id: 'ev-bnpl', weight: 0.7, once: true, minWeek: 6 },
  // Car paperwork and accidents
  { id: 'ev-fenderbender', weight: (s: GameState) => (hasCar(s) ? 0.8 : 0), once: true, minWeek: 10 },
  { id: 'ev-fenderback', weight: (s: GameState) => (num(s, 'fenderHandshake') && s.week - num(s, 'fenderHandshake') >= 3 ? 20 : 0), once: true },
  { id: 'ev-registration', weight: (s: GameState) => (hasCar(s) ? 1.5 : 0), once: true, minWeek: 14 },
  { id: 'ev-expiredtag', weight: (s: GameState) => (hasCar(s) && num(s, 'regExpired') && s.week - num(s, 'regExpired') >= 2 ? 8 : 0), once: true },
  // Bills, paperwork, identity
  { id: 'ev-medbill', weight: 0.6, once: true, minWeek: 8 },
  { id: 'ev-shorted', weight: (s: GameState) => (s.job ? 0.8 : 0), once: true, minWeek: 4 },
  { id: 'ev-idtheft', weight: (s: GameState) => (s.flags['seen:ev-fraudrefund'] ? 3 : 0.3), once: true, minWeek: 12 },
  // Work and health
  { id: 'ev-hourscut', weight: (s: GameState) => (s.job && (s.path === 'home' || s.path === 'work') && s.week >= 19 && s.week <= 26 ? 1.2 : 0), once: true },
  { id: 'ev-hoursback', weight: (s: GameState) => (num(s, 'hoursBackAt') && s.week >= num(s, 'hoursBackAt') ? 50 : 0), once: true },
  { id: 'ev-wisdom', weight: 0.5, once: true, minWeek: 9 },
  // Taxes
  { id: 'ev-1099', weight: (s: GameState) => (num(s, 'gigTax') >= 300 ? 6 : 0), once: true, minWeek: 20 },
  { id: 'ev-irsletter', weight: (s: GameState) => ((num(s, 'irsUnreported') && s.week - num(s, 'irsUnreported') >= 6) || (s.flags.taxMistake && s.flags.taxesFiled && s.week >= 27) ? 15 : 0), once: true },
  // School and housing
  { id: 'ev-accesscode', weight: (s: GameState) => (s.path === 'college' && s.flags.enrolled !== false && s.week >= 19 && s.week <= 24 ? 3 : 0), once: true },
  { id: 'ev-deposit', weight: (s: GameState) => (movedOut(s) ? 8 : 0), once: true, minWeek: 15 },
  // Consequences that come back.
  { id: 'ev-reinstate', weight: (s: GameState) => (num(s, 'licenseSuspended') && s.week - num(s, 'licenseSuspended') >= 2 ? 30 : 0), cooldown: 4 },
  { id: 'ev-multimeter', weight: (s: GameState) => (s.path === 'trade' && !s.phase2 && s.flags.toolsBroken && s.job ? 3 : 0), minWeek: 5, cooldown: 6 },
  { id: 'ev-leak', weight: (s: GameState) => (ownPlace(s) && s.housing.kind !== 'owned' ? 0.7 : 0), once: true, minWeek: 14 },
  // Cold and flu season: the gym, real food, and a winter coat all make it less likely.
  { id: 'ev-flu', weight: (s: GameState) => (fluSeason(s) ? fluRisk(s) : 0), cooldown: 8 },
  { id: 'ev-overage', weight: (s: GameState) => (s.flags.dataTight && s.subs.some((x) => x.id === 'phone') ? 1.2 : 0), cooldown: 8 },
];


// Skipped shifts (not sick days or appointments) since you started this job.
function reliable(s: GameState): boolean {
  return num(s, 'skippedWork') - num(s, 'skippedAtHire') <= 2;
}

export function fluSeason(s: GameState): boolean {
  const w = s.phase2 ? ((s.week - 37) % 52) + 1 : s.week;
  return w >= 17 && w <= 28;
}
// How likely you are to catch what's going around this winter (weight for the event roll).
export function fluRisk(s: GameState): number {
  let w = 1.6;
  if (s.flags.gym) w *= 0.4;
  if (s.plan.food === 'cook' || s.plan.food === 'parents' || s.plan.food === 'mealplan') w *= 0.75;
  else if (s.plan.food === 'ramen') w *= 1.25;
  if (s.flags.noCoat) w *= 1.5;
  if (s.stats.energy >= 60) w *= 0.7;
  return w;
}

// Job title after a mid-year promotion, by job.
export function promoTitle(s: GameState, level: 1 | 2): string {
  const art = s.job?.art;
  const t: Record<string, [string, string]> = {
    grocery: ['Lead Cashier', 'Front-End Supervisor'],
    warehouse: ['Shift Lead', 'Senior Shift Lead'],
    jobsite: ['Apprentice (Level 1.5)', 'Lead Apprentice'],
    library: ['Senior Library Assistant', 'Circulation Lead'],
  };
  return (t[art ?? ''] ?? ['Shift Lead', 'Senior Shift Lead'])[level - 1];
}
