import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Download, PackageCheck, PackageX, PackageMinus, Gauge } from 'lucide-react';
import { useAppStore, useCan } from '../store/appStore';
import { useDerived } from '../hooks/useDerived';
import { Alert, Button, Card, Field, FilterSelect, Input, Modal, PageHeader, ProgressBar, SearchInput, Select, Stat } from '../components/common/ui';
import { DataTable } from '../components/common/DataTable';
import { confirm } from '../components/common/confirm';
import { exportCsv } from '../services/importExportService';
import { addDaysISO, fmtDate, isValidISO } from '../utils/dateUtils';
import { fmtNum, fmtPct, pct, uid } from '../utils/formatters';

export default function ProductionOutputPage() {
  const data = useAppStore((s) => s.data);
  const commit = useAppStore((s) => s.commit);
  const openOrder = useAppStore((s) => s.openOrder);
  const canEdit = useCan('output');
  const d = useDerived();
  const [q, setQ] = useState('');
  const [plant, setPlant] = useState('');
  const [line, setLine] = useState('');
  const [from, setFrom] = useState(addDaysISO(d.today, -13));
  const [to, setTo] = useState(d.today);
  const [editing, setEditing] = useState(null);

  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    return data.outputs
      .filter((r) => (!from || r.date >= from) && (!to || r.date <= to))
      .map((r) => {
        const o = d.ctx.orders[r.orderId];
        const l = d.ctx.lines[r.lineId];
        return { ...r, order: o, style: d.ctx.styles[o?.styleId], line: l, plant: d.ctx.plants[l?.plantId] };
      })
      .filter((r) => (!plant || r.plant?.id === plant) && (!line || r.lineId === line))
      .filter((r) => !ql || `${r.order?.poNo} ${r.order?.soNo} ${r.style?.code} ${r.recordedBy}`.toLowerCase().includes(ql));
  }, [data.outputs, d.ctx, q, plant, line, from, to]);

  const totals = rows.reduce((t, r) => ({ good: t.good + r.good, rejects: t.rejects + r.rejects, shortages: t.shortages + r.shortages }), { good: 0, rejects: 0, shortages: 0 });
  const planned = useMemo(() => {
    let sum = 0;
    for (const e of Object.values(d.analysis)) {
      const l = d.ctx.lines[e.alloc.lineId];
      if ((plant && l?.plantId !== plant) || (line && e.alloc.lineId !== line)) continue;
      for (const day of e.plan.days) if (day.date >= from && day.date <= to && day.date < d.today) sum += day.qty;
    }
    return sum;
  }, [d, plant, line, from, to]);
  const goodBeforeToday = rows.filter((r) => r.date < d.today).reduce((s, r) => s + r.good, 0);

  const remove = async (r) => {
    if (await confirm({ title: 'Delete output entry?', message: `${fmtNum(r.good)} good pcs for ${r.order?.poNo} on ${fmtDate(r.date)} will be removed. Order progress is recalculated.`, confirmLabel: 'Delete', danger: true })) {
      commit((dd) => ({ ...dd, outputs: dd.outputs.filter((x) => x.id !== r.id) }), [{ entity: 'output', entityId: r.id, action: 'deleted', summary: `Output ${r.order?.poNo} ${r.date} deleted (${r.good} good)`, before: { good: r.good, rejects: r.rejects, shortages: r.shortages } }]);
      toast.success('Output entry deleted');
    }
  };

  return (
    <div>
      <PageHeader
        title="Production Output"
        subtitle="Actual output recorded against the plan. Manual entry in this prototype — not synchronised with the ERP."
        actions={
          <>
            <Button icon={Download} onClick={() => exportCsv(`output-${from}-${to}.csv`, rows, [
              { header: 'Date', key: 'date' }, { header: 'PO No', value: (r) => r.order?.poNo }, { header: 'SO No', value: (r) => r.order?.soNo }, { header: 'Style', value: (r) => r.style?.code },
              { header: 'Plant', value: (r) => r.plant?.code }, { header: 'Line', value: (r) => r.line?.code }, { header: 'Good', key: 'good' }, { header: 'Rejects', key: 'rejects' }, { header: 'Shortages', key: 'shortages' }, { header: 'Recorded By', key: 'recordedBy' },
            ])}>Export CSV</Button>
            {canEdit && <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Add output</Button>}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Good pieces" value={fmtNum(totals.good)} icon={PackageCheck} tone="green" />
        <Stat label="Quality rejects" value={fmtNum(totals.rejects)} icon={PackageX} sub={`${fmtPct(pct(totals.rejects, totals.good + totals.rejects), 1)} of inspected`} />
        <Stat label="Shortages" value={fmtNum(totals.shortages)} icon={PackageMinus} />
        <Stat label="Plan attainment" value={planned ? fmtPct(pct(goodBeforeToday, planned)) : '—'} icon={Gauge} sub={`${fmtNum(goodBeforeToday)} / ${fmtNum(planned)} planned (to yesterday)`} tone={planned && pct(goodBeforeToday, planned) < 85 ? 'amber' : 'blue'} />
      </div>
      <Card bodyClass="">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search PO, SO, style, recorder…" className="w-60" />
          <FilterSelect value={plant} onChange={(v) => { setPlant(v); setLine(''); }} options={data.plants.map((p) => ({ value: p.id, label: p.code }))} placeholder="All plants" className="!min-w-[110px]" />
          <FilterSelect value={line} onChange={setLine} options={data.lines.filter((l) => !plant || l.plantId === plant).map((l) => ({ value: l.id, label: l.code }))} placeholder="All lines" className="!min-w-[110px]" />
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="!w-[138px]" aria-label="From date" />
          <span className="text-xs text-slate-400">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="!w-[138px]" aria-label="To date" />
          <div className="flex gap-1">
            {[[0, 'Today'], [6, '7d'], [13, '14d'], [29, '30d']].map(([n, label]) => (
              <Button key={label} size="sm" variant="ghost" onClick={() => { setFrom(addDaysISO(d.today, -n)); setTo(d.today); }}>{label}</Button>
            ))}
          </div>
        </div>
        <DataTable
          rows={rows}
          initialSort={{ key: 'date', dir: 'desc' }}
          footer={`${rows.length} entries`}
          columns={[
            { key: 'date', header: 'Date', cell: (r) => fmtDate(r.date) },
            { key: 'po', header: 'Production order', sort: (r) => r.order?.poNo, cell: (r) => <button className="font-semibold text-slate-900 hover:text-blue-700 hover:underline" onClick={() => r.order && openOrder(r.order.id)}>{r.order?.poNo || 'Missing order'}</button> },
            { key: 'so', header: 'Sales order', sort: (r) => r.order?.soNo, cell: (r) => <span className="text-slate-600">{r.order?.soNo}</span> },
            { key: 'style', header: 'Style', sort: (r) => r.style?.code, cell: (r) => r.style?.code },
            { key: 'plant', header: 'Plant', sort: (r) => r.plant?.code, cell: (r) => r.plant?.code },
            { key: 'line', header: 'Line', sort: (r) => r.line?.code, cell: (r) => r.line?.code },
            { key: 'good', header: 'Good', align: 'right', cell: (r) => <span className="font-semibold">{fmtNum(r.good)}</span> },
            { key: 'rejects', header: 'Rejects', align: 'right', cell: (r) => <span className={r.rejects ? 'text-red-600' : 'text-slate-400'}>{fmtNum(r.rejects)}</span> },
            { key: 'shortages', header: 'Shortages', align: 'right', cell: (r) => <span className={r.shortages ? 'text-amber-700' : 'text-slate-400'}>{fmtNum(r.shortages)}</span> },
            { key: 'recordedBy', header: 'Recorded by', cell: (r) => <span className="text-slate-600">{r.recordedBy}</span> },
            { key: 'a', header: '', sortable: false, className: 'w-[1%]', cell: (r) => canEdit && <div className="flex justify-end gap-0.5"><Button size="icon-sm" variant="ghost" icon={Pencil} aria-label="Edit" onClick={() => setEditing(r)} /><Button size="icon-sm" variant="ghost" icon={Trash2} aria-label="Delete" className="hover:text-red-600" onClick={() => remove(r)} /></div> },
          ]}
        />
      </Card>
      {editing && <OutputDialog entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function OutputDialog({ entry, onClose }) {
  const data = useAppStore((s) => s.data);
  const commit = useAppStore((s) => s.commit);
  const notify = useAppStore((s) => s.notify);
  const d = useDerived();
  const isEdit = !!entry.id;
  const [v, setV] = useState({ date: entry.date || d.today, orderId: entry.orderId || '', lineId: entry.lineId || '', good: entry.good ?? '', rejects: entry.rejects ?? 0, shortages: entry.shortages ?? 0, recordedBy: entry.recordedBy || data.settings.user.name });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));

  const sum = d.orders[v.orderId];
  const allocatedLines = sum ? [...new Set(sum.allocs.map((a) => a.lineId))] : [];
  useEffect(() => {
    if (!isEdit && sum && !v.lineId && allocatedLines.length) setV((x) => ({ ...x, lineId: allocatedLines[0] }));
  }, [v.orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const otherGood = sum ? data.outputs.filter((r) => r.orderId === v.orderId && r.id !== entry.id).reduce((s, r) => s + r.good, 0) : 0;
  const newCum = otherGood + (Number(v.good) || 0);
  const orderOptions = Object.values(d.orders).filter((s) => s.status !== 'cancelled' && (s.allocs.length || s.good > 0) && (s.status !== 'completed' || s.order.id === entry.orderId)).sort((a, b) => a.order.poNo.localeCompare(b.order.poNo));

  const submit = async () => {
    if (saving) return;
    const e = {};
    if (!isValidISO(v.date)) e.date = 'Enter a valid date';
    else if (v.date > d.today) e.date = 'Output cannot be recorded for a future date';
    if (!d.ctx.orders[v.orderId]) e.orderId = 'Select a valid order';
    if (!d.ctx.lines[v.lineId]) e.lineId = 'Select a valid line';
    for (const k of ['good', 'rejects', 'shortages']) {
      const n = Number(v[k]);
      if (v[k] === '' || !Number.isInteger(n) || n < 0) e[k] = 'Non-negative whole number';
    }
    if (!e.good && Number(v.good) + Number(v.rejects) + Number(v.shortages) === 0) e.good = 'Enter at least one quantity';
    if (!String(v.recordedBy).trim()) e.recordedBy = 'Required';
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const dup = data.outputs.find((r) => r.id !== entry.id && r.orderId === v.orderId && r.lineId === v.lineId && r.date === v.date);
      if (dup && !(await confirm({ title: 'Possible duplicate entry', message: `An entry already exists for ${sum.order.poNo} on ${d.ctx.lines[v.lineId].code} for ${fmtDate(v.date)} (${fmtNum(dup.good)} good). Add this as a separate entry?`, confirmLabel: 'Add separate entry' }))) return;
      if (newCum > sum.order.qty && !(await confirm({ title: 'Output exceeds order quantity', message: `Cumulative good pieces would be ${fmtNum(newCum)} against an order quantity of ${fmtNum(sum.order.qty)} (+${fmtNum(newCum - sum.order.qty)}). Save anyway?`, confirmLabel: 'Save anyway' }))) return;
      if (!allocatedLines.includes(v.lineId) && !(await confirm({ title: 'Line not planned for this order', message: `${d.ctx.lines[v.lineId].code} has no allocation for ${sum.order.poNo}. Record the output anyway?`, confirmLabel: 'Record anyway' }))) return;

      const rec = { id: entry.id || uid('out'), date: v.date, orderId: v.orderId, lineId: v.lineId, good: Number(v.good), rejects: Number(v.rejects), shortages: Number(v.shortages), recordedBy: String(v.recordedBy).trim(), createdAt: entry.createdAt || Date.now() };
      const ok = commit((dd) => ({ ...dd, outputs: isEdit ? dd.outputs.map((r) => (r.id === rec.id ? rec : r)) : [rec, ...dd.outputs] }), [{ entity: 'output', entityId: rec.id, action: isEdit ? 'updated' : 'created', summary: `Output ${sum.order.poNo} ${rec.date}: ${rec.good} good, ${rec.rejects} rejects, ${rec.shortages} short`, before: isEdit ? { good: entry.good, rejects: entry.rejects, shortages: entry.shortages } : null, after: { good: rec.good, rejects: rec.rejects, shortages: rec.shortages } }]);
      if (ok) {
        toast.success(isEdit ? 'Output updated' : 'Output recorded', { description: `${sum.order.poNo}: ${fmtNum(newCum)} / ${fmtNum(sum.order.qty)} good pcs` });
        if (newCum >= sum.order.qty && otherGood < sum.order.qty) notify({ title: `${sum.order.poNo} quantity complete`, body: `${fmtNum(newCum)} good pieces recorded.`, severity: 'success', link: `/orders`, pref: 'output' });
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Edit output entry' : 'Record production output'}
      description="Manual entry for the demo — real output would come from the shop floor or ERP."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} disabled={saving} onClick={submit}>{isEdit ? 'Save changes' : 'Record output'}</Button></>}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Production date" required error={errors.date}><Input type="date" max={d.today} value={v.date} onChange={set('date')} error={errors.date} /></Field>
        <Field label="Recorded by" required error={errors.recordedBy}><Input value={v.recordedBy} onChange={set('recordedBy')} error={errors.recordedBy} /></Field>
        <Field label="Production order" required error={errors.orderId} className="col-span-2">
          <Select value={v.orderId} onChange={(e) => setV((x) => ({ ...x, orderId: e.target.value, lineId: '' }))} error={errors.orderId}>
            <option value="">Select order…</option>
            {orderOptions.map((s) => <option key={s.order.id} value={s.order.id}>{s.order.poNo} — {d.ctx.styles[s.order.styleId]?.code} ({fmtNum(s.good)}/{fmtNum(s.order.qty)})</option>)}
          </Select>
        </Field>
        <Field label="Line" required error={errors.lineId} className="col-span-2">
          <Select value={v.lineId} onChange={set('lineId')} error={errors.lineId}>
            <option value="">Select line…</option>
            {allocatedLines.length > 0 && <optgroup label="Planned for this order">{allocatedLines.map((id) => <option key={id} value={id}>{d.ctx.lines[id]?.code}</option>)}</optgroup>}
            <optgroup label="Other lines">{data.lines.filter((l) => !allocatedLines.includes(l.id)).map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}</optgroup>
          </Select>
        </Field>
        <Field label="Good pieces" required error={errors.good}><Input type="number" min={0} value={v.good} onChange={set('good')} error={errors.good} /></Field>
        <Field label="Quality rejects" error={errors.rejects}><Input type="number" min={0} value={v.rejects} onChange={set('rejects')} error={errors.rejects} /></Field>
        <Field label="Shortages" error={errors.shortages}><Input type="number" min={0} value={v.shortages} onChange={set('shortages')} error={errors.shortages} /></Field>
      </div>
      {sum && (
        <div className="mt-4 rounded-md border border-slate-200 p-3">
          <div className="mb-1.5 flex justify-between text-xs text-slate-600">
            <span>Order progress after this entry</span>
            <span className="tabular-nums">{fmtNum(newCum)} / {fmtNum(sum.order.qty)} good · {fmtNum(Math.max(0, sum.order.qty - newCum))} remaining</span>
          </div>
          <ProgressBar value={pct(newCum, sum.order.qty)} tone={newCum > sum.order.qty ? 'amber' : 'blue'} />
          <p className="mt-1.5 text-[11px] text-slate-500">Planned to date: {fmtNum(sum.plannedToDate)} pcs. Rejects and shortages are tracked separately and do not count as good output.</p>
        </div>
      )}
      {sum && newCum > sum.order.qty && <Alert tone="amber" className="mt-3" title="Cumulative good output exceeds the order quantity" />}
    </Modal>
  );
}
