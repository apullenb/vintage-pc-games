// Online courses: pay (or don't), put in the evenings, earn a skill for your resume.
import type { PathId } from '../engine/types.ts';
import type { SkillId } from './skills.ts';

export interface Course {
  id: string;
  name: string;
  provider: string;
  skill: SkillId;
  cost: number; // up front
  monthly?: number; // billed every month while enrolled
  sessions: number;
  desc: string;
  saturday?: boolean; // hands-on class that only meets Saturdays
  needsLicense?: boolean;
  free?: (path: PathId) => boolean; // an employer covers it up front
  cards: [string, string][]; // flashcard term, clue (clue never contains the term)
}

export const COURSES: Course[] = [
  {
    id: 'service',
    name: 'Customer Service Basics',
    provider: 'Valley Community College (free online)',
    skill: 'service',
    cost: 0,
    sessions: 5,
    desc: 'Free and self-paced. The discussion board is 90% “Great post!”',
    cards: [
      ['De-escalate', 'Calm an upset customer down before it blows up.'],
      ['Active listening', 'Repeat back what they said so they know you heard it.'],
      ['Upsell', 'Suggest a bigger or extra item at checkout.'],
      ['Follow-up', 'Checking back later to make sure the problem got fixed.'],
      ['Escalate', 'Hand a problem to a manager when it’s above your pay grade.'],
      ['Empathy', 'Showing you get how the other person feels.'],
    ],
  },
  {
    id: 'servsafe',
    name: 'ServSafe Food Handler',
    provider: 'ServSafe online',
    skill: 'servsafe',
    cost: 15,
    sessions: 2,
    desc: 'Cheap and quick. Mostly about how fast chicken turns dangerous.',
    cards: [
      ['Danger zone', '41°F to 135°F, where bacteria party.'],
      ['Cross-contact', 'Raw meat juice touching ready-to-eat food.'],
      ['FIFO', 'First in, first out: use the oldest stock first.'],
      ['Sanitize', 'Kill germs on a surface after you clean it.'],
      ['Allergen', 'Ingredient like peanuts that can make some people very sick.'],
      ['Handwashing', '20 seconds, warm water, soap. Every time.'],
    ],
  },
  {
    id: 'excel-free',
    name: 'Excel & Office (library course)',
    provider: 'Public library online learning (free)',
    skill: 'excel',
    cost: 0,
    sessions: 6,
    desc: 'Free with your library card. Slow, but it’s free.',
    cards: [
      ['SUM', 'Spreadsheet formula that adds up a column.'],
      ['Cell', 'One box in a spreadsheet, like B4.'],
      ['VLOOKUP', 'Finds a value in a table by matching a key.'],
      ['Pivot table', 'Summarizes a big data table in a few clicks.'],
      ['Filter', 'Hides rows that don’t match what you’re looking for.'],
      ['Mail merge', 'Sends the same letter to many people, with each name filled in.'],
    ],
  },
  {
    id: 'excel-cert',
    name: 'Microsoft Office Specialist prep + exam',
    provider: 'Certiport testing center',
    skill: 'excel',
    cost: 120,
    sessions: 3,
    desc: 'Faster, with a real certificate at the end. Costs real money.',
    cards: [
      ['SUM', 'Spreadsheet formula that adds up a column.'],
      ['Cell', 'One box in a spreadsheet, like B4.'],
      ['VLOOKUP', 'Finds a value in a table by matching a key.'],
      ['Pivot table', 'Summarizes a big data table in a few clicks.'],
      ['Filter', 'Hides rows that don’t match what you’re looking for.'],
      ['Mail merge', 'Sends the same letter to many people, with each name filled in.'],
    ],
  },
  {
    id: 'forklift',
    name: 'Forklift Certification',
    provider: 'Tri-County Safety Training',
    skill: 'forklift',
    cost: 150,
    sessions: 2,
    saturday: true,
    desc: 'Online theory, then a hands-on driving test. Meets Saturdays.',
    cards: [
      ['Load center', 'Distance from the forks to the middle of the load.'],
      ['Data plate', 'Tag on the truck that lists how much it can lift.'],
      ['Mast', 'Upright rails the forks ride up and down on.'],
      ['Pre-shift check', 'Look over tires, horn, and brakes before you drive.'],
      ['Tip-over', 'Turning too fast with the load up high. Don’t.'],
      ['Horn at corners', 'Warn people at blind spots before you turn.'],
    ],
  },
  {
    id: 'cpht',
    name: 'Pharmacy Tech (CPhT)',
    provider: 'PharmaPath online + PTCB exam',
    skill: 'cpht',
    cost: 350,
    sessions: 6,
    desc: 'The real deal: a national certification. The exam fee is included.',
    cards: [
      ['Generic drug', 'Same active ingredient as the brand name, usually way cheaper.'],
      ['Rx', 'Short for prescription: a doctor’s order for a medicine.'],
      ['HIPAA', 'Federal law that keeps patients’ health info private.'],
      ['OTC', 'Medicine you can buy without a prescription.'],
      ['Refill', 'More of the same prescription without a new doctor visit.'],
      ['PTCB exam', 'National test to become a certified pharmacy technician.'],
    ],
  },
  {
    id: 'it',
    name: 'IT Support Certificate',
    provider: 'Online certificate program',
    skill: 'itsupport',
    cost: 49,
    monthly: 49,
    sessions: 7,
    desc: '$49 a month until you finish. Finish fast, pay less.',
    cards: [
      ['IP address', 'The number that identifies a device on a network.'],
      ['Ticket', 'A logged help request in the IT queue.'],
      ['Password reset', 'The most common help desk call, by far.'],
      ['Router', 'Box that sends network traffic where it needs to go.'],
      ['Phishing', 'Fake email trying to steal a login.'],
      ['Reboot', 'Turning it off and on again. Fixes a shocking amount.'],
    ],
  },
  {
    id: 'books-free',
    name: 'Bookkeeping I',
    provider: 'Valley Community College (free with a workforce grant)',
    skill: 'bookkeeping',
    cost: 0,
    sessions: 7,
    desc: 'Free, thorough, and slow. Homework every week.',
    cards: [
      ['Debit', 'Left side of a ledger entry.'],
      ['Credit', 'Right side of a ledger entry.'],
      ['Invoice', 'A bill you send a customer.'],
      ['Reconcile', 'Match your records to the bank statement.'],
      ['Accounts payable', 'Money the business owes others.'],
      ['Receipt', 'Proof you paid. Keep it.'],
    ],
  },
  {
    id: 'books-cert',
    name: 'QuickBooks Certified User',
    provider: 'Online prep + exam',
    skill: 'bookkeeping',
    cost: 150,
    sessions: 4,
    desc: 'Faster, software-focused, with a certificate employers recognize.',
    cards: [
      ['Debit', 'Left side of a ledger entry.'],
      ['Credit', 'Right side of a ledger entry.'],
      ['Invoice', 'A bill you send a customer.'],
      ['Reconcile', 'Match your records to the bank statement.'],
      ['Accounts payable', 'Money the business owes others.'],
      ['Receipt', 'Proof you paid. Keep it.'],
    ],
  },
  {
    id: 'osha10',
    name: 'OSHA 10 Safety',
    provider: 'OSHA-authorized online trainer',
    skill: 'osha10',
    cost: 79,
    sessions: 2,
    free: (p) => p === 'trade',
    desc: 'Ten hours of safety training. Lots of cartoon people falling off ladders.',
    cards: [
      ['Fall protection', 'Harness and rails when you’re working up high.'],
      ['Lockout/tagout', 'Lock a machine’s power off before you fix it.'],
      ['PPE', 'Safety gear: vest, boots, gloves, glasses.'],
      ['SDS', 'Sheet that explains a chemical’s hazards.'],
      ['Three points', 'Two hands and a foot (or the reverse) on a ladder.'],
      ['Near miss', 'An almost-accident. Report it anyway.'],
    ],
  },
  {
    id: 'cdl',
    name: 'CDL Permit Prep',
    provider: 'DMV handbook + practice tests ($45 permit fee)',
    skill: 'cdl',
    cost: 45,
    sessions: 3,
    needsLicense: true,
    desc: 'Study for the commercial learner’s permit. You need a regular license first.',
    cards: [
      ['Air brakes', 'Big-truck brakes that run on compressed air.'],
      ['Pre-trip', 'Full inspection before you drive the truck.'],
      ['Hours of service', 'Rules on how long a trucker can drive.'],
      ['Gross weight', 'Truck plus everything loaded on it.'],
      ['Jackknife', 'Trailer swings around to face the cab.'],
      ['Logbook', 'Record of driving and rest time.'],
    ],
  },
  {
    id: 'spanish',
    name: 'Workplace Spanish',
    provider: 'Free language app + library conversation group',
    skill: 'spanish',
    cost: 0,
    sessions: 6,
    desc: 'Free. The owl is very persistent.',
    cards: [
      ['¿En qué le ayudo?', 'How can I help you?'],
      ['Por favor', 'Please.'],
      ['La receta', 'The prescription.'],
      ['El recibo', 'The receipt.'],
      ['Un momento', 'One moment.'],
      ['Con gusto', 'Happy to help.'],
    ],
  },
  {
    id: 'lead',
    name: 'Team Lead Training',
    provider: 'Valley Community College weekend workshop',
    skill: 'leadership',
    cost: 75,
    sessions: 3,
    desc: 'How to run a shift, give feedback, and not be a jerk about it.',
    cards: [
      ['Delegate', 'Hand a task to the right person and trust them with it.'],
      ['Feedback', 'Tell someone how they’re doing, kindly and specifically.'],
      ['One-on-one', 'Regular private check-in with a team member.'],
      ['Huddle', 'Two-minute team meeting before a shift.'],
      ['Onboarding', 'Getting a new hire trained and settled.'],
      ['Coverage', 'Making sure every shift has enough people.'],
    ],
  },
];

export const COURSE_BY_ID: Record<string, Course> = Object.fromEntries(COURSES.map((c) => [c.id, c]));
