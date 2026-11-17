// Mission scenes: bank, DMV, FAFSA, tools, transportation, dentist, housing, budget, credit, taxes, career.
import {
  achieve,
  minigame,
  chance,
  charge,
  creditScore,
  energy,
  log,
  money,
  num,
  openCredit,
  rep,
  round2,
  schedule,
  setFlag,
  unlock,
  xp,
} from '../../engine/core.ts';
import type { GameState } from '../../engine/types.ts';
import { CAREER_NEED } from '../chapters.ts';
import { gpaText, liveGpa } from '../college.ts';
import type { Choice, Scene } from '../types.ts';

export function loanPayment(principal: number, apr: number, months: number): number {
  const r = apr / 12;
  return round2((principal * r) / (1 - Math.pow(1 + r, -months)));
}

// Approximate monthly take-home pay.
export function monthlyNet(s: GameState): number {
  if (!s.job) return 0;
  const g = s.job.wage * s.job.hours * 4.33;
  const ded = s.path === 'college' && !s.phase2 ? 0.1 : 0.2;
  const prem = s.health === 'employer' ? s.job.premium * 2.17 : 0;
  return Math.round(g * (1 - ded - s.retirePct) - prem);
}
// What a landlord sees on your recent pay stubs: extra shifts and side gigs count.
export function monthlyGross(s: GameState): number {
  const base = s.job ? s.job.wage * s.job.hours * 4.33 : 0;
  const stubs = num(s, 'avgPaycheck');
  const gigs = num(s, 'avgGig') * 2.17;
  return Math.round((stubs ? stubs * 2.17 : base) + gigs);
}
// Just the base job, no extras (for comparison in text).
export function baseMonthlyGross(s: GameState): number {
  return s.job ? Math.round(s.job.wage * s.job.hours * 4.33) : 0;
}
export function monthlyBills(s: GameState): number {
  let b = s.housing.rent + s.housing.utilities;
  for (const x of s.subs) b += x.cost;
  if (s.car) b += s.car.insurance;
  for (const l of s.loans) if (!l.deferred) b += l.payment;
  return Math.round(b);
}

const after = (s: GameState, weeks: number): number => s.week + weeks;

// ---------- quiz helper ----------
function quiz(q: string, right: string, wrong: string[], why: string, next: string, speaker?: 'clerk' | 'taxpro'): Scene['steps'][string] {
  const opts: Choice[] = [
    { label: right, bot: 3, do: (_s, d) => void (d.correct = Number(d.correct ?? 0) + 1), result: `Correct! ${why}`, next },
    ...wrong.map((w) => ({ label: w, bot: -1, result: `Not quite. ${why}`, next }) as Choice),
  ];
  // Deterministic shuffle by question text so answers don't always come first.
  const k = q.length % opts.length;
  return { text: q, speaker, choices: [...opts.slice(k), ...opts.slice(0, k)] };
}

export const CARD_USE: Scene['steps'][string] = {
  text: (s) =>
    `APPROVED! ${s.card?.name}: ${money(s.card?.limit ?? 0)} limit, ${Math.round((s.card?.apr ?? 0) * 100)}% APR.\n\nA card only builds credit if you USE it and pay the bill. How will you use it?`,
  speaker: 'banker',
  choices: [
    {
      label: 'Small stuff only (gas, toiletries), and pay it in full every month',
      hint: '\u2713 Builds credit \u00b7 \u2713 Low balance \u00b7 \u2713 No interest if paid in full',
      bot: 3,
      do: (s) => setFlag(s, 'cardUse', 'small'),
      result: 'Smart. Small charges each week, one statement a month. Pay it in full on bills day.',
      tip: 'Keep your balance under 30% of your limit, and pay the full statement balance to avoid interest.',
    },
    {
      label: 'Everything (food, gas, fun) goes on the card',
      hint: '\u2713 Builds credit \u00b7 \u2717 Big balances \u00b7 \u2717 Easy to lose track',
      bot: -2,
      do: (s) => setFlag(s, 'cardUse', 'all'),
      result: 'Swipe swipe swipe. It doesn\u2019t feel like spending money\u2026 which is the problem.',
    },
    {
      label: 'Keep it in a drawer for emergencies',
      hint: '\u2713 No risk of overspending \u00b7 \u2717 An unused card barely builds credit',
      bot: 0,
      do: (s) => setFlag(s, 'cardUse', 'none'),
      result: 'Stashed in a drawer. Your credit history exists, but there\u2019s not much to report.',
    },
  ],
};

