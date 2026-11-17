// Achievements, unlocked as you play.
import { achieve, creditScore, num } from '../engine/core.ts';
import type { GameState } from '../engine/types.ts';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'licensed', name: 'Licensed', desc: 'Survived the DMV and passed your driving test.', icon: 'car' },
  { id: 'fafsa', name: 'Aid Secured', desc: 'Submitted the FAFSA on time.', icon: 'docs' },
  { id: 'wheels', name: 'Wheels', desc: 'Bought your first car.', icon: 'car' },
  { id: 'movedout', name: 'Keys to the Castle', desc: 'Signed your own lease.', icon: 'home' },
  { id: 'budgeter', name: 'Budget Boss', desc: 'Made a budget and set up automatic savings.', icon: 'chart' },
  { id: 'taxes', name: 'Taxpayer', desc: 'Filed your own taxes.', icon: 'docs' },
  { id: 'levelup', name: 'Level Up', desc: 'Hit your big career milestone.', icon: 'star' },
  { id: 'roadtrip', name: 'Promise Kept', desc: 'Went on the road trip with Rae.', icon: 'heart' },
  { id: 'scamdodger', name: 'Scam Dodger', desc: 'Didn’t fall for the fake delivery text.', icon: 'shield' },
  { id: 'raise', name: 'Ask and Receive', desc: 'Asked for a raise and got it.', icon: 'money' },
  { id: 'investor', name: 'Future Millionaire', desc: 'Opened a retirement account.', icon: 'chart' },
  { id: 'efund500', name: 'Cushion', desc: 'Saved $500 in your emergency fund.', icon: 'piggy' },
  { id: 'efund2k', name: 'Rainy Day Ready', desc: 'Saved $2,000.', icon: 'piggy' },
  { id: 'credit700', name: 'Creditworthy', desc: 'Reached a 700 credit score.', icon: 'card' },
  { id: 'nooverdraft', name: 'Never Overdrawn', desc: 'Finished 12 weeks without an overdraft fee.', icon: 'shield' },
  { id: 'paidfull', name: 'Paid in Full', desc: 'Paid your credit card in full 3 times.', icon: 'card' },
  { id: 'chef', name: 'Meal Prep Master', desc: 'Cooked your own food 6 weeks.', icon: 'food' },
  { id: 'rested', name: 'Work-Life Balance', desc: 'Finished the year without burning out.', icon: 'rest' },
  { id: 'rehired', name: 'Back on Your Feet', desc: 'Got a new job after losing one.', icon: 'work' },
  { id: 'promoted', name: 'Moving Up', desc: 'Earned a promotion by picking up extra shifts.', icon: 'star' },
  { id: 'debtfree', name: 'Debt-Free', desc: 'Finished with no credit card or car debt.', icon: 'star' },
  { id: 'auditor', name: 'Read Every Line', desc: 'Caught a mistake on a bill or a paycheck.', icon: 'docs' },
  { id: 'lockeddown', name: 'Locked Down', desc: 'Froze your credit after identity theft.', icon: 'shield' },
  { id: 'depositback', name: 'Spotless Record', desc: 'Got your whole security deposit back.', icon: 'home' },
  { id: 'deanslist', name: 'Dean’s List', desc: 'Earned a 3.5 GPA or better for a semester.', icon: 'star' },
  { id: 'intern', name: 'Hired Intern', desc: 'Landed a summer internship.', icon: 'work' },
  { id: 'selfemployed', name: 'Self-Employed', desc: 'Paid your gig taxes on time.', icon: 'money' },
];

export function checkAchievements(s: GameState): void {
  if (s.stats.savings >= 500) achieve(s, 'efund500');
  if (s.stats.savings >= 2000) achieve(s, 'efund2k');
  if ((creditScore(s) ?? 0) >= 700) achieve(s, 'credit700');
  if (s.week >= 12 && num(s, 'overdrafts') === 0) achieve(s, 'nooverdraft');
  if (num(s, 'cardPaidFull') >= 3) achieve(s, 'paidfull');
  if (num(s, 'cookWeeks') >= 6) achieve(s, 'chef');
  if (s.won && num(s, 'burnouts') === 0) achieve(s, 'rested');
  if (s.won && (s.card?.balance ?? 0) < 1 && !s.loans.some((l) => l.kind !== 'student' && l.balance > 0)) achieve(s, 'debtfree');
}
