import { addDaysISO, diffDays, fromISO, todayISO } from '../utils/dateUtils';
import { buildContext } from './capacityService';
import { nextWorkingDay, planAllocation } from './schedulingService';
import { DEFAULT_MILESTONE_TYPES, generateFromTemplate } from './milestoneService';

/** Deterministic PRNG so the demo looks the same every reset (relative to today's date). */
function rng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

const PLANTS = [
  ['K-01', 'Katunayake Plant 1', 'Katunayake EPZ', 3, 'cal-std'],
  ['K-02', 'Katunayake Plant 2', 'Katunayake EPZ', 3, 'cal-std'],
  ['NTM', 'Nittambuwa', 'Nittambuwa', 3, 'cal-std'],
  ['NTM-EXT', 'Nittambuwa Extension', 'Nittambuwa', 2, 'cal-std'],
  ['YKL', 'Yakkala', 'Yakkala', 2, 'cal-std'],
  ['KDW', 'Kadawatha', 'Kadawatha', 3, 'cal-std'],
  ['BYG', 'Biyagama', 'Biyagama EPZ', 3, 'cal-6day'],
  ['MTL', 'Matale', 'Matale', 2, 'cal-5day'],
  ['KGL', 'Kegalle', 'Kegalle', 2, 'cal-5day'],
  ['PLN', 'Polonnaruwa', 'Polonnaruwa', 2, 'cal-5day'],
  ['HRN', 'Horana', 'Horana', 3, 'cal-std'],
  ['WTL', 'Wattala (closed for refurbishment)', 'Wattala', 2, 'cal-std'],
];

// Efficiency ladder: planned efficiency by production day after a style changeover (last level holds).
const EFFICIENCY_LEVELS = [
  ['Day 1 — set-up & learning', 35, 1],
  ['Day 2 — ramp-up', 40, 2],
  ['Day 3 — ramp-up', 45, 3],
  ['Day 4+ — standard', 50, 4],
];

const BUYERS = [
  ['NVA', 'Northvale Apparel', 'United Kingdom'],
  ['MLN', 'Maison Lune', 'France'],
  ['HNP', 'Harbor & Pine', 'United States'],
  ['KST', 'Kestrel Active', 'Australia'],
  ['OST', 'Ostra Basics', 'Germany'],
  ['FLD', 'Fieldline Outfitters', 'United States'],
];

// code, description, buyer index, category, smv, template
const STYLES = [
  ['NV-DR-2041', 'Wrap midi dress, viscose print', 0, 'Dresses', 24.5, 'tpl-full'],
  ['NV-TP-1180', 'Jersey crew-neck top', 0, 'Tops', 9.8, 'tpl-repeat'],
  ['NV-SK-3302', 'Pleated midi skirt', 0, 'Skirts', 16.2, 'tpl-basic'],
  ['ML-DR-0912', 'Linen shirt dress', 1, 'Dresses', 28.4, 'tpl-full'],
  ['ML-BL-0455', 'Silk-touch blouse', 1, 'Tops', 18.6, 'tpl-basic'],
  ['HP-SH-7710', 'Oxford button-down shirt', 2, 'Shirts', 21.3, 'tpl-basic'],
  ['HP-TR-7802', 'Chino trouser, slim', 2, 'Trousers', 26.0, 'tpl-basic'],
  ['HP-SH-7725', 'Printed camp-collar shirt', 2, 'Shirts', 22.8, 'tpl-full'],
  ['KS-TP-5501', 'Performance tank top', 3, 'Tops', 8.4, 'tpl-repeat'],
  ['KS-TR-5620', 'Jogger pant, brushed', 3, 'Trousers', 19.5, 'tpl-basic'],
  ['OS-TP-2203', 'Basic long-sleeve tee', 4, 'Tops', 10.6, 'tpl-repeat'],
  ['OS-DR-2290', 'Jersey T-shirt dress', 4, 'Dresses', 14.9, 'tpl-repeat'],
  ['OS-SK-2315', 'A-line denim skirt', 4, 'Skirts', 20.7, 'tpl-basic'],
  ['FL-TR-4410', 'Utility cargo trouser', 5, 'Trousers', 31.5, 'tpl-basic'],
  ['FL-SH-4402', 'Flannel overshirt', 5, 'Shirts', 27.2, 'tpl-full'],
  ['ML-SK-0470', 'Satin slip skirt', 1, 'Skirts', 15.4, 'tpl-full'],
];

