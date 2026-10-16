import { uid } from '../utils/formatters';

const MAX_AUDIT = 1000;

export function makeAudit(user, { entity, entityId, action, summary, before, after }) {
  return { id: uid('au'), at: Date.now(), user: user || 'Unknown', entity, entityId, action, summary, before: before ?? null, after: after ?? null };
}

export function appendAudit(list, entries) {
  const next = [...entries, ...list];
  return next.length > MAX_AUDIT ? next.slice(0, MAX_AUDIT) : next;
}
