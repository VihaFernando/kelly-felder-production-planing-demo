import { fromISO, weekday } from '../utils/dateUtils';

/**
 * Capacity rules (simplified demo assumption, pending client confirmation):
 *   available minutes  = available operators (MOS) × working minutes per operator
 *   capacity (pieces)  = available minutes × planned efficiency ÷ style SMV
 */

export const DEFAULT_CALENDAR_ID = 'cal-std';

/** Build lookup indexes once per data snapshot; every capacity/scheduling call uses this context. */
export function buildContext(data, today) {
  const by = (arr) => Object.fromEntries((arr || []).map((x) => [x.id, x]));
  const exceptions = new Map();
  for (const ex of data.calendarExceptions || []) {
    exceptions.set(`${ex.scopeType}:${ex.scopeId || '*'}:${ex.date}`, ex);
  }
  const workforce = new Map();
  for (const w of data.workforce || []) workforce.set(`${w.lineId}:${w.year}:${w.month}`, w);
  return {
    data,
    today,
    plants: by(data.plants),
    lines: by(data.lines),
    shifts: by(data.shifts),
    calendars: by(data.calendars),
    styles: by(data.styles),
    orders: by(data.orders),
    buyers: by(data.buyers),
    // Efficiency ladder levels, ordered by the production day they start on.
    levels: [...(data.efficiencyLevels || [])].sort((a, b) => a.startDay - b.startDay || a.percent - b.percent),
    exceptions,
    workforce,
    settings: data.settings || {},
    cache: new Map(),
  };
}

export function calendarIdForLine(ctx, line) {
  if (!line) return DEFAULT_CALENDAR_ID;
  const plant = ctx.plants[line.plantId];
  return line.calendarId || plant?.calendarId || DEFAULT_CALENDAR_ID;
}

/**
 * Resolve the working day for a line on a date.
 * Precedence: line exception → plant exception → company-wide exception → weekly calendar pattern.
 */
export function getDayInfo(ctx, line, iso) {
  const key = `${line?.id}:${iso}`;
  const hit = ctx.cache.get(key);
  if (hit) return hit;

  const ex =
    ctx.exceptions.get(`line:${line?.id}:${iso}`) ||
    ctx.exceptions.get(`plant:${line?.plantId}:${iso}`) ||
    ctx.exceptions.get(`all:*:${iso}`);

  let info;
  if (ex) {
    const shift = ctx.shifts[ex.shiftId];
    const minutes = ex.type === 'holiday' ? 0 : Number.isFinite(+ex.minutes) && ex.minutes !== '' ? +ex.minutes : shift?.minutes ?? 0;
    info = { minutes, type: ex.type, shiftName: shift?.name || '', note: ex.note || '', exception: true };
  } else {
    const cal = ctx.calendars[calendarIdForLine(ctx, line)] || ctx.calendars[DEFAULT_CALENDAR_ID];
    const shiftId = cal?.week?.[weekday(iso)] || null;
    const shift = shiftId ? ctx.shifts[shiftId] : null;
    const active = shift && shift.status !== 'inactive';
    const minutes = active ? shift.minutes : 0;
    let type = 'working';
    if (!minutes) type = 'off';
    else if (shift.kind === 'half') type = 'halfday';
    info = { minutes, type, shiftName: shift?.name || 'No shift', note: '', exception: false };
  }
  ctx.cache.set(key, info);
  return info;
}

/** Operators available on a line in the month containing `iso`. Never silently assumes a full workforce. */
export function getOperators(ctx, line, iso) {
  const d = fromISO(iso);
  if (!d || !line) return { count: 0, source: 'none', record: null };
  const rec = ctx.workforce.get(`${line.id}:${d.getFullYear()}:${d.getMonth() + 1}`);
  if (rec) return { count: Number(rec.mos) || 0, source: 'workforce', record: rec };
  if (ctx.settings.useLineDefaultWhenNoWorkforce !== false && line.defaultOperators > 0) {
    return { count: Number(line.defaultOperators), source: 'default', record: null };
  }
  return { count: 0, source: 'none', record: null };
}

export function dailyCapacity(ctx, line, iso, smv, efficiency) {
  const day = getDayInfo(ctx, line, iso);
  const ops = getOperators(ctx, line, iso);
  const minutes = day.minutes * ops.count;
  const pcs = smv > 0 && efficiency > 0 ? Math.floor((minutes * (efficiency / 100)) / smv) : 0;
  return { day, operators: ops.count, operatorSource: ops.source, availableMinutes: minutes, pcs };
}

/** Ladder rules: first level starts on day 1, start days are unique, efficiency never drops as days progress. */
export function validateLadder(levels) {
  if (!levels.length) return 'The ladder needs at least one level.';
  const sorted = [...levels].sort((a, b) => a.startDay - b.startDay);
  if (sorted[0].startDay !== 1) return 'The first level must apply from day 1.';
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startDay === sorted[i - 1].startDay) return `Two levels start on day ${sorted[i].startDay}.`;
    if (sorted[i].percent < sorted[i - 1].percent) return `Efficiency cannot drop from ${sorted[i - 1].percent}% to ${sorted[i].percent}% on day ${sorted[i].startDay}.`;
  }
  return null;
}
