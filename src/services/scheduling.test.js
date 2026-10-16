import { describe, expect, it } from 'vitest';
import { buildContext, getDayInfo, dailyCapacity, validateLadder } from './capacityService';
import { analyzeAllocations, dailyAlign, ladderSteps, planAllocation, summarizeOrders, validatePlacement } from './schedulingService';
import { effectiveStatus, orderReadiness, indexById } from './milestoneService';
import { createDemoData } from './demoDataService';

const TODAY = '2026-10-14'; // a Wednesday

function fixture(overrides = {}) {
  const data = {
    plants: [{ id: 'p1', code: 'P1', status: 'active', calendarId: 'cal' }],
    lines: [{ id: 'l1', plantId: 'p1', code: 'L1', status: 'active', defaultOperators: 0, categories: [] }],
    shifts: [
      { id: 'n', name: 'Normal', minutes: 480, kind: 'normal', status: 'active' },
      { id: 'h', name: 'Half', minutes: 240, kind: 'half', status: 'active' },
    ],
    calendars: [{ id: 'cal', week: { 0: null, 1: 'n', 2: 'n', 3: 'n', 4: 'n', 5: 'n', 6: null } }],
    calendarExceptions: [],
    workforce: [{ id: 'w', lineId: 'l1', year: 2026, month: 10, mos: 30 }],
    styles: [{ id: 's1', smv: 20, category: 'Tops' }],
    orders: [{ id: 'o1', poNo: 'PO-1', styleId: 's1', qty: 3000, deliveryDate: '2026-11-30', status: 'open' }],
    buyers: [],
    efficiencyLevels: [{ id: 'e1', percent: 35, startDay: 1 }, { id: 'e2', percent: 40, startDay: 2 }, { id: 'e3', percent: 45, startDay: 3 }, { id: 'e4', percent: 50, startDay: 4 }],
    milestones: [],
    outputs: [],
    settings: { deliveryBufferDays: 3, useLineDefaultWhenNoWorkforce: true },
    ...overrides,
  };
  return { data, ctx: buildContext(data, TODAY) };
}

describe('efficiency ladder', () => {
  it('expands levels into per-day steps and holds the last level', () => {
    const { ctx } = fixture();
    expect(ladderSteps(ctx.levels)).toEqual([35, 40, 45, 50]);
    expect(ladderSteps(ctx.levels, 2)).toEqual([45, 50]);
  });

  it('fills gaps between level start days with the previous level', () => {
    expect(ladderSteps([{ percent: 30, startDay: 1 }, { percent: 50, startDay: 3 }])).toEqual([30, 30, 50]);
  });

  it('validates ladder rules', () => {
    expect(validateLadder([])).toMatch(/at least one/);
    expect(validateLadder([{ percent: 40, startDay: 2 }])).toMatch(/day 1/);
    expect(validateLadder([{ percent: 40, startDay: 1 }, { percent: 35, startDay: 2 }])).toMatch(/cannot drop/);
    expect(validateLadder([{ percent: 40, startDay: 1 }, { percent: 45, startDay: 1 }])).toMatch(/Two levels/);
    expect(validateLadder([{ percent: 35, startDay: 1 }, { percent: 50, startDay: 4 }])).toBeNull();
  });
});

describe('capacity', () => {
  it('computes MOS × minutes × efficiency ÷ SMV', () => {
    const { ctx } = fixture();
    const cap = dailyCapacity(ctx, ctx.lines.l1, TODAY, 20, 50);
    expect(cap.pcs).toBe(Math.floor((30 * 480 * 0.5) / 20)); // 360
  });

  it('respects weekends, holidays and half days', () => {
    const { ctx } = fixture({
      calendarExceptions: [
        { scopeType: 'all', scopeId: null, date: '2026-10-15', type: 'holiday' },
        { scopeType: 'plant', scopeId: 'p1', date: '2026-10-16', type: 'halfday', shiftId: 'h', minutes: '' },
      ],
    });
    const line = ctx.lines.l1;
    expect(getDayInfo(ctx, line, '2026-10-18').minutes).toBe(0); // Sunday
    expect(getDayInfo(ctx, line, '2026-10-15').minutes).toBe(0); // holiday
    expect(getDayInfo(ctx, line, '2026-10-16').minutes).toBe(240); // half day
  });

  it('flags missing workforce instead of assuming a full line', () => {
    const { ctx } = fixture({ workforce: [] });
    const plan = planAllocation(ctx, { id: 'a', orderId: 'o1', lineId: 'l1', startDate: TODAY, qty: 100 });
    expect(plan.missingWorkforce).toBe(true);
    expect(plan.overflow).toBe(true);
  });
});

describe('planAllocation', () => {
  it('applies the ladder day by day and skips non-working days', () => {
    const { ctx } = fixture();
    const plan = planAllocation(ctx, { id: 'a', orderId: 'o1', lineId: 'l1', startDate: TODAY, qty: 3000 });
    expect(plan.days.map((d) => d.eff).slice(0, 5)).toEqual([35, 40, 45, 50, 50]);
    expect(plan.days.map((d) => d.qty).slice(0, 4)).toEqual([252, 288, 324, 360]);
    expect(plan.days.reduce((s, d) => s + d.qty, 0)).toBe(3000);
    expect(plan.days.some((d) => d.date === '2026-10-17' || d.date === '2026-10-18')).toBe(false);
  });

  it('finishes sooner when starting higher on the ladder', () => {
    const { ctx } = fixture();
    const base = planAllocation(ctx, { id: 'a', orderId: 'o1', lineId: 'l1', startDate: TODAY, qty: 1300 });
    const repeat = planAllocation(ctx, { id: 'a', orderId: 'o1', lineId: 'l1', startDate: TODAY, qty: 1300, ladderStart: 3 });
    expect([base.workingDays, repeat.workingDays]).toEqual([5, 4]);
    expect(repeat.workingDays).toBeLessThan(base.workingDays);
  });

  it('marks plans incomplete when no ladder levels exist', () => {
    const { ctx } = fixture({ efficiencyLevels: [] });
    expect(planAllocation(ctx, { id: 'a', orderId: 'o1', lineId: 'l1', startDate: TODAY, qty: 100 }).incomplete).toBe(true);
  });
});

