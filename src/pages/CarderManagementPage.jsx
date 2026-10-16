import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Save, Pencil, Trash2, Copy, Users, AlertTriangle, Download } from 'lucide-react';
import { useAppStore, useCan } from '../store/appStore';
import { Alert, Button, Card, Field, Input, PageHeader, SearchInput, Select, Stat } from '../components/common/ui';
import { DataTable } from '../components/common/DataTable';
import { confirm } from '../components/common/confirm';
import { exportCsv } from '../services/importExportService';
import { fmtDateTime } from '../utils/dateUtils';
import { fmtNum } from '../utils/formatters';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function isCount(v) {
  return v !== '' && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 999;
}

export default function CarderManagementPage() {
  const data = useAppStore((s) => s.data);
  const commit = useAppStore((s) => s.commit);
  const canEdit = useCan('workforce');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [lineQuery, setLineQuery] = useState('');
  const [form, setForm] = useState({ lineId: '', mos: '', helpers: '', carders: '' });
  const [errors, setErrors] = useState({});
  const [tableQuery, setTableQuery] = useState('');

  const plantCode = (lineId) => data.plants.find((p) => p.id === data.lines.find((l) => l.id === lineId)?.plantId)?.code;
  const activeLines = data.lines.filter((l) => l.status === 'active' && data.plants.find((p) => p.id === l.plantId)?.status === 'active');
  const lineOptions = activeLines.filter((l) => `${l.code} ${l.name}`.toLowerCase().includes(lineQuery.toLowerCase()));

  const monthRecords = useMemo(() => data.workforce.filter((w) => w.year === year && w.month === month), [data.workforce, year, month]);
  const missing = activeLines.filter((l) => !monthRecords.some((w) => w.lineId === l.id));
  const totals = monthRecords.reduce((t, w) => ({ mos: t.mos + w.mos, helpers: t.helpers + w.helpers, carders: t.carders + w.carders }), { mos: 0, helpers: 0, carders: 0 });

  const rows = monthRecords
    .map((w) => ({ ...w, line: data.lines.find((l) => l.id === w.lineId) }))
    .filter((r) => !tableQuery || `${r.line?.code} ${plantCode(r.lineId)}`.toLowerCase().includes(tableQuery.toLowerCase()));

  const existing = form.lineId ? data.workforce.find((w) => w.lineId === form.lineId && w.year === year && w.month === month) : null;
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const pickLine = (lineId) => {
    const rec = data.workforce.find((w) => w.lineId === lineId && w.year === year && w.month === month);
    setForm(rec ? { lineId, mos: rec.mos, helpers: rec.helpers, carders: rec.carders } : { lineId, mos: '', helpers: '', carders: '' });
    setErrors({});
  };

  const save = () => {
    const e = {};
    if (!form.lineId) e.lineId = 'Select a line';
    for (const k of ['mos', 'helpers', 'carders']) if (!isCount(form[k])) e[k] = 'Whole number 0–999';
    setErrors(e);
    if (Object.keys(e).length) return;
    const line = data.lines.find((l) => l.id === form.lineId);
    const rec = { id: existing?.id || `wf-${form.lineId}-${year}-${month}`, lineId: form.lineId, year, month, mos: Number(form.mos), helpers: Number(form.helpers), carders: Number(form.carders), updatedAt: Date.now() };
    commit(
      (d) => ({ ...d, workforce: existing ? d.workforce.map((w) => (w.id === existing.id ? rec : w)) : [...d.workforce, rec] }),
      [{ entity: 'workforce', entityId: rec.id, action: existing ? 'updated' : 'created', summary: `Workforce ${line.code} ${MONTHS[month - 1]} ${year}: MOS ${rec.mos}, helpers ${rec.helpers}, carders ${rec.carders}`, before: existing ? { mos: existing.mos, helpers: existing.helpers, carders: existing.carders } : null, after: { mos: rec.mos, helpers: rec.helpers, carders: rec.carders } }],
    );
    toast.success(`${line.code} · ${MONTHS[month - 1]} ${year} ${existing ? 'updated' : 'saved'}`, { description: 'Planning board capacity recalculated.' });
    setForm({ lineId: '', mos: '', helpers: '', carders: '' });
  };

  const remove = async (r) => {
    if (await confirm({ title: `Delete ${r.line?.code} · ${MONTHS[r.month - 1]} ${r.year}?`, message: 'Capacity for this line and month will fall back to the line default operators (shown as a warning on the board).', confirmLabel: 'Delete', danger: true })) {
      commit((d) => ({ ...d, workforce: d.workforce.filter((w) => w.id !== r.id) }), [{ entity: 'workforce', entityId: r.id, action: 'deleted', summary: `Workforce ${r.line?.code} ${MONTHS[r.month - 1]} ${r.year} deleted`, before: { mos: r.mos, helpers: r.helpers, carders: r.carders } }]);
      toast.success('Workforce record deleted');
    }
  };

  const copyPrevious = async () => {
    const py = month === 1 ? year - 1 : year;
    const pm = month === 1 ? 12 : month - 1;
    const source = data.workforce.filter((w) => w.year === py && w.month === pm && missing.some((l) => l.id === w.lineId));
    if (!source.length) return toast(`No ${MONTHS[pm - 1]} records available for the ${missing.length} missing line(s)`);
    if (!(await confirm({ title: `Copy ${source.length} record(s) from ${MONTHS[pm - 1]}?`, message: `Lines without a ${MONTHS[month - 1]} ${year} record will receive last month's counts. Existing records are not changed.`, confirmLabel: 'Copy records' }))) return;
    const created = source.map((w) => ({ ...w, id: `wf-${w.lineId}-${year}-${month}`, year, month, updatedAt: Date.now() }));
    commit((d) => ({ ...d, workforce: [...d.workforce, ...created] }), [{ entity: 'workforce', entityId: '-', action: 'copied', summary: `${created.length} workforce records copied to ${MONTHS[month - 1]} ${year}` }]);
    toast.success(`${created.length} record(s) copied`);
  };

  return (
    <div>
      <PageHeader
        title="Carder Management"
        subtitle="Monthly staffing per line. MOS counts drive planning-board capacity for that month."
        actions={<Button icon={Download} onClick={() => exportCsv(`carder-${year}-${month}.csv`, rows, [{ header: 'Plant', value: (r) => plantCode(r.lineId) }, { header: 'Line', value: (r) => r.line?.code }, { header: 'Year', key: 'year' }, { header: 'Month', key: 'month' }, { header: 'MOS', key: 'mos' }, { header: 'Helpers', key: 'helpers' }, { header: 'Carders', key: 'carders' }])}>Export CSV</Button>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active lines" value={activeLines.length} icon={Users} sub={`${monthRecords.length} configured for ${MONTHS[month - 1].slice(0, 3)}`} />
        <Stat label="Total planned MOS" value={fmtNum(totals.mos)} tone="blue" />
        <Stat label="Total planned helpers" value={fmtNum(totals.helpers)} />
        <Stat label="Total planned carders" value={fmtNum(totals.carders)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card title={existing ? 'Update workforce record' : 'Add workforce record'} subtitle={`${MONTHS[month - 1]} ${year}`}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Year">
                <Select value={year} onChange={(e) => { setYear(Number(e.target.value)); setForm((f) => ({ ...f, lineId: '' })); }}>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </Select>
              </Field>
              <Field label="Month">
                <Select value={month} onChange={(e) => { setMonth(Number(e.target.value)); setForm((f) => ({ ...f, lineId: '' })); }}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </Select>
              </Field>
              <Field label="Line" required error={errors.lineId} className="col-span-2">
                <SearchInput value={lineQuery} onChange={setLineQuery} placeholder="Search lines…" className="mb-1.5" />
                <Select value={form.lineId} onChange={(e) => pickLine(e.target.value)} error={errors.lineId} disabled={!canEdit}>
                  <option value="">Select line… ({lineOptions.length})</option>
                  {lineOptions.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}{monthRecords.some((w) => w.lineId === l.id) ? ' ✓' : ''}</option>)}
                </Select>
              </Field>
              <Field label="MOS" required error={errors.mos}><Input type="number" min={0} value={form.mos} onChange={(e) => setForm({ ...form, mos: e.target.value })} error={errors.mos} disabled={!canEdit} /></Field>
              <Field label="Helpers" required error={errors.helpers}><Input type="number" min={0} value={form.helpers} onChange={(e) => setForm({ ...form, helpers: e.target.value })} error={errors.helpers} disabled={!canEdit} /></Field>
              <Field label="Carders" required error={errors.carders} className="col-span-2"><Input type="number" min={0} value={form.carders} onChange={(e) => setForm({ ...form, carders: e.target.value })} error={errors.carders} disabled={!canEdit} /></Field>
            </div>
            {existing && <p className="mt-3 text-xs text-amber-700">A record exists for this line and month — saving will update it.</p>}
            {canEdit && <Button variant="primary" icon={Save} className="mt-3 w-full" onClick={save}>{existing ? 'Update record' : 'Add record'}</Button>}
          </Card>
          {missing.length > 0 && (
            <Alert tone="amber" icon={AlertTriangle} title={`${missing.length} active line(s) have no ${MONTHS[month - 1]} ${year} record`}>
              <div className="mt-1">{missing.slice(0, 12).map((l) => l.code).join(', ')}{missing.length > 12 ? '…' : ''}</div>
              <div className="mt-1">The board uses the line default operators (or zero) for these lines and shows a warning.</div>
              {canEdit && <Button size="sm" icon={Copy} className="mt-2" onClick={copyPrevious}>Copy from previous month</Button>}
            </Alert>
          )}
        </div>

        <Card bodyClass="" title={`Records · ${MONTHS[month - 1]} ${year}`} actions={<SearchInput value={tableQuery} onChange={setTableQuery} placeholder="Filter line or plant…" className="w-52" />}>
          <DataTable
            rows={rows}
            initialSort={{ key: 'line', dir: 'asc' }}
            columns={[
              { key: 'plant', header: 'Plant', sort: (r) => plantCode(r.lineId), cell: (r) => plantCode(r.lineId) },
              { key: 'line', header: 'Line', sort: (r) => r.line?.code, cell: (r) => <span className="font-semibold">{r.line?.code}</span> },
              { key: 'period', header: 'Period', sortable: false, cell: (r) => `${MONTHS[r.month - 1].slice(0, 3)} ${r.year}` },
              { key: 'mos', header: 'MOS', align: 'right' },
              { key: 'helpers', header: 'Helpers', align: 'right' },
              { key: 'carders', header: 'Carders', align: 'right' },
              { key: 'updatedAt', header: 'Updated', cell: (r) => <span className="text-xs text-slate-500">{fmtDateTime(r.updatedAt)}</span> },
              { key: 'a', header: '', sortable: false, className: 'w-[1%]', cell: (r) => canEdit && <div className="flex justify-end gap-0.5"><Button size="icon-sm" variant="ghost" icon={Pencil} aria-label="Edit" onClick={() => pickLine(r.lineId)} /><Button size="icon-sm" variant="ghost" icon={Trash2} aria-label="Delete" className="hover:text-red-600" onClick={() => remove(r)} /></div> },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
