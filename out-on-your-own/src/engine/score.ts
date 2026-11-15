// Final scoring and the ending you earned.
import { CHAPTERS } from '../content/chapters.ts';
import { badDebt, creditScore, netWorth, num } from './core.ts';
import type { GameState } from './types.ts';

export interface ScoreLine {
  label: string;
  value: string;
  points: number;
  max: number;
}

export interface FinalScore {
  total: number;
  grade: string;
  title: string;
  lines: ScoreLine[];
  epilogue: string[];
}

const pts = (v: number, max: number): number => Math.max(0, Math.min(max, Math.round(v)));
const usd = (v: number): string => `$${Math.round(v).toLocaleString('en-US')}`;

export function finalScore(s: GameState): FinalScore {
  const sc = creditScore(s);
  const stars = s.chapterStars.reduce((a, b) => a + (b ?? 0), 0);
  const misses = num(s, 'rentMissed') + s.credit.late;
  const lines: ScoreLine[] = [
    { label: 'Mission stars', value: `${stars} / ${CHAPTERS.length * 3}`, points: pts((stars / (CHAPTERS.length * 3)) * 300, 300), max: 300 },
    { label: 'Emergency fund', value: usd(s.stats.savings), points: pts((s.stats.savings / 2000) * 150, 150), max: 150 },
    { label: 'Debt (cards & loans)', value: usd(badDebt(s)), points: pts(150 - (s.card?.balance ?? 0) / 8 - (badDebt(s) - (s.card?.balance ?? 0)) / 60, 150), max: 150 },
    { label: 'Credit score', value: sc === null ? 'None' : String(sc), points: sc === null ? 0 : pts(((sc - 550) / 200) * 100, 100), max: 100 },
    { label: 'Retirement savings', value: usd(s.retire), points: pts((s.retire / 1500) * 50, 50), max: 50 },
    { label: 'Bills paid on time', value: misses ? `${misses} missed` : 'All of them', points: pts(100 - misses * 25 - num(s, 'overdrafts') * 5, 100), max: 100 },
    { label: 'Career milestone', value: s.flags.careerDone ? 'Achieved' : 'Not yet', points: s.flags.careerDone ? 100 : 0, max: 100 },
    { label: 'Well-being', value: num(s, 'burnouts') ? `${num(s, 'burnouts')} burnout${num(s, 'burnouts') > 1 ? 's' : ''}` : 'No burnouts', points: pts(50 - num(s, 'burnouts') * 25, 50), max: 50 },
  ];
  const total = lines.reduce((a, l) => a + l.points, 0);
  const grade = total >= 900 ? 'A+' : total >= 820 ? 'A' : total >= 720 ? 'B' : total >= 600 ? 'C' : total >= 480 ? 'D' : 'F';
  const title =
    total >= 860 ? 'Thriving Adult' : total >= 720 ? 'Doing Great' : total >= 600 ? 'Holding It Together' : total >= 480 ? 'Scraping By' : 'Still Figuring It Out';
  return { total, grade, title, lines, epilogue: epilogue(s) };
}

function epilogue(s: GameState): string[] {
  const out: string[] = [];
  const career = !!s.flags.careerDone;
  switch (s.path) {
    case 'home':
      out.push(career ? 'You work as a pharmacy technician now, with benefits and a schedule that makes sense.' : 'You’re still at the register, but you know exactly what you want next.');
      out.push(s.housing.kind === 'parents' ? 'You still live at home, and you’ve saved more than almost anyone you know.' : 'You moved out and learned how much toilet paper actually costs.');
      break;
    case 'college': {
      out.push(career ? 'Sophomore year starts with your scholarship intact and a plan for your major.' : 'Your scholarship shrank, but you’re still enrolled and studying smarter.');
      const owed = s.loans.filter((l) => l.kind === 'student').reduce((a, l) => a + l.balance, 0);
      out.push(owed > 0 ? `You owe ${usd(owed)} in student loans, and you know exactly what that means now.` : 'You have no student loans. Rare!');
      break;
    }
    case 'trade':
      out.push(career ? 'You’re a Year 2 apprentice, on track to be a licensed electrician in three more years.' : 'You’re repeating Year 1, but you know the code book better than ever.');
      out.push('Dee still calls you “kid,” but now it sounds like respect.');
      break;
    case 'work':
      out.push(career ? 'You’re Team Lead at ParcelPoint. You train new hires, and you tell them to take the 401(k) match.' : 'Still on the warehouse floor, but your boss knows your name now.');
      out.push(s.flags.roommate === 'priya' ? 'You and Priya renewed the lease. The roommate agreement is laminated.' : 'Your apartment finally feels like home.');
      break;
  }
  out.push(s.stats.savings >= 1000 ? 'You have a real emergency fund. Surprises are annoying, not terrifying.' : 'Your savings are thin. Year two goal: build that cushion.');
  if ((s.card?.balance ?? 0) > 500) out.push('That credit card balance is following you into year two. Interest never sleeps.');
  out.push(s.flags.roadTrip ? 'You and Rae still talk about the coast trip. You’re already planning the next one.' : 'Rae’s already planning the next road trip. You’re going this time.');
  out.push(`Net worth after one year: ${usd(netWorth(s))}.`);
  return out;
}
