import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, Upload, RotateCcw, Database, ShieldAlert } from 'lucide-react';
import { ROLES, useAppStore } from '../store/appStore';
import { Alert, Button, Card, Checkbox, Field, Input, PageHeader, Select } from '../components/common/ui';
import { confirm } from '../components/common/confirm';
import { downloadFile } from '../services/importExportService';
import { SCHEMA_VERSION, isValidData, storageSizeKb } from '../services/storageService';
import { fmtDateTime, todayISO } from '../utils/dateUtils';

export default function SettingsPage() {
  const data = useAppStore((s) => s.data);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const resetDemo = useAppStore((s) => s.resetDemo);
  const replaceData = useAppStore((s) => s.replaceData);
  const s = data.settings;
  const isAdmin = s.user.role === 'admin';
  const fileRef = useRef(null);
  const [name, setName] = useState(s.user.name);

  const num = (key, min, max) => (e) => {
    const v = Number(e.target.value);
    if (!Number.isInteger(v) || v < min || v > max) return toast.error(`Enter a whole number between ${min} and ${max}`);
    updateSettings({ [key]: v });
    toast.success('Setting saved');
  };

  const importBackup = async (file) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const payload = parsed?.data ?? parsed;
      if (!isValidData(payload)) throw new Error('File is not a valid Kelly Felder planning backup.');
      if (parsed.version && parsed.version !== SCHEMA_VERSION) throw new Error(`Backup schema v${parsed.version} does not match this app (v${SCHEMA_VERSION}).`);
      if (!(await confirm({ title: 'Replace all local data?', message: `This replaces all data in this browser with the backup (${payload.orders.length} orders, ${payload.allocations.length} allocations).`, confirmLabel: 'Import backup', danger: true }))) return;
      replaceData(payload);
      toast.success('Backup imported');
    } catch (e) {
      toast.error('Import failed', { description: e.message });
    }
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Preferences for this demo environment." />
      <Alert tone="blue" icon={Database} className="mb-4" title="Demo mode — local data only">
        All data is stored in this browser&apos;s localStorage. There is no live ERP connection; ERP sync on the Orders page is simulated.
      </Alert>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="User profile & demo role">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Display name">
              <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim().length >= 2 && name !== s.user.name) { updateSettings({ user: { ...s.user, name: name.trim() } }); toast.success('Name saved'); } }} />
            </Field>
            <Field label="Demo role">
              <Select value={s.user.role} onChange={(e) => { updateSettings({ user: { ...s.user, role: e.target.value } }); toast.success(`Switched to ${ROLES[e.target.value].label}`); }}>
                {Object.entries(ROLES).map(([id, r]) => <option key={id} value={id}>{r.label}</option>)}
              </Select>
            </Field>
          </div>
          <ul className="mt-3 space-y-1 text-xs text-slate-500">
            <li><b className="text-slate-700">Central Planner</b> — plans the board, manages orders, master data and calendars.</li>
            <li><b className="text-slate-700">Plant Manager</b> — read-only board; records output, workforce and milestone updates.</li>
            <li><b className="text-slate-700">Administrator</b> — everything, plus demo data reset.</li>
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">Role switching demonstrates permissions in the UI only — it is not real authorisation.</p>
        </Card>

        <Card title="Scheduling preferences">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Default planning horizon">
              <Select value={s.defaultHorizon} onChange={(e) => { updateSettings({ defaultHorizon: e.target.value }); toast.success('Setting saved'); }}>
                <option value="2w">2 weeks</option>
                <option value="1m">1 month</option>
                <option value="3m">3 months</option>
              </Select>
            </Field>
            <Field label="Delivery buffer (days)" hint="Warn when finish is this close to delivery">
              <Input type="number" min={0} max={30} defaultValue={s.deliveryBufferDays} onBlur={num('deliveryBufferDays', 0, 30)} />
            </Field>
            <Field label="Low utilisation threshold (%)" hint="Used on the overview">
              <Input type="number" min={5} max={95} defaultValue={s.lowUtilizationThreshold} onBlur={num('lowUtilizationThreshold', 5, 95)} />
            </Field>
            <Field label="Default working calendar">
              <Select value={s.defaultCalendarId} onChange={(e) => { updateSettings({ defaultCalendarId: e.target.value }); toast.success('Setting saved'); }}>
                {data.calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
          <Checkbox className="mt-3" label="Use line default operators when no monthly carder record exists (flagged as a warning)" checked={s.useLineDefaultWhenNoWorkforce !== false} onChange={(v) => { updateSettings({ useLineDefaultWhenNoWorkforce: v }); toast.success(v ? 'Line defaults will be used (with warnings)' : 'Lines without carder records now have zero capacity'); }} />
          <p className="mt-3 text-xs text-slate-500">Efficiency levels are configured on the <Link to="/efficiency-ladder" className="font-medium text-blue-600 hover:underline">Efficiency Ladder</Link> page.</p>
        </Card>

        <Card title="Notification preferences">
          <div className="space-y-2">
            {[['milestones', 'Milestone delays and blocks'], ['capacity', 'Capacity and scheduling warnings'], ['output', 'Output milestones (order quantity complete)']].map(([k, label]) => (
              <Checkbox key={k} label={label} checked={s.notify?.[k] !== false} onChange={(v) => updateSettings({ notify: { ...s.notify, [k]: v } })} />
            ))}
          </div>
        </Card>

        <Card title="Data, import & export">
          <div className="flex flex-wrap gap-2">
            <Button icon={Download} onClick={() => { downloadFile(`kelly-felder-backup-${todayISO()}.json`, JSON.stringify({ version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data }, null, 2), 'application/json'); toast.success('Backup downloaded'); }}>Download full backup (JSON)</Button>
            <Button icon={Upload} disabled={!isAdmin} onClick={() => fileRef.current?.click()} title={!isAdmin ? 'Administrator only' : undefined}>Restore backup</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { importBackup(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <p className="mt-3 text-xs text-slate-500">CSV import/export with templates is available on <Link className="text-blue-600 hover:underline" to="/orders">Orders</Link> and <Link className="text-blue-600 hover:underline" to="/plants">Plants &amp; Lines</Link>; CSV export on the planning board, critical path, carder and output pages.</p>
          <div className="mt-4 rounded-md border border-red-200 bg-red-50/60 p-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-red-800"><ShieldAlert className="h-4 w-4" /> Reset demo data</div>
            <p className="mt-1 text-xs text-red-800/80">Replaces every local change with the original demo dataset, regenerated relative to today&apos;s date.</p>
            <Button className="mt-2" variant="danger" icon={RotateCcw} disabled={!isAdmin} onClick={async () => {
              if (await confirm({ title: 'Reset demo data?', message: 'All local orders, plans, milestones, output and configuration changes will be lost.', confirmLabel: 'Reset data', danger: true })) { resetDemo(); toast.success('Demo data reset'); }
            }}>Reset demo data</Button>
            {!isAdmin && <p className="mt-1.5 text-[11px] text-red-800/70">Switch to the Administrator role to reset.</p>}
          </div>
        </Card>

        <Card title="Recent changes (audit log)" bodyClass="max-h-80 overflow-y-auto scroll-thin">
          <ul className="divide-y divide-slate-100">
            {data.audit.slice(0, 60).map((a) => (
              <li key={a.id} className="px-4 py-2 text-xs">
                <div className="text-slate-700">{a.summary}</div>
                <div className="text-[11px] text-slate-400">{fmtDateTime(a.at)} · {a.user} · {a.entity}/{a.action}</div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Application information">
          <dl className="grid grid-cols-2 gap-y-2 text-[13px]">
            <dt className="text-slate-500">Application</dt><dd>Kelly Felder Production Planning (prototype)</dd>
            <dt className="text-slate-500">Data schema</dt><dd>v{SCHEMA_VERSION}</dd>
            <dt className="text-slate-500">Storage</dt><dd>localStorage · {storageSizeKb()} KB</dd>
            <dt className="text-slate-500">ERP connection</dt><dd>None (simulated sync)</dd>
            <dt className="text-slate-500">Records</dt><dd>{data.plants.length} plants · {data.lines.length} lines · {data.orders.length} orders</dd>
            <dt className="text-slate-500">Capacity formula</dt><dd>MOS × minutes × ladder efficiency ÷ SMV</dd>
          </dl>
        </Card>
      </div>
    </div>
  );
}