export const TASK_SCENES: Scene[] = [
  // ================= BANK =================
  {
    id: 'task-bank',
    title: 'Choosing a bank',
    art: 'bank',
    kind: 'task',
    steps: {
      start: {
        text: 'Your teen checking account turns into an adult account in week 8, and that adds a $15 monthly fee. Here are your options:',
        speaker: 'banker',
        choices: [
          {
            label: 'Big National Bank (stay, upgrade the account)',
            hint: '✓ Branches everywhere · ✗ $12/month fee unless you keep $1,500 · ✗ 0.1% savings interest',
            bot: -1,
            do: (s) => {
              s.bank = 'bigbank';
            },
            next: 'overdraft',
          },
          {
            label: 'Hometown Credit Union ($5 to join)',
            hint: '✓ No monthly fee · ✓ 1.5% savings interest · ✗ Fewer ATMs',
            pay: 5,
            methods: ['checking'],
            bot: 2,
            do: (s) => {
              s.bank = 'creditunion';
              unlock(s, 'credit-union');
            },
            next: 'overdraft',
          },
          {
            label: 'Online-only bank',
            hint: '✓ No fees · ✓ 4% high-yield savings · ✗ No branch if something goes wrong',
            bot: 2,
            do: (s) => {
              s.bank = 'online';
              unlock(s, 'hysa');
            },
            next: 'overdraft',
          },
        ],
      },
      overdraft: {
        text: '“One more thing: do you want overdraft coverage? If you spend more than you have, we’ll cover it… for a $35 fee each time.”',
        speaker: 'banker',
        choices: [
          {
            label: 'No thanks. Decline the purchase instead.',
            hint: '✓ Never pay a $35 overdraft fee on purchases · ✗ Embarrassing declined card',
            bot: 2,
            do: (s) => {
              s.overdraftOptIn = false;
              unlock(s, 'overdraft');
            },
            result: 'Account opened. Your old balance moves over. Purchases you can’t cover will be declined instead of costing $35.',
            tip: 'Overdraft fees are a big moneymaker for banks. Opting out means a declined card, which is annoying but free.',
          },
          {
            label: 'Yes, cover me',
            hint: '✓ Purchases always go through · ✗ $35 each time you go negative',
            bot: -1,
            do: (s) => {
              s.overdraftOptIn = true;
              unlock(s, 'overdraft');
            },
            result: 'Account opened. Your old balance moves over. Overdraft coverage is on, so watch that balance.',
          },
        ],
      },
    },
  },

  // ================= DMV =================
  {
    id: 'task-docs',
    title: 'Hunting for documents',
    art: (s) => s.housing.art,
    kind: 'task',
    steps: {
      start: {
        text: 'The DMV checklist says you need:\n• Birth certificate\n• Social Security card\n• TWO proofs of address with your name on them\n\nYour mom finds your birth certificate and Social Security card in the “important papers” folder. Now: proof of address. Pick one:',
        choices: [
          { label: 'Your bank statement', bot: 2, do: (_s, d) => void (d.p = Number(d.p ?? 0) + 1), result: 'Accepted! Bank statements count.', next: 'more' },
          { label: 'A birthday card from Grandma', bot: -2, result: 'Sweet, but no. It has to be official mail, like a bill, a bank statement, or a pay stub.', next: 'start2' },
          { label: 'Your high school yearbook', bot: -2, result: 'Iconic, but no. Official mail only.', next: 'start2' },
        ],
      },
      start2: {
        text: 'Try again. Which one counts as proof of address?',
        choices: [
          { label: 'Your bank statement', do: (_s, d) => void (d.p = Number(d.p ?? 0) + 1), result: 'Accepted!', next: 'more', bot: 2 },
          { label: 'A takeout menu with your address', bot: -2, result: 'No. Think official.', next: 'start2' },
        ],
      },
      more: {
        text: 'One more proof of address:',
        choices: [
          { label: 'A pay stub from work', bot: 2, result: 'Accepted! Your documents are ready.', do: (s) => setFlag(s, 'docs'), tip: 'Keep important documents (birth certificate, Social Security card, passport) in one folder. You’ll need them again and again.' },
          { label: 'Your library card', bot: -2, result: 'Library cards don’t count. Your pay stub does, though. Got it.', do: (s) => setFlag(s, 'docs') },
        ],
      },
    },
  },
  {
    id: 'task-dmvbook',
    title: 'DMV appointments',
    art: (s) => s.housing.art,
    kind: 'task',
    steps: {
      start: {
        text: (s) =>
          `The DMV website loads on the third try. Available appointments:\n\n• Week ${after(s, 2)}, weekday, at the branch near you\n• Week ${after(s, 1)}, Saturday, at a branch 50 minutes away`,
        choices: [
          {
            label: (s) => `Weekday, week ${after(s, 2)}`,
            hint: '✓ Close by · ✗ Costs a day of work (or class)',
            bot: 1,
            do: (s) => schedule(s, { week: after(s, 2), slot: 'weekday', kind: 'dmv', label: 'DMV appointment' }),
            result: 'Booked. It’s on your calendar.',
          },
          {
            label: (s) => `Saturday, week ${after(s, 1)} (far away)`,
            hint: '✓ No missed work · ✗ Uses your Saturday · ✗ Gas or bus fare',
            bot: 2,
            do: (s) => {
              schedule(s, { week: after(s, 1), slot: 'saturday', kind: 'dmv', label: 'DMV appointment' });
              charge(s, 10, 'Trip to far DMV');
            },
            result: 'Booked. A Saturday road trip to the DMV. Living the dream.',
          },
          { label: 'Never mind', bot: -3 },
        ],
      },
    },
  },
  {
    id: 'appt-dmv',
    title: 'DMV appointment',
    art: 'dmv',
    kind: 'appt',
    steps: {
      start: {
        text: 'Appointment line: 4 people. Walk-in line: 61 people. You feel powerful.',
        choices: [{ label: 'Go to the counter', next: null, do: (s) => s.queue.unshift({ t: 'scene', id: 'task-dmv', step: 'counter', data: { appt: 1 } }) }],
      },
    },
  },
  {
    id: 'task-dmv',
    title: 'The DMV',
    art: 'dmv',
    kind: 'task',
    steps: {
      start: {
        text: 'You pull ticket B-217.\n\nNOW SERVING: A-041.\n\nA baby is crying. The vending machine is out of everything except one sad granola bar.',
        choices: [
          {
            label: 'Wait it out',
            bot: 1,
            do: (s, d) => {
              energy(s, -6);
              d.seen = chance(s, 0.6) ? 1 : 0;
            },
            next: (_s, d) => (d.seen ? 'counter' : 'closed'),
          },
          { label: 'Give up and book an appointment later', bot: -1, result: 'You leave. The granola bar wins.' },
        ],
      },
      closed: {
        text: 'Four hours later, the screen flickers: “SYSTEM DOWN. ALL REMAINING CUSTOMERS PLEASE RETURN ANOTHER DAY.”',
        speaker: 'clerk',
        choices: [{ label: 'Scream internally', result: 'That was a whole day. Next time, book an appointment online.', tip: 'Many DMVs let you book appointments online. Walk-ins can take all day.' }],
      },
      counter: {
        text: '“Next!” The clerk, Gloria, peers at you over her glasses. “Documents?”',
        speaker: 'clerk',
        choices: [
          {
            label: 'Hand over your documents',
            hide: (s) => !s.flags.docs,
            next: 'fee',
          },
          {
            label: 'Uh… I have my school ID?',
            hide: (s) => !!s.flags.docs,
            result: '“Honey, I need your birth certificate, Social Security card, and two proofs of address. Come back when you have them.”\n\nThat was a wasted trip.',
            tip: 'Always check what documents an office needs before you go. Most post a checklist online.',
          },
        ],
      },
      fee: {
        text: '“That’ll be $35 for the written test, road test, and license.”',
        speaker: 'clerk',
        choices: [{ label: 'Pay $35', pay: 35, methods: ['checking', 'card'], next: 'q1', bot: 1 }],
      },
      q1: quiz(
        'WRITTEN TEST, Question 1/3: Two cars arrive at a 4-way stop at the same time. Who goes first?',
        'The car on the right',
        ['Whoever is faster', 'The bigger vehicle'],
        'When two cars arrive together, yield to the car on your right.',
        'q2',
        'clerk',
      ),
      q2: quiz(
        'Question 2/3: If you’re under 21, what blood alcohol level is legal for driving?',
        'Basically zero (0.00–0.02%)',
        ['0.08%, same as everyone', '0.05% on weekends'],
        'Under 21, almost every state has “zero tolerance.” Any alcohol can cost you your license.',
        'q3',
        'clerk',
      ),
      q3: quiz(
        'Question 3/3: A school bus stops with its red lights flashing on a two-lane road. You’re behind it. You should…',
        'Stop and wait until the lights stop',
        ['Pass carefully on the left', 'Honk so they hurry'],
        'Never pass a stopped school bus with flashing red lights.',
        'graded',
        'clerk',
      ),
      graded: {
        text: (_s, d) => `You got ${d.correct ?? 0}/3. ${Number(d.correct ?? 0) >= 2 ? 'You passed the written test! On to the road test.' : 'You need 2/3 to pass.'}`,
        speaker: 'clerk',
        choices: [
          { label: 'Road test time', hide: (_s, d) => Number(d.correct ?? 0) < 2, next: 'road' },
          {
            label: 'Ugh. Study and come back.',
            hide: (_s, d) => Number(d.correct ?? 0) >= 2,
            result: 'Failed. You’ll have to come back another day, and pay again.',
          },
        ],
      },
      road: {
        text: 'ROAD TEST. The examiner clicks a pen and climbs into the passenger seat. \u201cWhenever you\u2019re ready.\u201d',
        speaker: 'clerk',
        choices: [
          {
            label: 'Start the engine',
            bot: 3,
            do: (s) => minigame(s, 'roadtest'),
          },
        ],
      },
    },
  },

  // ================= FAFSA =================
  {
    id: 'task-fafsa',
    title: 'The FAFSA',
    art: 'library',
    kind: 'task',
    steps: {
      start: {
        text: (s) =>
          s.flags.fafsaInfo
            ? 'You have your parents’ tax info. Time to fill out the form. First question: are you a “dependent” or “independent” student?'
            : 'You make your FSA ID (username, password, three security questions, and a very cheerful progress bar). Then the form asks for your parents’ tax information.',
        choices: [
          {
            label: 'Call home for their tax info',
            hide: (s) => !!s.flags.fafsaInfo,
            bot: 2,
            do: (s) => {
              setFlag(s, 'fafsaInfo');
              unlock(s, 'fafsa');
            },
            result: 'Your dad spends 45 minutes finding the file. You have what you need. Come back another session to finish.',
          },
          {
            label: 'Dependent: I’m 18, unmarried, supported by my parents',
            hide: (s) => !s.flags.fafsaInfo,
            bot: 2,
            next: 'loan',
          },
          {
            label: 'Independent: I live on my own now!',
            hide: (s) => !s.flags.fafsaInfo,
            bot: -1,
            result: 'Error: Independent status requires being 24+, married, a veteran, or other special cases. Moving into a dorm doesn’t count. You fix it.',
            next: 'loan',
          },
        ],
      },
      loan: {
        text: 'SUBMITTED! A week later, your aid offer arrives:\n\n• Pell Grant: $3,200 (free money!)\n• Subsidized loan: $3,500 (no interest while in school)\n• OPTIONAL Unsubsidized loan: $2,000 (interest starts now, and the extra comes to you as a refund check)',
        speaker: 'advisor',
        choices: [
          {
            label: 'Accept the grant + subsidized loan only',
            hint: '✓ Borrow only what you need',
            bot: 2,
            do: (s) => {
              setFlag(s, 'fafsa');
              lateFafsa(s);
              s.loans.push({ name: 'Student loan', balance: 3500, apr: 0, payment: 0, kind: 'student', deferred: true });
              if (s.credit.firstWeek === null) s.credit.firstWeek = s.week;
              unlock(s, 'student-loan');
              achieve(s, 'fafsa');
            },
            result: 'Tuition and housing are covered for this year. You owe $3,500, but not until after you graduate.',
            tip: 'Grants are free money. Subsidized loans don’t build interest while you’re in school. Unsubsidized loans do.',
          },
          {
            label: 'Take everything, including $2,000 extra cash',
            hint: '✓ $2,000 in your pocket now · ✗ 6.5% interest starts today · ✗ You owe more later',
            bot: -2,
            do: (s) => {
              setFlag(s, 'fafsa');
              lateFafsa(s);
              s.loans.push({ name: 'Student loan', balance: 3500, apr: 0, payment: 0, kind: 'student', deferred: true });
              s.loans.push({ name: 'Unsubsidized loan', balance: 2000, apr: 0.065, payment: 0, kind: 'student', deferred: true });
              s.stats.cash = round2(s.stats.cash + 2000);
              if (s.credit.firstWeek === null) s.credit.firstWeek = s.week;
              unlock(s, 'student-loan');
              achieve(s, 'fafsa');
            },
            result: 'A $2,000 refund hits your account. It feels like free money. It isn’t.',
          },
        ],
      },
    },
  },

  // ================= TOOLS =================
  {
    id: 'task-tools',
    title: 'Buying tools',
    art: 'jobsite',
    kind: 'task',
    steps: {
      start: {
        text: 'Dee’s list: lineman’s pliers, wire strippers, screwdrivers, a multimeter, a tool pouch. Options:',
        speaker: 'boss',
        choices: [
          {
            label: 'New kit at the supply house: $380',
            pay: 380,
            hint: '✓ Quality, warrantied · ✗ Big hit to your cash',
            bot: (s) => (s.stats.cash + s.stats.savings > 900 ? 2 : 0),
            do: (s) => {
              setFlag(s, 'tools', 'new');
              rep(s, 3);
            },
            result: 'Shiny tools. Dee nods approvingly.',
          },
          {
            label: 'Used kit from an online marketplace: $160',
            pay: 160,
            methods: ['checking', 'savings'],
            hint: '✓ Cheap · ✗ Might be missing pieces',
            bot: 2,
            do: (s) => {
              setFlag(s, 'tools', 'used');
              if (chance(s, 0.4)) {
                setFlag(s, 'toolsBroken');
              }
            },
            result: (s) => (s.flags.toolsBroken ? 'Mostly good… but the multimeter is dead. You’ll need to replace it eventually.' : 'Score! Everything works.'),
          },
          {
            label: 'Open a ToolTown store card: 0% for 6 months!',
            hint: '✓ $0 today · ✗ 29.99% APR · ✗ ALL the interest gets charged if it isn’t paid off in 6 months',
            hide: (s) => !!s.card,
            bot: -1,
            do: (s) => {
              s.card = { name: 'ToolTown Card', kind: 'store', limit: 600, apr: 0.2999, balance: 380, deposit: 0, openedWeek: s.week };
              openCredit(s);
              setFlag(s, 'promoUntil', s.week + 24);
              setFlag(s, 'tools', 'new');
              unlock(s, 'deferred-interest');
            },
            result: 'Approved! $380 on a new card. The fine print says “deferred interest.” You’ll look that up later. Probably.',
            tip: '“0% if paid in full” store deals usually charge ALL the back interest if even $1 is left when the promo ends.',
          },
        ],
      },
    },
  },

  // ================= TRANSPORTATION =================
  {
    id: 'task-transport',
    title: 'Getting around',
    art: 'carlot',
    kind: 'task',
    steps: {
      start: {
        text: (s) =>
          `Your options${s.flags.license ? '' : ' (no license yet, so cars are off the table)'}:\n\nCars need insurance, gas (~$35/week), and repairs. Your take-home pay is about ${money(monthlyNet(s))}/month.`,
        speaker: 'dealer',
        choices: [
          {
            label: '2008 Hatchback, 160k miles: $2,400 cash',
            hint: '✓ No loan · ✗ Old car, repairs likely · Insurance ~$160/mo',
            req: (s) => (s.flags.license ? true : 'Needs a license'),
            bot: (s) => (s.stats.cash + s.stats.savings > 2900 ? 1 : -5),
            next: 'inspect',
          },
          {
            label: '2016 Sedan, 70k miles: $7,800 (financed)',
            hint: '✓ Reliable · ✗ Monthly loan payment · ✗ Full coverage insurance ~$320/mo',
            req: (s) => (s.flags.license ? true : 'Needs a license'),
            bot: (s) => (s.path === 'trade' ? 1 : -1),
            next: 'loan',
          },
          {
            label: (s) => (s.path === 'college' ? 'Keep riding the free campus bus' : s.path === 'trade' ? 'Pay coworkers for rides ($240/mo)' : 'Monthly bus pass ($65/mo)'),
            hint: (s) =>
              s.path === 'college'
                ? '✓ Free · ✗ On the bus’s schedule'
                : s.path === 'trade'
                  ? '✓ No car costs · ✗ Expensive · ✗ Depends on others'
                  : '✓ Cheap and predictable · ✗ Slow · ✗ Late buses',
            bot: (s) => (s.path === 'trade' ? 0 : 2),
            do: (s) => {
              setFlag(s, 'transportSet');
              if (s.path === 'trade') {
                if (!s.subs.some((x) => x.id === 'rides')) s.subs.push({ id: 'rides', label: 'Rides to job sites', cost: 240 });
                s.transport = 'bus';
              } else if (s.path !== 'college') {
                s.transport = 'bus';
                if (!s.subs.some((x) => x.id === 'buspass')) s.subs.push({ id: 'buspass', label: 'Monthly bus pass', cost: 65 });
              }
            },
            result: 'Decision made. No car payments, no insurance, no surprise repairs.',
          },
          {
            label: 'Used bike + good lock: $180',
            pay: 180,
            hint: '✓ Free commute · ✓ Exercise · ✗ Rain, flats, theft',
            hide: (s) => s.path === 'trade',
            bot: (s) => (s.path === 'work' ? 1 : 0),
            do: (s) => {
              setFlag(s, 'transportSet');
              s.transport = 'bike';
              s.subs = s.subs.filter((x) => x.id !== 'buspass');
              unlock(s, 'transport-cost');
            },
            result: 'You’re a cyclist now. Your legs will hate you for two weeks, then thank you.',
          },
        ],
      },
      inspect: {
        text: 'The seller says it “runs great.” A mechanic will do a pre-purchase inspection for $100.',
        speaker: 'dealer',
        choices: [
          {
            label: 'Pay $100 for an inspection first',
            pay: 100,
            hint: '✓ Know what you’re buying · ✗ $100 even if you walk away',
            bot: 2,
            do: (s, d) => {
              d.bad = chance(s, 0.5) ? 1 : 0;
              unlock(s, 'inspection');
            },
            next: (_s, d) => (d.bad ? 'inspectBad' : 'inspectGood'),
          },
          {
            label: 'Trust the seller and buy it: $2,400',
            pay: 2400,
            methods: ['checking', 'savings'],
            bot: -2,
            do: (s, d) => {
              buyCar(s, 'Old Hatchback', chance(s, 0.5) ? 25 : 55, 2000, 160);
              d.done = 1;
            },
            result: (s) => (s.car && s.car.condition < 30 ? 'You drive it home. The transmission makes a noise like a sad whale. Uh oh.' : 'You drive it home. It runs! For now.'),
          },
        ],
      },
      inspectGood: {
        text: 'The mechanic says: “Old but solid. Needs tires soon, but no big problems.”',
        speaker: 'mechanic',
        choices: [
          {
            label: 'Buy it: $2,400',
            pay: 2400,
            methods: ['checking', 'savings'],
            bot: 2,
            do: (s) => buyCar(s, 'Old Hatchback', 60, 2000, 160),
            result: 'It’s yours. Insurance is about $160/month (liability only). Teen drivers pay a lot.',
          },
          {
            label: 'Haggle on the price',
            hint: '\u2713 Could save hundreds \u00b7 Mini-game',
            bot: 3,
            do: (s) => minigame(s, 'haggle', { item: 'car', price: 2400 }),
          },
          { label: 'Walk away', next: 'start' },
        ],
      },
      haggled: {
        text: (_s, d) => `The seller shakes your hand. \u201cFine. ${money(Number(d.price ?? 2400))}, and that\u2019s my final offer.\u201d`,
        speaker: 'dealer',
        choices: [
          {
            label: (_s, d) => `Buy it: ${money(Number(d.price ?? 2400))}`,
            pay: (_s, d) => Number(d.price ?? 2400),
            methods: ['checking', 'savings'],
            bot: 2,
            do: (s) => buyCar(s, 'Old Hatchback', 60, 2000, 160),
            result: 'It’s yours, for less than the sticker price. Insurance is about $160/month (liability only).',
          },
          { label: 'Walk away', next: 'start' },
        ],
      },
      inspectBad: {
        text: 'The mechanic winces. “Transmission is slipping. That’s a $1,500 repair, maybe soon.”',
        speaker: 'mechanic',
        choices: [
          {
            label: 'Negotiate: offer $1,700',
            pay: 1700,
            methods: ['checking', 'savings'],
            bot: 1,
            do: (s) => buyCar(s, 'Old Hatchback', 35, 1500, 160),
            result: 'The seller grumbles but takes it. You saved $700 by knowing what you were buying.',
          },
          { label: 'Walk away. The inspection just saved you.', bot: 2, next: 'start', result: 'You walk. $100 well spent.' },
        ],
      },
      loan: {
        text: (s) => {
          const t = carLoanTerms(s);
          return `The finance office runs your credit.\n\n${t.note}\n\nTerms: ${money(t.down)} down, ${(t.apr * 100).toFixed(1)}% APR, 48 months → ${money(t.payment)}/month. Total paid over the loan: about ${money(t.payment * 48 + t.down)} for a $7,800 car.\nFull-coverage insurance (required with a loan): ~$320/month. Young drivers pay the most.`;
        },
        speaker: 'dealer',
        choices: [
          {
            label: (s) => `Sign (${money(carLoanTerms(s).down)} down payment)`,
            pay: (s) => carLoanTerms(s).down,
            methods: ['checking', 'savings'],
            bot: (s) => (s.path === 'trade' ? 2 : -1),
            do: (s) => {
              const t = carLoanTerms(s);
              buyCar(s, '2016 Sedan', 85, 7000, 320);
              s.loans.push({ name: 'Car loan', balance: 7800 - t.down, apr: t.apr, payment: t.payment, kind: 'car' });
              openCredit(s);
              unlock(s, 'car-loan');
            },
            result: 'You drive off the lot. That new-car smell is mostly air freshener, but still.',
            tip: 'With car loans, look at the total you’ll pay, not just the monthly payment. Better credit = lower rate = thousands saved.',
          },
          { label: 'Too much. Go back.', next: 'start' },
        ],
      },
    },
  },

  // ================= DENTIST =================
  {
    id: 'task-dentistcall',
    title: 'Calling the dentist',
    art: 'dentist',
    kind: 'task',
    steps: {
      start: {
        text: (s) =>
          `Smile Bright Dental. “Cleaning and checkup: ${s.dental ? 'covered by your insurance, $0' : '$165 without insurance'}. Next openings:\n• Weekday, week ${after(s, 1)}\n• Saturday, week ${after(s, 3)}”`,
        speaker: 'dentist',
        choices: [
          {
            label: (s) => `Weekday, week ${after(s, 1)}`,
            hint: (s) => `✓ Sooner · ✗ ${s.path === 'college' ? 'Miss a day of class' : 'Miss a day of work (8 unpaid hours)'}`,
            bot: 1,
            do: (s) => schedule(s, { week: after(s, 1), slot: 'weekday', kind: 'dentist', label: 'Dentist appointment' }),
            result: 'Booked! They’ll text you a reminder. Twice. And then once more.',
          },
          {
            label: (s) => `Saturday, week ${after(s, 3)}`,
            hint: '✓ No missed work · ✗ Uses a Saturday · ✗ Longer wait',
            bot: 2,
            req: (s) => (after(s, 3) <= 12 ? true : 'Too late for this chapter'),
            do: (s) => schedule(s, { week: after(s, 3), slot: 'saturday', kind: 'dentist', label: 'Dentist appointment' }),
            result: 'Booked for a Saturday.',
          },
          { label: 'Hang up (maybe later)', bot: -3 },
        ],
      },
    },
  },
  {
    id: 'appt-dentist',
    title: 'Dentist appointment',
    art: 'dentist',
    kind: 'appt',
    steps: {
      start: {
        text: (s) =>
          `Scrape, scrape, polish. Dr. Park asks how often you floss. You lie. She knows.\n\nBill: ${s.dental ? '$0, covered by insurance' : '$165'}.`,
        speaker: 'dentist',
        choices: [
          {
            label: 'Pay $165',
            pay: 165,
            hide: (s) => s.dental,
            bot: 1,
            do: (s, d) => {
              d.cavity = chance(s, 0.5) ? 1 : 0;
            },
            next: (_s, d) => (d.cavity ? 'cavity' : 'clean'),
          },
          {
            label: 'Great!',
            hide: (s) => !s.dental,
            do: (s, d) => {
              d.cavity = chance(s, 0.5) ? 1 : 0;
            },
            next: (_s, d) => (d.cavity ? 'cavity' : 'clean'),
          },
        ],
      },
      clean: {
        text: '“No cavities. See you in six months!”',
        speaker: 'dentist',
        choices: [
          {
            label: 'Free toothbrush!',
            do: (s) => {
              setFlag(s, 'dentistDone');
              s.flags.toothRisk = 0;
              unlock(s, 'preventive-care');
            },
          },
        ],
      },
      cavity: {
        text: (s) => `“You have a small cavity on that back molar. If we fill it now it’s ${s.dental ? '$40 with your insurance' : '$190'}. If you wait, it could need a root canal.”`,
        speaker: 'dentist',
        choices: [
          {
            label: (s) => `Fill it now (${s.dental ? '$40' : '$190'})`,
            pay: (s) => (s.dental ? 40 : 190),
            bot: 2,
            do: (s) => {
              setFlag(s, 'dentistDone');
              s.flags.toothRisk = 0;
              unlock(s, 'preventive-care');
            },
            result: 'Numb face for 3 hours. Problem solved.',
            tip: 'Small problems are cheap. Ignored problems get expensive. That goes for teeth, cars, and almost everything.',
          },
          {
            label: 'Wait on it',
            hint: '✓ Save money now · ✗ It will get worse',
            bot: -2,
            do: (s) => {
              setFlag(s, 'dentistDone');
              s.flags.toothRisk = 1;
            },
            result: '“Okay… call us if it starts hurting.”',
          },
        ],
      },
    },
  },

  // ================= HOUSING =================
  {
    id: 'task-housing',
    title: 'Finding a place',
    art: 'apartment',
    kind: 'task',
    steps: {
      start: {
        text: (s) => {
          const g = monthlyGross(s);
          const extra = g - baseMonthlyGross(s);
          return `Most landlords require your monthly income to be at least 3× the rent, and they check your credit.\n\nYour recent pay stubs show ~${money(g)}/month${extra > 50 ? ` (that includes ${money(extra)} from extra shifts and side gigs)` : ''} → max rent ~${money(g / 3)}.\nYour credit: ${creditScore(s) ?? 'no score yet'}.${creditScore(s) === null ? ' (No credit = double deposit.)' : ''}`;
        },
        speaker: 'landlord',
        choices: [
          { label: 'See the listings', next: (s) => `list-${s.path}` },
          { label: 'Not today', bot: -3 },
        ],
      },
      'list-home': {
        text: 'Your choices:',
        choices: [
          { label: 'Keep looking (come back another weekend)', bot: -4, next: null },
          housingOption('Stay home: rent goes up to $350', 0, 350, 0, false, 'bedroom', 'parents', '✓ Still cheapest by far · ✗ House rules forever · ✗ Less independence', 2),
          housingOption('Room in a shared house: $625', 625, 625, 0, true, 'apartment', 'room', '✓ Your own space · ✗ Deposit + rent + groceries now', 0),
          housingOption('Downtown studio: $1,050', 1050, 1050, 70, false, 'apartment', 'studio', '✓ All yours · ✗ Way over budget', -2),
        ],
      },
      'list-college': {
        text: 'Leases for next school year (you’d move in next fall):',
        choices: [
          { label: 'Keep looking (come back another weekend)', bot: -4, next: null },
          {
            label: 'House near campus with 3 friends: $550/mo',
            pay: (s) => depositFor(s, 550),
            methods: ['checking', 'savings', 'card'],
            hint: (s) => `✓ Cheaper than dorms · ✓ Friends · ✗ ${money(depositFor(s, 550))} deposit now`,
            bot: 2,
            do: (s) => {
              setFlag(s, 'housingDone');
              setFlag(s, 'nextYear', 'house');
              unlock(s, 'security-deposit');
              unlock(s, 'lease');
            },
            result: 'Signed! You’re locked in for next year. The deposit comes back when you move out… if you don’t wreck the place.',
          },
          {
            label: 'Sign up for the dorms again',
            hint: '✓ Nothing due now · ✗ Costs ~$1,800 more next year (more loans)',
            bot: 0,
            do: (s) => {
              setFlag(s, 'housingDone');
              setFlag(s, 'nextYear', 'dorm');
              const l = s.loans.find((x) => x.kind === 'student');
              if (l) l.balance += 1800;
            },
            result: 'Back to Hollis Hall next year. Easy, but your loans grow by $1,800.',
          },
          {
            label: 'Cheap apartment 40 min away by bus: $420/mo',
            pay: (s) => depositFor(s, 420),
            methods: ['checking', 'savings', 'card'],
            hint: '✓ Cheapest rent · ✗ 80 minutes of bus every day',
            bot: 1,
            do: (s) => {
              setFlag(s, 'housingDone');
              setFlag(s, 'nextYear', 'far');
              unlock(s, 'security-deposit');
              unlock(s, 'lease');
            },
            result: 'Signed. Cheap rent. Long podcasts.',
          },
        ],
      },
      'list-trade': {
        text: 'Places near your usual job sites:',
        choices: [
          { label: 'Keep looking (come back another weekend)', bot: -4, next: null },
          housingOption('Share a 2BR with coworker Dani: $600 + $50 utilities', 600, 600, 50, true, 'apartment', 'shared', '✓ Cheapest · ✓ Dani’s cool · ✗ Sharing a bathroom', 2),
          housingOption('Room in a house: $700', 700, 700, 0, false, 'apartment', 'room', '✓ Simple · ✗ $50 more than now', 0),
          housingOption('Studio of your own: $975 + $70 utilities', 975, 975, 70, false, 'apartment', 'studio', '✓ Privacy · ✗ Eats your budget', -1),
        ],
      },
      'list-work': {
        text: 'Theo moves out at the end of the month. Your options:',
        choices: [
          { label: 'Keep looking (come back another weekend)', bot: -4, next: null },
          { label: 'Interview new roommates', bot: 2, next: 'roommates' },
          housingOption('Take over the whole 2BR: $1,450', 0, 1450, 80, false, 'apartment', 'shared', '✓ No new roommate · ✗ Double the rent', -3),
          housingOption('Move to a small studio: $995 + $70 utilities', 995, 995, 70, false, 'apartment', 'studio', '✓ All yours · ✗ Deposit + more rent', -1),
        ],
      },
      roommates: {
        text: 'Three people answer your ad:\n\n• JORDAN: neat, works nights, has a cat (you’re allergic)\n• SAM: super fun bartender. “I pay rent when I can, you know?”\n• PRIYA: grad student, quiet, wants a written roommate agreement',
        speaker: 'roommate',
        choices: [
          roommatePick('Jordan', 'jordan', '✓ Reliable · ✗ Allergies (−3 energy/week)', 0),
          roommatePick('Sam', 'sam', '✓ Fun · ✗ “When I can” is not a rent schedule', -3),
          roommatePick('Priya', 'priya', '✓ Reliable, clear rules · ✗ Quiet hours', 3),
        ],
      },
    },
  },

  // ================= BUDGET =================
  {
    id: 'task-budget',
    title: 'Making a budget',
    art: (s) => s.housing.art,
    kind: 'task',
    steps: {
      start: {
        text: (s) => {
          const net = monthlyNet(s);
          const bills = monthlyBills(s);
          const food = budgetFood(s);
          const stuff = Math.round(personalCost(s) * 4.33);
          const gas = s.car ? 150 : s.transport === 'borrow' ? 110 : s.transport === 'carpool' ? 110 : 0;
          const left = net - bills - food - stuff - gas;
          return `MONTHLY BUDGET\nTake-home pay: ~${money(net)}\nFixed bills: −${money(bills)}\nFood: −${money(food)}\nToiletries, laundry, household: −${money(stuff)}\nGas/transport: −${money(gas)}\n\nLeft over: ${money(left)}\n\nThe 50/30/20 rule: about 50% for needs, 30% for wants, 20% for savings and debt. How much should automatically move to savings every paycheck?`;
        },
        choices: [25, 50, 100, 150, 250].map((amt) => ({
          label: `$${amt} per paycheck`,
          hint: `≈ ${money(amt * 2.17)}/month into savings`,
          bot: (s: GameState) => {
            const left = monthlyNet(s) - monthlyBills(s) - budgetFood(s) - Math.round(personalCost(s) * 4.33) - (s.car ? 150 : 0);
            const ideal = Math.max(25, left * 0.4) / 2.17;
            return 3 - Math.abs(amt - ideal) / 50;
          },
          do: (s: GameState) => {
            s.autoSave = amt;
            setFlag(s, 'budget');
            unlock(s, 'budget');
            unlock(s, 'pay-yourself-first');
            achieve(s, 'budgeter');
          },
          next: 'subs',
        })),
      },
      subs: {
        text: (s) => {
          const opt = s.subs.filter((x) => ['streamflix', 'gym', 'music'].includes(x.id));
          return opt.length
            ? `Automatic savings set! Now look at your subscriptions:\n${opt.map((x) => `• ${x.label}: ${money(x.cost)}/mo`).join('\n')}`
            : 'Automatic savings set! No sneaky subscriptions found. Nice.';
        },
        choices: [
          {
            label: 'Cancel the ones I don’t use',
            hide: (s) => !s.subs.some((x) => ['streamflix', 'music'].includes(x.id)),
            bot: 2,
            do: (s) => {
              s.subs = s.subs.filter((x) => !['streamflix', 'music'].includes(x.id));
            },
            result: 'Canceled. That’s money back every single month.',
          },
          { label: 'Done', result: 'Your budget is set. You can change auto-savings anytime from the Money screen.', tip: 'Paying yourself first (saving automatically on payday) works better than saving whatever is left at the end of the month.' },
        ],
      },
    },
  },

  // ================= CREDIT CARD =================
  {
    id: 'task-card',
    title: 'Credit card offers',
    art: 'bank',
    kind: 'task',
    steps: {
      start: {
        text: (s) =>
          `Your credit score: ${creditScore(s) ?? 'none yet'}.\n\nA credit card builds credit IF you pay on time and keep your balance low (under 30% of your limit). Each application is a “hard inquiry” that dings your score a little.`,
        speaker: 'banker',
        choices: [
          {
            label: 'Secured card: $300 deposit = $300 limit, 24% APR',
            pay: 300,
            methods: ['checking', 'savings'],
            hint: '✓ Guaranteed approval · ✓ Deposit comes back later · ✗ Ties up $300',
            bot: 2,
            do: (s) => {
              s.card = { name: 'Secured Visa', kind: 'secured', limit: 300, apr: 0.24, balance: 0, deposit: 300, openedWeek: s.week };
              openCredit(s);
              unlock(s, 'secured-card');
              unlock(s, 'utilization');
            },
            next: 'use',
          },
          {
            label: 'Student cash-back card: $500 limit, 22% APR',
            hide: (s) => s.path !== 'college',
            hint: '✓ No deposit · ✓ 1% cash back · ✗ Must be a student',
            bot: 3,
            do: (s) => {
              s.card = { name: 'Student Card', kind: 'student', limit: 500, apr: 0.22, balance: 0, deposit: 0, openedWeek: s.week };
              openCredit(s);
              unlock(s, 'utilization');
            },
            next: 'use',
          },
          {
            label: 'Store card: instant approval, 15% off today, 31.99% APR',
            hint: '✓ Easy approval · ✗ Highest interest rate · ✗ Tempting to overspend',
            bot: -1,
            do: (s) => {
              s.card = { name: 'MegaMart Card', kind: 'store', limit: 500, apr: 0.3199, balance: 0, deposit: 0, openedWeek: s.week };
              openCredit(s);
              unlock(s, 'utilization');
            },
            next: 'use',
          },
          {
            label: 'Premium rewards card: $2,000 limit, 19.99% APR',
            hint: '✓ Big limit, rewards · ✗ Needs good credit (680+)',
            bot: (s) => ((creditScore(s) ?? 0) >= 680 ? 3 : -2),
            do: (s, d) => {
              openCredit(s);
              if ((creditScore(s) ?? 0) >= 680) {
                s.card = { name: 'Rewards Card', kind: 'rewards', limit: 2000, apr: 0.1999, balance: 0, deposit: 0, openedWeek: s.week };
                d.ok = 1;
              } else {
                setFlag(s, 'cardDeniedWeek', s.week);
              }
            },
            result: (_s, d) => (d.ok ? 'Approved! A real grown-up card.' : 'DENIED. “Insufficient credit history.” And the application still counts as a hard inquiry.'),
          },
          { label: 'Not right now', bot: -1 },
        ],
      },
      denied: {
        text: 'DENIED. \u201cInsufficient credit history.\u201d And the application still counts as a hard inquiry on your report.',
        speaker: 'banker',
        choices: [{ label: 'Ugh.' }],
      },
      use: CARD_USE,
    },
  },

  // ================= TAXES =================
  {
    id: 'task-taxes',
    title: 'Tax season',
    art: 'office',
    kind: 'task',
    steps: {
      start: {
        text: (s) =>
          `Your W-2 says:\n• Wages: ${money(num(s, 'wagesYear'))}\n• Federal tax withheld: ${money(num(s, 'fedWithheld'))}\n• State tax withheld: ${money(num(s, 'stateWithheld'))}\n\nHow do you want to file?`,
        speaker: 'taxpro',
        choices: [
          {
            label: 'Free filing software, do it myself',
            hint: '✓ Free · ✗ You have to get it right',
            bot: 2,
            next: 'diy1',
          },
          {
            label: 'Tax-prep chain at the mall: $159',
            pay: 159,
            hint: '✓ Fast and easy · ✗ $159 for a simple return',
            bot: -1,
            next: 'refund',
          },
          {
            label: 'Free volunteer tax help at the library (book a Saturday)',
            hint: '✓ Free, done by trained volunteers · ✗ Takes a Saturday next week',
            bot: 1,
            hide: (s) => s.appointments.some((a) => a.kind === 'taxes'),
            req: (s) => (s.week + 1 <= 24 ? true : 'No Saturday slots left before the deadline'),
            do: (s) => schedule(s, { week: s.week + 1, slot: 'saturday', kind: 'taxes', label: 'Free tax help (library)' }),
            result: 'Booked! Bring your W-2 and ID.',
            tip: 'The IRS VITA program offers free tax prep to people earning under about $67,000.',
          },
        ],
      },
      diy1: {
        text: 'The software asks: “Can someone claim you as a dependent?”',
        speaker: 'taxpro',
        choices: [
          {
            label: (s) => (s.path === 'college' || s.path === 'home' ? 'Yes, my parents still support me' : 'No, I support myself'),
            bot: 2,
            result: 'Correct. The software moves on.',
            next: 'diy2',
          },
          {
            label: (s) => (s.path === 'college' || s.path === 'home' ? 'No (I want a bigger refund!)' : 'Yes, I think?'),
            bot: -2,
            do: (s) => setFlag(s, 'taxMistake'),
            result: 'Hmm. That answer may conflict with your parents’ return. That could cause a problem later.',
            next: 'diy2',
          },
        ],
      },
      diy2: {
        text: (s) => `Next: enter Box 1 (wages) from your W-2. It says ${money(num(s, 'wagesYear'))}.`,
        speaker: 'taxpro',
        choices: [
          { label: 'Type it in carefully', bot: 2, next: 'refund' },
          {
            label: 'Round up, it’s close enough',
            bot: -2,
            do: (s) => setFlag(s, 'taxMistake'),
            next: 'refund',
          },
        ],
      },
      refund: {
        text: (s) => {
          const r = refundFor(s);
          return r >= 0
            ? `FILED! Your refund: ${money(r)}.\n\n${s.flags.taxMistake ? '(The IRS may send a letter about that mistake…)\n\n' : ''}Most of this is money that was withheld from your paychecks all year. What will you do with it?`
            : `FILED. You OWE ${money(-r)}, because no federal tax was taken out of your paychecks (that “exempt” W-4).`;
        },
        speaker: 'taxpro',
        choices: [
          {
            label: 'Put it all in savings',
            hide: (s) => refundFor(s) < 0,
            bot: (s) => (s.card && s.card.balance > 200 ? 1 : 3),
            do: (s) => {
              const r = refundFor(s);
              s.stats.savings = round2(s.stats.savings + r);
              fileTaxes(s);
            },
            result: 'Straight to savings. Future you is grateful.',
          },
          {
            label: 'Pay down my credit card, save the rest',
            hide: (s) => refundFor(s) < 0 || !s.card || s.card.balance < 1,
            bot: 3,
            do: (s) => {
              let r = refundFor(s);
              if (s.card) {
                const p = Math.min(r, s.card.balance);
                s.card.balance = round2(s.card.balance - p);
                r -= p;
              }
              s.stats.savings = round2(s.stats.savings + r);
              fileTaxes(s);
            },
            result: 'Card balance down, savings up. Smart.',
          },
          {
            label: 'Treat yourself: new phone and concert tickets',
            hide: (s) => refundFor(s) < 0,
            hint: '✓ +25 energy · ✗ Refund gone',
            bot: -2,
            do: (s) => {
              energy(s, 25);
              fileTaxes(s);
            },
            result: 'Best weekend ever. The refund is gone, though.',
          },
          {
            label: (s) => `Pay what I owe: ${money(-refundFor(s))}`,
            hide: (s) => refundFor(s) >= 0,
            pay: (s) => -refundFor(s),
            do: (s) => fileTaxes(s),
            result: 'Paid. Lesson learned about the W-4. You fix it with HR.',
          },
        ],
      },
    },
  },
  {
    id: 'appt-taxes',
    title: 'Free tax help',
    art: 'library',
    kind: 'appt',
    steps: {
      start: {
        text: 'A retired accountant named Walt walks you through every line. He’s thrilled to explain what a standard deduction is.',
        speaker: 'taxpro',
        choices: [{ label: 'Thanks, Walt!', next: null, do: (s) => s.queue.unshift({ t: 'scene', id: 'task-taxes', step: 'refund' }) }],
      },
    },
  },

  // ================= CAREER (chapter 6) =================
  {
    id: 'task-career',
    title: 'Next step',
    art: (s) => s.job?.art ?? 'campus',
    kind: 'task',
    steps: {
      start: {
        text: (s) => {
          const n = CAREER_NEED[s.path];
          const ready = s.stats.xp >= n.xp && s.stats.rep >= n.rep;
          const req = `Career progress: ${s.stats.xp}/${n.xp}${n.rep ? `\nBoss rating: ${s.stats.rep}/${n.rep}` : ''}`;
          if (s.path === 'college') {
            const g = liveGpa(s);
            return `Your advisor pulls up your grades.\n\nGPA so far: ${gpaText(g)}. Your scholarship needs a 3.0.\n\n${(g ?? 0) >= 3.0 ? '“You’re on track. Don’t coast through finals.”' : '“Get to office hours, and study before finals in week 35.”'}`;
          }
          return `${req}\n\n${ready ? 'You’re qualified. Time to go for it.' : 'You’re not quite ready. More studying (and showing up) will get you there.'}`;
        },
        speaker: (s: GameState) => (s.path === 'college' ? 'advisor' : 'boss'),
        choices: [
          {
            label: (s) => (s.path === 'trade' ? 'Book the exam (Saturday, week 35)' : 'Schedule the interview (next weekday)'),
            hide: (s) => s.path === 'college',
            req: (s) => {
              const n = CAREER_NEED[s.path];
              if (s.week >= 36) return 'No time left this year';
              return s.stats.xp >= n.xp && s.stats.rep >= n.rep ? true : 'Not ready yet';
            },
            bot: 3,
            do: (s) => {
              setFlag(s, 'careerBooked');
              if (s.path === 'trade') schedule(s, { week: Math.max(s.week + 1, 35), slot: 'saturday', kind: 'interview', label: 'Apprentice exam' });
              else schedule(s, { week: s.week + 1, slot: 'weekday', kind: 'interview', label: 'Interview' });
            },
            result: 'It’s on the calendar. Get some rest beforehand.',
          },
          {
            label: 'Ask for study tips',
            do: (s) => {
              xp(s, 3);
              if (s.path === 'college' && s.school) {
                s.school.extraPrep += 0.5;
                setFlag(s, 'careerBooked');
              }
            },
            result: (s) => (s.path === 'college' ? 'Your advisor shares a study plan for finals. +3 progress, and it counts as half a study session.' : 'You get some pointers. +3 progress.'),
          },
        ],
      },
    },
  },
  {
    id: 'appt-interview',
    title: (s) => (s.path === 'trade' ? 'Apprentice exam' : 'The interview'),
    art: (s) => (s.path === 'trade' ? 'library' : 'office'),
    kind: 'appt',
    steps: {
      start: {
        text: (s) =>
          s.path === 'trade'
            ? 'Three hours. 100 questions on code, safety, and theory. Your pencil is sweating.'
            : `“So, ${s.name}. Tell me about a time you handled a problem at work.”`,
        speaker: (s: GameState) => (s.path === 'trade' ? 'advisor' : 'boss'),
        choices: [
          {
            label: (s) => (s.path === 'trade' ? 'Work through it calmly' : 'Give a specific example: the problem, what you did, and the result'),
            bot: 3,
            do: (s, d) => {
              const n = CAREER_NEED[s.path];
              const owed = num(s, 'classOwed') > 0;
              d.pass = s.stats.xp >= n.xp && s.stats.rep >= n.rep && !owed && s.stats.energy >= 15 ? 1 : 0;
              if (d.pass) promote(s);
            },
            result: (s, d) => (d.pass ? promoteText(s) : num(s, 'classOwed') > 0 ? 'You can’t sit for the exam with an unpaid tuition balance. Ouch.' : 'You were too exhausted to bring your best. Not this time.'),
          },
          {
            label: (s) => (s.path === 'trade' ? 'Guess fast and leave early' : '“I’m a perfectionist, I work too hard.”'),
            bot: -3,
            result: 'It doesn’t go well. Better luck next year.',
          },
        ],
      },
    },
  },

  // ================= JOB HUNT =================
  {
    id: 'jobhunt',
    title: 'Job hunting',
    art: 'office',
    kind: 'task',
    steps: {
      start: {
        text: 'You send out applications and refresh your email way too often.',
        choices: [
          {
            label: 'Follow up with a phone call',
            bot: 2,
            do: (s, d) => {
              d.hired = chance(s, 0.55) ? 1 : 0;
              if (d.hired) {
                s.job = {
                  title: 'Stock Associate',
                  place: 'Hardware Hub',
                  wage: s.path === 'home' ? 15 : 16.5,
                  hours: s.path === 'home' ? 28 : 38,
                  healthOffered: s.path !== 'home',
                  premium: 55,
                  dentalPremium: 0,
                  match: 0,
                  art: 'warehouse',
                };
                if (s.health === 'employer') s.health = 'none';
                s.stats.rep = 50;
                achieve(s, 'rehired');
              }
            },
            result: (_s, d) => (d.hired ? 'HIRED! Hardware Hub needs you Monday. (You’ll need to re-enroll in health insurance if you want it.)' : 'Nothing yet. Keep trying.'),
          },
        ],
      },
    },
  },
];

