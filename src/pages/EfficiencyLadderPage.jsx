import { useMemo, useState } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, RotateCcw, TrendingUp } from 'lucide-react';
import { useAppStore, useCan } from '../store/appStore';
import { useDerived } from '../hooks/useDerived';
import { Alert, Button, Card, PageHeader, Stat, cn } from '../components/common/ui';
import { DataTable } from '../components/common/DataTable';
import { FormModal } from '../components/common/FormModal';
import { confirm } from '../components/common/confirm';
import { buildContext, validateLadder } from '../services/capacityService';
import { ladderSteps, planAllocation } from '../services/schedulingService';
import { fmtNum, uid } from '../utils/formatters';

const DEMO_LEVELS = [
  { label: 'Day 1 — set-up & learning', percent: 35, startDay: 1 },
  { label: 'Day 2 — ramp-up', percent: 40, startDay: 2 },
  { label: 'Day 3 — ramp-up', percent: 45, startDay: 3 },
  { label: 'Day 4+ — standard', percent: 50, startDay: 4 },
];

const schema = z.object({
  label: z.string().trim().min(2, 'Enter a short label').max(40),
  percent: z.coerce.number({ message: 'Enter a percentage' }).int('Whole percent only').min(5, 'Minimum 5%').max(100, 'Maximum 100%'),
  startDay: z.coerce.number({ message: 'Enter a day' }).int('Whole day only').min(1, 'Day 1 or later').max(60, 'Day 60 or earlier'),
});

