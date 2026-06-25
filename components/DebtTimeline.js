'use client';

import { useRef, useState } from 'react';
import { inr, inrShort } from '@/lib/format';

/* ─── Layout ────────────────────────────────────────────────────────────── */
const PAD_T   = 16;
const PAD_B   = 50;   // room for x-axis labels (rotated in monthly view)
const PAD_L   = 62;   // room for y-axis labels
const PAD_R   = 16;
const CHART_H = 130;  // drawable area height
const SVG_H   = PAD_T + CHART_H + PAD_B;
const GRID_N  = 4;    // number of horizontal gridlines

/* Bar group widths (pixels per period) */
const BGW_Q = 54;  // quarterly
const BGW_M = 38;  // monthly

/* ─── Colours ───────────────────────────────────────────────────────────── */
const C_ADDED   = '#A32D2D';
const C_CLEARED = '#0F6E56';
const C_LINE    = '#3B6FD4';
const C_AXIS    = '#D6D1C0';
const C_MUTE    = '#8A9490';
const C_GRID    = '#EDE9DF';

/* ─── Helpers ───────────────────────────────────────────────────────────── */
function niceMax(raw) {
  if (!raw || raw <= 0) return 100000;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  return Math.ceil(raw / p) * p;
}

/**
 * Aggregate events into period buckets (monthly or quarterly).
 * Returns { periods, quarterly } where each period has:
 *   { period, added, cleared, outstanding, evts }
 */
function buildPeriods(events) {
  if (!events?.length) return { periods: [], quarterly: false };

  // Aggregate by calendar month "YYYY-MM"
  const byM = {};
  for (const ev of events) {
    if (!ev.date) continue;
    const k = ev.date.slice(0, 7);
    if (!byM[k]) byM[k] = { added: 0, cleared: 0, evts: [] };
    if (ev.type === 'added') byM[k].added += ev.principal || 0;
    else byM[k].cleared += ev.amount || 0;
    byM[k].evts.push(ev);
  }

  // Fill every month from the earliest event to today
  const todayM = new Date().toISOString().slice(0, 7);
  const minM   = Object.keys(byM).sort()[0];
  const months = [];
  let cur = new Date(minM + '-01T00:00:00Z');
  const end = new Date(todayM + '-01T00:00:00Z');
  while (cur <= end) {
    const k = cur.toISOString().slice(0, 7);
    months.push({ period: k, ...(byM[k] ?? { added: 0, cleared: 0, evts: [] }) });
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }

  // Compute running cumulative outstanding (debt added → up, cleared → down)
  let running = 0;
  for (const m of months) {
    running = Math.max(0, running + m.added - m.cleared);
    m.outstanding = running;
  }

  // Monthly view for ≤24 months, quarterly for longer spans
  if (months.length <= 24) return { periods: months, quarterly: false };

  // Collapse into quarters keyed "YYYY-Q#"
  const byQ = {};
  for (const m of months) {
    const [yr, mo] = m.period.split('-').map(Number);
    const qk = `${yr}-Q${Math.ceil(mo / 3)}`;
    if (!byQ[qk]) byQ[qk] = { period: qk, added: 0, cleared: 0, evts: [], outstanding: 0 };
    byQ[qk].added += m.added;
    byQ[qk].cleared += m.cleared;
    byQ[qk].evts.push(...m.evts);
    byQ[qk].outstanding = m.outstanding; // use end-of-quarter value
  }

  const qArr = Object.entries(byQ)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);

  return { periods: qArr, quarterly: true };
}

function fmtPeriodLabel(period, quarterly) {
  if (quarterly) {
    const [yr, q] = period.split('-');
    return `${q} ${yr}`;
  }
  const [yr, mo] = period.split('-').map(Number);
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${M[mo - 1]} '${String(yr).slice(2)}`;
}