// ---------- helpers ----------
// Filing the FAFSA after the priority deadline still gets federal aid, but not the school's priority grant.
function lateFafsa(s: GameState): void {
  const plan = s.subs.find((x) => x.id === 'tuitionplan');
  if (plan) {
    plan.cost = 150;
    plan.label = 'Tuition payment plan (late FAFSA)';
    log(s, 'Late FAFSA: federal aid came through, but you lost the priority grant. Payment plan drops to $150/month.', 'info');
  }
}

// Mirrors the weekly food and personal costs in engine.ts (kept here to avoid an import cycle).
const sharedHome = (s: GameState): boolean => s.housing.kind === 'parents' || s.housing.kind === 'dorm';
function budgetFood(s: GameState): number {
  return Math.round((sharedHome(s) ? 25 : 85) * 4.33);
}
function personalCost(s: GameState): number {
  return sharedHome(s) ? 25 : 45;
}


function buyCar(s: GameState, name: string, condition: number, value: number, insurance: number): void {
  s.car = { name, condition, value, insurance: insurance + (s.flags.ticketPoints ? 25 : 0) };
  s.transport = 'car';
  s.subs = s.subs.filter((x) => x.id !== 'buspass' && x.id !== 'rides');
  setFlag(s, 'transportSet');
  unlock(s, 'car-insurance');
  unlock(s, 'transport-cost');
  achieve(s, 'wheels');
}

