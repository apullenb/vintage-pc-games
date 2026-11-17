import { describe, expect, it } from 'vitest';
import { newState } from '../paths.ts';
import { shiftKind } from './shift.ts';

const look = { skin: 0, hair: 0, hairStyle: 0, shirt: 0 };

describe('Shift Rush follows your actual job', () => {
  it('matches each starting job', () => {
    expect(shiftKind(newState('A', look, 'home', 1))).toBe('home'); // Fresh Fields Market: checkout
    expect(shiftKind(newState('A', look, 'college', 1))).toBe('college'); // library
    expect(shiftKind(newState('A', look, 'trade', 1))).toBe('trade'); // job site
    expect(shiftKind(newState('A', look, 'work', 1))).toBe('work'); // warehouse
  });
  it('switches when your job changes', () => {
    const s = newState('A', look, 'college', 1);
    s.job = { ...s.job!, place: 'Fresh Fields Market', art: 'grocery' };
    expect(shiftKind(s)).toBe('home');
    s.job = { ...s.job, place: 'Hardware Hub', art: 'warehouse' };
    expect(shiftKind(s)).toBe('work');
  });
});