/* ─── Component ─────────────────────────────────────────────────────────── */
export default function DebtTimeline({ events }) {
  const containerRef = useRef(null);
  const [tooltip, setTooltip]   = useState(null);

  if (!events?.length) return null;

  const { periods, quarterly } = buildPeriods(events);
  if (!periods.length) return null;

  const BGW   = quarterly ? BGW_Q : BGW_M;
  const BW    = Math.max(4, Math.floor(BGW * 0.27));  // individual bar width
  const BGAP  = Math.max(2, Math.floor(BGW * 0.07));  // gap between the two bars
  const WIDTH = Math.max(PAD_L + periods.length * BGW + PAD_R, 400);
  const baseY = PAD_T + CHART_H;

  // Y scale
  const rawMax = Math.max(1, ...periods.map((p) => Math.max(p.added, p.cleared, p.outstanding)));
  const yMax   = niceMax(rawMax);
  const scY    = (v) => PAD_T + CHART_H - Math.round((Math.min(v, yMax) / yMax) * CHART_H);

  // X helpers
  const grpX  = (i) => PAD_L + i * BGW;
  const midX  = (i) => grpX(i) + Math.floor(BGW / 2);
  const aBarX = (i) => grpX(i) + Math.floor((BGW - 2 * BW - BGAP) / 2);
  const cBarX = (i) => aBarX(i) + BW + BGAP;

  // Outstanding polyline
  const linePts = periods.map((p, i) => `${midX(i)},${scY(p.outstanding)}`).join(' ');

  function onEnter(period, e) {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setTooltip({
      period,
      absoluteX    : e.clientX - rect.left + containerRef.current.scrollLeft,
      absoluteY    : e.clientY - rect.top,
      scrollLeft   : containerRef.current.scrollLeft,
      visibleWidth : rect.width,
    });
  }

  return (
    <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
      {/* Header */}
      <div className="flex justify-between items-baseline mb-3">
        <h2 className="text-sm font-medium">Debt Overview</h2>
        <span className="text-[11px] text-ink-mute">
          {quarterly ? 'Quarterly' : 'Monthly'} · cumulative outstanding
        </span>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="relative overflow-x-auto">
        <svg
          width={WIDTH}
          height={SVG_H}
          aria-label="Debt overview chart"
          style={{ display: 'block' }}
        >
          {/* ── Y-axis gridlines + labels ── */}
          {Array.from({ length: GRID_N }, (_, gridIndex) => {
            const gridValue = ((gridIndex + 1) / GRID_N) * yMax;
            const y = scY(gridValue);
            return (
              <g key={gridIndex}>
                <line x1={PAD_L} y1={y} x2={WIDTH - PAD_R} y2={y}
                  stroke={C_GRID} strokeWidth="1" />
                <text x={PAD_L - 5} y={y + 4} textAnchor="end" fontSize="8.5" fill={C_MUTE}>
                  {inrShort(gridValue)}
                </text>
              </g>
            );
          })}

          {/* ── Zero label ── */}
          <text x={PAD_L - 5} y={baseY + 4} textAnchor="end" fontSize="8.5" fill={C_MUTE}>₹0</text>

          {/* ── Baseline ── */}
          <line x1={PAD_L} y1={baseY} x2={WIDTH - PAD_R} y2={baseY}
            stroke={C_AXIS} strokeWidth="1.5" />

          {/* ── Bars + x-axis labels per period ── */}
          {periods.map((p, i) => {
            const aH = p.added   > 0 ? Math.max(2, Math.round((p.added   / yMax) * CHART_H)) : 0;
            const cH = p.cleared > 0 ? Math.max(2, Math.round((p.cleared / yMax) * CHART_H)) : 0;
            const showLabel = quarterly || i % 3 === 0 || i === periods.length - 1;
            const lx = midX(i);
            const ly = baseY + 14;
            return (
              <g key={p.period}
                onMouseEnter={(e) => onEnter(p, e)}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: 'pointer' }}
                aria-label={fmtPeriodLabel(p.period, quarterly)}
              >
                {/* Invisible hover zone */}
                <rect x={grpX(i)} y={PAD_T} width={BGW} height={CHART_H} fill="transparent" />

                {/* Added bar (red) */}
                {aH > 0 && (
                  <rect x={aBarX(i)} y={baseY - aH} width={BW} height={aH}
                    fill={C_ADDED} opacity="0.85" rx="1.5" />
                )}

                {/* Cleared bar (green) */}
                {cH > 0 && (
                  <rect x={cBarX(i)} y={baseY - cH} width={BW} height={cH}
                    fill={C_CLEARED} opacity="0.85" rx="1.5" />
                )}

                {/* Tick mark */}
                <line x1={lx} y1={baseY} x2={lx} y2={baseY + 4} stroke={C_AXIS} strokeWidth="1" />

                {/* X-axis label */}
                {showLabel && (
                  quarterly ? (
                    <text x={lx} y={ly} textAnchor="middle" fontSize="8.5" fill={C_MUTE}>
                      {fmtPeriodLabel(p.period, true)}
                    </text>
                  ) : (
                    <text
                      x={lx} y={ly}
                      textAnchor="end" fontSize="8.5" fill={C_MUTE}
                      transform={`rotate(-35 ${lx} ${ly})`}
                    >
                      {fmtPeriodLabel(p.period, false)}
                    </text>
                  )
                )}
              </g>
            );
          })}

          {/* ── Outstanding line ── */}
          <polyline
            points={linePts}
            fill="none"
            stroke={C_LINE}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.9"
            style={{ pointerEvents: 'none' }}
          />

          {/* ── Dots on outstanding line ── */}
          {periods.map((p, i) =>
            p.outstanding > 0 ? (
              <circle key={`ld-${i}`}
                cx={midX(i)} cy={scY(p.outstanding)} r="3.5"
                fill={C_LINE} stroke="white" strokeWidth="1.5"
                style={{ pointerEvents: 'none' }}
              />
            ) : null,
          )}
        </svg>

        {/* ── Tooltip ── */}
        {tooltip && (() => {
          const tooltipWidth = 190;
          // Clamp tooltip horizontally within the visible viewport area
          let left = tooltip.absoluteX - tooltipWidth / 2;
          left = Math.max(tooltip.scrollLeft + 4, Math.min(left, tooltip.scrollLeft + tooltip.visibleWidth - tooltipWidth - 4));
          // Show above cursor; flip below if too close to top
          let top = tooltip.absoluteY - 10;
          const p = tooltip.period;
          return (
            <div
              className="absolute z-20 pointer-events-none bg-ink text-paper text-[11px] rounded-xl px-3 py-2.5 shadow-xl leading-relaxed"
              style={{ left, top, width: tooltipWidth, transform: 'translateY(-100%)' }}
            >
              <p className="font-semibold text-[12px] mb-1">
                {fmtPeriodLabel(p.period, quarterly)}
              </p>
              {p.added > 0 && (
                <p className="flex justify-between gap-2">
                  <span className="opacity-60">Added</span>
                  <span className="font-medium">{inr(p.added)}</span>
                </p>
              )}
              {p.cleared > 0 && (
                <p className="flex justify-between gap-2">
                  <span className="opacity-60">Cleared</span>
                  <span className="font-medium">{inr(p.cleared)}</span>
                </p>
              )}
              <p className="flex justify-between gap-2">
                <span className="opacity-60">Outstanding</span>
                <span className="font-medium">{inr(p.outstanding)}</span>
              </p>
              {p.evts?.length > 0 && (
                <p className="opacity-40 text-[10px] mt-1 truncate">
                  {[...new Set(p.evts.map((e) => e.lender_name))].join(' · ')}
                </p>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-5 mt-3 flex-wrap">
        <span className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <span className="w-3 h-3 rounded-sm bg-danger inline-block flex-shrink-0" />
          Debt added
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <span className="w-3 h-3 rounded-sm bg-mint-600 inline-block flex-shrink-0" />
          Debt cleared
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <span className="inline-block w-5 h-[2.5px] rounded bg-[#3B6FD4] align-middle flex-shrink-0" />
          Outstanding
        </span>
      </div>
    </section>
  );
}
