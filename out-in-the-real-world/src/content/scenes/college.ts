// College scenes: picking a major, assignments, exams, report cards, and what good grades unlock.
import { achieve, charge, energy, inc, log, minigame, money, rep, scene, xp } from '../../engine/core.ts';
import type { GameState, MajorId } from '../../engine/types.ts';
import {
  COURSES,
  MAJORS,
  MAJOR_IDS,
  TERMS,
  courseOf,
  ensureSchool,
  examPrep,
  freeSkips,
  gpa,
  gpaText,
  hwPrep,
  hwScore,
  letterOf,
  liveGpa,
  noise,
  pickMajor,
  turnIn,
  type HwMode,
} from '../college.ts';
import type { Choice, Data, Scene } from '../types.ts';

const school = (s: GameState) => ensureSchool(s)!;
const courseAt = (s: GameState, d: Data) => {
  const sc = school(s);
  return sc.courses[Number(d.c) || 0] ?? sc.courses[0];
};
const hwTitle = (s: GameState, d: Data): string => courseOf(courseAt(s, d)).hw[Number(d.k) < 4 ? 0 : 1];

// Sims spread across majors (by seed) so every major gets balance-tested.
const botMajor = (s: GameState, id: MajorId): number => (MAJOR_IDS[Math.abs(s.seed) % MAJOR_IDS.length] === id ? 3 : 0);

const majorChoice = (id: MajorId): Choice => ({
  label: MAJORS[id].name,
  hint: MAJORS[id].hint,
  hide: (_s, d) => !!d.declare && id === 'undeclared',
  bot: (s) => botMajor(s, id),
  do: (s) => pickMajor(s, id),
  result: (_s, d) =>
    d.declare
      ? `You declare ${MAJORS[id].name}. Your spring schedule changes to match. Starting a semester late means you’ll be catching up for a while.`
      : `${MAJORS[id].pick}\n\nYour classes: ${MAJORS[id].fall.map((c) => COURSES[c].name).join(', ')}.`,
});

function hwChoice(mode: HwMode): Choice {
  return {
    label: mode === 'well' ? 'Do it right' : 'Rush it the night before',
    hint: (s, d) => {
      const est = hwScore(s, school(s), Number(d.c) || 0, mode);
      return mode === 'well' ? `✓ Likely ${letterOf(est)} · ✗ −10 energy` : `✓ Likely ${letterOf(est)} · −4 energy`;
    },
    bot: (s) => (mode === 'well' ? (s.stats.energy > 18 ? 3 : 0) : 1),
    do: (s, d) => {
      const sc = school(s);
      const c = Number(d.c) || 0;
      const score = Math.round(hwScore(s, sc, c, mode) + noise(s, 3));
      energy(s, mode === 'well' ? -10 : -4);
      if (mode === 'well') xp(s, 2);
      turnIn(s, c, score);
      d.score = score;
    },
    result: (s, d) => {
      const n = Number(d.score);
      const msg = n >= 90 ? 'The professor wrote “Excellent!” with an actual exclamation point.' : n >= 80 ? 'Solid work. A couple of red marks, nothing scary.' : n >= 70 ? 'It’s… fine. The comments say “develop this further.”' : 'The red ink is winning.';
      return `${courseOf(courseAt(s, d)).short}: ${n}% (${letterOf(n)}). ${msg}`;
    },
  };
}