const PEOPLE = [
  ['p-fab', 'Nadeesha Perera', 'Fabric Sourcing'],
  ['p-trm', 'Shehan de Silva', 'Trims & Accessories'],
  ['p-prt', 'Ayesha Fonseka', 'Print & Embellishment'],
  ['p-smp', 'Kavindi Jayasuriya', 'Sample Room'],
  ['p-mer', 'Roshan Abeywickrama', 'Merchandising'],
  ['p-cut', 'Gayan Karunaratne', 'Cutting'],
  ['p-prd', 'Upeksha Rajapaksha', 'Production'],
  ['p-pln', 'Tharaka Nuwan', 'Central Planning'],
];

const OWNER = { fabric: 'p-fab', trims: 'p-trm', print: 'p-prt', sample: 'p-smp', pp_approval: 'p-mer', cutting: 'p-cut', sewing: 'p-prd', production_start: 'p-prd', production_completion: 'p-prd' };

const TEMPLATES = [
  {
    id: 'tpl-full', name: 'Printed style (full path)', steps: [
      { type: 'fabric', offset: -26 }, { type: 'trims', offset: -18 }, { type: 'sample', offset: -22 },
      { type: 'print', offset: -12, dependsOn: ['fabric'] }, { type: 'pp_approval', offset: -10, dependsOn: ['sample'] },
      { type: 'cutting', offset: -4, dependsOn: ['fabric', 'print', 'pp_approval'] }, { type: 'sewing', offset: -1, dependsOn: ['cutting', 'trims'] },
      { type: 'production_start', offset: 0, dependsOn: ['sewing'] }, { type: 'production_completion', offset: 10 },
    ],
  },
  {
    id: 'tpl-basic', name: 'Standard (no print)', steps: [
      { type: 'fabric', offset: -22 }, { type: 'trims', offset: -16 }, { type: 'pp_approval', offset: -10 },
      { type: 'cutting', offset: -4, dependsOn: ['fabric', 'pp_approval'] }, { type: 'sewing', offset: -1, dependsOn: ['cutting', 'trims'] },
      { type: 'production_start', offset: 0, dependsOn: ['sewing'] }, { type: 'production_completion', offset: 10 },
    ],
  },
  {
    id: 'tpl-repeat', name: 'Repeat style (short path)', steps: [
      { type: 'fabric', offset: -18 }, { type: 'trims', offset: -12 }, { type: 'cutting', offset: -3, dependsOn: ['fabric'] },
      { type: 'production_start', offset: 0, dependsOn: ['cutting'] }, { type: 'production_completion', offset: 8 },
    ],
  },
].map((t) => ({ ...t, steps: t.steps.map((s) => ({ ...s, responsibleId: OWNER[s.type] })) }));

