// Payday decisions (save it, or spend it on something that matters) and story beats.
import { achieve, creditScore, energy, inc, log, money, num, rep, round2, schedule, setFlag, unlock, xp } from '../../engine/core.ts';
import { missWork } from '../../engine/core.ts';
import type { GameState } from '../../engine/types.ts';
import { CAREER_NEED } from '../chapters.ts';
import type { Choice, Scene } from '../types.ts';
import { medCost } from './events.ts';
import { monthlyGross } from './tasks.ts';

const saveChoice = (amount: number, why: string, bot = 1): Choice => ({
  label: `Save the ${money(amount)} instead`,
  hint: `✓ Emergency fund grows · ${why}`,
  bot,
  do: (s) => {
    const a = Math.min(amount, Math.max(0, s.stats.cash));
    s.stats.cash = round2(s.stats.cash - a);
    s.stats.savings = round2(s.stats.savings + a);
  },
  result: (s) => `Moved to savings. You now have ${money(s.stats.savings)} saved.`,
});

const ownPlace = (s: GameState): boolean => s.housing.kind !== 'parents' && s.housing.kind !== 'dorm';

export const OFFER_SCENES: Scene[] = [
  {
    id: 'off-save',
    title: 'Payday decision',
    art: 'bank',
    kind: 'offer',
    steps: {
      start: {
        text: (s) => `Your bank app pops up: “You have ${money(s.stats.cash)} in checking. Want to move some to savings?”`,
        choices: [
          {
            label: 'Move $150 to savings',
            req: (s) => (s.stats.cash >= 150 ? true : 'Not enough in checking'),
            bot: (s) => (s.stats.cash > 600 ? 3 : -1),
            do: (s) => {
              s.stats.cash = round2(s.stats.cash - 150);
              s.stats.savings = round2(s.stats.savings + 150);
            },
            result: (s) => `Saved! ${money(s.stats.savings)} in savings now.`,
          },
          {
            label: 'Move $50 to savings',
            req: (s) => (s.stats.cash >= 50 ? true : 'Not enough in checking'),
            bot: (s) => (s.stats.cash > 300 ? 2 : 0),
            do: (s) => {
              s.stats.cash = round2(s.stats.cash - 50);
              s.stats.savings = round2(s.stats.savings + 50);
            },
            result: 'Every bit counts.',
          },
          {
            label: 'Keep it in checking for now',
            hint: '✓ Cash on hand for bills · ✗ Easier to spend',
            bot: (s) => (s.stats.cash < 400 ? 2 : -1),
          },
        ],
      },
    },
  },
  {
    id: 'off-oil',
    title: 'Oil change due',
    art: 'road',
    kind: 'offer',
    steps: {
      start: {
        text: 'The sticker on your windshield says you’re 1,200 miles overdue for an oil change. $70 at the quick-lube place.',
        speaker: 'mechanic',
        choices: [
          {
            label: 'Get the oil change: $70',
            pay: 70,
            hint: '✓ Keeps the engine healthy (car condition +15)',
            bot: 3,
            do: (s) => {
              if (s.car) s.car.condition = Math.min(100, s.car.condition + 15);
              unlock(s, 'maintenance');
            },
            result: 'Fresh oil. Your car purrs. (Cars don’t purr. But still.)',
          },
          {
            label: 'Skip it this time',
            hint: '✓ $70 stays in your pocket · ✗ Engine wear (condition −12)',
            bot: -2,
            do: (s) => {
              if (s.car) s.car.condition = Math.max(0, s.car.condition - 12);
            },
            result: 'Skipped. The engine sounds a little rougher.',
            tip: 'Skipping a $70 oil change can lead to a $4,000 engine replacement.',
          },
        ],
      },
    },
  },
  {
    id: 'off-gym',
    title: 'Gym membership',
    art: 'street',
    kind: 'offer',
    steps: {
      start: {
        text: 'The gym near you has a deal: $30/month, no signup fee. You’ve been feeling sluggish.',
        choices: [
          {
            label: 'Sign up: $30/month',
            hint: '✓ +3 energy every week · ✗ Recurring bill',
            bot: (s) => (s.stats.energy < 60 && s.stats.savings > 400 ? 1 : -1),
            do: (s) => {
              setFlag(s, 'gym');
              s.subs.push({ id: 'gym', label: 'Gym membership', cost: 30 });
            },
            result: 'Membership card acquired. You will definitely go. (You do, mostly!)',
          },
          {
            label: 'Run in the park for free',
            hint: '✓ Free · ✗ Only when it’s nice out',
            bot: 2,
            do: (s) => energy(s, 3),
            result: 'You go for a run. Cheap and it feels great.',
          },
        ],
      },
    },
  },
  {
    id: 'off-renters',
    title: 'Renters insurance',
    art: 'apartment',
    kind: 'offer',
    steps: {
      start: {
        text: 'An insurance ad: “Renters insurance from $15/month. If your stuff is stolen or destroyed, we replace it.” Your landlord’s insurance covers the building, not your things.',
        choices: [
          {
            label: 'Get renters insurance: $15/month',
            hint: '✓ Theft, fire, and water damage covered · ✗ Another monthly bill',
            bot: 2,
            do: (s) => {
              setFlag(s, 'rentersIns');
              s.subs.push({ id: 'renters', label: 'Renters insurance', cost: 15 });
              unlock(s, 'renters-insurance');
            },
            result: 'Covered. Peace of mind for the price of a pizza.',
          },
          saveChoice(15, '✗ If something happens, you replace it all yourself', -1),
        ],
      },
    },
  },
  {
    id: 'off-roadside',
    title: 'Roadside assistance',
    art: 'road',
    kind: 'offer',
    steps: {
      start: {
        text: 'Roadside assistance: $60 per year. Free towing, jump starts, flat tire changes, and lockouts.',
        choices: [
          {
            label: 'Sign up: $60/year',
            pay: 60,
            hint: '✓ Free tows (usually $110+)',
            bot: (s) => ((s.car?.condition ?? 100) < 60 ? 2 : 0),
            do: (s) => setFlag(s, 'roadside'),
            result: 'Card in your wallet. Hope you never need it.',
          },
          saveChoice(60, '✗ One tow costs more than a year of coverage', 1),
        ],
      },
    },
  },
  {
    id: 'off-boots',
    title: 'Safety boots',
    art: (s) => s.job?.art ?? 'warehouse',
    kind: 'offer',
    steps: {
      start: {
        text: 'Your sneakers are falling apart, and they’re not great for a job site. Steel-toe work boots: $120.',
        speaker: 'boss',
        choices: [
          {
            label: 'Buy the boots: $120',
            pay: 120,
            hint: '✓ Much lower injury risk · ✓ Boss notices',
            bot: 2,
            do: (s) => {
              setFlag(s, 'boots');
              rep(s, 2);
            },
            result: 'Your feet stop hurting. Your boss says, “Finally.”',
          },
          saveChoice(120, '✗ Higher chance of getting hurt at work', -1),
        ],
      },
    },
  },
  {
    id: 'off-cert',
    title: 'Pharmacy tech course',
    art: 'grocery',
    kind: 'offer',
    steps: {
      start: {
        text: 'The pharmacist at Fresh Fields says they’ll be hiring a technician next year. An online certification course costs $350 and you do it at your own pace.',
        speaker: 'boss',
        choices: [
          {
            label: 'Enroll: $350',
            pay: 350,
            hint: '✓ Study sessions count more (+6 instead of +4) · ✓ Path to a $19/hr job',
            bot: 3,
            do: (s) => {
              setFlag(s, 'certEnrolled');
              unlock(s, 'invest-in-yourself');
            },
            result: 'Enrolled! Your first module is about pill counting. Riveting.',
            tip: 'Spending on skills that raise your income is one of the best “investments” you can make.',
          },
          saveChoice(350, '✗ Slower path to a better job', -1),
        ],
      },
    },
  },
  {
    id: 'off-books',
    title: 'Textbooks',
    art: 'campus',
    kind: 'offer',
    steps: {
      start: {
        text: 'Your syllabus lists four textbooks. The campus bookstore wants $320 for all of them, new.',
        choices: [
          { label: 'Buy them new: $320', pay: 320, hint: '✓ Easy · ✗ Most expensive', bot: -1, do: (s) => xp(s, 3), result: 'Crisp, new, expensive books.' },
          {
            label: 'Rent used copies online: $90',
            pay: 90,
            hint: '✓ Cheap · Same content',
            bot: 3,
            do: (s) => xp(s, 3),
            result: 'Someone else’s highlighting, but the same information. Saved $230.',
            tip: 'Rent, buy used, or check the library reserve before paying full price for textbooks.',
          },
          {
            label: 'Use the free library reserve copies',
            hint: '✓ Free · ✗ 2-hour checkout limit (−4 energy now)',
            bot: 1,
            do: (s) => energy(s, -4),
            result: 'You get very good at speed reading.',
          },
        ],
      },
    },
  },
  {
    id: 'off-paycard',
    title: 'Card balance',
    art: 'bank',
    kind: 'offer',
    steps: {
      start: {
        text: (s) =>
          `You owe ${money(s.card?.balance ?? 0)} on your ${s.card?.name}. At ${Math.round((s.card?.apr ?? 0) * 100)}% APR, carrying a balance costs about ${money(((s.card?.balance ?? 0) * (s.card?.apr ?? 0)) / 12)} a month in interest.\n\nPay some of it off now?`,
        choices: [
          {
            label: (s) => `Pay ${money(Math.min(150, s.card?.balance ?? 0))} now`,
            req: (s) => (s.stats.cash >= Math.min(150, s.card?.balance ?? 0) ? true : 'Not enough in checking'),
            hint: '✓ Less interest · ✓ Lower utilization helps your score',
            bot: 3,
            do: (s) => {
              if (!s.card) return;
              const p = Math.min(150, s.card.balance);
              s.card.balance = round2(s.card.balance - p);
              s.stats.cash = round2(s.stats.cash - p);
              unlock(s, 'utilization');
            },
            result: (s) => `Card balance: ${money(s.card?.balance ?? 0)}. Credit score: ${creditScore(s) ?? 'building'}.`,
          },
          {
            label: 'Keep the cash',
            hint: '✓ More cash on hand · ✗ Interest keeps building',
            bot: -1,
          },
        ],
      },
    },
  },
  {
    id: 'off-roth',
    title: 'Retirement account',
    art: 'bank',
    kind: 'offer',
    steps: {
      start: {
        text: 'Your bank suggests opening a Roth IRA, a retirement account you fund yourself. Money you put in at 18 has ~45 years to grow. $50 at 18 could be worth ~$800 at 63.',
        speaker: 'banker',
        choices: [
          {
            label: 'Open it with $50',
            pay: 50,
            methods: ['checking', 'savings'],
            hint: '✓ Compound growth for decades · ✗ Locked away (mostly) until retirement',
            bot: (s) => (s.stats.savings >= 500 ? 2 : -1),
            do: (s) => {
              s.retire = round2(s.retire + 50);
              unlock(s, 'compound-interest');
              achieve(s, 'investor');
            },
            result: 'Opened. You’re officially investing.',
          },
          saveChoice(50, 'Emergency fund first, then retirement', 1),
        ],
      },
    },
  },
  {
    id: 'off-glasses',
    title: 'Headaches',
    art: 'clinic',
    kind: 'offer',
    steps: {
      start: {
        text: 'You’ve been squinting at screens and getting headaches every afternoon. Eye exam + glasses: $180.',
        speaker: 'doctor',
        choices: [
          {
            label: 'Get the exam and glasses: $180',
            pay: 180,
            hint: '✓ No more headaches',
            bot: 2,
            do: (s) => energy(s, 6),
            result: 'You can see individual leaves on trees. Wild.',
          },
          {
            label: 'Deal with it',
            hint: '✓ Save $180 · ✗ −2 energy every week',
            bot: -2,
            do: (s) => setFlag(s, 'headaches'),
            result: 'Squinting continues.',
          },
        ],
      },
    },
  },
  {
    id: 'off-phoneplan',
    title: 'Your own phone plan',
    art: (s) => s.housing.art,
    kind: 'offer',
    steps: {
      start: {
        text: 'Your mom: “We’re switching carriers. Time for you to get your own phone plan, kiddo.”',
        speaker: 'mom',
        choices: [
          {
            label: 'Prepaid plan with my current phone: $30/month',
            hint: '✓ Cheapest · ✓ No credit check',
            bot: 3,
            do: (s) => {
              setFlag(s, 'familyPhone', false);
              s.subs.push({ id: 'phone', label: 'Phone plan', cost: 30 });
            },
            result: 'Done. Cheap and simple.',
          },
          {
            label: 'Big carrier + new phone: $95/month for 3 years',
            hint: '✓ New phone! · ✗ $95/month · ✗ 3-year contract',
            bot: -3,
            do: (s) => {
              setFlag(s, 'familyPhone', false);
              s.subs.push({ id: 'phone', label: 'Phone plan + phone payment', cost: 95 });
              energy(s, 8);
            },
            result: 'New phone. So shiny. $95 a month for the next 36 months.',
            tip: 'A “free” phone on a payment plan isn’t free. Add up the total cost over the contract.',
          },
        ],
      },
    },
  },
  {
    id: 'off-battery',
    title: 'Weak battery',
    art: 'road',
    kind: 'offer',
    steps: {
      start: {
        text: 'Cold morning. Your car takes three tries to start. The auto parts store tests the battery: “It’s on its way out. New one is $160.”',
        speaker: 'mechanic',
        choices: [
          {
            label: 'Replace it: $160',
            pay: 160,
            bot: 2,
            do: (s) => {
              if (s.car) s.car.condition = Math.min(100, s.car.condition + 10);
            },
            result: 'New battery. Starts on the first try.',
          },
          {
            label: 'Wait and see',
            hint: '✗ It might die on a workday',
            bot: -2,
            do: (s) => {
              setFlag(s, 'weakBattery');
            },
            result: 'You buy jumper cables, just in case.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-deadbattery',
    title: 'Dead battery',
    art: 'night',
    kind: 'event',
    steps: {
      start: {
        text: 'Click. Click. Nothing. Your battery is dead and you have to be at work in 20 minutes.',
        choices: [
          {
            label: 'Get a jump, then buy a battery: $160',
            pay: 160,
            bot: 2,
            do: (s) => {
              rep(s, -3);
              setFlag(s, 'weakBattery', false);
              log(s, 'Late to work because of the battery.', 'bad');
            },
            result: 'Late, but running.',
          },
        ],
      },
    },
  },
  {
    id: 'ev-breakin',
    title: 'Break-in',
    art: 'apartment',
    kind: 'event',
    steps: {
      start: {
        text: (s) =>
          `Your door is open. Your TV, laptop, and headphones are gone (about $1,100 of stuff).${s.flags.rentersIns ? '\n\nYou have renters insurance! You pay the $250 deductible and they cover the rest.' : '\n\nNo renters insurance. You’re on your own.'}`,
        speaker: 'cop',
        choices: [
          {
            label: (s) => (s.flags.rentersIns ? 'File a claim, pay the $250 deductible' : 'Replace the essentials: $600'),
            pay: (s) => (s.flags.rentersIns ? 250 : 600),
            bot: 2,
            do: (s) => {
              energy(s, -8);
              unlock(s, 'deductible');
            },
            result: (s) => (s.flags.rentersIns ? 'Your claim is approved. That $15/month just paid for itself.' : 'You replace the laptop. The TV will have to wait.'),
          },
          {
            label: 'Go without for now',
            hide: (s) => !!s.flags.rentersIns,
            do: (s) => {
              energy(s, -14);
              xp(s, -3);
            },
            result: 'No laptop, no TV. It’s a rough few weeks.',
          },
        ],
      },
    },
  },

  // ======================= STORY BEATS =======================
  {
    id: 'beat-curveball',
    title: 'The curveball',
    art: (s) => (s.car ? 'road' : 'clinic'),
    kind: 'story',
    steps: {
      start: {
        text: (s) =>
          s.car
            ? 'Your car makes a horrible grinding noise, then refuses to shift gears. The mechanic shakes his head. “Transmission. $1,800.”'
            : `${s.transport === 'bike' ? 'A delivery van clips your bike.' : 'You slip on wet stairs on your way out.'} Your wrist is swollen and purple. It’s probably broken.\n\nER bill: ${money(medCost(s, 'er'))}${s.health === 'none' ? ' (no insurance)' : ' (with insurance)'}.`,
        speaker: (s: GameState) => (s.car ? 'mechanic' : 'doctor'),
        choices: [
          {
            label: (s) => (s.car ? 'Fix it: $1,800' : `Pay the ER bill: ${money(medCost(s, 'er'))}`),
            pay: (s) => (s.car ? 1800 : medCost(s, 'er')),
            bot: 2,
            do: (s) => {
              setFlag(s, 'curveballDone');
              missWork(s, s.car ? 'Car in the shop' : 'ER visit');
              if (s.car) s.car.condition = 80;
              inc(s, 'medicalBills', s.car ? 0 : medCost(s, 'er'));
              unlock(s, 'emergency-fund');
            },
            result: (s) => (s.stats.savings >= 0 && num(s, 'savingsUses') > 0 ? 'Handled. THIS is what an emergency fund is for.' : 'Handled. It hurt, but you’re through it.'),
            tip: 'Emergency funds exist for exactly this moment: paying for a crisis without high-interest debt.',
          },
          {
            label: 'Mechanic financing: $160/month at 27% APR',
            hide: (s) => !s.car,
            hint: '✓ Nothing due today · ✗ 27% interest · ✗ Another monthly payment',
            bot: -1,
            do: (s) => {
              setFlag(s, 'curveballDone');
              missWork(s, 'Car in the shop');
              if (s.car) s.car.condition = 80;
              s.loans.push({ name: 'Repair financing', balance: 1800, apr: 0.27, payment: 160, kind: 'personal' });
              s.credit.inquiries.push(s.week);
            },
            result: 'Financed. The car runs. The payments start next month.',
          },
          {
            label: 'Sell the car as-is and switch to the bus',
            hide: (s) => !s.car || s.loans.some((l) => l.kind === 'car' && l.balance > 0),
            bot: 0,
            do: (s) => {
              setFlag(s, 'curveballDone');
              s.stats.cash = round2(s.stats.cash + 400);
              s.car = null;
              s.transport = 'bus';
              s.subs.push({ id: 'buspass', label: 'Monthly bus pass', cost: 65 });
            },
            result: 'You get $400 for it. Bus life it is.',
          },
          {
            label: 'Apply for the hospital’s financial assistance',
            hide: (s) => !!s.car || s.health !== 'none',
            hint: (s) => (monthlyGross(s) < 2600 ? '✓ You likely qualify: bill cut by 60%' : '✗ Your income may be too high'),
            bot: 3,
            pay: (s) => (monthlyGross(s) < 2600 ? Math.round(medCost(s, 'er') * 0.4) : medCost(s, 'er')),
            do: (s) => {
              setFlag(s, 'curveballDone');
              missWork(s, 'ER visit');
              unlock(s, 'charity-care');
            },
            result: (s) => (monthlyGross(s) < 2600 ? 'Approved! The hospital cut your bill by 60%. Always ask.' : 'Denied (income too high). You pay the full bill.'),
            tip: 'Most nonprofit hospitals must offer financial assistance. Ask the billing office before you pay.',
          },
          {
            label: 'Payment plan: $150/month',
            hide: (s) => !!s.car || s.health !== 'none',
            bot: 1,
            do: (s) => {
              setFlag(s, 'curveballDone');
              missWork(s, 'ER visit');
              s.subs.push({ id: 'medplan', label: 'Hospital payment plan', cost: 150 });
              unlock(s, 'payment-plan');
            },
            result: '$150/month until it’s paid. No interest, at least.',
          },
        ],
      },
    },
  },
  {
    id: 'beat-roadtrip',
    title: 'Rae’s road trip',
    art: 'beach',
    kind: 'story',
    steps: {
      start: {
        text: '“IT’S TIME. Coast trip, weekend of week 34. My cousin has a beach house, so we just split gas and food: $220 each. You PROMISED.”',
        speaker: 'rae',
        choices: [
          {
            label: 'I’m in! ($220)',
            pay: 220,
            hint: '✓ Keep your promise · ✓ Huge energy boost · ✗ $220 + your whole weekend',
            req: (s) => (s.appointments.some((a) => a.week === 34 && (a.slot === 'saturday' || a.slot === 'sunday')) ? 'You already have plans that weekend' : true),
            bot: (s) => (s.stats.savings + s.stats.cash > 900 ? 2 : -2),
            do: (s) => {
              setFlag(s, 'roadTripBooked');
              schedule(s, { week: 34, slot: 'saturday', kind: 'trip', label: 'Road trip with Rae' });
              schedule(s, { week: 34, slot: 'sunday', kind: 'drive', label: 'Road trip with Rae' });
            },
            result: 'Rae sends 47 ocean emojis.',
          },
          {
            label: '“I can’t swing it right now.”',
            bot: (s) => (s.stats.savings + s.stats.cash > 900 ? -1 : 2),
            do: (s) => energy(s, -6),
            result: 'Rae’s bummed but gets it. “Next time. For real.”',
          },
        ],
      },
    },
  },
  {
    id: 'appt-drive',
    title: 'Driving home',
    art: 'road',
    kind: 'appt',
    steps: {
      start: {
        text: 'The drive home is quiet in the good way. Rae’s asleep. The radio plays something you both used to sing in middle school.',
        choices: [{ label: 'Home.' }],
      },
    },
  },
  {
    id: 'beat-finals',
    title: 'Finals week',
    art: 'library',
    kind: 'story',
    steps: {
      start: {
        text: (s) =>
          `Finals start tomorrow. Your progress: ${s.stats.xp}/${CAREER_NEED.college.xp}. Energy: ${s.stats.energy}.\n\nThe night before…`,
        speaker: 'advisor',
        choices: [
          {
            label: 'Pull an all-nighter',
            hint: '✓ +8 progress · ✗ −25 energy (tired brains make mistakes)',
            bot: (s) => (s.stats.xp + 8 >= CAREER_NEED.college.xp && s.stats.xp < CAREER_NEED.college.xp && s.stats.energy > 40 ? 3 : -1),
            do: (s) => {
              xp(s, 8);
              energy(s, -25);
            },
            next: 'exam',
          },
          {
            label: 'Review once, then sleep 8 hours',
            hint: '✓ Well rested · +2 progress',
            bot: 2,
            do: (s) => {
              xp(s, 2);
              energy(s, 10);
            },
            next: 'exam',
          },
        ],
      },
      exam: {
        text: 'Pencils down. Grades post a week later…',
        choices: [
          {
            label: 'Check your grades',
            do: (s, d) => {
              d.pass = s.stats.xp >= CAREER_NEED.college.xp && s.stats.energy >= 10 ? 1 : 0;
              if (d.pass) {
                setFlag(s, 'careerDone');
                achieve(s, 'levelup');
              } else {
                setFlag(s, 'scholarshipCut');
              }
            },
            result: (_s, d) =>
              d.pass
                ? 'B+ average! Scholarship renewed. You screenshot the grades and send them to your parents, Rae, and Grandma.'
                : 'C average. Your scholarship gets cut for next year. You’ll need to take on more loans.',
          },
        ],
      },
    },
  },
];

const OFFER_LIST = [
  { id: 'off-save', weight: 0.8 },
  { id: 'off-oil', weight: (s: GameState) => (s.car && s.car.condition < 85 ? 3 : 0), cooldown: 6 },
  { id: 'off-gym', weight: 0.8, once: true, minWeek: 4 },
  { id: 'off-renters', weight: (s: GameState) => (ownPlace(s) && !s.flags.rentersIns ? 2 : 0), cooldown: 10 },
  { id: 'off-roadside', weight: (s: GameState) => (s.car && !s.flags.roadside ? 1.5 : 0), once: true },
  { id: 'off-boots', weight: (s: GameState) => (s.path === 'trade' || s.path === 'work' ? 2 : 0), once: true },
  { id: 'off-cert', weight: (s: GameState) => (s.path === 'home' && !s.flags.certEnrolled ? 2.5 : 0), minWeek: 6, cooldown: 8 },
  { id: 'off-paycard', weight: (s: GameState) => ((s.card?.balance ?? 0) > 60 ? 2 : 0), cooldown: 4 },
  { id: 'off-roth', weight: (s: GameState) => (s.week >= 10 ? 0.8 : 0), once: true },
  { id: 'off-glasses', weight: 0.6, once: true, minWeek: 6 },
  { id: 'off-phoneplan', weight: (s: GameState) => (s.flags.familyPhone && s.week >= 6 ? 3 : 0), once: true },
  { id: 'off-battery', weight: (s: GameState) => (s.car && s.week >= 19 && s.week <= 26 ? 2 : 0), once: true },
];

export { OFFER_LIST };

// Scheduled story moments; returns scene ids to run this week.
export function beatsFor(s: GameState): string[] {
  const out: string[] = [];
  const once = (id: string): boolean => !s.flags[`seen:${id}`];
  if (s.week === 2 && s.path === 'college' && once('off-books')) out.push('off-books');
  if (s.week === 26 && once('beat-curveball')) out.push('beat-curveball');
  if (s.week === 32 && once('beat-roadtrip')) out.push('beat-roadtrip');
  if (s.week === 35 && s.path === 'college' && once('beat-finals')) out.push('beat-finals');
  if (s.flags.weakBattery && s.car && s.week % 3 === 0 && once('ev-deadbattery')) out.push('ev-deadbattery');
  if (ownPlace(s) && s.week === 21 && once('ev-breakin') && (s.seed & 1) === 0) out.push('ev-breakin');
  return out;
}

