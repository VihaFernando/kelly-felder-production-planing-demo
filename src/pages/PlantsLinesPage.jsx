import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Plus, Pencil, Power, Trash2, Download, Upload, CalendarRange, Factory, CheckCircle2, Rows3, ListChecks } from 'lucide-react';
import { useAppStore, useCan } from '../store/appStore';
import { useDerived } from '../hooks/useDerived';
import { Badge, Button, Card, Drawer, FilterSelect, PageHeader, SearchInput, Stat, StatusBadge, cn, EmptyState } from '../components/common/ui';
import { confirm } from '../components/common/confirm';
import { LineFormModal, PlantFormModal } from '../components/masterdata/MasterForms';
import { ImportDialog } from '../components/common/ImportDialog';
import { exportCsv } from '../services/importExportService';
import { getOperators } from '../services/capacityService';
import { fmtShort } from '../utils/dateUtils';
import { fmtNum, uid } from '../utils/formatters';

export default function PlantsLinesPage() {
  const data = useAppStore((s) => s.data);
  const commit = useAppStore((s) => s.commit);
  const canEdit = useCan('masterdata');
  const d = useDerived();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const focusLine = params.get('line');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [plantModal, setPlantModal] = useState(null);
  const [lineModal, setLineModal] = useState(null);
  const [allocLine, setAllocLine] = useState(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!focusLine) return;
    const l = data.lines.find((x) => x.id === focusLine);
    if (l) {
      setExpanded((e) => new Set([...e, l.plantId]));
      setTimeout(() => document.getElementById(`line-${l.id}`)?.scrollIntoView({ block: 'center' }), 50);
    }
  }, [focusLine]); // eslint-disable-line react-hooks/exhaustive-deps

  const calName = (id) => data.calendars.find((c) => c.id === id)?.name || '—';
  const allocCount = useMemo(() => {
    const m = {};
    for (const a of data.allocations) if (d.analysis[a.id]?.plan.end >= d.today) m[a.lineId] = (m[a.lineId] || 0) + 1;
    return m;
  }, [data.allocations, d.analysis, d.today]);

  const groups = useMemo(() => {
    const ql = q.toLowerCase();
    return data.plants
      .filter((p) => !status || p.status === status)
      .map((p) => ({ plant: p, lines: data.lines.filter((l) => l.plantId === p.id) }))
      .filter((g) => !ql || `${g.plant.code} ${g.plant.name} ${g.plant.location}`.toLowerCase().includes(ql) || g.lines.some((l) => `${l.code} ${l.name}`.toLowerCase().includes(ql)));
  }, [data.plants, data.lines, q, status]);

  const stats = {
    plants: data.plants.length,
    activePlants: data.plants.filter((p) => p.status === 'active').length,
    lines: data.lines.length,
    available: data.lines.filter((l) => l.status === 'active' && data.plants.find((p) => p.id === l.plantId)?.status === 'active').length,
  };

  const togglePlant = async (p) => {
    const next = p.status === 'active' ? 'inactive' : 'active';
    const lineIds = new Set(data.lines.filter((l) => l.plantId === p.id).map((l) => l.id));
    const active = data.allocations.filter((a) => lineIds.has(a.lineId) && d.analysis[a.id]?.plan.end >= d.today).length;
    if (next === 'inactive' && !(await confirm({ title: `Deactivate ${p.code}?`, message: active ? `${active} current/future allocation(s) on this plant will be flagged as critical on the board until moved. History is kept.` : 'The plant will be hidden from planning. History is kept.', confirmLabel: 'Deactivate', danger: true }))) return;
    commit((dd) => ({ ...dd, plants: dd.plants.map((x) => (x.id === p.id ? { ...x, status: next } : x)) }), [{ entity: 'plant', entityId: p.id, action: next === 'active' ? 'activated' : 'deactivated', summary: `Plant ${p.code} ${next === 'active' ? 'activated' : 'deactivated'}` }]);
    toast.success(`${p.code} ${next === 'active' ? 'activated' : 'deactivated'}`);
  };

  const toggleLine = async (l) => {
    const next = l.status === 'active' ? 'inactive' : 'active';
    if (next === 'inactive' && allocCount[l.id] && !(await confirm({ title: `Deactivate ${l.code}?`, message: `${allocCount[l.id]} current/future allocation(s) will be flagged on the board until moved to an active line.`, confirmLabel: 'Deactivate', danger: true }))) return;
    commit((dd) => ({ ...dd, lines: dd.lines.map((x) => (x.id === l.id ? { ...x, status: next } : x)) }), [{ entity: 'line', entityId: l.id, action: next === 'active' ? 'activated' : 'deactivated', summary: `Line ${l.code} ${next === 'active' ? 'activated' : 'deactivated'}` }]);
    toast.success(`${l.code} ${next === 'active' ? 'activated' : 'deactivated'}`);
  };

  const deleteLine = async (l) => {
    const allocs = data.allocations.filter((a) => a.lineId === l.id).length;
    const outputs = data.outputs.filter((r) => r.lineId === l.id).length;
    const wf = data.workforce.filter((w) => w.lineId === l.id).length;
    if (allocs || outputs) {
      toast.error(`${l.code} cannot be deleted`, { description: `It has ${allocs} allocation(s) and ${outputs} output record(s). Deactivate it instead to preserve history.` });
      return;
    }
    if (await confirm({ title: `Delete line ${l.code}?`, message: `No allocations or output reference this line.${wf ? ` ${wf} workforce record(s) will also be removed.` : ''}`, confirmLabel: 'Delete line', danger: true })) {
      commit((dd) => ({ ...dd, lines: dd.lines.filter((x) => x.id !== l.id), workforce: dd.workforce.filter((w) => w.lineId !== l.id), calendarExceptions: dd.calendarExceptions.filter((c) => !(c.scopeType === 'line' && c.scopeId === l.id)) }), [{ entity: 'line', entityId: l.id, action: 'deleted', summary: `Line ${l.code} deleted` }]);
      toast.success(`${l.code} deleted`);
    }
  };

  const doExport = () =>
    exportCsv('plants-lines.csv', data.lines, [
      { header: 'Plant Code', value: (l) => data.plants.find((p) => p.id === l.plantId)?.code },
      { header: 'Plant Name', value: (l) => data.plants.find((p) => p.id === l.plantId)?.name },
      { header: 'Line Code', value: (l) => l.code },
      { header: 'Display Name', value: (l) => l.name },
      { header: 'Status', value: (l) => l.status },
      { header: 'Calendar', value: (l) => (l.calendarId ? calName(l.calendarId) : 'Inherit') },
      { header: 'Default Operators', value: (l) => l.defaultOperators },
      { header: 'Categories', value: (l) => (l.categories || []).join('|') },
    ]);

  const importConfig = {
    title: 'Import production lines',
    templateName: 'lines-template.csv',
    headers: ['Plant Code', 'Line Code', 'Display Name', 'Default Operators'],
    example: ['NTM', 'NTM-04', 'Nittambuwa Line 4', '30'],
    required: ['Plant Code', 'Line Code', 'Display Name'],
    existingKeys: new Set(data.lines.map((l) => l.code.toUpperCase())),
    keyOf: (l) => l.code,
    toItem: (row) => {
      const plant = data.plants.find((p) => p.code.toUpperCase() === String(row['Plant Code']).trim().toUpperCase());
      if (!plant) return { error: `unknown plant "${row['Plant Code']}"` };
      const ops = row['Default Operators'] === '' || row['Default Operators'] == null ? 0 : Number(row['Default Operators']);
      if (!Number.isInteger(ops) || ops < 0) return { error: 'Default Operators must be a whole number ≥ 0' };
      const code = String(row['Line Code']).trim().toUpperCase();
      if (!/^[A-Z0-9-]+$/.test(code)) return { error: 'Line Code may only contain letters, numbers and dashes' };
      return { item: { id: uid('ln'), plantId: plant.id, code, name: String(row['Display Name']).trim(), status: 'active', calendarId: null, defaultOperators: ops, categories: [], notes: '' } };
    },
    onImport: (items) => {
      commit((dd) => ({ ...dd, lines: [...dd.lines, ...items] }), [{ entity: 'line', entityId: '-', action: 'import', summary: `${items.length} lines imported from CSV` }]);
      toast.success(`Import completed: ${items.length} lines`);
    },
  };

  return (
    <div>
      <PageHeader
        title="Plants & Lines"
        subtitle="Manufacturing network master data used by the planning board and capacity calculations."
        actions={
          <>
            <Button icon={Download} onClick={doExport}>Export CSV</Button>
            {canEdit && <Button icon={Upload} onClick={() => setImporting(true)}>Import lines</Button>}
            {canEdit && <Button icon={Rows3} onClick={() => setLineModal({})}>Add line</Button>}
            {canEdit && <Button variant="primary" icon={Plus} onClick={() => setPlantModal({})}>Add plant</Button>}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total plants" value={stats.plants} icon={Factory} />
        <Stat label="Active plants" value={stats.activePlants} tone="green" />
        <Stat label="Total lines" value={stats.lines} icon={Rows3} />
        <Stat label="Available for planning" value={stats.available} tone="blue" icon={CheckCircle2} />
      </div>
      <Card bodyClass="">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search plant or line…" className="w-64" />
          <FilterSelect value={status} onChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} placeholder="Any status" />
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set(data.plants.map((p) => p.id)))}>Expand all</Button>
            <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set())}>Collapse all</Button>
          </div>
        </div>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>{['', 'Plant', 'Location', 'Status', 'Working calendar', 'Lines', 'Notes', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {groups.map(({ plant: p, lines }) => {
                const open = expanded.has(p.id);
                return (
                  <Fragment key={p.id}>
                    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setExpanded((e) => { const n = new Set(e); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}>
                      <td className="td w-8">{open ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}</td>
                      <td className="td"><span className="font-semibold text-slate-900">{p.code}</span> <span className="text-slate-600">{p.name}</span></td>
                      <td className="td text-slate-600">{p.location}</td>
                      <td className="td"><StatusBadge status={p.status} /></td>
                      <td className="td text-slate-600">{calName(p.calendarId)}</td>
                      <td className="td">{lines.filter((l) => l.status === 'active').length} / {lines.length}</td>
                      <td className="td max-w-[220px] truncate text-xs text-slate-500" title={p.notes}>{p.notes}</td>
                      <td className="td w-[1%]" onClick={(e) => e.stopPropagation()}>
                        {canEdit && (
                          <div className="flex justify-end gap-0.5">
                            <Button size="icon-sm" variant="ghost" icon={Plus} title="Add line" aria-label="Add line to plant" onClick={() => setLineModal({ plantId: p.id })} />
                            <Button size="icon-sm" variant="ghost" icon={Pencil} title="Edit plant" aria-label="Edit plant" onClick={() => setPlantModal(p)} />
                            <Button size="icon-sm" variant="ghost" icon={Power} title={p.status === 'active' ? 'Deactivate' : 'Activate'} aria-label="Toggle plant status" className={p.status === 'active' ? 'hover:text-red-600' : 'text-emerald-600'} onClick={() => togglePlant(p)} />
                          </div>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={8} className="border-b border-slate-200 bg-slate-50/70 px-3 py-2 pl-10">
                          {lines.length ? (
                            <table className="w-full overflow-hidden rounded-md border border-slate-200 bg-white">
                              <thead>
                                <tr>{['Line', 'Display name', 'Status', 'Calendar', 'MOS (this month)', 'Categories', 'Allocations', ''].map((h, i) => <th key={i} className="th py-1.5">{h}</th>)}</tr>
                              </thead>
                              <tbody>
                                {lines.map((l) => {
                                  const ops = getOperators(d.ctx, l, d.today);
                                  return (
                                    <tr key={l.id} id={`line-${l.id}`} className={cn(focusLine === l.id && 'bg-blue-50')}>
                                      <td className="td py-1.5 font-semibold">{l.code}</td>
                                      <td className="td py-1.5 text-slate-600">{l.name}</td>
                                      <td className="td py-1.5"><StatusBadge status={l.status} /></td>
                                      <td className="td py-1.5 text-xs text-slate-600">{l.calendarId ? calName(l.calendarId) : <span className="text-slate-400">Inherit · {calName(p.calendarId)}</span>}</td>
                                      <td className="td py-1.5">{ops.source === 'workforce' ? ops.count : ops.source === 'default' ? <span className="text-amber-700" title="No carder record this month — using default">{ops.count} (default)</span> : <Badge tone="red">Missing</Badge>}</td>
                                      <td className="td py-1.5 text-xs text-slate-600">{l.categories?.length ? l.categories.join(', ') : <span className="text-slate-400">All</span>}</td>
                                      <td className="td py-1.5"><button className="font-medium text-blue-600 hover:underline" onClick={() => setAllocLine(l)}>{allocCount[l.id] || 0} current</button></td>
                                      <td className="td w-[1%] py-1.5">
                                        <div className="flex justify-end gap-0.5">
                                          <Button size="icon-sm" variant="ghost" icon={CalendarRange} title="View on planning board" aria-label="View on planning board" onClick={() => navigate(`/planning`)} />
                                          {canEdit && <Button size="icon-sm" variant="ghost" icon={Pencil} title="Edit line" aria-label="Edit line" onClick={() => setLineModal(l)} />}
                                          {canEdit && <Button size="icon-sm" variant="ghost" icon={Power} title={l.status === 'active' ? 'Deactivate' : 'Activate'} aria-label="Toggle line status" className={l.status === 'active' ? 'hover:text-red-600' : 'text-emerald-600'} onClick={() => toggleLine(l)} />}
                                          {canEdit && <Button size="icon-sm" variant="ghost" icon={Trash2} title="Delete line" aria-label="Delete line" className="hover:text-red-600" onClick={() => deleteLine(l)} />}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          ) : (
                            <p className="py-2 text-xs text-slate-500">No lines configured for this plant.</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!groups.length && <EmptyState title="No plants match the filters" />}
        </div>
      </Card>

      <PlantFormModal open={!!plantModal} onClose={() => setPlantModal(null)} plant={plantModal?.id ? plantModal : null} />
      <LineFormModal open={!!lineModal} onClose={() => setLineModal(null)} line={lineModal?.id ? lineModal : null} defaultPlantId={lineModal?.plantId} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} config={importConfig} />
      {allocLine && <LineAllocationsDrawer line={allocLine} onClose={() => setAllocLine(null)} />}
    </div>
  );
}

function LineAllocationsDrawer({ line, onClose }) {
  const d = useDerived();
  const openOrder = useAppStore((s) => s.openOrder);
  const navigate = useNavigate();
  const entries = Object.values(d.analysis).filter((e) => e.alloc.lineId === line.id).sort((a, b) => a.plan.start.localeCompare(b.plan.start));
  return (
    <Drawer open onClose={onClose} title={`${line.code} allocations`} subtitle={line.name}>
      <div className="p-4">
        {entries.length ? (
          <table className="w-full">
            <thead><tr>{['Order', 'Style', 'Dates', 'Qty', 'Status'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {entries.map((e) => {
                const s = d.orders[e.alloc.orderId];
                const past = e.plan.end < d.today;
                return (
                  <tr key={e.alloc.id} className={cn('cursor-pointer hover:bg-slate-50', past && 'text-slate-400')} onClick={() => { onClose(); openOrder(s.order.id); }}>
                    <td className="td font-medium">{s.order.poNo}</td>
                    <td className="td">{d.ctx.styles[s.order.styleId]?.code}</td>
                    <td className="td">{fmtShort(e.plan.start)} → {fmtShort(e.plan.end)}</td>
                    <td className="td tabular-nums">{fmtNum(e.alloc.qty)}</td>
                    <td className="td"><StatusBadge status={s.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <EmptyState icon={ListChecks} title="No allocations on this line" />}
        <Button className="mt-4" icon={CalendarRange} onClick={() => { onClose(); navigate('/planning'); }}>Open planning board</Button>
      </div>
    </Drawer>
  );
}
