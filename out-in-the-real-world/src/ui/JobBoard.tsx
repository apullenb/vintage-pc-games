// The job board (local listings you can apply to) and your resume (skills, course, experience).
import { useState } from 'react';
import { courseProgress, currentCourse, dropCourse, pendingJob, setApplyTarget } from '../content/careers.ts';
import { LISTING_BY_ID, SCHEDULE_LABEL, boardCloses, boardFor, experience, fitFor, hasCar, offerWage, reference, tenure, tuitionAfter, type Listing } from '../content/jobs.ts';
import { SKILLS, hasSkill, skillName } from '../content/skills.ts';
import { money, num } from '../engine/core.ts';
import type { GameState } from '../engine/types.ts';
import { Icon, Modal } from './common.tsx';
import './jobboard.css';

type Tab = 'jobs' | 'resume';

const perMonth = (wage: number, hours: number): number => Math.round(wage * hours * 4.33);

function Req({ ok, text, note }: { ok: boolean; text: string; note?: string }) {
  return (
    <li className={ok ? 'ok' : 'miss'}>
      <span aria-hidden="true">{ok ? '✓' : '✗'}</span> {text}
      {note && <small> {note}</small>}
      <span className="sr-only">{ok ? ' (you have this)' : ' (missing)'}</span>
    </li>
  );
}

function statusOf(g: GameState, l: Listing): string | null {
  if (g.flags.newJobId === l.id) return `You accepted! Starting week ${num(g, 'newJobAt')}.`;
  if (g.flags.offerFor === l.id) return 'Offer on the table.';
  if (g.flags.interviewFor === l.id) {
    const a = g.appointments.find((x) => x.kind === 'jobint');
    return a ? `Interview booked: week ${a.week}, ${a.slot}.` : 'Interview coming up.';
  }
  return null;
}

function ListingCard({ g, l, setG }: { g: GameState; l: Listing; setG: (g: GameState) => void }) {
  const fit = fitFor(g, l);
  const wage = offerWage(g, l);
  const now = g.job ? perMonth(g.job.wage, g.job.hours) : 0;
  const month = perMonth(wage, l.hours);
  const diff = month - now;
  const picked = g.flags.applyTo === l.id;
  const referred = g.flags.referral === l.id;
  const status = statusOf(g, l);
  const pending = pendingJob(g);
  const blocked = g.path === 'trade' ? 'Mid-apprenticeship' : pending && !status ? 'One application at a time' : null;
  const n = l.needs;
  return (
    <article className={`jb-card ${picked ? 'picked' : ''} ${fit.ok && !l.scam ? 'fits' : ''}`} aria-label={`${l.title} at ${l.place}`}>
      <div className="jb-head">
        <div>
          <h3>{l.title}</h3>
          <span className="muted">{l.place}</span>
        </div>
        <div className="jb-pay">
          <strong>{money(wage, true)}</strong>
          <small>/hr</small>
          {g.job && <span className={`jb-diff ${diff >= 0 ? 'up' : 'down'}`}>{`${diff >= 0 ? '+' : '−'}${money(Math.abs(diff))}/mo`}</span>}
        </div>
      </div>
      <div className="tags">
        <span className="tag">{l.hours} hrs/wk</span>
        <span className={`tag ${l.health ? 'good' : ''}`}>{l.health ? `Health plan` : 'No health plan'}</span>
        {l.match > 0 && <span className="tag good">{Math.round(l.match * 100)}% 401(k) match</span>}
        <span className={`tag ${l.schedule === 'days' ? '' : 'warn'}`}>{SCHEDULE_LABEL[l.schedule]}</span>
        {l.commute > 0 && <span className={`tag ${l.bus ? '' : 'warn'}`}>{l.bus ? `${l.commute} min · bus OK` : `${l.commute} min · car only`}</span>}
        {l.tuition !== undefined && <span className="tag good">Tuition help</span>}
      </div>
      <p className="jb-blurb">{l.blurb}</p>
      {l.perk && <p className="muted small">{l.perk}</p>}
      <ul className="jb-reqs" aria-label="Requirements">
        {!l.scam && !n.skills && !n.license && !n.exp && !n.ref && l.bus && <Req ok text="No experience needed" />}
        {l.scam && <Req ok text="No experience needed!" />}
        {(n.skills ?? []).map((k) => (
          <Req key={k} ok={hasSkill(g, k)} text={skillName(k)} />
        ))}
        {n.license && <Req ok={!!g.flags.license} text="Driver’s license" />}
        {n.clean && <Req ok={!num(g, 'ticketPoints')} text="Clean driving record" />}
        {!l.bus && <Req ok={hasCar(g)} text="A car" note="(no bus out there)" />}
        {n.exp && <Req ok={experience(g) >= n.exp || referred} text={`${n.exp} weeks’ work experience`} note={`(you: ${experience(g)})`} />}
        {n.ref && <Req ok={reference(g) >= n.ref || referred} text={`Reference: boss rating ${n.ref}+`} note={`(you: ${reference(g) || 'none'})`} />}
        {l.prefer && !(l.prefer === 'spanish' && l.bilingual) && <li className={hasSkill(g, l.prefer) ? 'ok' : 'nice'}>{hasSkill(g, l.prefer) ? '✓' : '+'} {skillName(l.prefer)} <small>(preferred)</small></li>}
        {l.bilingual && <li className={hasSkill(g, 'spanish') ? 'ok' : 'nice'}>{hasSkill(g, 'spanish') ? '✓' : '+'} Spanish <small>(+{money(l.bilingual, true)}/hr)</small></li>}
        {fit.hard.filter((h) => h.startsWith('Finish') || h.startsWith('Fits')).map((h) => (
          <Req key={h} ok={false} text={h} />
        ))}
      </ul>
      {referred && <p className="jb-note good">Rae referred you here.</p>}
      {status ? (
        <p className="jb-note">{status}</p>
      ) : (
        <div className="jb-actions">
          {picked ? (
            <>
              <span className="jb-picked">★ Picked. Plan “Apply” in an evening or weekend slot.</span>
              <button className="btn small ghost" onClick={() => setG(setApplyTarget(g, null))}>
                Unpick
              </button>
            </>
          ) : (
            <button className="btn small" disabled={!!blocked} onClick={() => setG(setApplyTarget(g, l.id))}>
              {blocked ?? 'Apply this week'}
            </button>
          )}
          {!fit.ok && !l.scam && !blocked && <span className="muted small">You can apply, but expect a no.</span>}
        </div>
      )}
    </article>
  );
}

