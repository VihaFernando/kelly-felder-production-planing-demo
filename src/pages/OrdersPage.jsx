import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Download, Upload, RefreshCw, Pencil, Trash2, Eye, CalendarRange } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, useCan } from '../store/appStore';
import { useDerived } from '../hooks/useDerived';
import { Button, Card, FilterSelect, PageHeader, SearchInput, StatusBadge, Tabs, Badge, cn, STATUS } from '../components/common/ui';
import { DataTable } from '../components/common/DataTable';
import { FormModal } from '../components/common/FormModal';
import { ImportDialog } from '../components/common/ImportDialog';
import { confirm } from '../components/common/confirm';
import { OrderFormModal } from '../components/orders/OrderFormModal';
import { CATEGORIES } from '../components/masterdata/MasterForms';
import { exportCsv } from '../services/importExportService';
import { generateFromTemplate } from '../services/milestoneService';
import { addDaysISO, fmtDate, isValidISO, fmtDateTime } from '../utils/dateUtils';
import { fmtNum, uid } from '../utils/formatters';

export default function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'orders';
  const data = useAppStore((s) => s.data);
  const counts = { orders: data.orders.length, buyers: data.buyers.length, styles: data.styles.length };
  return (
    <div>
      <PageHeader title="Orders" subtitle={`Production orders are sourced from the ERP (simulated). Last sync ${fmtDateTime(data.settings.lastErpSync)}.`} />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={(v) => setParams(v === 'orders' ? {} : { tab: v })}
        tabs={[
          { value: 'orders', label: 'Production Orders', count: counts.orders },
          { value: 'buyers', label: 'Buyers', count: counts.buyers },
          { value: 'styles', label: 'Styles', count: counts.styles },
        ]}
      />
      {tab === 'orders' && <ProductionOrders />}
      {tab === 'buyers' && <Buyers />}
      {tab === 'styles' && <Styles />}
    </div>
  );
}