describe('conflicts, validation and Daily Align', () => {
  const allocs = [
    { id: 'a1', orderId: 'o1', lineId: 'l1', startDate: TODAY, qty: 3000 },
    { id: 'a2', orderId: 'o2', lineId: 'l1', startDate: '2026-10-16', qty: 1000 },
  ];
  const orders = [
    { id: 'o1', poNo: 'PO-1', styleId: 's1', qty: 3000, deliveryDate: '2026-11-30' },
    { id: 'o2', poNo: 'PO-2', styleId: 's1', qty: 1000, deliveryDate: '2026-11-30' },
  ];

  it('detects overlapping allocations on a line', () => {
    const { ctx } = fixture({ orders });
    const a = analyzeAllocations(ctx, allocs, []);
    expect(a.a1.conflicts).toEqual(['a2']);
    expect(a.a2.issues.some((i) => i.code === 'overlap')).toBe(true);
  });

  it('rejects placements on inactive lines and duplicate allocations', () => {
    const { ctx } = fixture({ orders, lines: [{ id: 'l1', plantId: 'p1', code: 'L1', status: 'inactive', categories: [] }] });
    const res = validatePlacement(ctx, allocs, { ...allocs[0] }, []);
    expect(res.errors.join(' ')).toMatch(/inactive/);
    const { ctx: ctx2 } = fixture({ orders });
    const dup = validatePlacement(ctx2, allocs, { ...allocs[0], id: 'new' }, []);
    expect(dup.errors.join(' ')).toMatch(/identical allocation/);
  });

  it('Daily Align sequences overlaps and does not move locked allocations', () => {
    const { ctx } = fixture({ orders });
    const changes = dailyAlign(ctx, allocs, '2026-10-01', '2026-12-31');
    expect(changes).toHaveLength(1);
    const end1 = planAllocation(ctx, allocs[0]).end;
    expect(changes[0].toStart > end1).toBe(true);
    expect(dailyAlign(ctx, allocs.map((a) => ({ ...a, locked: true })), '2026-10-01', '2026-12-31')).toHaveLength(0);
  });
});

describe('milestones', () => {
  it('derives overdue and dependency risk from dates', () => {
    const ms = [
      { id: 'm1', orderId: 'o1', type: 'fabric', plannedDate: '2026-10-10', status: 'in_progress', dependsOn: [] },
      { id: 'm2', orderId: 'o1', type: 'cutting', plannedDate: '2026-10-25', status: 'pending', dependsOn: ['m1'] },
    ];
    const byId = indexById(ms);
    expect(effectiveStatus(ms[0], TODAY, byId)).toBe('overdue');
    expect(effectiveStatus(ms[1], TODAY, byId)).toBe('at_risk');
    expect(effectiveStatus({ ...ms[0], status: 'completed' }, TODAY, byId)).toBe('completed');
    expect(orderReadiness(ms, TODAY, ms).state).toBe('blocked');
  });
});

describe('demo data', () => {
  const data = createDemoData(TODAY);
  const ctx = buildContext(data, TODAY);

  it('has referential integrity', () => {
    const ids = (k) => new Set(data[k].map((x) => x.id));
    const lines = ids('lines');
    const orders = ids('orders');
    expect(data.lines.every((l) => ids('plants').has(l.plantId))).toBe(true);
    expect(data.allocations.every((a) => lines.has(a.lineId) && orders.has(a.orderId))).toBe(true);
    expect(data.outputs.every((r) => lines.has(r.lineId) && orders.has(r.orderId))).toBe(true);
    expect(data.milestones.every((m) => orders.has(m.orderId))).toBe(true);
    expect(data.orders.every((o) => ids('styles').has(o.styleId))).toBe(true);
  });

  it('covers the scenarios needed for the demo', () => {
    const analysis = analyzeAllocations(ctx, data.allocations, data.milestones);
    const sums = Object.values(summarizeOrders(ctx, data.allocations, analysis, data.milestones, data.outputs));
    const count = (fn) => sums.filter(fn).length;
    expect(data.plants.length).toBe(5);
    expect(data.lines.filter((l) => l.status === 'active').length).toBe(8);
    expect(data.orders.length).toBeGreaterThanOrEqual(12);
    expect(data.orders.length).toBeLessThanOrEqual(32);
    expect(count((s) => s.status === 'unplanned')).toBeGreaterThan(0);
    expect(count((s) => s.status === 'completed')).toBeGreaterThan(0);
    expect(count((s) => s.status === 'in_production')).toBeGreaterThan(0);
    expect(count((s) => s.status === 'partial')).toBeGreaterThan(0);
    expect(count((s) => s.risk === 'critical')).toBeGreaterThan(0);
    expect(count((s) => s.readiness.state === 'blocked')).toBeGreaterThan(0);
    expect(Object.values(analysis).some((e) => e.conflicts.length)).toBe(true);
    expect(data.efficiencyLevels.map((l) => l.percent)).toEqual([35, 40, 45, 50]);
  });

  it('never records more good pieces than ordered', () => {
    for (const o of data.orders) {
      const good = data.outputs.filter((r) => r.orderId === o.id).reduce((s, r) => s + r.good, 0);
      expect(good).toBeLessThanOrEqual(o.qty);
    }
  });
});