function Resume({ g, setG }: { g: GameState; setG: (g: GameState) => void }) {
  const c = currentCourse(g);
  const ref = reference(g);
  const after = tuitionAfter(g);
  const owned = SKILLS.filter((k) => hasSkill(g, k.id));
  const rest = SKILLS.filter((k) => !hasSkill(g, k.id));
  return (
    <div className="jb-resume">
      <section>
        <h3>Experience</h3>
        {g.job ? (
          <p>
            <strong>{g.job.title}</strong>, {g.job.place} · {money(g.job.wage, true)}/hr · {g.job.hours} hrs/wk
            <br />
            <span className="muted small">
              {tenure(g)} weeks here · {experience(g)} weeks working total
            </span>
          </p>
        ) : (
          <p>Between jobs. {experience(g)} weeks of work experience.</p>
        )}
        <p className="small">
          Best reference: {g.flags.burned && !ref ? 'none (you quit without notice)' : ref ? `${ref}/100${g.job && tenure(g) >= 4 && ref === g.stats.rep ? ' (your boss)' : ' (your last boss)'}` : 'not yet (your boss barely knows you)'}
          {after !== null && g.job && <> · {g.job.place} pays tuition after {after} weeks{tenure(g) >= after ? ' (you qualify)' : ` (${after - tenure(g)} to go)`}</>}
        </p>
      </section>
      <section>
        <h3>Course</h3>
        {c ? (
          <div className="jb-course">
            <p>
              <strong>{c.name}</strong> <span className="muted small">{c.provider}</span>
            </p>
            <div className="jb-meter" role="progressbar" aria-valuemin={0} aria-valuemax={c.sessions} aria-valuenow={courseProgress(g)} aria-label="Course sessions">
              {Array.from({ length: c.sessions }, (_, i) => (
                <span key={i} className={i < courseProgress(g) ? 'on' : ''} />
              ))}
            </div>
            <p className="small">
              {courseProgress(g)}/{c.sessions} sessions · Earns {skillName(c.skill)}
              {c.saturday ? ' · Saturdays only' : ''}
              {c.monthly ? ` · ${money(c.monthly)}/month` : ''}
            </p>
            <button
              className="btn small ghost"
              onClick={() => {
                if (confirm(`Drop ${c.name}? You lose your progress and get no refund.`)) setG(dropCourse(g));
              }}
            >
              Drop course
            </button>
          </div>
        ) : (
          <p className="small">No course right now. Plan “Take an online course” in an evening or weekend slot.</p>
        )}
      </section>
      <section>
        <h3>Skills ({owned.length})</h3>
        <ul className="jb-skills">
          {owned.map((k) => (
            <li key={k.id} className="have">
              <span aria-hidden="true">✓</span>
              <span>
                <strong>{k.name}</strong>
                <small>{k.desc}</small>
              </span>
            </li>
          ))}
          {rest.map((k) => (
            <li key={k.id}>
              <span aria-hidden="true">·</span>
              <span>
                <strong>{k.name}</strong>
                <small>Get it: {k.how}</small>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function JobBoard({ g, setG, onClose }: { g: GameState; setG: (g: GameState) => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('jobs');
  const board = boardFor(g);
  const fits = board.filter((l) => !l.scam && fitFor(g, l).ok).length;
  const startAt = LISTING_BY_ID[String(g.flags.newJobId ?? '')];
  return (
    <Modal title="Job Board" onClose={onClose} wide>
      <div className="jb-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'jobs'} className={`pill ${tab === 'jobs' ? 'on' : ''}`} onClick={() => setTab('jobs')}>
          <Icon name="search" size={12} /> Listings ({board.length})
        </button>
        <button role="tab" aria-selected={tab === 'resume'} className={`pill ${tab === 'resume' ? 'on' : ''}`} onClick={() => setTab('resume')}>
          <Icon name="docs" size={12} /> My resume ({(g.skills ?? []).length} skills)
        </button>
      </div>
      {tab === 'jobs' ? (
        <>
          <p className="small jb-intro">
            {startAt
              ? `You start at ${startAt.place} in week ${num(g, 'newJobAt')}. Enjoy your last days.`
              : g.path === 'trade'
                ? 'You’re mid-apprenticeship, so switching jobs isn’t on the table this year. Look around anyway.'
                : `You qualify for ${fits} of ${board.length}. Pick one, then plan “Apply for a job” in an evening or weekend.`}{' '}
            <span className="muted">New listings week {boardCloses(g.week) + 1}.</span>
          </p>
          <div className="jb-list">
            {board.map((l) => (
              <ListingCard key={l.id} g={g} l={l} setG={setG} />
            ))}
          </div>
        </>
      ) : (
        <Resume g={g} setG={setG} />
      )}
    </Modal>
  );
}
