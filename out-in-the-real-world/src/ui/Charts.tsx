// Week-by-week progress charts for the Money screen. Plain inline SVG, no libraries.
import { useState } from 'react';
import { creditLabel, money } from '../engine/core.ts';
import type { GameState } from '../engine/types.ts';

type Row = GameState['history'][number];

const VW = 320; // viewBox width
const VH = 130;
const ML = 46; // room for y labels
const MR = 6;
const MT = 8;
const MB = 20; // room for x labels
const PW = VW - ML - MR;
const PH = VH - MT - MB;

function niceStep(span: number): number {
  const raw = span / 3;
  const mag = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

// Map a pointer position on the SVG to a week index.
function indexAt(e: React.PointerEvent<SVGSVGElement>, n: number): number {
  const r = e.currentTarget.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * VW;
  return Math.max(0, Math.min(n - 1, Math.floor(((x - ML) / PW) * n)));
}

export function HistoryCharts({ history }: { history: Row[] }) {
  const [sel, setSel] = useState<number | null>(null);
  if (history.length < 1)
    return (
      <div className="charts empty">
        <p className="muted small">Your week-by-week chart appears here after you finish your first week.</p>
      </div>
    );
  const n = history.length;
  const pick = sel ?? n - 1;
  const row = history[pick];
  const pointer = {
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => setSel(indexAt(e, n)),
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => setSel(indexAt(e, n)),
    onPointerLeave: (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.pointerType === 'mouse') setSel(null);
    },
  };
  const step = PW / n;
  const xMid = (i: number) => ML + step * i + step / 2;
  const xLabels = (
    <>
      <text x={xMid(0)} y={VH - 5} textAnchor={n === 1 ? 'middle' : 'start'} className="ax">
        Wk {history[0].week}
      </text>
      {n > 1 && (
        <text x={xMid(n - 1)} y={VH - 5} textAnchor="end" className="ax">
          Wk {history[n - 1].week}
        </text>
      )}
    </>
  );
  const cursor = <rect x={ML + step * pick} y={MT} width={step} height={PH} className="cursor" />;

  // ---- money you have: bars around a zero line ----
  const nets = history.map((h) => h.net);
  let lo = Math.min(0, ...nets);
  let hi = Math.max(0, ...nets);
  if (hi - lo < 100) hi = lo + 100;
  const ms = niceStep(hi - lo);
  lo = Math.floor(lo / ms) * ms;
  hi = Math.ceil(hi / ms) * ms;
  const y = (v: number) => MT + PH - ((v - lo) / (hi - lo)) * PH;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 0.001; v += ms) ticks.push(v);
  const barW = Math.max(2, Math.min(18, step - 2));

  // ---- credit score: a line with Fair / Good / Excellent bands ----
  const scores = history.map((h) => h.score);
  const known = scores.filter((s): s is number => s !== null);
  const cLo = Math.min(500, Math.floor((Math.min(...(known.length ? known : [600])) - 20) / 50) * 50);
  const cHi = 850;
  const cy = (v: number) => MT + PH - ((v - cLo) / (cHi - cLo)) * PH;
  const segs: string[] = [];
  let cur = '';
  scores.forEach((s, i) => {
    if (s === null) {
      if (cur) segs.push(cur);
      cur = '';
      return;
    }
    cur += `${cur ? 'L' : 'M'}${xMid(i).toFixed(1)},${cy(s).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  const bands = [
    { v: 580, label: 'Fair' },
    { v: 670, label: 'Good' },
    { v: 740, label: 'Great' },
  ].filter((b) => b.v > cLo);

  const first = history[0];
  const lastRow = history[n - 1];

  return (
    <div className="charts">
      <figure className="chart">
        <figcaption>
          <strong>Money you have</strong>
          <span className="chart-sub">checking + savings − card owed</span>
          <span className="readout">
            Week {row.week}: <b className={row.net < 0 ? 'neg' : ''}>{money(row.net)}</b>
          </span>
        </figcaption>
        <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`Money you have, week ${first.week}: ${money(first.net)}; week ${lastRow.week}: ${money(lastRow.net)}.`} {...pointer}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={ML} x2={VW - MR} y1={y(t)} y2={y(t)} className={t === 0 ? 'zero' : 'grid'} />
              <text x={ML - 4} y={y(t) + 4} textAnchor="end" className="ax">
                {money(t)}
              </text>
            </g>
          ))}
          {cursor}
          {history.map((h, i) => {
            const top = Math.min(y(h.net), y(0));
            const hgt = Math.max(1, Math.abs(y(h.net) - y(0)));
            return <rect key={h.week} x={xMid(i) - barW / 2} y={top} width={barW} height={hgt} rx={1} className={`bar-v ${h.net < 0 ? 'neg' : ''} ${i === pick ? 'on' : ''}`} />;
          })}
          {xLabels}
        </svg>
      </figure>
      <figure className="chart">
        <figcaption>
          <strong>Credit score</strong>
          <span className="chart-sub">300 to 850, higher is better</span>
          <span className="readout">
            Week {row.week}: <b>{row.score ?? 'none yet'}</b>
            {row.score !== null && <> ({creditLabel(row.score)})</>}
          </span>
        </figcaption>
        <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={known.length ? `Credit score over time, latest ${known[known.length - 1]}.` : 'No credit score yet.'} {...pointer}>
          {bands.map((b) => (
            <g key={b.v}>
              <line x1={ML} x2={VW - MR} y1={cy(b.v)} y2={cy(b.v)} className="grid" />
              <text x={ML - 4} y={cy(b.v) + 4} textAnchor="end" className="ax">
                {b.v}
              </text>
              <text x={VW - MR - 2} y={cy(b.v) - 3} textAnchor="end" className="ax band">
                {b.label}
              </text>
            </g>
          ))}
          <line x1={ML} x2={VW - MR} y1={MT + PH} y2={MT + PH} className="zero" />
          {cursor}
          {segs.map((d, i) => (
            <path key={i} d={d} className="line" />
          ))}
          {scores.map((s, i) => (s === null ? null : <circle key={i} cx={xMid(i)} cy={cy(s)} r={i === pick ? 4.5 : 3} className={`dot ${i === pick ? 'on' : ''}`} />))}
          {!known.length && (
            <text x={ML + PW / 2} y={MT + PH / 2} textAnchor="middle" className="ax empty-note">
              No score yet
            </text>
          )}
          {xLabels}
        </svg>
      </figure>
      <details className="chart-table">
        <summary>Show as a table</summary>
        <table>
          <thead>
            <tr>
              <th>Week</th>
              <th>Money you have</th>
              <th>Credit</th>
              <th>Energy</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.week}>
                <td>{h.week}</td>
                <td className={h.net < 0 ? 'neg' : ''}>{money(h.net)}</td>
                <td>{h.score ?? '—'}</td>
                <td>{h.energy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
