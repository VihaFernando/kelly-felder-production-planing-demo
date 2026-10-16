import { addDaysISO, diffDays } from '../utils/dateUtils';
import { uid } from '../utils/formatters';

export const MILESTONE_STATUSES = [
  { id: 'pending', label: 'Pending' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'blocked', label: 'Blocked' },
];

/** Milestone types that gate production start (readiness prerequisites). */
export function isReadinessType(typeId, types) {
  const t = (types || []).find((x) => x.id === typeId);
  return t ? !!t.readiness : !['production_start', 'production_completion'].includes(typeId);
}

/**
 * Effective status is always derived from dates + stored status, never stored as a static label.
 *  completed / blocked are explicit; overdue = planned date passed and not complete;
 *  at_risk = expected date slips past plan, a prerequisite is overdue/blocked, or due within 2 days but not started.
 */
export function effectiveStatus(m, today, byId, depth = 0) {
  if (!m) return 'pending';
  if (m.status === 'completed') return 'completed';
  if (m.status === 'blocked') return 'blocked';
  if (m.plannedDate && m.plannedDate < today) return 'overdue';
  if (m.expectedDate && m.plannedDate && m.expectedDate > m.plannedDate) return 'at_risk';
  if (depth < 4 && byId) {
    for (const depId of m.dependsOn || []) {
      const dep = byId[depId];
      const s = effectiveStatus(dep, today, byId, depth + 1);
      if (s === 'overdue' || s === 'blocked') return 'at_risk';
    }
  }
  if (m.status === 'pending' && m.plannedDate && diffDays(m.plannedDate, today) <= 2) return 'at_risk';
  return m.status || 'pending';
}

export function daysRemaining(m, today) {
  if (!m?.plannedDate) return null;
  if (m.status === 'completed') return null;
  return diffDays(m.plannedDate, today);
}

export function indexById(list) {
  const out = {};
  for (const x of list || []) out[x.id] = x;
  return out;
}

/** Explains why a milestone is flagged, including dependency chains. */
export function explainMilestone(m, today, byId, typeName) {
  const s = effectiveStatus(m, today, byId);
  const name = typeName(m.type);
  if (s === 'overdue') return `${name} was due ${Math.abs(diffDays(m.plannedDate, today))} day(s) ago and is not complete.`;
  if (s === 'blocked') return `${name} is blocked${m.blockReason ? `: ${m.blockReason}` : ''}.`;
  if (s === 'at_risk') {
    if (m.expectedDate && m.expectedDate > m.plannedDate) return `${name} expected ${diffDays(m.expectedDate, m.plannedDate)} day(s) after plan.`;
    const bad = (m.dependsOn || []).map((d) => byId[d]).filter((d) => d && ['overdue', 'blocked'].includes(effectiveStatus(d, today, byId)));
    if (bad.length) return `Depends on ${bad.map((d) => typeName(d.type)).join(', ')} which is delayed.`;
    return `${name} is due within 2 days and has not started.`;
  }
  return '';
}

const NEXT_ACTION = {
  fabric: 'Chase supplier for confirmed fabric ETA; consider alternate fabric lot.',
  trims: 'Confirm trims delivery with sourcing team.',
  print: 'Follow up with print vendor on completion date.',
  sample: 'Expedite sample with sample room.',
  pp_approval: 'Escalate PP approval with buyer merchandiser.',
  cutting: 'Confirm cutting plan once fabric and approvals clear.',
  sewing: 'Check line set-up and feeding plan.',
  production_start: 'Confirm line readiness or reschedule on the planning board.',
  production_completion: 'Review output against plan; consider overtime or additional line.',
};

export function nextAction(m) {
  return NEXT_ACTION[m.type] || 'Follow up with the responsible person.';
}

/**
 * Readiness of an order from its prerequisite milestones.
 * ready = all prerequisites completed; blocked = any overdue/blocked; at_risk = any at risk.
 */
export function orderReadiness(orderMilestones, today, allMilestones, types) {
  const byId = indexById(allMilestones || orderMilestones);
  const prereq = (orderMilestones || []).filter((m) => isReadinessType(m.type, types));
  if (!prereq.length) return { state: 'unknown', issues: [], done: 0, total: 0 };
  const issues = [];
  let done = 0;
  let atRisk = false;
  let blocked = false;
  for (const m of prereq) {
    const s = effectiveStatus(m, today, byId);
    if (s === 'completed') done++;
    else if (s === 'overdue' || s === 'blocked') {
      blocked = true;
      issues.push({ milestoneId: m.id, status: s, label: `${labelForType(m.type)} ${s === 'blocked' ? 'blocked' : 'overdue'}` });
    } else if (s === 'at_risk') {
      atRisk = true;
      issues.push({ milestoneId: m.id, status: s, label: `${labelForType(m.type)} at risk` });
    }
  }
  issues.sort((a, b) => (a.status === 'at_risk') - (b.status === 'at_risk'));
  const state = done === prereq.length ? 'ready' : blocked ? 'blocked' : atRisk ? 'at_risk' : 'pending';
  return { state, issues, done, total: prereq.length };
}

export const DEFAULT_MILESTONE_TYPES = [
  { id: 'fabric', name: 'Fabric arrival', readiness: true },
  { id: 'trims', name: 'Trims readiness', readiness: true },
  { id: 'print', name: 'Print completion', readiness: true },
  { id: 'sample', name: 'Sample readiness', readiness: true },
  { id: 'pp_approval', name: 'PP approval', readiness: true },
  { id: 'cutting', name: 'Cutting readiness', readiness: true },
  { id: 'sewing', name: 'Sewing readiness', readiness: true },
  { id: 'production_start', name: 'Production start', readiness: false },
  { id: 'production_completion', name: 'Production completion', readiness: false },
];

export function labelForType(id) {
  return DEFAULT_MILESTONE_TYPES.find((t) => t.id === id)?.name || id;
}

/** Instantiate a template's milestones for an order relative to its production start. */
export function generateFromTemplate(template, orderId, prodStart, prodEnd) {
  const idByStep = {};
  const ms = template.steps.map((s) => {
    const id = uid('ms');
    idByStep[s.type] = id;
    return { id, orderId, type: s.type, plannedDate: s.type === 'production_completion' && prodEnd ? prodEnd : addDaysISO(prodStart, s.offset), expectedDate: null, actualDate: null, responsibleId: s.responsibleId || null, status: 'pending', comments: [], history: [], dependsOn: [] };
  });
  template.steps.forEach((s, i) => {
    ms[i].dependsOn = (s.dependsOn || []).map((t) => idByStep[t]).filter(Boolean);
  });
  return ms;
}