export const COLLEGE_SCENES: Scene[] = [
  // Saves from before grades existed may be paused on the old finals scene.
  {
    id: 'beat-finals',
    title: 'Finals week',
    art: 'library',
    kind: 'story',
    steps: { start: { text: 'Finals start tomorrow.', choices: [{ label: 'Let’s do this', do: (s) => scene(s, 'col-exam', { exam: 'final' }) }] } },
  },
  {
    id: 'col-major',
    title: (_s, d) => (d?.declare ? 'Declare your major' : 'Pick a major'),
    art: 'campus',
    speaker: 'advisor',
    kind: 'story',
    steps: {
      start: {
        text: (_s, d) =>
          d.declare
            ? 'Your advisor taps the red pen on your file. “Spring registration closes Friday. Undeclared isn’t an option anymore. What’s it going to be?”'
            : 'Orientation, table 4. An advisor with a lanyard full of pins slides you a form.\n\n“Your major decides your classes, your lab fees, and how much you’ll study. You can switch later. It just costs time.”',
        choices: MAJOR_IDS.map(majorChoice),
      },
    },
  },
  {
    id: 'col-hw',
    title: (s, d) => `Due Friday: ${courseOf(courseAt(s, d)).short}`,
    art: 'library',
    kind: 'event',
    steps: {
      start: {
        text: (s, d) => {
          const sc = school(s);
          const p = hwPrep(s, sc);
          return `${courseOf(courseAt(s, d)).name}: “${hwTitle(s, d)}” is due Friday. It’s worth real points.\n\nStudy sessions since your last assignment: ${p}. Energy: ${s.stats.energy}.`;
        },
        choices: [
          hwChoice('well'),
          hwChoice('rush'),
          {
            label: 'Have an AI write the whole thing',
            hint: '✓ Zero effort · ✗ Professors check, and getting caught means a zero',
            bot: -2,
            do: (s, d) => {
              const sc = school(s);
              const caught = noise(s, 1) > 0.4; // about 30%
              if (caught) {
                turnIn(s, Number(d.c) || 0, 0);
                rep(s, -10);
                sc.aiCaught = (sc.aiCaught ?? 0) + 1;
                if (sc.aiCaught >= 2) sc.probation = true;
                d.caught = 1;
              } else {
                turnIn(s, Number(d.c) || 0, 76);
                sc.extraPrep = Math.max(0, sc.extraPrep - 0.5); // you didn't learn it
                d.caught = 0;
              }
              inc(s, 'aiEssays');
            },
            result: (s, d) =>
              d.caught
                ? `Caught. The professor ran it through a checker and quoted a paragraph back to you in office hours. Zero on the assignment${(school(s).aiCaught ?? 0) >= 2 ? ', and a second strike puts you on academic probation' : ', and a warning in your file'}.`
                : 'It got a 76. Weirdly bland, but it passed. You learned nothing, which will matter on the exam.',
          },
          {
            label: 'Skip it',
            hint: '✓ Free night · ✗ A zero in the gradebook',
            bot: -3,
            do: (s, d) => {
              turnIn(s, Number(d.c) || 0, 0);
              energy(s, 4);
            },
            result: 'A zero. It sits in the gradebook like a pothole.',
          },
        ],
      },
    },
  },
  {
    id: 'col-exam',
    title: (_s, d) => (d?.exam === 'final' ? 'Finals week' : 'Midterms'),
    art: 'lecture',
    speaker: 'advisor',
    kind: 'story',
    steps: {
      start: {
        text: (s, d) => {
          const sc = school(s);
          const need = MAJORS[sc.major].need;
          const prep = Math.floor(examPrep(s, sc) * 2) / 2;
          const missed = sc.courses[0]?.missed ?? 0;
          return `${d.exam === 'final' ? 'Finals' : 'Midterms'} start tomorrow: ${sc.courses.length} classes, one long week. ${d.exam === 'final' ? 'Worth 35% of every grade.' : 'Worth 25% of every grade.'}\n\nStudy sessions since the last exam: ${prep} of ${need}. Classes skipped: ${missed}. Energy: ${s.stats.energy}.\n\nThe night before…`;
        },
        choices: [
          {
            label: 'Pull an all-nighter',
            hint: '✓ Counts as a study session · ✗ −25 energy (tired brains blank on tests)',
            bot: (s) => {
              const sc = school(s);
              return examPrep(s, sc) < MAJORS[sc.major].need && s.stats.energy > 60 ? 3 : -1;
            },
            do: (s, d) => {
              school(s).extraPrep += 1;
              energy(s, -25);
              inc(s, 'allNighters');
              minigame(s, 'flashcards', { exam: String(d.exam) });
            },
          },
          {
            label: 'Review once, then sleep 8 hours',
            hint: '✓ +10 energy · Counts as half a study session',
            bot: 2,
            do: (s, d) => {
              school(s).extraPrep += 0.5;
              energy(s, 10);
              minigame(s, 'flashcards', { exam: String(d.exam) });
            },
          },
          {
            label: 'Go out. You’ll wing it.',
            hint: '✓ +8 energy · ✗ About $25 · ✗ No review at all',
            bot: -2,
            do: (s, d) => {
              charge(s, 25, 'Night out');
              energy(s, 8);
              minigame(s, 'flashcards', { exam: String(d.exam) });
            },
          },
        ],
      },
    },
  },
  {
    id: 'col-report',
    title: (s) => `${school(s).done[school(s).done.length - 1]?.name ?? ''} report card`,
    art: 'dorm',
    kind: 'story',
    steps: {
      start: {
        text: (s) => {
          const sc = school(s);
          const t = sc.done[sc.done.length - 1];
          if (!t) return 'Grades are posted.';
          const lines = t.grades.map((g) => `${(COURSES[g.id]?.name ?? g.id)}: ${g.letter}`).join('\n');
          const notes: string[] = [];
          if (t.gpa >= 3.5) notes.push('DEAN’S LIST. A $250 scholarship bonus is on its way.');
          if (t.grades.some((g) => g.letter === 'F')) notes.push('An F means taking the class again, and paying for it again.');
          if (sc.probation) notes.push(`ACADEMIC PROBATION. You only get ${freeSkips(sc)} free skip per class now. Raise your GPA or lose your aid.`);
          const year = t.name === TERMS[TERMS.length - 1].name;
          if (year) notes.push(s.flags.careerDone ? `Year GPA: ${gpaText(gpa(s))}. Your scholarship renews!` : `Year GPA: ${gpaText(gpa(s))}. Under 3.0, so your scholarship gets cut.`);
          const mood = t.gpa >= 3.5 ? 'You refresh the page three times to make sure it’s real.' : t.gpa >= 3.0 ? 'Solid. You screenshot it for your mom.' : t.gpa >= 2.0 ? 'You close the tab. Then open it again. Still a C.' : 'You stare at it for a long time.';
          return `${t.name} grades are posted.\n\n${lines}\n\nSemester GPA: ${gpaText(t.gpa)} · Credits: ${t.earned} of ${t.attempted}\n${mood}${notes.length ? `\n\n${notes.join('\n')}` : ''}`;
        },
        choices: [
          {
            label: 'Time to declare a major',
            hide: (s) => school(s).major !== 'undeclared' || school(s).done.length >= TERMS.length,
            bot: 1,
            do: (s) => scene(s, 'col-major', { declare: 1 }),
          },
          {
            label: (s) => ((school(s).done[school(s).done.length - 1]?.gpa ?? 0) >= 3.0 ? 'Send it to the family group chat' : 'Close the laptop'),
            hide: (s) => school(s).major === 'undeclared' && school(s).done.length < TERMS.length,
            bot: 1,
            do: (s) => {
              if (gpa(s) !== null && (gpa(s) ?? 0) >= 3.0) energy(s, 6);
            },
          },
        ],
      },
    },
  },
  {
    id: 'col-job',
    title: 'Better campus job',
    art: (s) => MAJORS[school(s).major].job.art,
    kind: 'offer',
    speaker: 'boss',
    steps: {
      start: {
        text: (s) => {
          const j = MAJORS[school(s).major].job;
          return `Your Dean’s List email got around. ${j.place} wants you as a ${j.title}: ${money(j.wage, true)}/hr instead of ${money(s.job?.wage ?? 16, true)}, same 15 hours, and it looks great on a résumé.`;
        },
        choices: [
          {
            label: 'Take it',
            hint: (s) => `✓ +${money(((MAJORS[school(s).major].job.wage - (s.job?.wage ?? 16)) * 15 * 2), true)} per paycheck before taxes · ✓ Real experience`,
            bot: 3,
            do: (s) => {
              const j = MAJORS[school(s).major].job;
              if (s.job) s.job = { ...s.job, title: j.title, place: j.place, wage: j.wage, art: j.art };
              rep(s, 3);
              xp(s, 3);
              inc(s, 'betterJob');
            },
            result: (s) => `You’re now a ${s.job?.title}. The library gives you a going-away cookie.`,
          },
          {
            label: 'Stay at the library',
            hint: '✓ Quiet shifts where you can study',
            bot: 0,
            result: 'You stay. The library is quiet, and quiet is underrated.',
          },
        ],
      },
    },
  },
  {
    id: 'col-intern',
    title: 'Summer internship',
    art: 'office',
    speaker: 'hr',
    kind: 'offer',
    steps: {
      start: {
        text: (s) => {
          const sc = school(s);
          return `Career fair. A recruiter looks at your ${gpaText(liveGpa(s))} GPA and your ${MAJORS[sc.major].name} major and actually perks up.\n\n“We have a ${MAJORS[sc.major].intern.title}. It’s paid. Want an interview?”`;
        },
        choices: [
          {
            label: 'Interview in a thrift-store blazer: $25',
            pay: 25,
            hint: '✓ Look the part · ✓ Very likely to land it',
            bot: 3,
            do: (s) => {
              const sc = school(s);
              sc.internship = MAJORS[sc.major].intern.title;
              achieve(s, 'intern');
              xp(s, 4);
            },
            result: (s) => `You got it! Your ${school(s).internship} starts in June. The blazer is now your lucky blazer.`,
            tip: 'Internships are often the fastest path to a first job. Many companies hire their interns after graduation.',
          },
          {
            label: 'Interview in your hoodie',
            hint: '✓ Free · ✗ First impressions are a thing',
            bot: 0,
            do: (s, d) => {
              d.got = noise(s, 1) > 0.2 ? 1 : 0;
              if (d.got) {
                const sc = school(s);
                sc.internship = MAJORS[sc.major].intern.title;
                achieve(s, 'intern');
              }
            },
            result: (_s, d) => (d.got ? 'They liked your answers more than your outfit. You got it!' : '“We’ll be in touch.” They are not in touch.'),
          },
          { label: 'Not this year', bot: -1, result: 'Maybe next year. The free pens were nice, though.' },
        ],
      },
    },
  },
  {
    id: 'col-summer',
    title: 'Summer class',
    art: 'campus',
    speaker: 'advisor',
    kind: 'offer',
    steps: {
      start: {
        text: 'Your advisor mentions the summer session: one online class, 3 credits, $350 after your aid.\n\n“A degree is 120 credits, so 15 a semester gets you out in four years. Bank a few now and a bad semester later won’t push graduation back. Every extra semester is more tuition and a later first paycheck.”',
        choices: [
          {
            label: 'Sign up: $350',
            pay: 350,
            hint: '✓ +3 credits toward graduating on time · ✗ $350 now',
            bot: (s) => (s.stats.savings > 2400 ? 2 : -1),
            do: (s) => {
              const sc = school(s);
              sc.extraCredits = (sc.extraCredits ?? 0) + 3;
              xp(s, 3);
              log(s, 'Signed up for a summer class: +3 credits banked.', 'good');
            },
            result: 'Enrolled. Future you graduates sooner. Present you is a little broke.',
            tip: 'Summer and community college classes can cost far less per credit. Check that the credits transfer first.',
          },
          { label: 'Take the summer off', bot: 1, result: 'Summer is for working and sleeping. Both count.' },
        ],
      },
    },
  },
];
