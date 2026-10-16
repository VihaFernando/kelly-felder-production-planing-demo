const nf = new Intl.NumberFormat('en-US');

export function fmtNum(n) {
  const v = Number(n);
  return Number.isFinite(v) ? nf.format(Math.round(v)) : '—';
}

export function fmtCompact(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(Math.round(v));
}

export function fmtPct(n, digits = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? `${v.toFixed(digits)}%` : '—';
}

export function pct(part, whole) {
  return whole > 0 ? (part / whole) * 100 : 0;
}

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function plural(n, word, pluralWord) {
  return `${fmtNum(n)} ${n === 1 ? word : pluralWord || word + 's'}`;
}
