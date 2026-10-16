import { addDaysISO, diffDays, maxIso, todayISO } from '../utils/dateUtils';
import { dailyCapacity, getDayInfo } from './capacityService';
import { orderReadiness } from './milestoneService';

const MAX_PLAN_DAYS = 240;

/**
 * Efficiency ladder → per-working-day planned efficiency for an allocation.
 * Each level applies from its start day (e.g. 35% day 1, 40% day 2 … 50% from day 4) and the last level
 * holds until the allocation finishes. `ladderStart` (level index) lets a repeat style skip the ramp-up.
 * Returns an array: steps[k] = efficiency % on working day k+1 (last entry repeats).
 */
export function ladderSteps(levels, ladderStart = 0) {
  if (!levels?.length) return [];
  const startIdx = Math.max(0, Math.min(Number(ladderStart) || 0, levels.length - 1));
  const firstDay = levels[startIdx].startDay;
  const lastDay = levels[levels.length - 1].startDay;
  const steps = [];
  for (let day = firstDay; day <= lastDay; day++) {
    let pctAtDay = levels[0].percent;
    for (const l of levels) if (l.startDay <= day) pctAtDay = l.percent;
    steps.push(Number(pctAtDay));
  }
  return steps;
}

export function efficiencySteps(ctx, alloc) {
  return ladderSteps(ctx.levels, alloc.ladderStart);
}

/**
 * Lay an allocation out day by day from its start date, consuming line capacity on working days only.
 * Returns the daily plan, finish date, and data-quality flags.
 */
export function planAllocation(ctx, alloc) {
  const line = ctx.lines[alloc.lineId];
  const order = ctx.orders[alloc.orderId];
  const style = order ? ctx.styles[order.styleId] : null;
  const smv = Number(style?.smv) || 0;
  const steps = efficiencySteps(ctx, alloc);
  const qty = Math.max(0, Math.round(Number(alloc.qty) || 0));

  const result = { days: [], start: alloc.startDate, end: alloc.startDate, qty, smv, efficiency: steps[steps.length - 1] || 0, startEfficiency: steps[0] || 0, steps, missingWorkforce: false, defaultWorkforce: false, incomplete: false, overflow: false, workingDays: 0 };
  if (!line || !smv || !qty || !steps.length) {
    result.incomplete = true;
    return result;
  }

  let remaining = qty;
  let iso = alloc.startDate;
  let workDay = 0;
  for (let i = 0; i < MAX_PLAN_DAYS && remaining > 0; i++) {
    const eff = steps[Math.min(workDay, steps.length - 1)];
    const cap = dailyCapacity(ctx, line, iso, smv, eff);
    if (cap.day.minutes > 0) {
      if (cap.operatorSource === 'none') result.missingWorkforce = true;
      if (cap.operatorSource === 'default') result.defaultWorkforce = true;
    }
    const q = Math.min(cap.pcs, remaining);
    if (q > 0) {
      workDay++;
      result.days.push({ date: iso, qty: q, capacity: cap.pcs, minutes: cap.availableMinutes, eff });
      result.workingDays++;
      remaining -= q;
      result.end = iso;
    }
    iso = addDaysISO(iso, 1);
  }
  if (remaining > 0) {
    result.overflow = true;
    result.incomplete = true;
  }
  if (!result.days.length) result.end = alloc.startDate;
  return result;
}

/** Next date (inclusive) on which the line has working minutes. */
export function nextWorkingDay(ctx, line, iso) {
  let d = iso;
  for (let i = 0; i < 60; i++) {
    if (getDayInfo(ctx, line, d).minutes > 0) return d;
    d = addDaysISO(d, 1);
  }
  return iso;
}

function overlaps(a, b) {
  return a.start <= b.end && b.start <= a.end;
}

/** Analyse every allocation: daily plan, same-line overlaps and per-allocation issues. */
export function analyzeAllocations(ctx, allocations, milestones) {
  const result = {};
  const byLine = {};
  for (const a of allocations) {
    const plan = planAllocation(ctx, a);
    result[a.id] = { alloc: a, plan, conflicts: [], issues: [] };
    (byLine[a.lineId] ||= []).push(result[a.id]);
  }
  for (const list of Object.values(byLine)) {
    list.sort((x, y) => (x.plan.start < y.plan.start ? -1 : 1));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[j].plan.start > list[i].plan.end) break;
        if (overlaps(list[i].plan, list[j].plan)) {
          list[i].conflicts.push(list[j].alloc.id);
          list[j].conflicts.push(list[i].alloc.id);
        }
      }
    }
  }
  const msByOrder = groupBy(milestones || [], 'orderId');
  for (const r of Object.values(result)) {
    r.issues = allocationIssues(ctx, r, msByOrder[r.alloc.orderId] || [], milestones);
    r.level = r.issues.some((i) => i.level === 'critical') ? 'critical' : r.issues.some((i) => i.level === 'warning') ? 'warning' : 'ok';
  }
  return result;
}

