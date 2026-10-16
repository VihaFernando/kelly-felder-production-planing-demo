import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, CheckCircle2, AlertTriangle, Ban, Clock, CalendarClock, ArrowRight, Download, MessageSquare, History, Link2 } from 'lucide-react';
import { useAppStore, useCan } from '../store/appStore';
import { useDerived } from '../hooks/useDerived';
import { Alert, Button, Card, Checkbox, Field, FilterSelect, Input, Modal, PageHeader, SearchInput, Select, Stat, StatusBadge, Tabs, Textarea, cn, EmptyState, STATUS } from '../components/common/ui';
import { DataTable } from '../components/common/DataTable';
import { effectiveStatus, daysRemaining, explainMilestone, nextAction, isReadinessType, MILESTONE_STATUSES } from '../services/milestoneService';
import { exportCsv } from '../services/importExportService';
import { diffDays, fmtDate, fmtDateTime, fmtShort, isValidISO, addDaysISO } from '../utils/dateUtils';
import { uid } from '../utils/formatters';

const RANK = { blocked: 0, overdue: 0, at_risk: 1, in_progress: 2, pending: 3, completed: 4 };

export default function CriticalPathPage() {
  const data = useAppStore((s) => s.data);
  const openOrder = useAppStore((s) => s.openOrder);
  const canEdit = useCan('milestones');
  const d = useDerived();
  const { today, orders, ctx } = d;
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('list');
  const [q, setQ] = useState('');
  const [f, setF] = useState({ plant: '', type: '', status: '', owner: '', from: '', to: '' });
  const [criticalOnly, setCriticalOnly] = useState(params.get('flag') === 'critical');
  const [showCompleted, setShowCompleted] = useState(false);
  const [editing, setEditing] = useState(null);
  const orderFilter = params.get('order') || '';
  const [timelineOrder, setTimelineOrder] = useState(orderFilter);

  useEffect(() => {
    const mid = params.get('milestone');
    if (mid) {
      const m = data.milestones.find((x) => x.id === mid);
      if (m) setEditing(m);
    }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    return data.milestones
      .map((m) => {
        const s = orders[m.orderId];
        if (!s) return null;
        const status = effectiveStatus(m, today, d.msById);
        const line = ctx.lines[s.allocs[0]?.lineId];
        return { id: m.id, m, s, status, days: daysRemaining(m, today), line, plant: ctx.plants[line?.plantId], style: ctx.styles[s.order.styleId], owner: d.peopleById[m.responsibleId] };
      })
      .filter(Boolean)
      .filter((r) => {
        if (orderFilter && r.m.orderId !== orderFilter) return false;
        if (!showCompleted && r.status === 'completed' && !orderFilter) return false;
        if (['completed', 'cancelled'].includes(r.s.status) && r.status !== 'completed' && !orderFilter) return false;
        if (criticalOnly && !['overdue', 'blocked', 'at_risk'].includes(r.status)) return false;
        if (f.plant && r.plant?.id !== f.plant) return false;
        if (f.type && r.m.type !== f.type) return false;
        if (f.status && r.status !== f.status) return false;
        if (f.owner && r.m.responsibleId !== f.owner) return false;
        if (f.from && r.m.plannedDate < f.from) return false;
        if (f.to && r.m.plannedDate > f.to) return false;
        if (q && !`${r.s.order.poNo} ${r.style?.code} ${d.typeName(r.m.type)}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => RANK[a.status] - RANK[b.status] || a.m.plannedDate.localeCompare(b.m.plannedDate));
  }, [data.milestones, orders, today, d, ctx, orderFilter, showCompleted, criticalOnly, f, q]);

  const stats = useMemo(() => {
    const all = data.milestones.filter((m) => orders[m.orderId] && !['completed', 'cancelled'].includes(orders[m.orderId].status)).map((m) => ({ m, s: effectiveStatus(m, today, d.msById) }));
    return {
      overdue: all.filter((x) => x.s === 'overdue').length,
      blocked: all.filter((x) => x.s === 'blocked').length,
      atRisk: all.filter((x) => x.s === 'at_risk').length,
      due7: all.filter((x) => x.s !== 'completed' && diffDays(x.m.plannedDate, today) >= 0 && diffDays(x.m.plannedDate, today) <= 7).length,
      done7: data.milestones.filter((m) => m.status === 'completed' && m.actualDate && diffDays(today, m.actualDate) <= 7).length,
    };
  }, [data.milestones, orders, today, d.msById]);

  const priority = rows.filter((r) => ['overdue', 'blocked', 'at_risk'].includes(r.status) && isReadinessType(r.m.type, data.milestoneTypes)).slice(0, 6);

  const impact = (r) => {
    if (!r.s.start) return <span className="text-slate-500">Not scheduled · due {fmtShort(r.s.order.deliveryDate)}</span>;
    if (r.status === 'completed') return <span className="text-slate-400">—</span>;
    const ref = r.m.expectedDate && r.m.expectedDate > r.m.plannedDate ? r.m.expectedDate : r.m.plannedDate;
    const buffer = diffDays(r.s.start, ref > today ? ref : today);
    if (!isReadinessType(r.m.type, data.milestoneTypes)) return <span className="text-slate-500">Start {fmtShort(r.s.start)}</span>;
    if (buffer <= 0 || r.status === 'blocked' || r.status === 'overdue') return <span className="font-medium text-red-600">Start {fmtShort(r.s.start)} at risk</span>;
    return <span className={cn(buffer <= 3 ? 'text-amber-700' : 'text-slate-600')}>Start {fmtShort(r.s.start)} · {buffer}d buffer</span>;
  };

  const columns = [
    { key: 'po', header: 'Order', sort: (r) => r.s.order.poNo, cell: (r) => <button className="font-semibold text-slate-900 hover:text-blue-700 hover:underline" onClick={(e) => { e.stopPropagation(); openOrder(r.s.order.id); }}>{r.s.order.poNo}</button> },
    { key: 'style', header: 'Style', sort: (r) => r.style?.code, cell: (r) => r.style?.code },
    { key: 'line', header: 'Plant / Line', sort: (r) => r.line?.code || 'zzz', cell: (r) => (r.line ? `${r.plant?.code} / ${r.line.code}` : <span className="text-slate-400">Unplanned</span>) },
    { key: 'type', header: 'Milestone', sort: (r) => d.typeName(r.m.type), cell: (r) => <span className="font-medium">{d.typeName(r.m.type)}{r.m.dependsOn?.length > 0 && <Link2 className="ml-1 inline h-3 w-3 text-slate-400" aria-label="Has dependencies" />}</span> },
    { key: 'planned', header: 'Planned', sort: (r) => r.m.plannedDate, cell: (r) => fmtDate(r.m.plannedDate) },
    { key: 'exp', header: 'Expected / Actual', sort: (r) => r.m.actualDate || r.m.expectedDate || '', cell: (r) => (r.m.actualDate ? <span className="text-emerald-700">{fmtDate(r.m.actualDate)}</span> : r.m.expectedDate ? <span className={cn(r.m.expectedDate > r.m.plannedDate && 'font-medium text-amber-700')}>{fmtDate(r.m.expectedDate)}</span> : <span className="text-slate-400">—</span>) },
    { key: 'owner', header: 'Responsible', sort: (r) => r.owner?.name, cell: (r) => r.owner?.name || <span className="text-slate-400">Unassigned</span> },
    { key: 'status', header: 'Status', sort: (r) => RANK[r.status], cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'days', header: 'Days', align: 'right', sort: (r) => r.days ?? 9999, cell: (r) => (r.days == null ? '—' : <span className={cn('font-medium', r.days < 0 ? 'text-red-600' : r.days <= 2 ? 'text-amber-700' : 'text-slate-600')}>{r.days < 0 ? `${-r.days}d late` : `${r.days}d`}</span>) },
    { key: 'impact', header: 'Impact on production', sortable: false, cell: impact },
  ];

  const doExport = () =>
    exportCsv('critical-path.csv', rows, [
      { header: 'Order', value: (r) => r.s.order.poNo },
      { header: 'Style', value: (r) => r.style?.code },
      { header: 'Line', value: (r) => r.line?.code || '' },
      { header: 'Milestone', value: (r) => d.typeName(r.m.type) },
      { header: 'Planned', value: (r) => r.m.plannedDate },
      { header: 'Expected', value: (r) => r.m.expectedDate || '' },
      { header: 'Actual', value: (r) => r.m.actualDate || '' },
      { header: 'Responsible', value: (r) => r.owner?.name || '' },
      { header: 'Status', value: (r) => STATUS[r.status]?.label },
      { header: 'Days', value: (r) => r.days ?? '' },
    ]);

  const filterCount = Object.values(f).filter(Boolean).length + (criticalOnly ? 1 : 0) + (q ? 1 : 0);

  return (
    <div>
      <PageHeader
        title="Critical Path & Follow-ups"
        subtitle="Production prerequisites by order. Statuses are calculated from dates and dependencies."
        actions={
          <>
            <Button icon={Download} onClick={doExport}>Export CSV</Button>
            {canEdit && <Button variant="primary" icon={Plus} onClick={() => setEditing({ isNew: true, orderId: orderFilter || '' })}>New milestone</Button>}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Overdue" value={stats.overdue} tone={stats.overdue ? 'red' : 'green'} icon={AlertTriangle} onClick={() => { setF({ ...f, status: 'overdue' }); setCriticalOnly(false); }} />
        <Stat label="Blocked" value={stats.blocked} tone={stats.blocked ? 'red' : 'green'} icon={Ban} onClick={() => { setF({ ...f, status: 'blocked' }); setCriticalOnly(false); }} />
        <Stat label="At risk" value={stats.atRisk} tone={stats.atRisk ? 'amber' : 'green'} icon={Clock} onClick={() => { setF({ ...f, status: 'at_risk' }); setCriticalOnly(false); }} />
        <Stat label="Due in 7 days" value={stats.due7} icon={CalendarClock} onClick={() => { setF({ ...f, status: '', from: today, to: addDaysISO(today, 7) }); }} />
        <Stat label="Completed (7 days)" value={stats.done7} tone="green" icon={CheckCircle2} />
      </div>

      <Tabs className="mb-4 mt-4" value={tab} onChange={setTab} tabs={[{ value: 'list', label: 'Follow-up list', count: rows.length }, { value: 'timeline', label: 'Order timeline' }]} />

      {tab === 'list' ? (
        <div className="grid gap-4 2xl:grid-cols-[1fr_380px]">
          <Card bodyClass="">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
              <SearchInput value={q} onChange={setQ} placeholder="Search order, style, milestone…" className="w-56" />
              <FilterSelect value={f.plant} onChange={(v) => setF({ ...f, plant: v })} options={data.plants.map((p) => ({ value: p.id, label: p.code }))} placeholder="All plants" className="!min-w-[110px]" />
              <FilterSelect value={f.type} onChange={(v) => setF({ ...f, type: v })} options={data.milestoneTypes.map((t) => ({ value: t.id, label: t.name }))} placeholder="All milestones" />
              <FilterSelect value={f.status} onChange={(v) => setF({ ...f, status: v })} options={['overdue', 'blocked', 'at_risk', 'in_progress', 'pending', 'completed'].map((s) => ({ value: s, label: STATUS[s].label }))} placeholder="Any status" className="!min-w-[115px]" />
              <FilterSelect value={f.owner} onChange={(v) => setF({ ...f, owner: v })} options={data.people.map((p) => ({ value: p.id, label: p.name }))} placeholder="Anyone" />
              <Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="!w-[138px]" aria-label="Planned from" title="Planned from" />
              <Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="!w-[138px]" aria-label="Planned to" title="Planned to" />
              <Checkbox label="Critical / overdue only" checked={criticalOnly} onChange={setCriticalOnly} />
              <Checkbox label="Show completed" checked={showCompleted} onChange={setShowCompleted} />
              {(filterCount > 0 || orderFilter) && <Button size="sm" variant="ghost" onClick={() => { setF({ plant: '', type: '', status: '', owner: '', from: '', to: '' }); setQ(''); setCriticalOnly(false); setParams({}); }}>Clear filters</Button>}
            </div>
            {orderFilter && <div className="border-b border-blue-100 bg-blue-50 px-3 py-1.5 text-xs text-blue-800">Showing all milestones for <b>{orders[orderFilter]?.order.poNo}</b>.</div>}
            <DataTable columns={columns} rows={rows} onRowClick={(r) => setEditing(r.m)} rowClass={(r) => (r.status === 'overdue' || r.status === 'blocked' ? 'bg-red-50/40' : '')} empty={<EmptyState icon={CheckCircle2} title="No milestones match">Try clearing filters or enabling “Show completed”.</EmptyState>} />
          </Card>
          <Card title="Priority actions" subtitle="What is delayed, who owns it and what to do next" bodyClass="divide-y divide-slate-100">
            {priority.map((r) => (
              <button key={r.id} onClick={() => setEditing(r.m)} className="block w-full px-4 py-3 text-left hover:bg-slate-50">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-slate-900">{d.typeName(r.m.type)} · {r.s.order.poNo}</span>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-1 text-xs text-slate-600">{explainMilestone(r.m, today, d.msById, d.typeName)}</p>
                <dl className="mt-1.5 grid grid-cols-[80px_1fr] gap-x-2 gap-y-0.5 text-xs">
                  <dt className="text-slate-400">Responsible</dt><dd className="text-slate-700">{r.owner?.name || 'Unassigned'}{r.owner && <span className="text-slate-400"> · {r.owner.department}</span>}</dd>
                  <dt className="text-slate-400">Date at risk</dt><dd className="text-slate-700">{r.s.start ? `Production start ${fmtDate(r.s.start)} on ${r.line?.code}` : `Delivery ${fmtDate(r.s.order.deliveryDate)} (unplanned)`}</dd>
                  <dt className="text-slate-400">Next action</dt><dd className="font-medium text-slate-800">{nextAction(r.m)}</dd>
                </dl>
              </button>
            ))}
            {!priority.length && <EmptyState icon={CheckCircle2} title="No urgent follow-ups">All prerequisites in view are on track.</EmptyState>}
          </Card>
        </div>
      ) : (
        <OrderTimeline orderId={timelineOrder} setOrderId={setTimelineOrder} onEdit={setEditing} />
      )}

      {editing && (
        <MilestoneDialog
          milestone={editing}
          onClose={() => {
            setEditing(null);
            if (params.get('milestone')) { const p = new URLSearchParams(params); p.delete('milestone'); setParams(p); }
          }}
        />
      )}
    </div>
  );
}

function OrderTimeline({ orderId, setOrderId, onEdit }) {
  const data = useAppStore((s) => s.data);
  const d = useDerived();
  const s = d.orders[orderId];
  const ms = data.milestones.filter((m) => m.orderId === orderId).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  const options = Object.values(d.orders).filter((x) => !['completed', 'cancelled'].includes(x.status)).sort((a, b) => a.order.poNo.localeCompare(b.order.poNo));
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <Field label="Order" className="w-80">
          <Select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
            <option value="">Select an order…</option>
            {options.map((x) => <option key={x.order.id} value={x.order.id}>{x.order.poNo} — {d.ctx.styles[x.order.styleId]?.code} ({STATUS[x.readiness.state]?.label})</option>)}
          </Select>
        </Field>
        {s && (
          <div className="flex flex-wrap gap-4 pt-4 text-xs text-slate-600">
            <span>Start <b className="text-slate-800">{s.start ? fmtDate(s.start) : 'Unplanned'}</b></span>
            <span>Finish <b className="text-slate-800">{s.end ? fmtDate(s.end) : '—'}</b></span>
            <span>Delivery <b className="text-slate-800">{fmtDate(s.order.deliveryDate)}</b></span>
            <StatusBadge status={s.readiness.state} />
          </div>
        )}
      </div>
      {s ? (
        <ol className="relative mt-5 ml-2 border-l-2 border-slate-200">
          {ms.map((m) => {
            const st = effectiveStatus(m, d.today, d.msById);
            const deps = (m.dependsOn || []).map((id) => d.msById[id]).filter(Boolean);
            const dot = { completed: 'bg-emerald-500', overdue: 'bg-red-500', blocked: 'bg-red-500', at_risk: 'bg-amber-500', in_progress: 'bg-blue-500', pending: 'bg-slate-300' }[st];
            return (
              <li key={m.id} className="mb-4 ml-5">
                <span className={cn('absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full ring-4 ring-white', dot)} />
                <button onClick={() => onEdit(m)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-left hover:bg-slate-50 sm:w-[560px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-slate-800">{d.typeName(m.type)}</span>
                    <StatusBadge status={st} />
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    Planned {fmtDate(m.plannedDate)}{m.expectedDate && !m.actualDate ? ` · Expected ${fmtDate(m.expectedDate)}` : ''}{m.actualDate ? ` · Done ${fmtDate(m.actualDate)}` : ''} · {d.peopleById[m.responsibleId]?.name || 'Unassigned'}
                  </div>
                  {deps.length > 0 && <div className="mt-1 text-[11px] text-slate-400">Depends on: {deps.map((x) => d.typeName(x.type)).join(', ')}</div>}
                  {st !== 'completed' && explainMilestone(m, d.today, d.msById, d.typeName) && <div className="mt-1 text-xs text-amber-800">{explainMilestone(m, d.today, d.msById, d.typeName)}</div>}
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState title="Select an order to view its critical path" />
      )}
    </Card>
  );
}

function MilestoneDialog({ milestone, onClose }) {
  const data = useAppStore((s) => s.data);
  const commit = useAppStore((s) => s.commit);
  const notify = useAppStore((s) => s.notify);
  const canEdit = useCan('milestones');
  const d = useDerived();
  const isNew = !!milestone.isNew;
  const [v, setV] = useState(() => ({
    orderId: milestone.orderId || '', type: milestone.type || '', plannedDate: milestone.plannedDate || addDaysISO(d.today, 7), expectedDate: milestone.expectedDate || '', actualDate: milestone.actualDate || '',
    responsibleId: milestone.responsibleId || '', status: milestone.status || 'pending', blockReason: milestone.blockReason || '', dependsOn: milestone.dependsOn || [],
  }));
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));

  const order = data.orders.find((o) => o.id === v.orderId);
  const siblings = data.milestones.filter((m) => m.orderId === v.orderId && m.id !== milestone.id);
  const effective = effectiveStatus({ ...milestone, ...v }, d.today, d.msById);
  const user = data.settings.user.name;

  const validate = (next) => {
    const e = {};
    if (!next.orderId) e.orderId = 'Select an order';
    if (!next.type) e.type = 'Select a milestone type';
    if (!isValidISO(next.plannedDate)) e.plannedDate = 'Valid planned date required';
    if (next.expectedDate && !isValidISO(next.expectedDate)) e.expectedDate = 'Invalid date';
    if (next.status === 'completed' && !isValidISO(next.actualDate)) e.actualDate = 'Actual completion date required';
    if (next.actualDate && next.actualDate > d.today) e.actualDate = 'Actual date cannot be in the future';
    if (next.status === 'blocked' && !next.blockReason.trim()) e.blockReason = 'Explain what is blocking';
    if (isNew && next.type && data.milestones.some((m) => m.orderId === next.orderId && m.type === next.type)) e.type = 'This order already has this milestone';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = (override) => {
    const next = { ...v, ...override };
    if (next.status === 'completed' && !next.actualDate) next.actualDate = d.today;
    if (next.status !== 'completed') next.actualDate = next.actualDate && next.status === 'completed' ? next.actualDate : '';
    if (!validate(next)) return;
    const changes = [];
    if (!isNew) {
      for (const k of ['plannedDate', 'expectedDate', 'actualDate', 'status', 'responsibleId']) {
        if ((milestone[k] || '') !== (next[k] || '')) changes.push(`${k === 'responsibleId' ? 'Responsible' : k.replace('Date', ' date')}: ${k === 'responsibleId' ? d.peopleById[milestone[k]]?.name || '—' : milestone[k] || '—'} → ${k === 'responsibleId' ? d.peopleById[next[k]]?.name || '—' : next[k] || '—'}`);
      }
    }
    const history = [...(comment.trim() ? [{ at: Date.now(), by: user, change: `Comment: ${comment.trim()}` }] : []), ...(changes.length ? [{ at: Date.now(), by: user, change: changes.join('; ') }] : []), ...(isNew ? [{ at: Date.now(), by: user, change: 'Created' }] : []), ...(milestone.history || [])];
    const item = {
      ...(isNew ? {} : milestone), id: isNew ? uid('ms') : milestone.id, orderId: next.orderId, type: next.type, plannedDate: next.plannedDate, expectedDate: next.expectedDate || null, actualDate: next.actualDate || null,
      responsibleId: next.responsibleId || null, status: next.status, blockReason: next.status === 'blocked' ? next.blockReason.trim() : '', dependsOn: next.dependsOn,
      comments: comment.trim() ? [{ at: Date.now(), by: user, text: comment.trim() }, ...(milestone.comments || [])] : milestone.comments || [], history,
    };
    delete item.isNew;
    commit((dd) => ({ ...dd, milestones: isNew ? [...dd.milestones, item] : dd.milestones.map((m) => (m.id === item.id ? item : m)) }), [{ entity: 'milestone', entityId: item.id, action: isNew ? 'created' : 'updated', summary: `${d.typeName(item.type)} ${isNew ? 'created' : 'updated'} for ${order?.poNo}${changes.length ? ` (${changes.join('; ')})` : ''}`, before: isNew ? null : { status: milestone.status, plannedDate: milestone.plannedDate, expectedDate: milestone.expectedDate }, after: { status: item.status, plannedDate: item.plannedDate, expectedDate: item.expectedDate } }]);
    const newEff = effectiveStatus(item, d.today, { ...d.msById, [item.id]: item });
    if ((newEff === 'blocked' || (item.expectedDate && item.expectedDate > item.plannedDate)) && newEff !== effectiveStatus(milestone, d.today, d.msById)) {
      notify({ title: `${d.typeName(item.type)} ${newEff === 'blocked' ? 'blocked' : 'delayed'} — ${order?.poNo}`, body: newEff === 'blocked' ? item.blockReason : `Expected ${fmtDate(item.expectedDate)} vs plan ${fmtDate(item.plannedDate)}`, severity: newEff === 'blocked' ? 'critical' : 'warning', link: `/critical-path?order=${item.orderId}`, pref: 'milestones' });
      toast.warning('Milestone updated — downstream production flagged', { description: `${order?.poNo}: check the planning board for impact.` });
    } else {
      toast.success(`${d.typeName(item.type)} ${item.status === 'completed' ? 'completed' : 'saved'}`);
    }
    onClose();
  };

  const orderOptions = Object.values(d.orders).filter((x) => x.status !== 'cancelled').sort((a, b) => a.order.poNo.localeCompare(b.order.poNo));

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={isNew ? 'New milestone' : `${d.typeName(milestone.type)} · ${order?.poNo}`}
      description={!isNew && order ? `${d.ctx.styles[order.styleId]?.code} · ${d.orders[order.id]?.start ? `production start ${fmtDate(d.orders[order.id].start)}` : 'not scheduled'}` : undefined}
      footer={
        canEdit ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            {!isNew && v.status !== 'completed' && <Button icon={CheckCircle2} onClick={() => save({ status: 'completed', actualDate: v.actualDate || d.today })}>Mark completed</Button>}
            <Button variant="primary" onClick={() => save()}>{isNew ? 'Create milestone' : 'Save changes'}</Button>
          </>
        ) : <Button onClick={onClose}>Close</Button>
      }
    >
      {!isNew && effective !== 'completed' && explainMilestone(milestone, d.today, d.msById, d.typeName) && (
        <Alert tone={['overdue', 'blocked'].includes(effective) ? 'red' : 'amber'} className="mb-4" title={explainMilestone(milestone, d.today, d.msById, d.typeName)}>
          Next action: {nextAction(milestone)}
        </Alert>
      )}
      <fieldset disabled={!canEdit} className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Field label="Production order" required error={errors.orderId} className="col-span-2 md:col-span-1">
          <Select value={v.orderId} onChange={set('orderId')} disabled={!isNew} error={errors.orderId}>
            <option value="">Select…</option>
            {orderOptions.map((x) => <option key={x.order.id} value={x.order.id}>{x.order.poNo} — {d.ctx.styles[x.order.styleId]?.code}</option>)}
          </Select>
        </Field>
        <Field label="Milestone" required error={errors.type}>
          <Select value={v.type} onChange={set('type')} disabled={!isNew} error={errors.type}>
            <option value="">Select…</option>
            {data.milestoneTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Responsible">
          <Select value={v.responsibleId} onChange={set('responsibleId')}>
            <option value="">Unassigned</option>
            {data.people.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.department}</option>)}
          </Select>
        </Field>
        <Field label="Planned date" required error={errors.plannedDate}><Input type="date" value={v.plannedDate} onChange={set('plannedDate')} error={errors.plannedDate} /></Field>
        <Field label="Expected date" error={errors.expectedDate} hint="Revised ETA if slipping"><Input type="date" value={v.expectedDate} onChange={set('expectedDate')} error={errors.expectedDate} /></Field>
        <Field label="Status" hint={`Calculated: ${STATUS[effective]?.label}`}>
          <Select value={v.status} onChange={set('status')}>
            {MILESTONE_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
        {v.status === 'completed' && <Field label="Actual completion" required error={errors.actualDate}><Input type="date" value={v.actualDate || d.today} max={d.today} onChange={set('actualDate')} error={errors.actualDate} /></Field>}
        {v.status === 'blocked' && <Field label="Blocking reason" required error={errors.blockReason} className="col-span-2"><Input value={v.blockReason} onChange={set('blockReason')} error={errors.blockReason} /></Field>}
        {siblings.length > 0 && (
          <Field label="Depends on (prerequisites)" className="col-span-2 md:col-span-3">
            <div className="flex flex-wrap gap-3 pt-1">
              {siblings.map((m) => (
                <Checkbox key={m.id} label={`${d.typeName(m.type)} (${STATUS[effectiveStatus(m, d.today, d.msById)].label})`} checked={v.dependsOn.includes(m.id)} onChange={(on) => setV((x) => ({ ...x, dependsOn: on ? [...x.dependsOn, m.id] : x.dependsOn.filter((id) => id !== m.id) }))} />
              ))}
            </div>
          </Field>
        )}
        <Field label="Add comment" className="col-span-2 md:col-span-3"><Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Update for the team…" /></Field>
      </fieldset>

      {!isNew && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><MessageSquare className="h-3.5 w-3.5" /> Comments</h4>
            <ul className="max-h-40 space-y-2 overflow-y-auto text-xs scroll-thin">
              {(milestone.comments || []).map((c, i) => (
                <li key={i} className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5"><div className="text-slate-700">{c.text}</div><div className="mt-0.5 text-[11px] text-slate-400">{c.by} · {fmtDateTime(c.at)}</div></li>
              ))}
              {!milestone.comments?.length && <li className="text-slate-400">No comments.</li>}
            </ul>
          </div>
          <div>
            <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><History className="h-3.5 w-3.5" /> Change history</h4>
            <ul className="max-h-40 space-y-1.5 overflow-y-auto text-xs scroll-thin">
              {(milestone.history || []).map((h, i) => (
                <li key={i}><span className="text-slate-400">{fmtDateTime(h.at)} · {h.by}</span><div className="text-slate-700">{h.change}</div></li>
              ))}
              {!milestone.history?.length && <li className="text-slate-400">No changes recorded yet.</li>}
            </ul>
          </div>
        </div>
      )}
      {!isNew && siblings.some((m) => m.dependsOn?.includes(milestone.id)) && (
        <p className="mt-3 flex items-center gap-1 text-xs text-slate-500"><ArrowRight className="h-3 w-3" /> Downstream: {siblings.filter((m) => m.dependsOn?.includes(milestone.id)).map((m) => d.typeName(m.type)).join(', ')}</p>
      )}
    </Modal>
  );
}
