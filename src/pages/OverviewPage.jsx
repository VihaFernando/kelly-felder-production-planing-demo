import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CalendarClock, ChevronRight, ClipboardList, Factory, Gauge, PackageCheck, Route as RouteIcon, Truck, Timer, CircleSlash } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useDerived } from '../hooks/useDerived';
import { Card, PageHeader, Select, Stat, StatusBadge, cn, EmptyState, ProgressBar } from '../components/common/ui';
import { effectiveStatus } from '../services/milestoneService';
import { getDayInfo, getOperators } from '../services/capacityService';
import { addDaysISO, diffDays, eachDay, fmtDate, fmtShort } from '../utils/dateUtils';
import { fmtNum, fmtPct, pct } from '../utils/formatters';

export default function OverviewPage() {
  const data = useAppStore((s) => s.data);
  const openOrder = useAppStore((s) => s.openOrder);
  const d = useDerived();
  const navigate = useNavigate();
  const [period, setPeriod] = useState(14);
  const { today, orders, analysis, ctx } = d;

  const m = useMemo(() => {
    const list = Object.values(orders);
    const active = list.filter((s) => !['completed', 'cancelled'].includes(s.status));
    const planned = active.filter((s) => ['planned', 'partial', 'in_production'].includes(s.status));
    const unplanned = active.filter((s) => s.status === 'unplanned');
    const atRisk = active.filter((s) => s.risk !== 'ok');
    const overdueMs = data.milestones.filter((x) => ['overdue', 'blocked'].includes(effectiveStatus(x, today, d.msById)));

    const periodDays = eachDay(addDaysISO(today, -(period - 1)), period);
    const plannedByDay = Object.fromEntries(periodDays.map((x) => [x, 0]));
    for (const e of Object.values(analysis)) for (const day of e.plan.days) if (day.date in plannedByDay) plannedByDay[day.date] += day.qty;
    const actualByDay = Object.fromEntries(periodDays.map((x) => [x, 0]));
    for (const r of data.outputs) if (r.date in actualByDay) actualByDay[r.date] += r.good;
    const chart = periodDays.map((x) => ({ date: fmtShort(x), Planned: plannedByDay[x], Actual: actualByDay[x], Attainment: plannedByDay[x] ? Math.round((actualByDay[x] / plannedByDay[x]) * 100) : null }));
    const totPlanned = periodDays.filter((x) => x < today).reduce((s, x) => s + plannedByDay[x], 0);
    const totActual = periodDays.filter((x) => x < today).reduce((s, x) => s + actualByDay[x], 0);
    return { active, planned, unplanned, atRisk, overdueMs, chart, plannedToday: plannedByDay[today] || 0, actualToday: actualByDay[today] || 0, attainment: pct(totActual, totPlanned), totPlanned, totActual };
  }, [orders, analysis, data.milestones, data.outputs, today, period, d.msById]);

  const attention = useMemo(() => {
    const list = Object.values(orders).filter((s) => !['completed', 'cancelled'].includes(s.status));
    const msItems = m.overdueMs
      .map((x) => ({ x, s: orders[x.orderId], st: effectiveStatus(x, today, d.msById) }))
      .filter((r) => r.s && !['completed', 'cancelled'].includes(r.s.status))
      .sort((a, b) => (a.s.start || a.s.order.deliveryDate).localeCompare(b.s.start || b.s.order.deliveryDate))
      .slice(0, 6);
    const notReady = list.filter((s) => s.start && s.start >= today && diffDays(s.start, today) <= 14 && ['blocked', 'at_risk'].includes(s.readiness.state)).sort((a, b) => a.start.localeCompare(b.start));
    const capacity = list.filter((s) => s.reasons.some((r) => ['capacity', 'delivery', 'overlap', 'workforce'].includes(r.code)));
    const delivery = list.filter((s) => s.daysToDelivery >= 0 && s.daysToDelivery <= 14 && s.remaining > 0).sort((a, b) => a.daysToDelivery - b.daysToDelivery);

    const horizon = eachDay(today, 14);
    const lowUtil = [];
    for (const line of data.lines) {
      if (line.status !== 'active' || ctx.plants[line.plantId]?.status !== 'active') continue;
      let avail = 0;
      for (const day of horizon) avail += getDayInfo(ctx, line, day).minutes * getOperators(ctx, line, day).count;
      let used = 0;
      for (const e of Object.values(analysis)) {
        if (e.alloc.lineId !== line.id) continue;
        for (const day of e.plan.days) if (day.date >= today && day.date <= horizon[13]) used += (day.qty * e.plan.smv) / (day.eff / 100);
      }
      const u = avail ? (used / avail) * 100 : 0;
      if (u < (data.settings.lowUtilizationThreshold || 45)) lowUtil.push({ line, u, avail });
    }
    lowUtil.sort((a, b) => a.u - b.u);
    return { msItems, notReady, capacity, delivery, lowUtil };
  }, [orders, m.overdueMs, today, d.msById, data.lines, data.settings.lowUtilizationThreshold, ctx, analysis]);

  const upcoming = useMemo(
    () => Object.values(analysis).filter((e) => e.plan.start >= today).sort((a, b) => a.plan.start.localeCompare(b.plan.start)).slice(0, 8),
    [analysis, today],
  );

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle={`${fmtDate(today, 'EEEE, dd MMMM yyyy')} · ${data.plants.filter((p) => p.status === 'active').length} active plants · ${data.lines.filter((l) => l.status === 'active').length} lines`}
        actions={
          <div className="flex items-center gap-2 text-xs text-slate-500">
            Period
            <Select value={period} onChange={(e) => setPeriod(Number(e.target.value))} className="w-36">
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </Select>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Active orders" value={fmtNum(m.active.length)} icon={ClipboardList} onClick={() => navigate('/orders')} />
        <Stat label="Planned" value={fmtNum(m.planned.length)} sub="incl. partial / running" icon={CalendarClock} onClick={() => navigate('/orders?status=planned')} />
        <Stat label="To plan" value={fmtNum(m.unplanned.length)} tone={m.unplanned.length ? 'amber' : undefined} icon={CircleSlash} onClick={() => navigate('/orders?status=unplanned')} />
        <Stat label="Orders at risk" value={fmtNum(m.atRisk.length)} tone={m.atRisk.length ? 'red' : 'green'} icon={AlertTriangle} onClick={() => navigate('/orders?risk=any')} />
        <Stat label="Late milestones" value={fmtNum(m.overdueMs.length)} sub="overdue or blocked" tone={m.overdueMs.length ? 'red' : 'green'} icon={RouteIcon} onClick={() => navigate('/critical-path?flag=critical')} />
        <Stat label="Planned today" value={fmtNum(m.plannedToday)} sub="pieces" icon={Timer} />
        <Stat label="Good pcs today" value={fmtNum(m.actualToday)} sub={m.plannedToday ? `${fmtPct(pct(m.actualToday, m.plannedToday))} of plan so far` : 'no plan today'} icon={PackageCheck} onClick={() => navigate('/output')} />
        <Stat label={`Attainment ${period}d`} value={fmtPct(m.attainment)} sub={`${fmtNum(m.totActual)} / ${fmtNum(m.totPlanned)} pcs`} tone={m.attainment >= 90 ? 'green' : m.attainment >= 75 ? 'amber' : 'red'} icon={Gauge} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Card title="Planned vs actual good output" subtitle="All plants · planned from the saved plan, actual from output records" bodyClass="px-2 pb-2 pt-3">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={m.chart} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} interval="preserveStartEnd" />
                  <YAxis yAxisId="q" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                  <YAxis yAxisId="p" orientation="right" domain={[0, 120]} hide />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: '#e2e8f0' }} formatter={(v, n) => (n === 'Attainment' ? `${v}%` : fmtNum(v))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
                  <Bar yAxisId="q" dataKey="Planned" fill="#cbd5e1" radius={[2, 2, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  <Bar yAxisId="q" dataKey="Actual" fill="#2563eb" radius={[2, 2, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  <Line yAxisId="p" dataKey="Attainment" stroke="#059669" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Upcoming production" subtitle="Next scheduled starts" actions={<button onClick={() => navigate('/planning')} className="text-xs font-medium text-blue-600 hover:underline">Open board</button>} bodyClass="">
            {upcoming.length ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr>{['Start', 'Order', 'Style', 'Line', 'Qty', 'Finish', 'Readiness'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                  <tbody>
                    {upcoming.map((e) => {
                      const s = orders[e.alloc.orderId];
                      return (
                        <tr key={e.alloc.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openOrder(s.order.id)}>
                          <td className="td">{fmtShort(e.plan.start)} <span className="text-xs text-slate-400">({diffDays(e.plan.start, today)}d)</span></td>
                          <td className="td font-medium">{s.order.poNo}</td>
                          <td className="td text-slate-600">{ctx.styles[s.order.styleId]?.code}</td>
                          <td className="td">{ctx.lines[e.alloc.lineId]?.code}</td>
                          <td className="td tabular-nums">{fmtNum(e.alloc.qty)}</td>
                          <td className="td">{fmtShort(e.plan.end)}</td>
                          <td className="td"><StatusBadge status={s.readiness.state} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState title="No upcoming production scheduled" />}
          </Card>
        </div>

        <Card title="Needs attention" subtitle="Prioritised — click an item to act" bodyClass="divide-y divide-slate-100">
          <AttentionGroup icon={RouteIcon} title="Critical milestones" tone="red" count={m.overdueMs.length} onAll={() => navigate('/critical-path?flag=critical')}>
            {attention.msItems.map(({ x, s, st }) => (
              <AttentionItem key={x.id} onClick={() => navigate(`/critical-path?milestone=${x.id}`)} title={`${d.typeName(x.type)} — ${s.order.poNo}`} meta={`${st === 'blocked' ? 'Blocked' : `${Math.abs(diffDays(x.plannedDate, today))}d overdue`} · ${d.peopleById[x.responsibleId]?.name || 'Unassigned'}${s.start ? ` · starts ${fmtShort(s.start)}` : ''}`} tone="red" />
            ))}
          </AttentionGroup>
          <AttentionGroup icon={CalendarClock} title="Starting soon, not ready" tone="amber" count={attention.notReady.length}>
            {attention.notReady.slice(0, 5).map((s) => (
              <AttentionItem key={s.order.id} onClick={() => openOrder(s.order.id)} title={`${s.order.poNo} · ${ctx.styles[s.order.styleId]?.code}`} meta={`Starts ${fmtShort(s.start)} (${diffDays(s.start, today)}d) · ${s.readiness.issues[0]?.label || ''}`} tone={s.readiness.state === 'blocked' ? 'red' : 'amber'} />
            ))}
          </AttentionGroup>
          <AttentionGroup icon={Factory} title="Capacity & schedule conflicts" tone="red" count={attention.capacity.length}>
            {attention.capacity.slice(0, 5).map((s) => (
              <AttentionItem key={s.order.id} onClick={() => navigate(`/planning?order=${s.order.id}`)} title={`${s.order.poNo} · ${ctx.styles[s.order.styleId]?.code}`} meta={s.reasons.find((r) => ['capacity', 'delivery', 'overlap', 'workforce'].includes(r.code))?.msg} tone="red" />
            ))}
          </AttentionGroup>
          <AttentionGroup icon={Truck} title="Approaching delivery (14 days)" tone="amber" count={attention.delivery.length}>
            {attention.delivery.slice(0, 5).map((s) => (
              <AttentionItem key={s.order.id} onClick={() => openOrder(s.order.id)} title={`${s.order.poNo} · due ${fmtShort(s.order.deliveryDate)}`} meta={`${fmtNum(s.remaining)} pcs remaining · ${s.status === 'unplanned' ? 'not planned' : s.end ? `finish ${fmtShort(s.end)}` : ''}`} tone={s.status === 'unplanned' || (s.end && s.end > s.order.deliveryDate) ? 'red' : 'amber'} />
            ))}
          </AttentionGroup>
          <AttentionGroup icon={Gauge} title={`Low planned utilisation (next 14d, < ${data.settings.lowUtilizationThreshold}%)`} tone="gray" count={attention.lowUtil.length}>
            {attention.lowUtil.slice(0, 5).map(({ line, u, avail }) => (
              <button key={line.id} onClick={() => navigate(`/plants?line=${line.id}`)} className="flex w-full items-center gap-3 px-4 py-1.5 text-left hover:bg-slate-50">
                <span className="w-20 text-[13px] font-medium text-slate-800">{line.code}</span>
                <ProgressBar value={u} tone={u < 20 ? 'red' : 'amber'} className="flex-1" />
                <span className="w-24 text-right text-xs tabular-nums text-slate-500">{avail ? fmtPct(u) : 'no capacity'}</span>
              </button>
            ))}
          </AttentionGroup>
        </Card>
      </div>
    </div>
  );
}

function AttentionGroup({ icon: Icon, title, count, tone, children, onAll }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const empty = Array.isArray(items) && items.length === 0;
  return (
    <div className="py-2">
      <div className="flex items-center gap-2 px-4 py-1">
        <Icon className={cn('h-3.5 w-3.5', tone === 'red' ? 'text-red-500' : tone === 'amber' ? 'text-amber-500' : 'text-slate-400')} />
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        <span className={cn('rounded px-1.5 text-[11px] font-semibold', count ? (tone === 'red' ? 'bg-red-50 text-red-700' : tone === 'amber' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600') : 'bg-emerald-50 text-emerald-700')}>{count}</span>
        {onAll && count > 0 && <button onClick={onAll} className="ml-auto text-[11px] font-medium text-blue-600 hover:underline">View all</button>}
      </div>
      {empty ? <p className="px-4 py-1 pl-9 text-xs text-slate-400">Nothing to action.</p> : items}
    </div>
  );
}

function AttentionItem({ title, meta, tone, onClick }) {
  return (
    <button onClick={onClick} className="group flex w-full items-center gap-2 py-1.5 pl-9 pr-3 text-left hover:bg-slate-50">
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone === 'red' ? 'bg-red-500' : 'bg-amber-500')} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-slate-800">{title}</span>
        <span className="block truncate text-xs text-slate-500">{meta}</span>
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-slate-500" />
    </button>
  );
}
