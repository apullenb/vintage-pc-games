// Job skills and certifications: what goes on your resume. Some come from courses, some from experience.
import { inc, log } from '../engine/core.ts';
import type { GameState } from '../engine/types.ts';

export type SkillId =
  | 'service'
  | 'servsafe'
  | 'excel'
  | 'forklift'
  | 'cpht'
  | 'itsupport'
  | 'bookkeeping'
  | 'osha10'
  | 'cdl'
  | 'spanish'
  | 'leadership'
  | 'warehouse';

export interface Skill {
  id: SkillId;
  name: string;
  desc: string;
  how: string; // where it usually comes from
}

export const SKILLS: Skill[] = [
  { id: 'service', name: 'Customer Service', desc: 'Calm, friendly, and good at fixing other people’s bad days.', how: '8 weeks at a counter job, or a course' },
  { id: 'warehouse', name: 'Warehouse Ops', desc: 'Scanners, pick lists, pallets, and not dropping the fragile box.', how: '8 weeks at a warehouse' },
  { id: 'leadership', name: 'Leadership', desc: 'You’ve run a shift, trained a newbie, and survived it.', how: 'A promotion, or Team Lead training' },
  { id: 'servsafe', name: 'Food Safety (ServSafe)', desc: 'Temperatures, cross-contamination, and why you never thaw chicken on the counter.', how: 'ServSafe course' },
  { id: 'excel', name: 'Excel & Office', desc: 'Spreadsheets, formulas, and emails that don’t start with “hey.”', how: 'Library course or certification' },
  { id: 'forklift', name: 'Forklift Certification', desc: 'Certified to drive a forklift without starring in a safety video.', how: 'Saturday hands-on class' },
  { id: 'cpht', name: 'Pharmacy Tech (CPhT)', desc: 'National pharmacy technician certification.', how: 'Pharmacy tech course + exam' },
  { id: 'itsupport', name: 'IT Support Basics', desc: 'Networks, passwords, and “have you tried turning it off and on.”', how: 'IT support certificate' },
  { id: 'bookkeeping', name: 'Bookkeeping', desc: 'Debits, credits, and making the numbers match.', how: 'Community college or QuickBooks course' },
  { id: 'osha10', name: 'OSHA 10 Safety', desc: 'Ten hours of workplace safety. Hard hats are not a fashion choice.', how: 'OSHA 10 online course' },
  { id: 'cdl', name: 'CDL Permit', desc: 'Learner’s permit for commercial trucks. The first step to a CDL.', how: 'CDL permit prep (needs a license)' },
  { id: 'spanish', name: 'Spanish for Work', desc: 'Enough Spanish to help customers. Bilingual jobs often pay more.', how: 'Workplace Spanish course' },
];

export const SKILL_BY_ID: Record<string, Skill> = Object.fromEntries(SKILLS.map((k) => [k.id, k]));

export function skillName(id: string): string {
  return SKILL_BY_ID[id]?.name ?? id;
}

// Older saves have no skills list: treat it as empty.
export function skillsOf(s: GameState): string[] {
  return s.skills ?? [];
}

export function hasSkill(s: GameState, id: string): boolean {
  return skillsOf(s).includes(id);
}

// Adds a skill (once). Returns true if it was new.
export function addSkill(s: GameState, id: SkillId, why: string): boolean {
  if (hasSkill(s, id)) return false;
  s.skills = [...skillsOf(s), id];
  inc(s, 'skillsGained');
  s.flags.newSkillWeek = s.week;
  log(s, `New skill: ${skillName(id)}. ${why}`, 'good');
  return true;
}