function allocationIssues(ctx, r, orderMilestones, allMilestones) {
  const issues = [];
  const { plan, alloc } = r;
  const order = ctx.orders[alloc.orderId];
  const line = ctx.lines[alloc.lineId];
  if (!order) issues.push({ level: 'critical', code: 'orphan', msg: 'Allocation references a missing order' });
  if (!line) issues.push({ level: 'critical', code: 'orphan', msg: 'Allocation references a missing line' });
  if (line && line.status !== 'active') issues.push({ level: 'critical', code: 'inactive', msg: `Line ${line.code} is inactive` });
  if (plan.incomplete && !plan.overflow) issues.push({ level: 'warning', code: 'incomplete', msg: 'Planning information incomplete (missing SMV, quantity, line or efficiency ladder)' });
  if (plan.overflow) issues.push({ level: 'critical', code: 'capacity', msg: 'No capacity to complete this quantity within the planning horizon' });
  if (plan.missingWorkforce) issues.push({ level: 'warning', code: 'workforce', msg: 'No workforce (MOS) configured for one or more planned months' });
  else if (plan.defaultWorkforce) issues.push({ level: 'info', code: 'workforce-default', msg: 'Using line default operators — no monthly carder record' });
  if (r.conflicts.length) issues.push({ level: 'critical', code: 'overlap', msg: `Overlaps ${r.conflicts.length} other allocation(s) on ${line?.code}` });
  if (order && plan.end > order.deliveryDate) {
    issues.push({ level: 'critical', code: 'delivery', msg: `Estimated finish ${plan.end} is after delivery ${order.deliveryDate}` });
  } else if (order && diffDays(order.deliveryDate, plan.end) < (ctx.settings.deliveryBufferDays ?? 3)) {
    issues.push({ level: 'warning', code: 'delivery-buffer', msg: `Finishes within ${ctx.settings.deliveryBufferDays ?? 3} days of delivery` });
  }
  const readiness = orderReadiness(orderMilestones, ctx.today, allMilestones);
  const daysToStart = diffDays(plan.start, ctx.today);
  if (readiness.state === 'blocked' && daysToStart <= 14) {
    issues.push({ level: daysToStart <= 7 ? 'critical' : 'warning', code: 'readiness', msg: `Not ready: ${readiness.issues[0]?.label || 'prerequisite blocked/overdue'}` });
  } else if (readiness.state === 'at_risk' && daysToStart <= 14) {
    issues.push({ level: 'warning', code: 'readiness', msg: `Readiness at risk: ${readiness.issues[0]?.label || ''}` });
  }
  if (style(ctx, order) && line?.categories?.length && !line.categories.includes(style(ctx, order).category)) {
    issues.push({ level: 'warning', code: 'category', msg: `${line.code} is not set up for ${style(ctx, order).category}` });
  }
  return issues;
}

function style(ctx, order) {
  return order ? ctx.styles[order.styleId] : null;
}

/** Validate a proposed allocation position (move or new placement) against current allocations. */
export function validatePlacement(ctx, allocations, proposed, milestones) {
  const errors = [];
  const line = ctx.lines[proposed.lineId];
  const order = ctx.orders[proposed.orderId];
  if (!line) errors.push('Target line does not exist.');
  else if (line.status !== 'active') errors.push(`Line ${line.code} is inactive and cannot receive allocations.`);
  if (line && ctx.plants[line.plantId]?.status !== 'active') errors.push(`Plant ${ctx.plants[line.plantId]?.code} is inactive.`);
  if (!order) errors.push('Order does not exist.');
  if (proposed.qty <= 0) errors.push('Allocation quantity must be greater than zero.');
  const dup = allocations.find((a) => a.id !== proposed.id && a.orderId === proposed.orderId && a.lineId === proposed.lineId && a.startDate === proposed.startDate);
  if (dup) errors.push('An identical allocation of this order already exists on this line and date.');

  const others = allocations.filter((a) => a.id !== proposed.id);
  const analysis = analyzeAllocations(ctx, [...others, proposed], milestones);
  const r = analysis[proposed.id];
  if (line && getDayInfo(ctx, line, proposed.startDate).minutes === 0) {
    r.issues.unshift({ level: 'warning', code: 'nonworking', msg: `Start date is a non-working day on ${line.code}; production begins ${r.plan.days[0]?.date || '—'}` });
  }
  if (proposed.startDate < ctx.today) r.issues.unshift({ level: 'warning', code: 'past', msg: 'Start date is in the past' });
  const warnings = r.issues.filter((i) => i.level !== 'info');
  return { plan: r.plan, errors, warnings, info: r.issues.filter((i) => i.level === 'info'), conflicts: r.conflicts };
}