export function carLoanTerms(s: GameState): { apr: number; down: number; payment: number; note: string } {
  const sc = creditScore(s);
  const cosign = s.path === 'home' || s.path === 'college';
  let apr: number;
  let note: string;
  if (sc !== null && sc >= 700) {
    apr = 0.069;
    note = `Credit score ${sc}: Good! You qualify for a good rate.`;
  } else if (sc !== null && sc >= 640) {
    apr = 0.099;
    note = `Credit score ${sc}: Fair. Decent rate.`;
  } else if (cosign) {
    apr = 0.089;
    note = 'No credit history. Your parents co-sign, so you get their rate. (If you miss payments, it hurts THEIR credit too.)';
  } else {
    apr = 0.189;
    note = 'No credit history = high risk to lenders. Best offer: 18.9% APR.';
  }
  const down = sc === null && !cosign ? 1200 : 800;
  return { apr, down, payment: loanPayment(7800 - down, apr, 48), note };
}

function depositFor(s: GameState, rent: number): number {
  return creditScore(s) === null ? rent * 2 : rent;
}

function housingOption(
  label: string,
  rentForDeposit: number,
  rent: number,
  utilities: number,
  roommate: boolean,
  art: GameState['housing']['art'],
  kind: GameState['housing']['kind'],
  hint: string,
  bot: number,
): Choice {
  return {
    label,
    hint: (s) => (rentForDeposit > 0 ? `${hint} · Deposit ${money(depositFor(s, rentForDeposit))}` : hint),
    pay: rentForDeposit > 0 ? (s) => depositFor(s, rentForDeposit) : undefined,
    methods: ['checking', 'savings', 'card'],
    bot: (s) => (rent * 3 > monthlyGross(s) ? -5 : bot),
    req: (s) => (rent * 3 > monthlyGross(s) && kind !== 'parents' ? `Need ${money(rent * 3)}/mo income` : true),
    do: (s) => {
      if (kind === 'parents') {
        s.housing.rent = rent;
      } else {
        s.housing = { kind, name: label.split(':')[0], rent, utilities, missed: 0, roommate, art };
        if (s.plan.food === 'parents') s.plan.food = 'ramen';
        unlock(s, 'security-deposit');
        unlock(s, 'lease');
        achieve(s, 'movedout');
        minigame(s, 'moving');
        setFlag(s, 'needFurniture');
      }
      setFlag(s, 'housingDone');
    },
    result: kind === 'parents' ? 'You stay. More rent, more savings than anywhere else, more “where are you going?”' : 'Lease signed! New keys, new place, new bills.',
    tip: 'Read the lease before you sign: how long it lasts, what happens if you leave early, and who fixes what.',
  };
}

