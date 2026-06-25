'use client';

import { useRef, useState } from 'react';
import { fmtDate, inr } from '@/lib/format';

/* ─── SVG layout constants ──────────────────────────────────────────────── */
const SVG_W = 1000;
const SVG_H = 170;
const PAD_X = 44;          // left/right padding inside SVG
const DRAW_W = SVG_W - PAD_X * 2;
const BASELINE_Y = 110;    // y of the horizontal axis rule
const DOT_R = 7;           // dot radius
const STACK_GAP = 20;      // vertical gap between stacked dots on same date
const TICK_H = 7;          // axis tick height

/* ─── Colour tokens (matches tailwind config) ────────────────────────────── */
const COLOR_ADDED   = '#A32D2D'; // danger
const COLOR_CLEARED = '#0F6E56'; // mint-600
const COLOR_AXIS    = '#E2DDCB'; // edge
const COLOR_MUTE    = '#7A867F'; // ink-mute

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function dateToMs(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function svgX(dateStr, minMs, rangeMs) {
  const ms = dateToMs(dateStr);
  if (ms === null || rangeMs <= 0) return PAD_X;
  const pct = Math.max(0, Math.min(1, (ms - minMs) / rangeMs));
  return PAD_X + pct * DRAW_W;
}

/** Return monthly or quarterly tick marks between minMs and todayMs. */
function buildTicks(minMs, todayMs) {
  const totalDays = (todayMs - minMs) / 86400000;
  const quarterly = totalDays > 540; // >18 months → quarterly

  const ticks = [];
  const start = new Date(minMs);
  let cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  while (cur.getTime() <= todayMs) {
    const mo = cur.getUTCMonth();
    const yr = cur.getUTCFullYear();
    if (!quarterly || mo % 3 === 0) {
      const label = quarterly
        ? `Q${Math.floor(mo / 3) + 1} ${yr}`
        : `${MONTHS[mo]} '${String(yr).slice(2)}`;
      ticks.push({ ms: cur.getTime(), label });
    }
    cur = new Date(Date.UTC(yr, mo + 1, 1));
  }
  return ticks;
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function DebtTimeline({ events }) {
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null); // { pixelX, pixelY, event }

  if (!events || events.length === 0) return null;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayMs  = dateToMs(todayStr);
  const allMs    = events.map((e) => dateToMs(e.date)).filter(Boolean);
  const minMs    = Math.min(...allMs);
  const rangeMs  = Math.max(todayMs - minMs, 86400000); // at least 1 day

  /* Group events by date so we can stack overlapping dots. */
  const byDate = new Map();
  for (const event of events) {
    if (!byDate.has(event.date)) byDate.set(event.date, []);
    byDate.get(event.date).push(event);
  }

  /* Build final dot list with stacked y-offsets. */
  const dots = [];
  for (const [date, group] of byDate) {
    const cx = svgX(date, minMs, rangeMs);
    group.forEach((event, i) => {
      dots.push({ event, cx, cy: BASELINE_Y - DOT_R - (i + 1) * STACK_GAP + STACK_GAP });
    });
  }

  const ticks = buildTicks(minMs, todayMs);
  const todaySvgX = PAD_X + DRAW_W; // always the right edge

  /* Tooltip open/close handlers */
  function handleEnter(dotInfo, e) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      pixelX: e.clientX - rect.left,
      pixelY: e.clientY - rect.top,
      info: dotInfo,
    });
  }
  function handleLeave() {
    setTooltip(null);
  }

  return (
    <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
      <div className="flex justify-between items-baseline mb-4">
        <h2 className="text-sm font-medium">Debt Lifecycle Timeline</h2>
        <span className="text-[11px] text-ink-mute">All debts · from first to today</span>
      </div>

      {/* SVG wrapper – overflow-x-auto lets it scroll on narrow screens */}
      <div ref={containerRef} className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full min-w-[400px]"
          aria-label="Debt lifecycle timeline"
          style={{ display: 'block' }}
        >
          {/* ── Baseline rule ── */}
          <line
            x1={PAD_X} y1={BASELINE_Y}
            x2={SVG_W - PAD_X} y2={BASELINE_Y}
            stroke={COLOR_AXIS} strokeWidth="2"
          />

          {/* ── Axis ticks + labels ── */}
          {ticks.map((tick, i) => {
            const tx = svgX(new Date(tick.ms).toISOString().slice(0, 10), minMs, rangeMs);
            if (tx > SVG_W - PAD_X - 16) return null; // skip if too close to "Today"
            return (
              <g key={i}>
                <line x1={tx} y1={BASELINE_Y} x2={tx} y2={BASELINE_Y + TICK_H} stroke={COLOR_AXIS} strokeWidth="1" />
                <text x={tx} y={BASELINE_Y + TICK_H + 11} textAnchor="middle" fontSize="9" fill={COLOR_MUTE}>
                  {tick.label}
                </text>
              </g>
            );
          })}

          {/* ── Today marker ── */}
          <line
            x1={todaySvgX} y1={BASELINE_Y - 34}
            x2={todaySvgX} y2={BASELINE_Y + TICK_H}
            stroke={COLOR_MUTE} strokeWidth="1.5" strokeDasharray="4 3"
          />
          <text x={todaySvgX} y={BASELINE_Y + TICK_H + 11} textAnchor="middle" fontSize="9" fill={COLOR_MUTE}>
            Today
          </text>

          {/* ── Drop lines from dot to baseline ── */}
          {dots.map(({ event, cx, cy }, i) => (
            <line
              key={`drop-${i}`}
              x1={cx} y1={cy + DOT_R}
              x2={cx} y2={BASELINE_Y}
              stroke={event.type === 'added' ? COLOR_ADDED : COLOR_CLEARED}
              strokeWidth="1" opacity="0.25"
            />
          ))}

          {/* ── Event dots ── */}
          {dots.map(({ event, cx, cy }, i) => {
            const fill = event.type === 'added' ? COLOR_ADDED : COLOR_CLEARED;
            return (
              <g
                key={`dot-${i}`}
                onMouseEnter={(e) => handleEnter({ event, cx, cy }, e)}
                onMouseLeave={handleLeave}
                style={{ cursor: 'pointer' }}
                role="img"
                aria-label={
                  event.type === 'added'
                    ? `${event.lender_name} added on ${event.date}`
                    : `${event.lender_name} cleared on ${event.date}`
                }
              >
                {/* Invisible larger hit target */}
                <circle cx={cx} cy={cy} r={DOT_R + 6} fill="transparent" />
                {/* Visible dot */}
                <circle cx={cx} cy={cy} r={DOT_R} fill={fill} opacity="0.9" />
                {/* Outer ring on cleared to make it visually distinct */}
                {event.type === 'cleared' && (
                  <circle cx={cx} cy={cy} r={DOT_R + 3} fill="none" stroke={fill} strokeWidth="1.5" opacity="0.4" />
                )}
                {/* Native tooltip fallback */}
                <title>
                  {event.lender_name}
                  {event.type === 'added'
                    ? ` · Debt added · ${event.date} · ${Math.round(event.principal || 0)}`
                    : ` · Cleared · ${event.date} · ${Math.round(event.amount || 0)}`}
                </title>
              </g>
            );
          })}
        </svg>

        {/* ── Hover tooltip overlay ── */}
        {tooltip && (
          <div
            className="absolute z-20 pointer-events-none bg-ink text-paper text-[11px] rounded-xl px-3 py-2.5 shadow-xl max-w-[190px] leading-relaxed"
            style={{
              left: tooltip.pixelX,
              top: tooltip.pixelY,
              transform: 'translate(-50%, calc(-100% - 12px))',
            }}
          >
            <p className="font-semibold truncate">{tooltip.info.event.lender_name}</p>
            <p className="text-ink-soft mt-0.5">
              {tooltip.info.event.type === 'added' ? '🔴 Debt added' : '🟢 Cleared'}
            </p>
            <p className="text-ink-soft">{fmtDate(tooltip.info.event.date)}</p>
            <p className="font-medium mt-0.5">
              {inr(tooltip.info.event.type === 'added'
                ? tooltip.info.event.principal
                : tooltip.info.event.amount)}
            </p>
            {tooltip.info.event.category && (
              <p className="text-ink-mute">{tooltip.info.event.category}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-5 mt-3 flex-wrap">
        <span className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <span className="w-3 h-3 rounded-full bg-danger inline-block flex-shrink-0" />
          Debt added
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <span className="w-3 h-3 rounded-full bg-mint-600 inline-block flex-shrink-0 ring-1 ring-mint-600 ring-offset-1" />
          Debt cleared
        </span>
      </div>

      {/* ── Note ── */}
      <p className="text-[11px] text-ink-mute mt-2 leading-relaxed">
        Dates represent when a debt was recorded (red) or when a full clearance payment was made (green). Partial payments are not shown.
        Dots on the same date are stacked vertically.
      </p>
    </section>
  );
}
