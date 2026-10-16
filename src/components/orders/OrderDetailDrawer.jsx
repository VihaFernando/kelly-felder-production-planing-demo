import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarRange, Pencil, Route as RouteIcon, AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore, useCan } from '../../store/appStore';
import { useDerived } from '../../hooks/useDerived';
import { Badge, Button, Drawer, KeyValue, ProgressBar, StatusBadge, cn } from '../common/ui';
import { fmtDate, fmtDateTime, fmtShort, todayISO } from '../../utils/dateUtils';
import { fmtNum, pct } from '../../utils/formatters';
import { effectiveStatus } from '../../services/milestoneService';
import { OrderFormModal } from './OrderFormModal';

export function OrderDetailDrawer() {
  const id = useAppStore((s) => s.orderPanelId);
  const close = useAppStore((s) => s.closeOrder);
  const data = useAppStore((s) => s.data);
  const commit = useAppStore((s) => s.commit);
  const canOrders = useCan('orders');
  const canMs = useCan('milestones');
  const d = useDerived();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const sum = id ? d.orders[id] : null;
  if (!id) return null;
  if (!sum) return null;
  const o = sum.order;
  const style = d.ctx.styles[o.styleId];
  const buyer = style ? d.ctx.buyers[style.buyerId] : null;
  const milestones = data.milestones.filter((m) => m.orderId === o.id).sort((a, b) => (a.plannedDate < b.plannedDate ? -1 : 1));
  const outputs = data.outputs.filter((r) => r.orderId === o.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const history = data.audit.filter((a) => a.entityId === o.id || sum.allocs.some((al) => al.id === a.entityId)).slice(0, 8);
  const today = todayISO();
  const progress = pct(sum.good, o.qty);

  const toggleMilestone = (m) => {
    const done = m.status === 'completed';
    const next = { ...m, status: done ? 'in_progress' : 'completed', actualDate: done ? null : today, history: [{ at: Date.now(), by: data.settings.user.name, change: done ? 'Reopened' : 'Marked completed' }, ...(m.history || [])] };
    commit((dd) => ({ ...dd, milestones: dd.milestones.map((x) => (x.id === m.id ? next : x)) }), [{ entity: 'milestone', entityId: m.id, action: done ? 'reopened' : 'completed', summary: `${d.typeName(m.type)} ${done ? 'reopened' : 'completed'} for ${o.poNo}` }]);
    toast.success(`${d.typeName(m.type)} ${done ? 'reopened' : 'completed'}`);
  };

  return (
    <>
      <Drawer
        open
        onClose={close}
        width="max-w-2xl"
        title={
          <span className="flex items-center gap-2">
            {o.poNo}
            <span className="font-normal text-slate-400">·</span>
            <span className="font-normal text-slate-600">{style?.code}</span>
          </span>
        }
        subtitle={
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={sum.status} />
            <StatusBadge status={sum.risk} />
            <StatusBadge status={sum.readiness.state} label={`Readiness: ${sum.readiness.state === 'unknown' ? 'n/a' : `${sum.readiness.done}/${sum.readiness.total}`}`} />
            <Badge tone={o.source === 'ERP' ? 'gray' : 'amber'}>{o.source === 'ERP' ? 'ERP order' : 'Manual (demo)'}</Badge>
          </span>
        }
        footer={
          <>
            <Button icon={RouteIcon} onClick={() => { close(); navigate(`/critical-path?order=${o.id}`); }}>Critical path</Button>
            {canOrders && <Button icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}
            <Button variant="primary" icon={CalendarRange} onClick={() => { close(); navigate(`/planning?order=${o.id}`); }}>Open on board</Button>
          </>
        }
      >
        <div className="space-y-5 px-5 py-4">
          {sum.reasons.length > 0 && (
            <div className="space-y-1.5">
              {sum.reasons.slice(0, 4).map((r, i) => (
                <div key={i} className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-xs', r.level === 'critical' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900')}>
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {r.msg}
                </div>
              ))}
            </div>
          )}

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Order</h3>
            <KeyValue
              cols={3}
              items={[
                ['Sales order', `${o.soNo} / ${o.lineItem}`],
                ['Buyer', buyer?.name],
                ['Delivery', <span key="d" className={cn(sum.daysToDelivery < 0 && 'text-red-600')}>{fmtDate(o.deliveryDate)} <span className="text-slate-400">({sum.daysToDelivery}d)</span></span>],
                ['Style', `${style?.code} — ${style?.description}`],
                ['Category', style?.category],
                ['SMV', style?.smv],
                ['Order qty', `${fmtNum(o.qty)} pcs`],
                ['Planned qty', `${fmtNum(sum.plannedQty)} pcs`],
                ['Scheduled', sum.start ? `${fmtShort(sum.start)} → ${fmtShort(sum.end)}` : 'Not scheduled'],
              ]}
            />
          </section>

          <section className="rounded-md border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold uppercase tracking-wide text-slate-500">Production progress</span>
              <span className="tabular-nums text-slate-600">{progress.toFixed(0)}%</span>
            </div>
            <ProgressBar value={progress} tone={sum.status === 'completed' ? 'green' : sum.reasons.some((r) => r.code === 'behind') ? 'amber' : 'blue'} />
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[
                ['Planned to date', sum.plannedToDate],
                ['Good pieces', sum.good],
                ['Remaining', sum.remaining],
                ['Rejects / short', `${fmtNum(sum.rejects)} / ${fmtNum(sum.shortages)}`],
              ].map(([k, v]) => (
                <div key={k}>
                  <div className="text-[11px] text-slate-500">{k}</div>
                  <div className="text-sm font-semibold tabular-nums text-slate-800">{typeof v === 'number' ? fmtNum(v) : v}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Line allocations</h3>
            {sum.allocs.length ? (
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table className="w-full">
                  <thead>
                    <tr>
                      {['Line', 'Dates', 'Qty', 'Efficiency ladder'].map((h) => <th key={h} className="th py-1.5">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sum.allocs.map((a) => {
                      const p = d.analysis[a.id]?.plan;
                      const line = d.ctx.lines[a.lineId];
                      return (
                        <tr key={a.id}>
                          <td className="td py-1.5 font-medium">{line?.code}<span className="ml-1 text-xs font-normal text-slate-400">{d.ctx.plants[line?.plantId]?.code}</span></td>
                          <td className="td py-1.5">{fmtShort(p?.start)} → {fmtShort(p?.end)} <span className="text-xs text-slate-400">({p?.workingDays}d)</span></td>
                          <td className="td py-1.5 tabular-nums">{fmtNum(a.qty)}</td>
                          <td className="td py-1.5 text-xs">{p?.steps?.length ? `${p.startEfficiency}% → ${p.efficiency}%` : <span className="text-red-600">No ladder</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500">Not yet allocated to a line. Open the planning board and drag it from the unplanned list.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Readiness checklist & milestones</h3>
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {milestones.map((m) => {
                const s = effectiveStatus(m, today, d.msById);
                return (
                  <li key={m.id} className="flex items-center gap-2.5 px-3 py-2">
                    <button disabled={!canMs} onClick={() => toggleMilestone(m)} aria-label={m.status === 'completed' ? 'Reopen milestone' : 'Mark milestone complete'} className="text-slate-400 hover:text-emerald-600 disabled:cursor-default">
                      {m.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-800">{d.typeName(m.type)}</div>
                      <div className="text-xs text-slate-500">
                        Plan {fmtShort(m.plannedDate)}
                        {m.actualDate && ` · Actual ${fmtShort(m.actualDate)}`}
                        {m.expectedDate && !m.actualDate && ` · Expected ${fmtShort(m.expectedDate)}`}
                        {' · '}{d.peopleById[m.responsibleId]?.name || 'Unassigned'}
                      </div>
                    </div>
                    <StatusBadge status={s} />
                  </li>
                );
              })}
              {!milestones.length && <li className="px-3 py-3 text-xs text-slate-500">No milestones for this order.</li>}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Production history</h3>
            {outputs.length ? (
              <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 scroll-thin">
                <table className="w-full">
                  <thead className="sticky top-0">
                    <tr>{['Date', 'Line', 'Good', 'Rejects', 'Short'].map((h) => <th key={h} className="th py-1.5">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {outputs.map((r) => (
                      <tr key={r.id}>
                        <td className="td py-1.5">{fmtDate(r.date)}</td>
                        <td className="td py-1.5">{d.ctx.lines[r.lineId]?.code}</td>
                        <td className="td py-1.5 tabular-nums font-medium">{fmtNum(r.good)}</td>
                        <td className="td py-1.5 tabular-nums text-slate-500">{fmtNum(r.rejects)}</td>
                        <td className="td py-1.5 tabular-nums text-slate-500">{fmtNum(r.shortages)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No output recorded yet.</p>
            )}
          </section>

          {history.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Change history</h3>
              <ul className="space-y-1.5 text-xs">
                {history.map((h) => (
                  <li key={h.id} className="flex gap-2">
                    <span className="w-32 shrink-0 text-slate-400">{fmtDateTime(h.at)}</span>
                    <span className="text-slate-700">{h.summary} <span className="text-slate-400">— {h.user}</span></span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </Drawer>
      <OrderFormModal open={editing} onClose={() => setEditing(false)} order={o} />
    </>
  );
}