function roommatePick(name: string, id: string, hint: string, bot: number): Choice {
  return {
    label: `Pick ${name}`,
    hint,
    bot,
    do: (s) => {
      setFlag(s, 'roommate', id);
      setFlag(s, 'housingDone');
      s.housing.name = `2-bedroom on Pine Ave (with ${name})`;
      if (id === 'priya') unlock(s, 'roommate-agreement');
    },
    result: `${name} moves in next week.`,
  };
}

export function refundFor(s: GameState): number {
  const fed = num(s, 'fedWithheld');
  const st = num(s, 'stateWithheld');
  if (s.flags.w4exempt) return -Math.round(num(s, 'wagesYear') * 0.04);
  return Math.round(fed * 0.9 + st * 0.6);
}

function fileTaxes(s: GameState): void {
  setFlag(s, 'taxesFiled');
  unlock(s, 'taxes');
  unlock(s, 'refund');
  achieve(s, 'taxes');
  log(s, 'Taxes filed!', 'good');
}

function promote(s: GameState): void {
  setFlag(s, 'careerDone');
  achieve(s, 'levelup');
  if (!s.job) return;
  // (If you changed jobs from the job board, the pharmacy opening is still at Fresh Fields, and a raise never cuts your pay.)
  if (s.path === 'home') {
    s.job = { ...s.job, title: 'Pharmacy Technician', place: 'Fresh Fields Market', art: 'grocery', wage: Math.max(19, s.job.wage), hours: 36, healthOffered: true, premium: 50, dentalPremium: 6, match: 0.03, schedule: undefined, commute: undefined };
  } else if (s.path === 'trade') {
    s.job = { ...s.job, title: 'Year 2 Apprentice', wage: 21.5 };
  } else if (s.path === 'work') {
    s.job = { ...s.job, title: 'Team Lead', wage: Math.max(22, s.job.wage + 1.5) };
  }
}

function promoteText(s: GameState): string {
  switch (s.path) {
    case 'home':
      return 'YOU GOT IT! Pharmacy Technician: $19/hour, 36 hours a week, real benefits. Your mom cries a little.';
    case 'trade':
      return 'PASSED! You’re a Year 2 apprentice now: $21.50/hour. Dee buys the crew donuts in your honor.';
    default:
      return 'YOU’RE THE NEW TEAM LEAD! $22/hour. Theo texts you 14 exclamation points.';
  }
}