function ProductionOrders() {
  const data = useAppStore((s) => s.data);
  const commit = useAppStore((s) => s.commit);
  const openOrder = useAppStore((s) => s.openOrder);
  const notify = useAppStore((s) => s.notify);
  const canEdit = useCan('orders');
  const d = useDerived();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [f, setF] = useState({ buyer: '', plant: '', status: params.get('status') || '', readiness: '', risk: params.get('risk') || '' });
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);

  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    return Object.values(d.orders)
      .map((s) => {
        const style = d.ctx.styles[s.order.styleId];
        const lines = [...new Set(s.allocs.map((a) => d.ctx.lines[a.lineId]?.code))].filter(Boolean);
        const plants = [...new Set(s.allocs.map((a) => d.ctx.lines[a.lineId]?.plantId))];
        return { id: s.order.id, s, style, buyer: d.ctx.buyers[style?.buyerId], lines, plants };
      })
      .filter((r) => {
        if (f.buyer && r.buyer?.id !== f.buyer) return false;
        if (f.plant && !r.plants.includes(f.plant)) return false;
        if (f.status === 'planned' ? !['planned', 'partial', 'in_production'].includes(r.s.status) : f.status && r.s.status !== f.status) return false;
        if (f.readiness && r.s.readiness.state !== f.readiness) return false;
        if (f.risk === 'any' ? r.s.risk === 'ok' : f.risk && r.s.risk !== f.risk) return false;
        if (ql && !`${r.s.order.poNo} ${r.s.order.soNo} ${r.style?.code} ${r.style?.description} ${r.buyer?.name}`.toLowerCase().includes(ql)) return false;
        return true;
      });
  }, [d, q, f]);

  const remove = async (o) => {
    const hasOutput = data.outputs.some((r) => r.orderId === o.id);
    if (hasOutput) {
      toast.error(`${o.poNo} has recorded output and cannot be deleted`, { description: 'Set its status to Cancelled instead to preserve production history.' });
      return;
    }
    const allocs = data.allocations.filter((a) => a.orderId === o.id).length;
    const ok = await confirm({ title: `Delete ${o.poNo}?`, message: `This removes the demo order${allocs ? `, its ${allocs} line allocation(s)` : ''} and its milestones. This cannot be undone.`, confirmLabel: 'Delete order', danger: true });
    if (!ok) return;
    commit((dd) => ({ ...dd, orders: dd.orders.filter((x) => x.id !== o.id), allocations: dd.allocations.filter((a) => a.orderId !== o.id), milestones: dd.milestones.filter((m) => m.orderId !== o.id) }), [{ entity: 'order', entityId: o.id, action: 'deleted', summary: `${o.poNo} deleted`, before: o }]);
    toast.success(`${o.poNo} deleted`);
  };

  const simulateSync = () => {
    const styles = data.styles;
    const base = Math.max(...data.orders.map((o) => Number(o.poNo.replace(/\D/g, '')) || 0)) + 7;
    const today = d.today;
    const created = [0, 1].map((i) => {
      const st = styles[(base + i * 5) % styles.length];
      return { id: uid('po'), poNo: `PO-${base + i * 11}`, soNo: `SO-${9100 + ((base + i) % 800)}`, lineItem: '10', styleId: st.id, qty: 1500 + ((base * (i + 3)) % 30) * 100, deliveryDate: addDaysISO(today, 40 + i * 12), source: 'ERP', status: 'open', createdAt: Date.now() };
    });
    const ms = created.flatMap((o) => {
      const st = styles.find((s) => s.id === o.styleId);
      const tpl = data.templates.find((t) => t.id === st.templateId);
      return tpl ? generateFromTemplate(tpl, o.id, addDaysISO(o.deliveryDate, -22), addDaysISO(o.deliveryDate, -10)) : [];
    });
    commit((dd) => ({ ...dd, orders: [...created, ...dd.orders], milestones: [...dd.milestones, ...ms], settings: { ...dd.settings, lastErpSync: new Date().toISOString() } }), [{ entity: 'erp', entityId: '-', action: 'sync', summary: `Simulated ERP sync: ${created.map((o) => o.poNo).join(', ')} received` }]);
    notify({ title: 'ERP sync completed (simulated)', body: `${created.length} new orders awaiting planning.`, link: '/orders?status=unplanned' });
    toast.success(`Simulated ERP sync: ${created.length} new orders`, { description: 'This is demo data — no real ERP connection exists.' });
  };

  const doExport = () =>
    exportCsv('production-orders.csv', rows, [
      { header: 'PO No', value: (r) => r.s.order.poNo },
      { header: 'SO No', value: (r) => r.s.order.soNo },
      { header: 'Line Item', value: (r) => r.s.order.lineItem },
      { header: 'Buyer', value: (r) => r.buyer?.name },
      { header: 'Style Code', value: (r) => r.style?.code },
      { header: 'Description', value: (r) => r.style?.description },
      { header: 'Qty', value: (r) => r.s.order.qty },
      { header: 'SMV', value: (r) => r.style?.smv },
      { header: 'Delivery Date', value: (r) => r.s.order.deliveryDate },
      { header: 'Planned Lines', value: (r) => r.lines.join(' ') },
      { header: 'Start', value: (r) => r.s.start || '' },
      { header: 'Finish', value: (r) => r.s.end || '' },
      { header: 'Planning Status', value: (r) => STATUS[r.s.status]?.label },
      { header: 'Readiness', value: (r) => STATUS[r.s.readiness.state]?.label },
      { header: 'Risk', value: (r) => STATUS[r.s.risk]?.label },
      { header: 'Good Pcs', value: (r) => r.s.good },
    ]);

  const importConfig = {
    title: 'Import production orders (demo)',
    templateName: 'orders-template.csv',
    headers: ['PO No', 'SO No', 'Line Item', 'Style Code', 'Qty', 'Delivery Date'],
    example: ['PO-70001', 'SO-9001', '10', data.styles[0]?.code, '2400', addDaysISO(d.today, 45)],
    required: ['PO No', 'SO No', 'Style Code', 'Qty', 'Delivery Date'],
    existingKeys: new Set(data.orders.map((o) => o.poNo.toUpperCase())),
    keyOf: (o) => o.poNo.toUpperCase(),
    toItem: (row) => {
      const style = data.styles.find((s) => s.code.toUpperCase() === String(row['Style Code']).trim().toUpperCase());
      if (!style) return { error: `unknown style "${row['Style Code']}"` };
      const qty = Number(row.Qty);
      if (!Number.isInteger(qty) || qty <= 0) return { error: 'Qty must be a positive whole number' };
      const date = String(row['Delivery Date']).trim();
      if (!isValidISO(date)) return { error: 'Delivery Date must be YYYY-MM-DD' };
      return { item: { id: uid('po'), poNo: String(row['PO No']).trim(), soNo: String(row['SO No']).trim(), lineItem: String(row['Line Item'] || '10').trim(), styleId: style.id, qty, deliveryDate: date, source: 'Manual', status: 'open', createdAt: Date.now() } };
    },
    onImport: (items) => {
      const ms = items.flatMap((o) => {
        const st = data.styles.find((s) => s.id === o.styleId);
        const tpl = data.templates.find((t) => t.id === st.templateId);
        return tpl ? generateFromTemplate(tpl, o.id, addDaysISO(o.deliveryDate, -22), addDaysISO(o.deliveryDate, -10)) : [];
      });
      commit((dd) => ({ ...dd, orders: [...items, ...dd.orders], milestones: [...dd.milestones, ...ms] }), [{ entity: 'order', entityId: '-', action: 'import', summary: `${items.length} orders imported from CSV` }]);
      toast.success(`Import completed: ${items.length} orders`);
    },
  };

  const columns = [
    { key: 'po', header: 'PO No', sort: (r) => r.s.order.poNo, cell: (r) => <span className="font-semibold text-slate-900">{r.s.order.poNo}{r.s.order.source !== 'ERP' && <Badge tone="amber" className="ml-1.5">Manual</Badge>}</span> },
    { key: 'so', header: 'SO No', sort: (r) => r.s.order.soNo, cell: (r) => <span className="text-slate-600">{r.s.order.soNo}</span> },
    { key: 'buyer', header: 'Buyer', sort: (r) => r.buyer?.name, cell: (r) => r.buyer?.name },
    { key: 'style', header: 'Style', sort: (r) => r.style?.code, cell: (r) => <span className="font-medium">{r.style?.code}</span> },
    { key: 'desc', header: 'Description', sort: (r) => r.style?.description, cell: (r) => <span className="block max-w-[200px] truncate text-slate-600" title={r.style?.description}>{r.style?.description}</span> },
    { key: 'item', header: 'Item', sort: (r) => r.s.order.lineItem, cell: (r) => r.s.order.lineItem },
    { key: 'qty', header: 'Qty', align: 'right', sort: (r) => r.s.order.qty, cell: (r) => fmtNum(r.s.order.qty) },
    { key: 'smv', header: 'SMV', align: 'right', sort: (r) => r.style?.smv, cell: (r) => r.style?.smv },
    { key: 'delivery', header: 'Delivery', sort: (r) => r.s.order.deliveryDate, cell: (r) => <span className={cn(r.s.daysToDelivery < 14 && r.s.remaining > 0 && 'font-medium text-red-600')}>{fmtDate(r.s.order.deliveryDate)}</span> },
    { key: 'line', header: 'Plant / Line', sort: (r) => r.lines[0] || 'zzz', cell: (r) => (r.lines.length ? <span>{r.lines.join(', ')}</span> : <span className="text-slate-400">—</span>) },
    { key: 'status', header: 'Planning', sort: (r) => r.s.status, cell: (r) => <StatusBadge status={r.s.status} /> },
    { key: 'ready', header: 'Readiness', sort: (r) => r.s.readiness.state, cell: (r) => <StatusBadge status={r.s.readiness.state} /> },
    { key: 'risk', header: 'Risk', sort: (r) => ({ critical: 0, at_risk: 1, ok: 2 })[r.s.risk], cell: (r) => <span title={r.s.reasons.map((x) => x.msg).join('\n')}><StatusBadge status={r.s.risk} /></span> },
    {
      key: 'actions', header: '', sortable: false, className: 'w-[1%]',
      cell: (r) => (
        <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Button size="icon-sm" variant="ghost" icon={Eye} title="View details" aria-label="View details" onClick={() => openOrder(r.id)} />
          <Button size="icon-sm" variant="ghost" icon={CalendarRange} title="Open on planning board" aria-label="Open on planning board" onClick={() => navigate(`/planning?order=${r.id}`)} />
          {canEdit && <Button size="icon-sm" variant="ghost" icon={Pencil} title="Edit" aria-label="Edit" onClick={() => setEditing(r.s.order)} />}
          {canEdit && <Button size="icon-sm" variant="ghost" icon={Trash2} title="Delete" aria-label="Delete" className="hover:text-red-600" onClick={() => remove(r.s.order)} />}
        </div>
      ),
    },
  ];

  const opt = (arr) => arr.map((s) => ({ value: s, label: STATUS[s].label }));
  return (
    <Card bodyClass="">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search PO, SO, style, buyer…" className="w-64" />
        <FilterSelect value={f.buyer} onChange={(v) => setF({ ...f, buyer: v })} options={data.buyers.map((b) => ({ value: b.id, label: b.name }))} placeholder="All buyers" />
        <FilterSelect value={f.plant} onChange={(v) => setF({ ...f, plant: v })} options={data.plants.map((p) => ({ value: p.id, label: p.code }))} placeholder="All plants" />
        <FilterSelect value={f.status} onChange={(v) => setF({ ...f, status: v })} options={opt(['unplanned', 'planned', 'partial', 'in_production', 'completed', 'cancelled'])} placeholder="Any status" />
        <FilterSelect value={f.readiness} onChange={(v) => setF({ ...f, readiness: v })} options={opt(['ready', 'pending', 'at_risk', 'blocked', 'unknown'])} placeholder="Any readiness" />
        <FilterSelect value={f.risk} onChange={(v) => setF({ ...f, risk: v })} options={[{ value: 'any', label: 'At risk or critical' }, ...opt(['critical', 'at_risk', 'ok'])]} placeholder="Any risk" />
        <div className="ml-auto flex flex-wrap gap-1.5">
          {canEdit && <Button icon={RefreshCw} onClick={simulateSync} title="Simulates receiving new orders from the ERP">Sync ERP (demo)</Button>}
          {canEdit && <Button icon={Upload} onClick={() => setImporting(true)}>Import</Button>}
          <Button icon={Download} onClick={doExport}>Export CSV</Button>
          {canEdit && <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>New order</Button>}
        </div>
      </div>
      <DataTable columns={columns} rows={rows} onRowClick={(r) => openOrder(r.id)} initialSort={{ key: 'delivery', dir: 'asc' }} footer={`${rows.length} of ${data.orders.length} orders`} />
      <OrderFormModal open={!!editing} onClose={() => setEditing(null)} order={editing === 'new' ? null : editing} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} config={importConfig} />
    </Card>
  );
}

