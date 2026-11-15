import { describe, expect, it } from 'vitest';
import { newState } from '../content/paths.ts';
import { playGame } from './bot.ts';
import { CREDIT_WAIT, canPay, charge, creditScore, pay } from './core.ts';
import { begin, payBills } from './engine.ts';

const fresh = () => newState('Test', { skin: 0, hair: 0, hairStyle: 0, shirt: 0 }, 'work', 1);

describe('money rules', () => {
  it('overdrafting checking costs $35 when opted in, and is declined when opted out', () => {
    const s = fresh();
    s.stats.cash = 20;
    expect(canPay(s, 50, 'checking').ok).toBe(true);
    pay(s, 50, 'checking', 'Test');
    expect(s.stats.cash).toBe(20 - 50 - 35);
    const t = fresh();
    t.overdraftOptIn = false;
    t.stats.cash = 20;
    expect(canPay(t, 50, 'checking').ok).toBe(false);
  });

  it('unavoidable charges fall back to savings, then the card', () => {
    const s = fresh();
    s.stats.cash = 10;
    s.stats.savings = 100;
    expect(charge(s, 60, 'Fine')).toBe('savings');
    s.stats.savings = 0;
    s.card = { name: 'C', kind: 'secured', limit: 300, apr: 0.24, balance: 0, deposit: 300, openedWeek: 1 };
    expect(charge(s, 60, 'Fine')).toBe('card');
    expect(s.card.balance).toBe(60);
  });

  it('no credit score until there is some history', () => {
    const s = fresh();
    expect(creditScore(s)).toBeNull();
    s.credit.firstWeek = 1;
    s.week = 1 + CREDIT_WAIT;
    expect(creditScore(s)).not.toBeNull();
  });

  it('paying a card in full avoids interest; carrying a balance does not', () => {
    const s = begin(fresh());
    s.card = { name: 'C', kind: 'secured', limit: 300, apr: 0.24, balance: 200, deposit: 300, openedWeek: 1 };
    s.queue = [{ t: 'billsDue', bills: [{ id: 'card', label: 'Card', amount: 200, minimum: 25, kind: 'card' }] }];
    const full = payBills(s, { card: { amount: 200, method: 'checking' } });
    expect(full.card?.balance).toBe(0);
    expect(full.flags.cardCarry).toBe(false);
    const min = payBills(s, { card: { amount: 25, method: 'checking' } });
    expect(min.card?.balance).toBe(175);
    expect(min.flags.cardCarry).toBe(true);
    const late = payBills(s, { card: null });
    expect(late.credit.late).toBe(1);
  });

  it('missing rent twice ends the game', () => {
    let s = begin(fresh());
    s.queue = [{ t: 'billsDue', bills: [{ id: 'rent', label: 'Rent', amount: 725, kind: 'housing' }] }, { t: 'summary' }];
    s = payBills(s, { rent: null });
    expect(s.housing.missed).toBe(1);
    s.queue = [{ t: 'billsDue', bills: [{ id: 'rent', label: 'Rent', amount: 725, kind: 'housing' }] }, { t: 'summary' }];
    s = payBills(s, { rent: null });
    expect(s.queue.some((q) => q.t === 'gameOver')).toBe(true);
  });
});

describe('determinism', () => {
  it('the same seed and choices play out the same way', () => {
    const a = playGame('college', 99, 'wise');
    const b = playGame('college', 99, 'wise');
    expect(a.s.stats).toEqual(b.s.stats);
    expect(a.steps).toBe(b.steps);
  });
});