/**
 * Daily Align: deterministic per-line clean-up for allocations starting inside the range.
 *  1. Starts that fall on non-working days snap forward to the next working day.
 *  2. Overlapping allocations are sequenced in start order, each starting the next working day after the previous finishes.
 * Allocations marked `locked` are never moved. Gaps between orders are preserved (no compaction).
 */
export function dailyAlign(ctx, allocations, rangeStart, rangeEnd, lineIds) {
  const changes = [];
  const working = allocations.map((a) => ({ ...a }));
  const byLine = groupBy(working, 'lineId');
  for (const [lineId, list] of Object.entries(byLine)) {
    if (lineIds && !lineIds.has(lineId)) continue;
    const line = ctx.lines[lineId];
    if (!line) continue;
    list.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.id < b.id ? -1 : 1));
    let prevEnd = null;
    for (const a of list) {
      const inRange = a.startDate >= rangeStart && a.startDate <= rangeEnd;
      let start = a.startDate;
      if (inRange && !a.locked) {
        if (prevEnd && start <= prevEnd) start = addDaysISO(prevEnd, 1);
        start = nextWorkingDay(ctx, line, start);
      }
      if (start !== a.startDate) {
        const before = planAllocation(ctx, a);
        const moved = { ...a, startDate: start };
        const after = planAllocation(ctx, moved);
        changes.push({ allocId: a.id, orderId: a.orderId, lineId, fromStart: a.startDate, toStart: start, fromEnd: before.end, toEnd: after.end, reason: prevEnd && a.startDate <= prevEnd ? 'Resolve overlap' : 'Non-working start day' });
        a.startDate = start;
      }
      const p = planAllocation(ctx, a);
      prevEnd = maxIso(prevEnd, p.end);
    }
  }
  return changes;
}

/** Order-level roll-up used by every page (dashboard, orders, board, overview). */
export function summarizeOrders(ctx, allocations, analysis, milestones, outputs) {
  const allocByOrder = groupBy(allocations, 'orderId');
  const msByOrder = groupBy(milestones, 'orderId');
  const outByOrder = groupBy(outputs, 'orderId');
  const today = ctx.today || todayISO();
  const out = {};
  for (const o of ctx.data.orders) {
    const allocs = allocByOrder[o.id] || [];
    const plans = allocs.map((a) => analysis[a.id]).filter(Boolean);
    const plannedQty = allocs.reduce((s, a) => s + (Number(a.qty) || 0), 0);
    const good = (outByOrder[o.id] || []).reduce((s, r) => s + r.good, 0);
    const rejects = (outByOrder[o.id] || []).reduce((s, r) => s + r.rejects, 0);
    const shortages = (outByOrder[o.id] || []).reduce((s, r) => s + r.shortages, 0);
    const start = plans.reduce((m, p) => (!m || p.plan.start < m ? p.plan.start : m), null);
    const end = plans.reduce((m, p) => (!m || p.plan.end > m ? p.plan.end : m), null);
    const plannedToDate = plans.reduce((s, p) => s + p.plan.days.filter((d) => d.date <= today).reduce((x, d) => x + d.qty, 0), 0);
    const readiness = orderReadiness(msByOrder[o.id] || [], today, milestones);

    let status;
    if (o.status === 'cancelled') status = 'cancelled';
    else if (good >= o.qty) status = 'completed';
    else if (!allocs.length) status = 'unplanned';
    else if (good > 0) status = 'in_production';
    else if (plannedQty < o.qty) status = 'partial';
    else status = 'planned';

    const reasons = [];
    const issueLevels = plans.flatMap((p) => p.issues);
    for (const i of issueLevels) if (i.level !== 'info') reasons.push(i);
    const daysToDelivery = diffDays(o.deliveryDate, today);
    if (status === 'unplanned' && daysToDelivery <= 30) reasons.push({ level: daysToDelivery <= 14 ? 'critical' : 'warning', code: 'unplanned', msg: `Unplanned with delivery in ${daysToDelivery} days` });
    if (status === 'partial') reasons.push({ level: 'warning', code: 'partial', msg: `${o.qty - plannedQty} pcs not yet allocated` });
    if (status === 'in_production' && plannedToDate > 0 && good < plannedToDate * 0.85) reasons.push({ level: 'warning', code: 'behind', msg: `Behind plan: ${good} of ${plannedToDate} pcs planned to date` });

    let risk = 'ok';
    if (status === 'completed' || status === 'cancelled') risk = 'ok';
    else if (reasons.some((r) => r.level === 'critical')) risk = 'critical';
    else if (reasons.some((r) => r.level === 'warning')) risk = 'at_risk';

    out[o.id] = { order: o, allocs, plannedQty, good, rejects, shortages, remaining: Math.max(0, o.qty - good), start, end, plannedToDate, readiness, status, risk, reasons, daysToDelivery };
  }
  return out;
}

export function groupBy(arr, key) {
  const m = {};
  for (const x of arr || []) (m[x[key]] ||= []).push(x);
  return m;
}