export function createDemoData(today = todayISO()) {
  const r = rng(20261016);
  const plants = [];
  const lines = [];
  PLANTS.forEach(([code, name, location, n, cal], pi) => {
    const plantId = `pl-${code.toLowerCase()}`;
    const inactive = code === 'WTL';
    plants.push({ id: plantId, code, name, location, status: inactive ? 'inactive' : 'active', calendarId: cal, notes: inactive ? 'Refurbishment until next quarter — no planning.' : '' });
    for (let i = 1; i <= n; i++) {
      const lc = `${code}-${String(i).padStart(2, '0')}`;
      const cats = pi % 4 === 0 ? ['Dresses', 'Tops', 'Skirts'] : pi % 4 === 1 ? ['Shirts', 'Trousers', 'Tops'] : pi % 4 === 2 ? [] : ['Tops', 'Dresses', 'Skirts', 'Trousers'];
      lines.push({
        id: `ln-${lc.toLowerCase()}`, plantId, code: lc, name: `${name.split(' (')[0]} Line ${i}`,
        status: inactive || lc === 'KDW-03' ? 'inactive' : 'active', calendarId: null,
        defaultOperators: lc === 'KGL-02' ? 0 : r.int(24, 38),
        categories: cats, notes: lc === 'KDW-03' ? 'Machines relocated to KDW-01/02.' : '',
      });
    }
  });

  const efficiencyLevels = EFFICIENCY_LEVELS.map(([label, percent, startDay], i) => ({ id: `ef-${i + 1}`, label, percent, startDay }));
  const activeLines = lines.filter((l) => l.status === 'active');
  // Repeat styles have already been learned, so they start higher up the ladder (index 2 = 45%).
  const ladderStartFor = (style) => (style.templateId === 'tpl-repeat' ? 2 : 0);

  const shifts = [
    { id: 'sh-normal', name: 'Normal', start: '07:30', end: '16:30', minutes: 480, kind: 'normal', status: 'active' },
    { id: 'sh-sat', name: 'Saturday', start: '07:30', end: '12:30', minutes: 300, kind: 'normal', status: 'active' },
    { id: 'sh-half', name: 'Half Day', start: '07:30', end: '11:30', minutes: 240, kind: 'half', status: 'active' },
    { id: 'sh-ot', name: 'Extended (OT)', start: '07:30', end: '18:30', minutes: 600, kind: 'normal', status: 'active' },
    { id: 'sh-holiday', name: 'Holiday', start: '00:00', end: '00:00', minutes: 0, kind: 'holiday', status: 'active' },
  ];
  const calendars = [
    { id: 'cal-std', name: 'Standard (Mon–Fri + Sat half)', week: { 0: null, 1: 'sh-normal', 2: 'sh-normal', 3: 'sh-normal', 4: 'sh-normal', 5: 'sh-normal', 6: 'sh-sat' } },
    { id: 'cal-5day', name: '5-day week', week: { 0: null, 1: 'sh-normal', 2: 'sh-normal', 3: 'sh-normal', 4: 'sh-normal', 5: 'sh-normal', 6: null } },
    { id: 'cal-6day', name: '6-day week', week: { 0: null, 1: 'sh-normal', 2: 'sh-normal', 3: 'sh-normal', 4: 'sh-normal', 5: 'sh-normal', 6: 'sh-normal' } },
  ];
  const ex = (scopeType, scopeId, offset, type, note, shiftId = null, minutes = '') => ({ id: `ce-${scopeType}-${offset}-${scopeId || 'all'}`, scopeType, scopeId, date: addDaysISO(today, offset), type, shiftId, minutes, note });
  const calendarExceptions = [
    ex('all', null, -17, 'holiday', 'Poya Day'),
    ex('all', null, 12, 'holiday', 'Poya Day'),
    ex('all', null, 41, 'holiday', 'Poya Day'),
    ex('all', null, 71, 'holiday', 'Poya Day'),
    ex('all', null, 55, 'holiday', 'Public holiday'),
    ex('plant', 'pl-ntm', 23, 'halfday', 'Plant maintenance', 'sh-half'),
    ex('plant', 'pl-ykl', 31, 'holiday', 'Local festival'),
    ex('plant', 'pl-k-02', 9, 'halfday', 'Fire drill & safety training', 'sh-half'),
    ex('line', 'ln-k-01-02', 18, 'holiday', 'Machine overhaul'),
    ex('plant', 'pl-byg', 26, 'working', 'Extended shift for export peak', 'sh-ot', 600),
  ];

  // Workforce: rolling monthly records. PLN-02 relies on the line default; KGL-02 has none at all.
  const workforce = [];
  const t = fromISO(today);
  for (const l of lines) {
    if (l.status !== 'active' || l.code === 'PLN-02' || l.code === 'KGL-02') continue;
    const base = l.defaultOperators;
    for (let m = -2; m <= 4; m++) {
      if (l.code === 'HRN-03' && m >= 2) continue;
      const d = new Date(t.getFullYear(), t.getMonth() + m, 1);
      const mos = Math.max(18, base + r.int(-2, 2));
      const helpers = Math.round(mos * 0.28) + r.int(0, 2);
      workforce.push({ id: `wf-${l.id}-${d.getFullYear()}-${d.getMonth() + 1}`, lineId: l.id, year: d.getFullYear(), month: d.getMonth() + 1, mos, helpers, carders: mos + helpers + r.int(2, 4), updatedAt: Date.now() });
    }
  }

  const buyers = BUYERS.map(([code, name, country], i) => ({ id: `by-${i + 1}`, code, name, country }));
  const styles = STYLES.map(([code, description, bi, category, smv, templateId], i) => ({ id: `st-${i + 1}`, code, description, buyerId: buyers[bi].id, category, smv, templateId }));
  const people = PEOPLE.map(([id, name, department]) => ({ id, name, department }));

  const settings = {
    user: { name: 'Tharaka Nuwan', role: 'planner', plantId: 'pl-ntm' },
    defaultHorizon: '3m', deliveryBufferDays: 3,
    lowUtilizationThreshold: 45, useLineDefaultWhenNoWorkforce: true, defaultCalendarId: 'cal-std',
    notify: { milestones: true, capacity: true, output: true }, lastErpSync: new Date(Date.now() - 3600_000 * 5).toISOString(),
  };

  const data = { plants, lines, efficiencyLevels, shifts, calendars, calendarExceptions, workforce, buyers, styles, people, templates: TEMPLATES, milestoneTypes: DEFAULT_MILESTONE_TYPES, orders: [], allocations: [], milestones: [], outputs: [], notifications: [], audit: [], settings };
  const ctx = buildContext(data, today);

  // --- Orders & allocations, laid out line by line with real capacity calculations ---
  let poSeq = 61200;
  const newOrder = (style, qty, delivery, source = 'ERP') => {
    poSeq += r.int(3, 19);
    const o = { id: `po-${poSeq}`, poNo: `PO-${poSeq}`, soNo: `SO-${8800 + Math.floor(poSeq / 7) % 900}`, lineItem: String(r.pick([10, 10, 20, 30])), styleId: style.id, qty, deliveryDate: delivery, source, status: 'open', createdAt: Date.now(), notes: '' };
    data.orders.push(o);
    ctx.orders[o.id] = o;
    return o;
  };
  const styleFor = (line) => {
    const eligible = line.categories.length ? styles.filter((s) => line.categories.includes(s.category)) : styles;
    return r.pick(eligible);
  };

  const scenario = []; // remembers what each order is meant to demonstrate
  let allocSeq = 1;
  activeLines.forEach((line, li) => {
    const lowUtil = ['MTL-02', 'PLN-02', 'KGL-02', 'HRN-03'].includes(line.code);
    const count = lowUtil ? (line.code === 'KGL-02' ? 0 : 1) : r.int(2, 4);
    let cursor = addDaysISO(today, -r.int(4, 16));
    if (li < 6) {
      // A finished order before the current one.
      const st = styleFor(line);
      const start = nextWorkingDay(ctx, line, addDaysISO(today, -34 - r.int(0, 4)));
      const a = { id: `al-${allocSeq++}`, orderId: null, lineId: line.id, startDate: start, qty: 0, ladderStart: ladderStartFor(st) };
      const o = newOrder(st, 0, null);
      a.orderId = o.id;
      a.qty = o.qty = Math.round((r.int(14, 22) * 100) / 1);
      const p = planAllocation(ctx, a);
      o.deliveryDate = addDaysISO(p.end, r.int(6, 12));
      data.allocations.push(a);
      scenario.push({ order: o, alloc: a, kind: 'completed' });
      cursor = addDaysISO(p.end, r.int(1, 3));
      if (cursor > addDaysISO(today, -3)) cursor = addDaysISO(today, -r.int(3, 8));
    }
    for (let k = 0; k < count; k++) {
      const st = styleFor(line);
      const qty = r.int(15, 60) * 100;
      const o = newOrder(st, qty, null);
      const a = { id: `al-${allocSeq++}`, orderId: o.id, lineId: line.id, startDate: nextWorkingDay(ctx, line, cursor), qty, ladderStart: ladderStartFor(st) };
      const p = planAllocation(ctx, a);
      const roll = r.next();
      o.deliveryDate = addDaysISO(p.end, roll < 0.1 ? -3 : roll < 0.2 ? 1 : r.int(7, 21));
      data.allocations.push(a);
      scenario.push({ order: o, alloc: a, kind: a.startDate <= today ? 'running' : 'future' });
      cursor = addDaysISO(p.end, r.int(1, 5));
    }
  });

  // Deliberate board issues for Daily Align: one overlap and one Sunday start.
  const futureOnLine = (code) => scenario.filter((s) => s.kind === 'future' && ctx.lines[s.alloc.lineId].code === code);
  const ov = futureOnLine('NTM-02');
  if (ov.length >= 1) {
    const prev = scenario.filter((s) => s.alloc.lineId === ov[0].alloc.lineId && s.alloc.startDate < ov[0].alloc.startDate).pop();
    if (prev) ov[0].alloc.startDate = addDaysISO(planAllocation(ctx, prev.alloc).end, -2);
  }
  const sun = futureOnLine('K-02-01')[0];
  if (sun) {
    let d = sun.alloc.startDate;
    for (let i = 0; i < 7 && fromISO(d).getDay() !== 0; i++) d = addDaysISO(d, 1);
    sun.alloc.startDate = d;
  }
  // Partial allocation: only part of the order quantity is planned.
  const partial = scenario.find((s) => s.kind === 'future' && s.order.qty >= 3000);
  if (partial) {
    partial.order.qty += 1800;
    partial.kind = 'partial';
  }

  // Unplanned orders straight from the "ERP".
  const unplannedSpecs = [[2, 2400, 24], [5, 3600, 38], [7, 1800, 19], [9, 5200, 52], [11, 3000, 45], [13, 2600, 33], [0, 4200, 61], [14, 2000, 28]];
  unplannedSpecs.forEach(([si, qty, del], i) => {
    const o = newOrder(styles[si], qty, addDaysISO(today, del));
    if (i === 6) o.source = 'Manual';
    scenario.push({ order: o, alloc: null, kind: 'unplanned' });
  });

  // --- Milestones ---
  const tplById = Object.fromEntries(TEMPLATES.map((x) => [x.id, x]));
  for (const s of scenario) {
    const style = ctx.styles[s.order.styleId];
    const tpl = tplById[style.templateId];
    const p = s.alloc ? planAllocation(ctx, s.alloc) : null;
    const start = p ? p.start : addDaysISO(s.order.deliveryDate, -22);
    const ms = generateFromTemplate(tpl, s.order.id, start, p ? p.end : addDaysISO(start, 10));
    for (const m of ms) {
      m.responsibleId = OWNER[m.type];
      if (m.plannedDate < today) {
        m.status = 'completed';
        m.actualDate = addDaysISO(m.plannedDate, r.int(-2, 1));
        if (m.actualDate > today) m.actualDate = today;
      } else if (diffDays(m.plannedDate, today) <= 6 && m.type !== 'production_completion') {
        m.status = r.next() < 0.5 ? 'in_progress' : 'pending';
      }
      if (m.type === 'production_completion' && s.kind !== 'completed' && m.plannedDate < today) {
        m.status = 'in_progress';
        m.actualDate = null;
      }
    }
    s.milestones = ms;
    data.milestones.push(...ms);
  }

  // Readiness problems on orders starting soon — the follow-up page's main use case.
  const soon = scenario.filter((s) => s.alloc && s.alloc.startDate > today && diffDays(s.alloc.startDate, today) <= 21).sort((a, b) => (a.alloc.startDate < b.alloc.startDate ? -1 : 1));
  const findMs = (s, type) => s?.milestones.find((m) => m.type === type);
  const setMs = (s, type, patch) => { const m = findMs(s, type); if (m) Object.assign(m, patch); return m; };
  if (soon[0]) setMs(soon[0], 'fabric', { status: 'in_progress', actualDate: null, expectedDate: addDaysISO(today, 4), plannedDate: addDaysISO(today, -3), comments: [{ at: Date.now() - 86400000, by: 'Nadeesha Perera', text: 'Mill confirmed dispatch slipped — shipment now arriving at Colombo port.' }] });
  if (soon[1]) setMs(soon[1], findMs(soon[1], 'pp_approval') ? 'pp_approval' : 'cutting', { status: 'pending', actualDate: null, plannedDate: addDaysISO(today, 1), expectedDate: addDaysISO(today, 5) });
  if (soon[2]) setMs(soon[2], findMs(soon[2], 'print') ? 'print' : 'trims', { status: 'blocked', actualDate: null, plannedDate: addDaysISO(today, 2), blockReason: 'Print screen damaged — remake in progress' });
  if (soon[3]) setMs(soon[3], 'trims', { status: 'in_progress', actualDate: null, plannedDate: addDaysISO(today, 3), expectedDate: addDaysISO(today, 6) });
  if (soon[4]) setMs(soon[4], 'cutting', { status: 'in_progress', actualDate: null, plannedDate: addDaysISO(today, -1) });
  if (soon[6]) setMs(soon[6], 'fabric', { status: 'blocked', actualDate: null, plannedDate: addDaysISO(today, 1), blockReason: 'Shade band rejected by buyer QA' });
  const up = scenario.filter((s) => s.kind === 'unplanned');
  if (up[0]) setMs(up[0], 'fabric', { status: 'in_progress', actualDate: null, plannedDate: addDaysISO(today, -2), expectedDate: addDaysISO(today, 6) });
  if (up[2]) setMs(up[2], 'trims', { status: 'pending', actualDate: null, plannedDate: addDaysISO(today, -1) });

  // --- Output records from the actual daily plan ---
  const recorders = ['Upeksha Rajapaksha', 'Line clerk — K-01', 'Line clerk — NTM', 'Line clerk — BYG'];
  const behindLines = new Set(['ln-ykl-01', 'ln-hrn-02', 'ln-k-02-02']);
  let outSeq = 1;
  for (const s of scenario) {
    if (!s.alloc || s.alloc.startDate > today) continue;
    const p = planAllocation(ctx, s.alloc);
    // Orders whose plan ended before today finished on time, except on the deliberately "behind" lines.
    const finished = s.kind === 'completed' || (p.end < today && !behindLines.has(s.alloc.lineId));
    let cum = 0;
    const days = p.days.filter((d) => d.date < today || (d.date === today && r.next() < 0.55));
    days.forEach((d, idx) => {
      const isLast = finished && idx === days.length - 1;
      const factor = behindLines.has(s.alloc.lineId) ? 0.55 + r.next() * 0.2 : 0.82 + r.next() * 0.22;
      const ramp = idx === 0 ? 0.6 : 1;
      let good = Math.round(d.qty * factor * ramp);
      if (isLast) good = Math.max(good, s.order.qty - cum);
      good = Math.min(good, s.order.qty - cum);
      if (good <= 0) return;
      cum += good;
      data.outputs.push({ id: `out-${outSeq++}`, date: d.date, orderId: s.order.id, lineId: s.alloc.lineId, good, rejects: Math.round(good * (0.005 + r.next() * 0.03)), shortages: r.next() < 0.18 ? r.int(2, 25) : 0, recordedBy: r.pick(recorders), createdAt: Date.now() });
    });
    if (finished) {
      const pc = findMs(s, 'production_completion');
      if (pc) Object.assign(pc, { status: 'completed', actualDate: days[days.length - 1]?.date || pc.plannedDate });
    }
  }

  // --- Notifications & audit ---
  const now = Date.now();
  data.notifications = [
    { id: 'n-1', at: now - 3600_000 * 5, severity: 'info', title: 'ERP sync completed (simulated)', body: `${up.length} orders awaiting planning.`, link: '/orders?status=unplanned', read: false },
    soon[0] && { id: 'n-2', at: now - 3600_000 * 20, severity: 'critical', title: `Fabric overdue — ${soon[0].order.poNo}`, body: 'Planned production start is at risk.', link: `/critical-path?order=${soon[0].order.id}`, read: false },
    soon[2] && { id: 'n-3', at: now - 3600_000 * 26, severity: 'warning', title: `Milestone blocked — ${soon[2].order.poNo}`, body: 'Print screen damaged — remake in progress.', link: `/critical-path?order=${soon[2].order.id}`, read: false },
    { id: 'n-4', at: now - 3600_000 * 30, severity: 'info', title: 'Calendar updated', body: 'Poya Day holiday applied to all plants.', link: '/calendar', read: true },
  ].filter(Boolean);
  data.audit = [
    { id: 'au-1', at: now - 3600_000 * 30, user: 'System', entity: 'calendar', entityId: 'ce-all-12-all', action: 'created', summary: 'Poya Day holiday added for all plants' },
    { id: 'au-2', at: now - 3600_000 * 5, user: 'System', entity: 'erp', entityId: '-', action: 'sync', summary: `Simulated ERP sync — ${data.orders.length} orders` },
  ];
  return data;
}