const buyerSchema = z.object({ code: z.string().trim().min(2, 'Required').max(8), name: z.string().trim().min(2, 'Required').max(60), country: z.string().trim().min(2, 'Required').max(40) });

function Buyers() {
  const data = useAppStore((s) => s.data);
  const commit = useAppStore((s) => s.commit);
  const canEdit = useCan('orders');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');

  const rows = data.buyers
    .filter((b) => `${b.code} ${b.name} ${b.country}`.toLowerCase().includes(q.toLowerCase()))
    .map((b) => {
      const styleIds = new Set(data.styles.filter((s) => s.buyerId === b.id).map((s) => s.id));
      return { ...b, styles: styleIds.size, orders: data.orders.filter((o) => styleIds.has(o.styleId)).length };
    });

  const remove = async (b) => {
    if (b.styles) return toast.error(`${b.name} has ${b.styles} style(s) and cannot be deleted`);
    if (await confirm({ title: `Delete ${b.name}?`, message: 'This buyer has no styles and will be removed.', confirmLabel: 'Delete', danger: true })) {
      commit((d) => ({ ...d, buyers: d.buyers.filter((x) => x.id !== b.id) }), [{ entity: 'buyer', entityId: b.id, action: 'deleted', summary: `Buyer ${b.name} deleted` }]);
      toast.success('Buyer deleted');
    }
  };

  return (
    <Card bodyClass="">
      <div className="flex items-center gap-2 border-b border-slate-200 p-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search buyers…" className="w-64" />
        {canEdit && <Button variant="primary" icon={Plus} className="ml-auto" onClick={() => setEditing({})}>New buyer</Button>}
      </div>
      <DataTable
        rows={rows}
        columns={[
          { key: 'code', header: 'Code', cell: (r) => <span className="font-semibold">{r.code}</span> },
          { key: 'name', header: 'Buyer' },
          { key: 'country', header: 'Country' },
          { key: 'styles', header: 'Styles', align: 'right' },
          { key: 'orders', header: 'Orders', align: 'right' },
          { key: 'a', header: '', sortable: false, className: 'w-[1%]', cell: (r) => canEdit && <div className="flex justify-end gap-0.5"><Button size="icon-sm" variant="ghost" icon={Pencil} aria-label="Edit" onClick={() => setEditing(r)} /><Button size="icon-sm" variant="ghost" icon={Trash2} aria-label="Delete" onClick={() => remove(r)} /></div> },
        ]}
      />
      <FormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.name}` : 'New buyer'}
        schema={buyerSchema}
        defaultValues={editing?.id ? { code: editing.code, name: editing.name, country: editing.country } : { code: '', name: '', country: '' }}
        fields={[{ name: 'code', label: 'Code', required: true }, { name: 'country', label: 'Country', required: true }, { name: 'name', label: 'Buyer name', required: true, span: 2 }]}
        onSubmit={(v, { setError }) => {
          if (data.buyers.some((b) => b.code.toUpperCase() === v.code.toUpperCase() && b.id !== editing.id)) { setError('code', { message: 'Code already exists' }); return false; }
          const item = { ...editing, ...v, code: v.code.toUpperCase(), id: editing.id || uid('by') };
          commit((d) => ({ ...d, buyers: editing.id ? d.buyers.map((b) => (b.id === item.id ? { id: item.id, code: item.code, name: item.name, country: item.country } : b)) : [...d.buyers, { id: item.id, code: item.code, name: item.name, country: item.country }] }), [{ entity: 'buyer', entityId: item.id, action: editing.id ? 'updated' : 'created', summary: `Buyer ${item.name} saved` }]);
          toast.success('Buyer saved');
        }}
      />
    </Card>
  );
}

const styleSchema = z.object({
  code: z.string().trim().min(3, 'Required').max(20),
  description: z.string().trim().min(3, 'Required').max(80),
  buyerId: z.string().min(1, 'Select a buyer'),
  category: z.string().min(1, 'Select a category'),
  smv: z.coerce.number({ message: 'Enter SMV' }).positive('Must be greater than 0').max(300),
  templateId: z.string().min(1, 'Select a template'),
});

function Styles() {
  const data = useAppStore((s) => s.data);
  const commit = useAppStore((s) => s.commit);
  const canEdit = useCan('orders');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [buyer, setBuyer] = useState('');

  const rows = data.styles
    .filter((s) => (!buyer || s.buyerId === buyer) && `${s.code} ${s.description} ${s.category}`.toLowerCase().includes(q.toLowerCase()))
    .map((s) => ({ ...s, buyerName: data.buyers.find((b) => b.id === s.buyerId)?.name, tplName: data.templates.find((t) => t.id === s.templateId)?.name, orders: data.orders.filter((o) => o.styleId === s.id).length }));

  const remove = async (s) => {
    if (s.orders) return toast.error(`${s.code} is used by ${s.orders} order(s) and cannot be deleted`);
    if (await confirm({ title: `Delete style ${s.code}?`, message: 'No orders reference this style.', confirmLabel: 'Delete', danger: true })) {
      commit((d) => ({ ...d, styles: d.styles.filter((x) => x.id !== s.id) }), [{ entity: 'style', entityId: s.id, action: 'deleted', summary: `Style ${s.code} deleted` }]);
      toast.success('Style deleted');
    }
  };

  return (
    <Card bodyClass="">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search styles…" className="w-64" />
        <FilterSelect value={buyer} onChange={setBuyer} options={data.buyers.map((b) => ({ value: b.id, label: b.name }))} placeholder="All buyers" />
        {canEdit && <Button variant="primary" icon={Plus} className="ml-auto" onClick={() => setEditing({})}>New style</Button>}
      </div>
      <DataTable
        rows={rows}
        columns={[
          { key: 'code', header: 'Style code', cell: (r) => <span className="font-semibold">{r.code}</span> },
          { key: 'description', header: 'Description' },
          { key: 'buyerName', header: 'Buyer' },
          { key: 'category', header: 'Category' },
          { key: 'smv', header: 'SMV', align: 'right' },
          { key: 'tplName', header: 'Critical-path template' },
          { key: 'orders', header: 'Orders', align: 'right' },
          { key: 'a', header: '', sortable: false, className: 'w-[1%]', cell: (r) => canEdit && <div className="flex justify-end gap-0.5"><Button size="icon-sm" variant="ghost" icon={Pencil} aria-label="Edit" onClick={() => setEditing(r)} /><Button size="icon-sm" variant="ghost" icon={Trash2} aria-label="Delete" onClick={() => remove(r)} /></div> },
        ]}
      />
      <FormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit style ${editing.code}` : 'New style'}
        description="SMV changes immediately affect capacity calculations for every order using this style."
        schema={styleSchema}
        defaultValues={editing?.id ? { code: editing.code, description: editing.description, buyerId: editing.buyerId, category: editing.category, smv: editing.smv, templateId: editing.templateId } : { code: '', description: '', buyerId: '', category: '', smv: 15, templateId: data.templates[0]?.id }}
        fields={[
          { name: 'code', label: 'Style code', required: true },
          { name: 'buyerId', label: 'Buyer', type: 'select', required: true, placeholder: 'Select buyer…', options: data.buyers.map((b) => ({ value: b.id, label: b.name })) },
          { name: 'description', label: 'Description', required: true, span: 2 },
          { name: 'category', label: 'Garment category', type: 'select', required: true, placeholder: 'Select…', options: CATEGORIES.map((c) => ({ value: c, label: c })) },
          { name: 'smv', label: 'SMV (minutes)', type: 'number', step: '0.1', required: true },
          { name: 'templateId', label: 'Default critical-path template', type: 'select', required: true, span: 2, options: data.templates.map((t) => ({ value: t.id, label: t.name })) },
        ]}
        onSubmit={(v, { setError }) => {
          if (data.styles.some((s) => s.code.toUpperCase() === v.code.toUpperCase() && s.id !== editing.id)) { setError('code', { message: 'Style code already exists' }); return false; }
          const item = { ...v, code: v.code.toUpperCase(), id: editing.id || uid('st') };
          commit((d) => ({ ...d, styles: editing.id ? d.styles.map((s) => (s.id === item.id ? item : s)) : [...d.styles, item] }), [{ entity: 'style', entityId: item.id, action: editing.id ? 'updated' : 'created', summary: `Style ${item.code} saved`, before: editing.id ? { smv: editing.smv } : null, after: { smv: item.smv } }]);
          toast.success(`Style ${item.code} saved`);
        }}
      />
    </Card>
  );
}
