import { diffDays } from '../../utils/dateUtils';

export const LEFT_WIDTH = 248;
export const LANE_HEIGHT = 30; // compact lane height (many lines)
export const LANE_HEIGHT_MAX = 46; // lanes grow up to this when few lines fill the screen
export const ROW_PAD = 6;

export const RANGE_PRESETS = [
  { id: '2w', label: '2 weeks', days: 14, dayWidth: 64 },
  { id: '1m', label: '1 month', days: 31, dayWidth: 38 },
  { id: '3m', label: '3 months', days: 91, dayWidth: 26 },
];

export const TONE_CLASSES = {
  blue: { bar: 'bg-blue-50 border-blue-500 text-blue-950', accent: 'bg-blue-500', ghost: 'border-blue-500 bg-blue-500/10' },
  green: { bar: 'bg-emerald-50 border-emerald-500 text-emerald-950', accent: 'bg-emerald-500', ghost: 'border-emerald-500 bg-emerald-500/10' },
  amber: { bar: 'bg-amber-50 border-amber-500 text-amber-950', accent: 'bg-amber-500', ghost: 'border-amber-500 bg-amber-500/10' },
  red: { bar: 'bg-red-50 border-red-500 text-red-950', accent: 'bg-red-500', ghost: 'border-red-500 bg-red-500/10' },
  gray: { bar: 'bg-slate-100 border-slate-400 text-slate-700', accent: 'bg-slate-400', ghost: 'border-slate-400 bg-slate-400/10' },
};

export const TONE_LABEL = { blue: 'Scheduled', green: 'Completed', amber: 'At risk', red: 'Critical', gray: 'Incomplete info' };

/** Single colour rule for allocation blocks, derived from the shared scheduling analysis. */
export function blockTone(summary, entry) {
  if (summary?.status === 'completed') return 'green';
  if (entry.level === 'critical') return 'red';
  if (entry.plan.incomplete) return 'gray';
  if (entry.level === 'warning' || summary?.reasons.some((r) => r.code === 'behind')) return 'amber';
  return 'blue';
}

/** Greedy lane assignment so overlapping allocations on one line stay visible. */
export function assignLanes(items) {
  const lanes = [];
  const sorted = [...items].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  for (const it of sorted) {
    let lane = lanes.findIndex((end) => end < it.start);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(it.end);
    } else lanes[lane] = it.end;
    it.lane = lane;
  }
  return Math.max(1, lanes.length);
}

export function spanInRange(start, end, rangeStart, days) {
  const s = diffDays(start, rangeStart);
  const e = diffDays(end, rangeStart);
  if (e < 0 || s >= days) return null;
  return { from: Math.max(0, s), to: Math.min(days - 1, e), clippedLeft: s < 0, clippedRight: e >= days };
}
