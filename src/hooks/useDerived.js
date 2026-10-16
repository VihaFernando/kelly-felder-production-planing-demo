import { useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { buildContext } from '../services/capacityService';
import { analyzeAllocations, summarizeOrders } from '../services/schedulingService';
import { indexById } from '../services/milestoneService';
import { todayISO } from '../utils/dateUtils';

/**
 * Single source of derived planning facts (capacity context, allocation analysis, order roll-ups).
 * Cached per (data, allocations) pair so every page sees identical numbers without recomputing.
 */
const cache = [];

export function getDerived(data, allocations) {
  const today = todayISO();
  const hit = cache.find((c) => c.data === data && c.allocations === allocations && c.today === today);
  if (hit) return hit.value;
  const ctx = buildContext(data, today);
  const analysis = analyzeAllocations(ctx, allocations, data.milestones);
  const orders = summarizeOrders(ctx, allocations, analysis, data.milestones, data.outputs);
  const value = { ctx, today, analysis, orders, allocations, msById: indexById(data.milestones), peopleById: indexById(data.people), typeName: (id) => data.milestoneTypes.find((t) => t.id === id)?.name || id };
  cache.unshift({ data, allocations, today, value });
  cache.length = Math.min(cache.length, 3);
  return value;
}

export function useDerived({ board = false } = {}) {
  const data = useAppStore((s) => s.data);
  const boardAllocations = useAppStore((s) => (board ? s.board?.allocations : null));
  const allocations = boardAllocations ?? data.allocations;
  return useMemo(() => getDerived(data, allocations), [data, allocations]);
}
