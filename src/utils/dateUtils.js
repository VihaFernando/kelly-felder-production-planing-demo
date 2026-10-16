import { addDays, differenceInCalendarDays, format, isValid, parseISO, startOfWeek } from 'date-fns';

/** All business dates are stored as ISO day strings (yyyy-MM-dd) to avoid timezone drift. */
export const ISO = 'yyyy-MM-dd';

export function toISO(date) {
  return isValid(date) ? format(date, ISO) : null;
}

export function fromISO(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const d = parseISO(iso);
  return isValid(d) ? d : null;
}

export function isValidISO(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso || '') && fromISO(iso) !== null;
}

export function todayISO() {
  return format(new Date(), ISO);
}

export function addDaysISO(iso, n) {
  const d = fromISO(iso);
  return d ? format(addDays(d, n), ISO) : iso;
}

export function diffDays(a, b) {
  const da = fromISO(a);
  const db = fromISO(b);
  if (!da || !db) return 0;
  return differenceInCalendarDays(da, db);
}

export function eachDay(startIso, count) {
  const start = fromISO(startIso);
  if (!start) return [];
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = format(addDays(start, i), ISO);
  return out;
}

export function weekday(iso) {
  const d = fromISO(iso);
  return d ? d.getDay() : 0;
}

export function startOfWeekISO(iso) {
  const d = fromISO(iso);
  return d ? format(startOfWeek(d, { weekStartsOn: 1 }), ISO) : iso;
}

export function fmtDate(iso, pattern = 'dd MMM yyyy') {
  const d = fromISO(iso);
  return d ? format(d, pattern) : '—';
}

export function fmtShort(iso) {
  return fmtDate(iso, 'dd MMM');
}

export function fmtDateTime(ts) {
  const d = new Date(ts);
  return isValid(d) ? format(d, 'dd MMM yyyy, HH:mm') : '—';
}

export function minIso(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

export function maxIso(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}
