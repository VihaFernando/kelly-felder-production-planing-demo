import { create } from 'zustand';
import { toast } from 'sonner';
import { clearData, loadData, saveData } from '../services/storageService';
import { createDemoData } from '../services/demoDataService';
import { appendAudit, makeAudit } from '../services/auditService';
import { uid } from '../utils/formatters';

export const ROLES = {
  planner: { label: 'Central Planner', perms: ['plan', 'override', 'orders', 'milestones', 'output', 'workforce', 'masterdata', 'calendar'] },
  plant_manager: { label: 'Plant Manager', perms: ['milestones', 'output', 'workforce'] },
  admin: { label: 'Administrator', perms: ['plan', 'override', 'orders', 'milestones', 'output', 'workforce', 'masterdata', 'calendar', 'admin'] },
};

function initialData() {
  const { data, status } = loadData();
  if (data) return { data, loadStatus: status };
  const fresh = createDemoData();
  saveData(fresh);
  return { data: fresh, loadStatus: status };
}

const init = initialData();

const HISTORY_LIMIT = 50;

export const useAppStore = create((set, get) => ({
  data: init.data,
  loadStatus: init.loadStatus,
  /** Planning-board working copy. null = no unsaved board changes. */
  board: null,
  orderPanelId: null,

  can(perm) {
    return ROLES[get().data.settings.user.role]?.perms.includes(perm) ?? false;
  },
  userName() {
    return get().data.settings.user.name;
  },

  /**
   * Apply an immutable update to the data and persist it.
   * `fn(data)` returns the new data. Optional audit entries are recorded with the current user.
   */
  commit(fn, audits = [], { silentFail = false } = {}) {
    const prev = get().data;
    let next;
    try {
      next = fn(prev);
    } catch (err) {
      console.error(err);
      if (!silentFail) toast.error('Change could not be applied', { description: err.message });
      return false;
    }
    if (!next || next === prev) return false;
    const user = prev.settings.user.name;
    if (audits.length) next = { ...next, audit: appendAudit(next.audit, audits.map((a) => makeAudit(user, a))) };
    const ok = saveData(next);
    set({ data: next });
    if (!ok) toast.error('Saved in memory only — browser storage is full or unavailable.');
    return true;
  },

  upsert(collection, item, audit) {
    const exists = get().data[collection].some((x) => x.id === item.id);
    const withId = item.id ? item : { ...item, id: uid(collection.slice(0, 3)) };
    return get().commit(
      (d) => ({ ...d, [collection]: exists ? d[collection].map((x) => (x.id === withId.id ? withId : x)) : [withId, ...d[collection]] }),
      audit ? [audit] : [],
    );
  },

  remove(collection, id, audit) {
    return get().commit((d) => ({ ...d, [collection]: d[collection].filter((x) => x.id !== id) }), audit ? [audit] : []);
  },

  updateSettings(patch) {
    return get().commit((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  },

  notify({ title, body, severity = 'info', link = null, pref }) {
    const s = get().data.settings;
    if (pref && s.notify && s.notify[pref] === false) return;
    get().commit((d) => ({ ...d, notifications: [{ id: uid('n'), at: Date.now(), title, body, severity, link, read: false }, ...d.notifications].slice(0, 200) }));
  },

  markNotifications(ids, read = true) {
    get().commit((d) => ({ ...d, notifications: d.notifications.map((n) => (!ids || ids.includes(n.id) ? { ...n, read } : n)) }));
  },

  openOrder(id) {
    set({ orderPanelId: id });
  },
  closeOrder() {
    set({ orderPanelId: null });
  },

  // ---------------- Planning board working copy with undo/redo ----------------
  boardAllocations() {
    return get().board?.allocations ?? get().data.allocations;
  },
  boardApply(nextAllocations, label, meta = {}) {
    const b = get().board;
    const current = b?.allocations ?? get().data.allocations;
    const past = [...(b?.past || []), { allocations: current, label }].slice(-HISTORY_LIMIT);
    const changes = [...(b?.changes || []), { label, at: Date.now(), ...meta }];
    set({ board: { allocations: nextAllocations, past, future: [], changes } });
  },
  boardUndo() {
    const b = get().board;
    if (!b?.past.length) return;
    const last = b.past[b.past.length - 1];
    set({ board: { ...b, allocations: last.allocations, past: b.past.slice(0, -1), future: [{ allocations: b.allocations, label: last.label }, ...b.future], changes: b.changes.slice(0, -1) } });
    toast(`Undone: ${last.label}`);
  },
  boardRedo() {
    const b = get().board;
    if (!b?.future.length) return;
    const [nextState, ...rest] = b.future;
    set({ board: { ...b, allocations: nextState.allocations, past: [...b.past, { allocations: b.allocations, label: nextState.label }], future: rest, changes: [...b.changes, { label: nextState.label, at: Date.now() }] } });
    toast(`Redone: ${nextState.label}`);
  },
  boardDirty() {
    const b = get().board;
    return !!b && b.allocations !== get().data.allocations;
  },
  boardSave() {
    const b = get().board;
    if (!b) return;
    const audits = (b.changes || []).map((c) => ({ entity: 'allocation', entityId: c.allocId || '-', action: 'planning', summary: c.label, before: c.before, after: c.after }));
    const ok = get().commit((d) => ({ ...d, allocations: b.allocations }), audits);
    if (ok || b.allocations === get().data.allocations) {
      set({ board: null });
      toast.success('Plan saved to this browser (localStorage)');
    }
  },
  boardDiscard() {
    set({ board: null });
  },

  resetDemo() {
    clearData();
    const fresh = createDemoData();
    saveData(fresh);
    set({ data: fresh, board: null, orderPanelId: null });
  },

  replaceData(data) {
    saveData(data);
    set({ data, board: null });
  },
}));

export const useData = (selector) => useAppStore((s) => selector(s.data));
export const useCan = (perm) => useAppStore((s) => ROLES[s.data.settings.user.role]?.perms.includes(perm) ?? false);