export default function EfficiencyLadderPage() {
  const data = useAppStore((s) => s.data);
  const commit = useAppStore((s) => s.commit);
  const canEdit = useCan('masterdata');
  const d = useDerived();
  const [editing, setEditing] = useState(null);
  const levels = d.ctx.levels;
  const steps = ladderSteps(levels, 0);

  const usage = useMemo(() => {
    const counts = levels.map(() => 0);
    for (const a of data.allocations) counts[Math.min(a.ladderStart || 0, Math.max(0, levels.length - 1))]++;
    return counts;
  }, [data.allocations, levels]);

  /** Recalculate the saved plan with the proposed ladder so the planner sees the impact of a change. */
  const impactOf = (nextLevels) => {
    const ctx = buildContext({ ...data, efficiencyLevels: nextLevels }, d.today);
    let moved = 0;
    let late = 0;
    for (const a of data.allocations) {
      const before = d.analysis[a.id]?.plan;
      const after = planAllocation(ctx, a);
      if (!before || after.end < d.today) continue;
      if (after.end !== before.end) moved++;
      const order = ctx.orders[a.orderId];
      if (order && after.end > order.deliveryDate && before.end <= order.deliveryDate) late++;
    }
    return { moved, late };
  };

  const save = (nextLevels, summary) => {
    const problem = validateLadder(nextLevels);
    if (problem) {
      toast.error('Ladder not saved', { description: problem });
      return false;
    }
    const impact = impactOf(nextLevels);
    commit((dd) => ({ ...dd, efficiencyLevels: nextLevels }), [{ entity: 'efficiency', entityId: '-', action: 'updated', summary, before: levels.map((l) => `${l.percent}%@d${l.startDay}`).join(', '), after: [...nextLevels].sort((a, b) => a.startDay - b.startDay).map((l) => `${l.percent}%@d${l.startDay}`).join(', ') }]);
    const desc = impact.moved ? `${impact.moved} allocation finish date(s) recalculated${impact.late ? ` · ${impact.late} now finish after delivery` : ''}.` : 'No planned finish dates changed.';
    if (impact.late) toast.warning(summary, { description: desc });
    else toast.success(summary, { description: desc });
    return true;
  };

  const remove = async (level) => {
    if (levels.length === 1) return toast.error('The ladder needs at least one level');
    const next = levels.filter((l) => l.id !== level.id);
    const problem = validateLadder(next);
    if (problem) return toast.error(`Cannot remove ${level.percent}%`, { description: problem });
    const impact = impactOf(next);
    const ok = await confirm({
      title: `Remove the ${level.percent}% level?`,
      message: `${impact.moved} planned allocation(s) will be recalculated${impact.late ? ` and ${impact.late} will finish after delivery` : ''}. Allocations that started at this level will start at the nearest remaining level.`,
      confirmLabel: 'Remove level',
      danger: true,
    });
    if (ok) save(next, `Efficiency level ${level.percent}% removed`);
  };

  const resetDemo = async () => {
    if (await confirm({ title: 'Restore demo ladder?', message: 'Replaces the current levels with 35% → 40% → 45% → 50%. All plans are recalculated.', confirmLabel: 'Restore' })) {
      save(DEMO_LEVELS.map((l, i) => ({ ...l, id: `ef-${i + 1}` })), 'Efficiency ladder restored to demo levels');
    }
  };

  // Worked example so the planner can see how the ladder shapes daily output.
  const example = useMemo(() => {
    const smv = 20;
    const minutes = 30 * 480;
    let remaining = 3000;
    const days = [];
    for (let k = 0; remaining > 0 && k < 60 && steps.length; k++) {
      const eff = steps[Math.min(k, steps.length - 1)];
      const pcs = Math.min(remaining, Math.floor((minutes * eff) / 100 / smv));
      days.push({ day: k + 1, eff, pcs });
      remaining -= pcs;
    }
    const target = steps[steps.length - 1] || 0;
    const targetPcs = Math.floor((minutes * target) / 100 / smv);
    const flatDays = target ? Math.ceil(3000 / targetPcs) : 0;
    // Pieces not produced during ramp-up compared with running at target efficiency from day 1.
    const loss = days.slice(0, steps.length - 1).reduce((s, r) => s + Math.max(0, targetPcs - r.pcs), 0);
    return { days, flatDays, loss };
  }, [steps]);

  const maxPct = Math.max(60, ...levels.map((l) => l.percent));
  const lastDay = levels.length ? levels[levels.length - 1].startDay : 1;

  return (
    <div>
      <PageHeader
        title="Efficiency Ladder"
        subtitle="Planned efficiency by production day after a style changeover. Used by every capacity calculation and the planning board."
        actions={canEdit && (
          <>
            <Button icon={RotateCcw} onClick={resetDemo}>Restore demo levels</Button>
            <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Add level</Button>
          </>
        )}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Levels" value={levels.length} icon={TrendingUp} />
        <Stat label="Starting efficiency" value={levels.length ? `${levels[0].percent}%` : '—'} />
        <Stat label="Target efficiency" value={levels.length ? `${levels[levels.length - 1].percent}%` : '—'} tone="blue" sub={levels.length ? `reached on day ${lastDay}` : undefined} />
        <Stat label="Allocations using ladder" value={fmtNum(data.allocations.length)} sub="recalculated on every change" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Card title="Ladder levels" subtitle="Each level applies from its start day until the next level begins; the last level holds until the order finishes." bodyClass="">
            <DataTable
              rows={levels.map((l, i) => ({ ...l, index: i }))}
              initialSort={{ key: 'startDay', dir: 'asc' }}
              columns={[
                { key: 'index', header: 'Level', cell: (r) => <span className="font-semibold text-slate-900">L{r.index + 1}</span>, sort: (r) => r.index },
                { key: 'label', header: 'Label' },
                { key: 'percent', header: 'Efficiency', align: 'right', cell: (r) => <span className="font-semibold">{r.percent}%</span> },
                { key: 'startDay', header: 'Applies from', cell: (r) => (r.index === levels.length - 1 ? `Day ${r.startDay} onward` : `Day ${r.startDay}${levels[r.index + 1].startDay - 1 > r.startDay ? `–${levels[r.index + 1].startDay - 1}` : ''}`) },
                { key: 'usage', header: 'Allocations starting here', align: 'right', sort: (r) => usage[r.index], cell: (r) => fmtNum(usage[r.index]) },
                {
                  key: 'a', header: '', sortable: false, className: 'w-[1%]',
                  cell: (r) => canEdit && (
                    <div className="flex justify-end gap-0.5">
                      <Button size="icon-sm" variant="ghost" icon={Pencil} aria-label={`Edit ${r.percent}% level`} onClick={() => setEditing(r)} />
                      <Button size="icon-sm" variant="ghost" icon={Trash2} aria-label={`Remove ${r.percent}% level`} className="hover:text-red-600" onClick={() => remove(r)} />
                    </div>
                  ),
                },
              ]}
            />
          </Card>

          <Card title="Ladder profile" subtitle="Planned efficiency for the first production days">
            <div className="flex h-40 items-end gap-1.5">
              {Array.from({ length: Math.max(lastDay + 2, 6) }, (_, k) => {
                const eff = steps[Math.min(k, steps.length - 1)] || 0;
                return (
                  <div key={k} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[11px] font-semibold tabular-nums text-slate-700">{eff}%</span>
                    <div className={cn('w-full rounded-t', k < lastDay - 1 ? 'bg-blue-300' : 'bg-blue-600')} style={{ height: `${(eff / maxPct) * 100}px` }} />
                    <span className="text-[11px] text-slate-500">D{k + 1}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Worked example" subtitle="3,000 pcs · SMV 20 · 30 MOS × 480 min">
            {example.days.length ? (
              <>
                <table className="w-full">
                  <thead><tr>{['Day', 'Efficiency', 'Pieces'].map((h) => <th key={h} className="th py-1.5">{h}</th>)}</tr></thead>
                  <tbody>
                    {example.days.slice(0, 8).map((r) => (
                      <tr key={r.day}>
                        <td className="td py-1.5">Day {r.day}</td>
                        <td className="td py-1.5">{r.eff}%</td>
                        <td className="td py-1.5 tabular-nums">{fmtNum(r.pcs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {example.days.length > 8 && <p className="mt-1 text-xs text-slate-400">+ {example.days.length - 8} more day(s)</p>}
                <p className="mt-3 text-xs text-slate-600">
                  With the ladder: <b>{example.days.length} working days</b> ({example.flatDays} at flat target efficiency). Ramp-up learning loss: <b>{fmtNum(example.loss)} pcs</b>{example.days.length > example.flatDays ? `, adding ${example.days.length - example.flatDays} day(s)` : ''}.
                </p>
              </>
            ) : <p className="text-xs text-slate-500">Add at least one level.</p>}
          </Card>
          <Alert tone="gray" title="How the planning board uses the ladder">
            Daily capacity = MOS × working minutes × ladder efficiency ÷ SMV. Each allocation starts at level 1 unless the planner chooses a higher start level (e.g. a repeat style) when scheduling or moving it. Planned efficiency is kept separate from actual output.
          </Alert>
        </div>
      </div>

      <FormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.percent}% level` : 'Add efficiency level'}
        description="Rules: the first level starts on day 1, each start day is unique, and efficiency cannot decrease on later days."
        schema={schema}
        defaultValues={editing?.id ? { label: editing.label, percent: editing.percent, startDay: editing.startDay } : { label: `Day ${lastDay + 1}+`, percent: Math.min(100, (levels[levels.length - 1]?.percent || 30) + 5), startDay: lastDay + 1 }}
        fields={[
          { name: 'percent', label: 'Efficiency (%)', type: 'number', required: true },
          { name: 'startDay', label: 'Applies from production day', type: 'number', required: true },
          { name: 'label', label: 'Label', required: true, span: 2 },
        ]}
        onSubmit={(v) => {
          const item = { id: editing.id || uid('ef'), label: v.label, percent: v.percent, startDay: v.startDay };
          const next = editing.id ? levels.map((l) => (l.id === item.id ? item : l)) : [...levels, item];
          return save(next, editing.id ? `Efficiency level updated to ${item.percent}% from day ${item.startDay}` : `Efficiency level ${item.percent}% added from day ${item.startDay}`);
        }}
      />
    </div>
  );
}
