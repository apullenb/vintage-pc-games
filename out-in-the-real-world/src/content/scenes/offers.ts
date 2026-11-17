// Payday decisions (save it, or spend it on something that matters) and story beats.
import { achieve, charge, creditScore, energy, inc, log, money, num, rep, round2, save, schedule, setFlag, unlock, xp } from '../../engine/core.ts';
import { missWork } from '../../engine/core.ts';
import type { GameState } from '../../engine/types.ts';
import type { Choice, Scene } from '../types.ts';
import { hospitalPlan, medCost } from './events.ts';
import { monthlyGross } from './tasks.ts';
import { currentCourse, enroll } from '../careers.ts';
import { COURSE_BY_ID } from '../courses.ts';
import { hasSkill } from '../skills.ts';

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
              inc(s, 'oilSkipped');
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
            hint: '✓ +3 energy every week · ✓ Fewer winter colds · ✗ Recurring bill',
            bot: (s) => (s.stats.energy < 60 && s.stats.savings > 400 ? 1 : -1),
            do: (s) => {
              setFlag(s, 'gym');
              s.subs.push({ id: 'gym', label: 'Gym membership', cost: 30 });
            },
            result: 'Membership card acquired. You will definitely go. (You do, mostly!)',
          },
          {
            label: 'Run in the park for free',
            hint: '✓ Free · ✓ +3 energy today · ✗ Only when it’s nice out (no winter protection)',
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
            hint: '✓ Earns the CPhT certification (6 sessions) · ✓ Path to a $19/hr job',
            bot: 3,
            req: (s) => (currentCourse(s) ? 'Finish your current course first' : true),
            do: (s) => {
              // The same course as "Pharmacy Tech (CPhT)" in the online course catalog.
              setFlag(s, 'certEnrolled');
              s.flags.certMigrated = true;
              enroll(s, COURSE_BY_ID.cpht, 350);
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
              if (s.flags.rentersIns) achieve(s, 'covered');
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

  // ======================= MORE PAYDAY DECISIONS =======================
  {
    id: 'off-gigtax',
    title: 'Gig money',
    art: 'road',
    kind: 'offer',
    steps: {
      start: {
        text: (s) =>
          `You’ve made ${money(num(s, 'gigTax'))} delivering food. The app didn’t take out a single dollar for taxes. That’s on you now.\n\nA driver in the pickup line says: “Set aside a quarter of it. And track your miles. Every mile is a deduction.”`,
        choices: [
          {
            label: (s) => `Move ${money(Math.round(num(s, 'gigTax') * 0.25))} to savings and start a mileage log`,
            hint: '✓ Tax bill covered · ✓ Mileage cuts what you owe · ✗ Logging trips is tedious (−2 energy)',
            bot: 3,
            do: (s) => {
              save(s, Math.round(num(s, 'gigTax') * 0.25));
              setFlag(s, 'gigSetAside');
              setFlag(s, 'gigMiles');
              energy(s, -2);
              unlock(s, 'self-employment-tax');
            },
            result: (s) => `A free app tracks every trip. Your tax money sits in savings (${money(s.stats.savings)} total), where you won’t spend it by accident.`,
            tip: 'Gig apps don’t withhold taxes. Saving about 25% of what you earn makes April boring instead of scary.',
          },
          {
            label: 'Just start the mileage log',
            hint: '✓ Lower taxes · ✗ Nothing set aside for the bill',
            bot: 1,
            do: (s) => {
              setFlag(s, 'gigMiles');
              unlock(s, 'self-employment-tax');
            },
            result: 'Every trip logged. Future you will thank you. Future you will also need to find the money.',
          },
          {
            label: '“Taxes? It’s side money.”',
            hint: '✓ Spend it all · ✗ The app reports it to the IRS',
            bot: -2,
            result: 'Side money, main-character spending.',
          },
        ],
      },
    },
  },
  {
    id: 'off-movein',
    title: 'Move-in checklist',
    art: 'apartment',
    kind: 'offer',
    steps: {
      start: {
        text: 'Cleaning out a drawer, you find the “Move-In Condition Checklist” from your lease. You never filled it out.\n\nLandlords can keep deposit money for damage. Without proof of what was already there, it’s your word against theirs.',
        speaker: 'landlord',
        choices: [
          {
            label: 'Photograph every room tonight and email the checklist',
            hint: '✓ Protects your deposit · ✓ Dated proof · ✗ A dull evening (−4 energy)',
            bot: 2,
            do: (s) => {
              setFlag(s, 'moveInPhotos');
              energy(s, -4);
              unlock(s, 'deposit-return');
            },
            result: '214 photos, including a carpet stain shaped like Ohio. You email them to your landlord and to yourself so the date is on record.',
            tip: 'Take dated photos on move-in day and move-out day. They’re the best evidence you’ll ever have in a deposit fight.',
          },
          {
            label: 'Nah, the place is fine',
            hint: '✓ Free evening · ✗ No proof later',
            bot: -1,
            result: 'Back in the drawer it goes.',
          },
        ],
      },
    },
  },
  {
    id: 'off-carinsshop',
    title: 'Insurance renewal',
    art: 'office',
    kind: 'offer',
    steps: {
      start: {
        text: (s) =>
          `Your car insurance renewal arrived: ${money(s.car?.insurance ?? 0)}/month. Rae says she saved $300 a year just by getting quotes. Your insurer also offers a “SafeDrive” app that tracks your braking and speed for a discount.`,
        choices: [
          {
            label: 'Spend an evening getting three quotes',
            hint: '✓ Same coverage, lower price (−$20/month) · ✗ An evening on the phone (−4 energy)',
            bot: 3,
            do: (s) => {
              if (s.car) s.car.insurance = Math.max(50, s.car.insurance - 20);
              energy(s, -4);
              unlock(s, 'insurance-shopping');
            },
            result: (s) => `Company #3 offers the exact same coverage for less. Switched: ${money(s.car?.insurance ?? 0)}/month.`,
            tip: 'Insurance companies price the same driver very differently. Get new quotes every year.',
          },
          {
            label: 'Try the SafeDrive tracking app',
            hint: (s) => (num(s, 'ticketPoints') ? '✓ Discount for careful driving · ✗ Your driving record says… maybe not' : '✓ Discount for careful driving · ✗ It sees every hard brake'),
            bot: (s) => (num(s, 'ticketPoints') ? -1 : 1),
            do: (s, d) => {
              d.bad = num(s, 'ticketPoints') ? 1 : 0;
              if (s.car) s.car.insurance = Math.max(50, s.car.insurance + (d.bad ? 10 : -12));
              unlock(s, 'insurance-shopping');
            },
            result: (_s, d) =>
              d.bad ? 'Six weeks of data later: “Frequent hard braking detected.” Your rate goes UP $10/month.' : 'Six weeks of smooth driving: −$12/month. You now stop for yellow lights like a grandparent.',
          },
          {
            label: 'Just renew',
            hint: '✓ No effort · ✗ Probably overpaying',
            bot: -1,
            result: 'Renewed. Same price as always, which is the problem.',
          },
        ],
      },
    },
  },
  {
    id: 'off-warranty',
    title: 'Extended warranty',
    art: 'carlot',
    kind: 'offer',
    steps: {
      start: {
        text: 'The dealership calls: “Your vehicle is out of factory warranty! Our Platinum Protection Plan covers major repairs for just $45 a month.”\n\nYou ask what isn’t covered. They talk very fast.',
        speaker: 'dealer',
        choices: [
          {
            label: 'Sign up: $45/month',
            hint: '✓ Covers big repairs after a $100 deductible · ✗ $540 a year · ✗ Claims can be denied',
            bot: -1,
            do: (s) => {
              setFlag(s, 'carWarranty');
              s.subs.push({ id: 'warranty', label: 'Extended car warranty', cost: 45 });
              unlock(s, 'extended-warranty');
            },
            result: 'Signed. The contract is 14 pages. Page 9 is just a list of “wear items” it doesn’t cover.',
          },
          {
            label: 'Auto-save $25 every paycheck into a car repair fund',
            hint: '✓ Covers any repair · ✓ Stays yours if nothing breaks · ✗ Small fund at first',
            bot: 3,
            do: (s) => {
              s.autoSave += 25;
              unlock(s, 'pay-yourself-first');
              unlock(s, 'extended-warranty');
            },
            result: 'Every payday, $25 slides into savings automatically. If the car never breaks, you keep all of it.',
            tip: 'An extended warranty is repair insurance with a profit margin built in. Saving the same money yourself often works out better.',
          },
          {
            label: 'No thanks',
            hint: '✓ No new bill · ✗ No plan for the next repair, either',
            bot: 0,
            result: '“Are you sure? Repairs can cost THOUSANDS!” Click.',
          },
        ],
      },
    },
  },
  {
    id: 'off-gymcancel',
    title: 'Gym price hike',
    art: 'street',
    kind: 'offer',
    steps: {
      start: {
        text: 'Email from the gym: “Exciting news! Your membership rate is adjusting to $40/month.”\n\nYou try to cancel online. There’s no button. The fine print: cancel in person with a manager, weekdays 10 to 2, or by certified letter.',
        choices: [
          {
            label: 'Keep it at $40/month',
            hint: '✓ Still +3 energy a week and fewer colds · ✗ $120 more per year',
            bot: (s) => (s.stats.energy < 50 ? 2 : 0),
            do: (s) => {
              const g = s.subs.find((x) => x.id === 'gym');
              if (g) g.cost = 40;
            },
            result: 'You grumble and keep lifting. At least you actually go.',
          },
          {
            label: 'Cancel by certified letter: $9',
            pay: 9,
            hint: '✓ Proof you canceled · ✗ Lose the gym energy boost',
            bot: (s) => (s.stats.energy < 50 ? 0 : 2),
            do: (s) => {
              s.subs = s.subs.filter((x) => x.id !== 'gym');
              setFlag(s, 'gym', false);
              unlock(s, 'cancel-trap');
            },
            result: 'Certified letter sent, receipt saved. Next month you check your statement: no charge. Free runs in the park from now on.',
            tip: 'Read how to cancel BEFORE you sign up. Keep proof you canceled, then check your statement to make sure the charges stop.',
          },
          {
            label: 'Just stop paying',
            hint: '✓ No hassle today · ✗ You still owe under the contract',
            bot: -2,
            do: (s) => {
              s.subs = s.subs.filter((x) => x.id !== 'gym');
              setFlag(s, 'gym', false);
              charge(s, 80, 'Gym dues in collections');
              unlock(s, 'cancel-trap');
              unlock(s, 'collections');
            },
            result: 'Two months later, a collection agency calls about $80 in “unpaid dues and fees.” You pay it fast to keep it off your credit report.',
          },
        ],
      },
    },
  },
  {
    id: 'off-dataplan',
    title: 'Phone bill check-up',
    art: (s) => s.housing.art,
    kind: 'offer',
    steps: {
      start: {
        text: (s) => {
          const c = s.subs.find((x) => x.id === 'phone')?.cost ?? 0;
          return `Your phone bill: ${money(c)}/month. Three months in a row, you’ve run out of data around the 20th and been slowed to a crawl.\n\nYour carrier suggests unlimited for +$15/month.${c > 30 && c < 95 ? ' A prepaid carrier offers 15 GB for $30 on the same towers.' : ''}`;
        },
        choices: [
          {
            label: 'Switch to the $30 prepaid plan with 15 GB',
            hide: (s) => {
              const c = s.subs.find((x) => x.id === 'phone')?.cost ?? 0;
              return c <= 30 || c >= 95;
            },
            hint: '✓ More data AND cheaper · ✗ An evening moving your number (−4 energy)',
            bot: 3,
            do: (s) => {
              const p = s.subs.find((x) => x.id === 'phone');
              if (p) p.cost = 30;
              energy(s, -4);
              setFlag(s, 'dataPlanSet');
            },
            result: 'Number moved, new SIM in. Same towers, smaller bill, more data.',
            tip: 'Prepaid carriers often run on the big networks for much less. Compare plans every year or two.',
          },
          {
            label: 'Upgrade to unlimited (+$15/month)',
            hint: '✓ Never slowed again · ✗ $180 more a year',
            bot: 0,
            do: (s) => {
              const p = s.subs.find((x) => x.id === 'phone');
              if (p) p.cost += 15;
              setFlag(s, 'dataPlanSet');
            },
            result: 'Unlimited. Stream all you want.',
          },
          {
            label: 'Use Wi-Fi more: download maps and music at home',
            hint: '✓ Free · ✗ You might still run out (−2 energy)',
            bot: 1,
            do: (s) => {
              energy(s, -2);
              setFlag(s, 'dataTight');
              setFlag(s, 'dataPlanSet');
            },
            result: 'Offline maps, downloaded playlists, autoplay off. You are now a Wi-Fi hunter.',
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
              hospitalPlan(s, medCost(s, 'er'));
            },
            result: (s) => `$150/month until the ${money(medCost(s, 'er'))} is paid off: about ${Math.ceil(medCost(s, 'er') / 150)} months. No interest, at least.`,
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
];

const OFFER_LIST = [
  { id: 'off-save', weight: 0.8 },
  // Before the cold hits (the week-16 coat bill): buy smart now, or skip the coat and shiver.
  { id: 'off-clothes', weight: (s: GameState) => (s.week >= 12 && s.week <= 15 ? 3 : 0), once: true },
  { id: 'off-oil', weight: (s: GameState) => (s.car && s.car.condition < 85 ? 3 : 0), cooldown: 6 },
  { id: 'off-gym', weight: 0.8, once: true, minWeek: 4 },
  { id: 'off-renters', weight: (s: GameState) => (ownPlace(s) && !s.flags.rentersIns ? 2 : 0), cooldown: 10 },
  { id: 'off-roadside', weight: (s: GameState) => (s.car && !s.flags.roadside ? 1.5 : 0), once: true },
  { id: 'off-boots', weight: (s: GameState) => (s.path === 'trade' || s.path === 'work' ? 2 : 0), once: true },
  { id: 'off-cert', weight: (s: GameState) => (s.path === 'home' && !s.flags.certEnrolled && !hasSkill(s, 'cpht') && currentCourse(s)?.id !== 'cpht' ? 2.5 : 0), minWeek: 6, cooldown: 8 },
  { id: 'off-paycard', weight: (s: GameState) => ((s.card?.balance ?? 0) > 60 ? 2 : 0), cooldown: 4 },
  { id: 'off-roth', weight: (s: GameState) => (s.week >= 10 ? 0.8 : 0), once: true },
  { id: 'off-glasses', weight: 0.6, once: true, minWeek: 6 },
  { id: 'off-phoneplan', weight: (s: GameState) => (s.flags.familyPhone && s.week >= 6 ? 3 : 0), once: true },
  { id: 'off-battery', weight: (s: GameState) => (s.car && s.week >= 19 && s.week <= 26 ? 2 : 0), once: true },
  { id: 'off-gigtax', weight: (s: GameState) => (num(s, 'gigTax') >= 150 && !s.flags.gigMiles ? 2.5 : 0), once: true, minWeek: 6 },
  { id: 'off-movein', weight: (s: GameState) => (ownPlace(s) && s.week <= 12 && !s.flags.moveInPhotos ? 1.5 : 0), once: true, minWeek: 2 },
  { id: 'off-carinsshop', weight: (s: GameState) => (s.car ? 1.2 : 0), once: true, minWeek: 19 },
  { id: 'off-warranty', weight: (s: GameState) => (s.car && !s.flags.carWarranty ? 1 : 0), once: true, minWeek: 19 },
  { id: 'off-gymcancel', weight: (s: GameState) => (s.flags.gym && s.subs.some((x) => x.id === 'gym') ? 2 : 0), once: true, minWeek: 19 },
  { id: 'off-dataplan', weight: (s: GameState) => (s.subs.some((x) => x.id === 'phone') && !s.flags.dataPlanSet ? 1 : 0), once: true, minWeek: 19 },
];

export { OFFER_LIST };

// Scheduled story moments; returns scene ids to run this week.
export function beatsFor(s: GameState): string[] {
  const out: string[] = [];
  const once = (id: string): boolean => !s.flags[`seen:${id}`];
  if (s.week === 2 && s.path === 'college' && once('off-books')) out.push('off-books');
  if (s.week === 26 && once('beat-curveball')) out.push('beat-curveball');
  if (s.week === 32 && once('beat-roadtrip')) out.push('beat-roadtrip');
  if (s.flags.weakBattery && s.car && s.week % 3 === 0 && once('ev-deadbattery')) out.push('ev-deadbattery');
  if (ownPlace(s) && s.week === 21 && once('ev-breakin') && (s.seed & 1) === 0) out.push('ev-breakin');
  return out;
}

