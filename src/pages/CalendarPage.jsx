import { useMemo, useState } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';
import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Pencil, Power, Trash2 } from 'lucide-react';
import { useAppStore, useCan } from '../store/appStore';
import { useDerived } from '../hooks/useDerived';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, StatusBadge, Tabs, cn } from '../components/common/ui';
import { DataTable } from '../components/common/DataTable';
import { FormModal } from '../components/common/FormModal';
import { confirm } from '../components/common/confirm';
import { buildContext, getDayInfo, DEFAULT_CALENDAR_ID } from '../services/capacityService';
import { eachDay, fmtDate, fromISO, toISO } from '../utils/dateUtils';
import { uid } from '../utils/formatters';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };

export default function CalendarPage() {
  const [tab, setTab] = useState('calendar');
  return (
    <div>
      <PageHeader title="Calendar & Shifts" subtitle="Working days, holidays and minutes used by the scheduling service and planning board." />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'calendar', label: 'Calendar' }, { value: 'shifts', label: 'Shift Management' }]} />
      {tab === 'calendar' ? <CalendarTab /> : <ShiftsTab />}
    </div>
  );
}

function minutesBetween(start, end) {
  const [h1, m1] = start.split(':').map(Number);
  const [h2, m2] = end.split(':').map(Number);
  const diff = h2 * 60 + m2 - (h1 * 60 + m1);
  return diff > 0 ? diff : 0;
}

const shiftSchema = z.object({
  name: z.string().trim().min(2, 'Required').max(30),
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  end: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  minutes: z.coerce.number().int('Whole minutes').min(0).max(1440),
  kind: z.enum(['normal', 'half', 'holiday']),
  status: z.enum(['active', 'inactive']),
});

function ShiftsTab() {
  const data = useAppStore((s) => s.data);
  const commit = useAppStore((s) => s.commit);
  const canEdit = useCan('calendar');
  const [editing, setEditing] = useState(null);

  const usage = (id) => data.calendars.filter((c) => Object.values(c.week).includes(id)).length + data.calendarExceptions.filter((e) => e.shiftId === id).length;

  const remove = async (s) => {
    if (usage(s.id)) return toast.error(`${s.name} is used by calendars or exceptions`, { description: 'Deactivate it instead.' });
    if (await confirm({ title: `Delete shift ${s.name}?`, message: 'This shift is not used anywhere.', confirmLabel: 'Delete', danger: true })) {
      commit((d) => ({ ...d, shifts: d.shifts.filter((x) => x.id !== s.id) }), [{ entity: 'shift', entityId: s.id, action: 'deleted', summary: `Shift ${s.name} deleted` }]);
      toast.success('Shift deleted');
    }
  };
  const toggle = async (s) => {
    const next = s.status === 'active' ? 'inactive' : 'active';
    if (next === 'inactive' && usage(s.id) && !(await confirm({ title: `Deactivate ${s.name}?`, message: 'Days using this shift will have no working minutes until it is reactivated. Plans are recalculated.', confirmLabel: 'Deactivate', danger: true }))) return;
    commit((d) => ({ ...d, shifts: d.shifts.map((x) => (x.id === s.id ? { ...x, status: next } : x)) }), [{ entity: 'shift', entityId: s.id, action: next, summary: `Shift ${s.name} ${next}` }]);
  };
  const setWeekday = (cal, dow, shiftId) => {
    commit((d) => ({ ...d, calendars: d.calendars.map((c) => (c.id === cal.id ? { ...c, week: { ...c.week, [dow]: shiftId || null } } : c)) }), [{ entity: 'calendar', entityId: cal.id, action: 'updated', summary: `${cal.name}: ${DAY_NAMES[dow]} → ${data.shifts.find((s) => s.id === shiftId)?.name || 'No shift'}` }]);
    toast.success(`${cal.name} updated`, { description: 'Capacity recalculated.' });
  };

  return (
    <div className="space-y-4">
      <Card title="Shifts" bodyClass="" actions={canEdit && <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing({})}>Add shift</Button>}>
        <DataTable
          rows={data.shifts}
          columns={[
            { key: 'name', header: 'Shift', cell: (r) => <span className="font-semibold">{r.name}</span> },
            { key: 'start', header: 'Start' },
            { key: 'end', header: 'End' },
            { key: 'minutes', header: 'Working minutes', align: 'right' },
            { key: 'kind', header: 'Type', cell: (r) => <Badge tone={r.kind === 'holiday' ? 'red' : r.kind === 'half' ? 'amber' : 'gray'}>{r.kind === 'half' ? 'Half day' : r.kind === 'holiday' ? 'Holiday' : 'Normal'}</Badge> },
            { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
            { key: 'a', header: '', sortable: false, className: 'w-[1%]', cell: (r) => canEdit && <div className="flex justify-end gap-0.5"><Button size="icon-sm" variant="ghost" icon={Pencil} aria-label="Edit" onClick={() => setEditing(r)} /><Button size="icon-sm" variant="ghost" icon={Power} aria-label="Toggle status" onClick={() => toggle(r)} /><Button size="icon-sm" variant="ghost" icon={Trash2} aria-label="Delete" className="hover:text-red-600" onClick={() => remove(r)} /></div> },
          ]}
        />
      </Card>
      <Card title="Weekly working patterns" subtitle="Assign a shift to each weekday. Plants and lines reference these patterns." bodyClass="">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="th">Pattern</th>{WEEKDAYS.map((dow) => <th key={dow} className="th">{DAY_NAMES[dow]}</th>)}<th className="th">Weekly minutes</th></tr></thead>
            <tbody>
              {data.calendars.map((c) => (
                <tr key={c.id}>
                  <td className="td font-medium">{c.name}</td>
                  {WEEKDAYS.map((dow) => (
                    <td key={dow} className="td py-1.5">
                      <Select value={c.week[dow] || ''} onChange={(e) => setWeekday(c, dow, e.target.value)} disabled={!canEdit} className="!h-7 min-w-[110px] text-xs">
                        <option value="">Off</option>
                        {data.shifts.filter((s) => s.kind !== 'holiday').map((s) => <option key={s.id} value={s.id}>{s.name} ({s.minutes})</option>)}
                      </Select>
                    </td>
                  ))}
                  <td className="td tabular-nums">{WEEKDAYS.reduce((sum, dow) => sum + (data.shifts.find((s) => s.id === c.week[dow] && s.status === 'active')?.minutes || 0), 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <FormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.name}` : 'Add shift'}
        description="Working minutes are paid production minutes per operator (breaks excluded) — enter them explicitly."
        schema={shiftSchema}
        defaultValues={editing?.id ? editing : { name: '', start: '07:30', end: '16:30', minutes: 480, kind: 'normal', status: 'active' }}
        fields={[
          { name: 'name', label: 'Shift name', required: true, span: 2 },
          { name: 'start', label: 'Start time', type: 'time', required: true },
          { name: 'end', label: 'End time', type: 'time', required: true },
          { name: 'minutes', label: 'Working minutes', type: 'number', required: true },
          { name: 'kind', label: 'Type', type: 'select', options: [{ value: 'normal', label: 'Normal' }, { value: 'half', label: 'Half day' }, { value: 'holiday', label: 'Holiday (0 min)' }] },
          { name: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
        ]}
        onSubmit={(v, { setError }) => {
          if (v.kind !== 'holiday' && v.minutes > minutesBetween(v.start, v.end)) { setError('minutes', { message: `Cannot exceed shift length (${minutesBetween(v.start, v.end)} min)` }); return false; }
          const item = { ...v, minutes: v.kind === 'holiday' ? 0 : v.minutes, id: editing.id || uid('sh') };
          commit((d) => ({ ...d, shifts: editing.id ? d.shifts.map((s) => (s.id === item.id ? item : s)) : [...d.shifts, item] }), [{ entity: 'shift', entityId: item.id, action: editing.id ? 'updated' : 'created', summary: `Shift ${item.name} saved (${item.minutes} min)`, before: editing.id ? { minutes: editing.minutes } : null, after: { minutes: item.minutes } }]);
          toast.success(`Shift ${item.name} saved`);
        }}
      />
    </div>
  );
}

function CalendarTab() {
  const data = useAppStore((s) => s.data);
  const commit = useAppStore((s) => s.commit);
  const canEdit = useCan('calendar');
  const d = useDerived();
  const [scope, setScope] = useState({ type: 'plant', id: data.plants.find((p) => p.status === 'active')?.id || '' });
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [dayEdit, setDayEdit] = useState(null);

  const ctx = useMemo(() => buildContext(data, d.today), [data, d.today]);
  const plant = scope.type === 'plant' ? data.plants.find((p) => p.id === scope.id) : scope.type === 'line' ? data.plants.find((p) => p.id === data.lines.find((l) => l.id === scope.id)?.plantId) : null;
  const line = scope.type === 'line' ? data.lines.find((l) => l.id === scope.id) : null;
  // A reference line resolves the calendar for the chosen scope (company → default pattern, plant → plant pattern).
  const refLine = line || (plant ? { id: `__plant_${plant.id}`, plantId: plant.id, calendarId: null } : { id: '__all', plantId: '__none', calendarId: data.settings.defaultCalendarId || DEFAULT_CALENDAR_ID });

  const start = toISO(month);
  const days = eachDay(start, endOfMonth(month).getDate());
  const lead = (fromISO(start).getDay() + 6) % 7;
  const scopeKey = scope.type === 'all' ? { scopeType: 'all', scopeId: null } : { scopeType: scope.type, scopeId: scope.id };
  const monthExceptions = data.calendarExceptions.filter((e) => e.date.startsWith(start.slice(0, 7)) && (e.scopeType === 'all' || (e.scopeType === 'plant' && e.scopeId === plant?.id) || (e.scopeType === 'line' && e.scopeId === line?.id))).sort((a, b) => a.date.localeCompare(b.date));
  const workingDays = days.filter((iso) => getDayInfo(ctx, refLine, iso).minutes > 0).length;
  const totalMinutes = days.reduce((s, iso) => s + getDayInfo(ctx, refLine, iso).minutes, 0);

  const setPattern = (calendarId) => {
    if (scope.type === 'plant') commit((dd) => ({ ...dd, plants: dd.plants.map((p) => (p.id === plant.id ? { ...p, calendarId } : p)) }), [{ entity: 'plant', entityId: plant.id, action: 'calendar', summary: `${plant.code} calendar → ${data.calendars.find((c) => c.id === calendarId)?.name}` }]);
    else if (scope.type === 'line') commit((dd) => ({ ...dd, lines: dd.lines.map((l) => (l.id === line.id ? { ...l, calendarId: calendarId || null } : l)) }), [{ entity: 'line', entityId: line.id, action: 'calendar', summary: `${line.code} calendar → ${calendarId ? data.calendars.find((c) => c.id === calendarId)?.name : 'inherit plant'}` }]);
    else commit((dd) => ({ ...dd, settings: { ...dd.settings, defaultCalendarId: calendarId } }));
    toast.success('Working calendar assigned', { description: 'Plans recalculated.' });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <Card bodyClass="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <Select value={`${scope.type}:${scope.id}`} onChange={(e) => { const [type, id] = e.target.value.split(':'); setScope({ type, id }); }} className="!w-64">
            <option value="all:">Company-wide (all plants)</option>
            <optgroup label="Plants">{data.plants.map((p) => <option key={p.id} value={`plant:${p.id}`}>{p.code} — {p.name}</option>)}</optgroup>
            <optgroup label="Lines">{data.lines.map((l) => <option key={l.id} value={`line:${l.id}`}>{l.code}</option>)}</optgroup>
          </Select>
          <Select value={scope.type === 'plant' ? plant?.calendarId : scope.type === 'line' ? line?.calendarId || '' : data.settings.defaultCalendarId || DEFAULT_CALENDAR_ID} onChange={(e) => setPattern(e.target.value)} disabled={!canEdit} className="!w-60" aria-label="Weekly pattern">
            {scope.type === 'line' && <option value="">Inherit plant ({data.calendars.find((c) => c.id === plant?.calendarId)?.name})</option>}
            {data.calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div className="ml-auto flex items-center gap-1">
            <Button size="icon" icon={ChevronLeft} aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))} />
            <span className="w-32 text-center text-[13px] font-semibold text-slate-800">{format(month, 'MMMM yyyy')}</span>
            <Button size="icon" icon={ChevronRight} aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))} />
            <Button onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {WEEKDAYS.map((dow) => <div key={dow} className="py-2">{DAY_NAMES[dow]}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: lead }, (_, i) => <div key={`p${i}`} className="min-h-[86px] border-b border-r border-slate-100 bg-slate-50/50" />)}
          {days.map((iso) => {
            const info = getDayInfo(ctx, refLine, iso);
            const tone = info.type === 'holiday' ? 'bg-red-50 hatch' : info.minutes === 0 ? 'bg-slate-100 hatch' : info.type === 'halfday' ? 'bg-amber-50' : 'bg-white';
            return (
              <button key={iso} disabled={!canEdit} onClick={() => setDayEdit({ iso, info })} className={cn('min-h-[86px] border-b border-r border-slate-100 p-1.5 text-left transition-colors enabled:hover:ring-2 enabled:hover:ring-inset enabled:hover:ring-blue-400', tone)}>
                <div className="flex items-center justify-between">
                  <span className={cn('flex h-5 w-5 items-center justify-center rounded text-[12px] font-semibold', iso === d.today ? 'bg-blue-600 text-white' : 'text-slate-700')}>{fromISO(iso).getDate()}</span>
                  {info.exception && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" title="Calendar exception" />}
                </div>
                <div className="mt-1 text-[11px] font-medium text-slate-700">{info.type === 'holiday' ? 'Holiday' : info.minutes === 0 ? 'Non-working' : info.type === 'halfday' ? 'Half day' : info.shiftName}</div>
                <div className="text-[11px] tabular-nums text-slate-500">{info.minutes} min</div>
                {info.note && <div className="mt-0.5 truncate text-[10.5px] text-slate-500" title={info.note}>{info.note}</div>}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-4 px-3 py-2 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm bg-white ring-1 ring-slate-200" /> Working</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm bg-amber-50 ring-1 ring-amber-200" /> Half day</span>
          <span className="inline-flex items-center gap-1.5"><span className="hatch h-3 w-4 rounded-sm bg-red-50 ring-1 ring-red-200" /> Holiday</span>
          <span className="inline-flex items-center gap-1.5"><span className="hatch h-3 w-4 rounded-sm bg-slate-100 ring-1 ring-slate-200" /> No production capacity</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Exception</span>
          {canEdit && <span className="ml-auto text-slate-400">Click a day to change it</span>}
        </div>
      </Card>

      <div className="space-y-4">
        <Card title={format(month, 'MMMM yyyy')} subtitle={scope.type === 'all' ? 'Company-wide' : scope.type === 'plant' ? plant?.name : line?.code}>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div><div className="text-[11px] uppercase tracking-wide text-slate-500">Working days</div><div className="text-xl font-semibold text-slate-900">{workingDays}</div></div>
            <div><div className="text-[11px] uppercase tracking-wide text-slate-500">Minutes / operator</div><div className="text-xl font-semibold text-slate-900">{totalMinutes.toLocaleString()}</div></div>
          </div>
        </Card>
        <Card title="Exceptions this month" bodyClass="divide-y divide-slate-100">
          {monthExceptions.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 px-4 py-2">
              <div>
                <div className="text-[13px] font-medium text-slate-800">{fmtDate(e.date, 'EEE dd MMM')} · {e.type === 'holiday' ? 'Holiday' : e.type === 'halfday' ? 'Half day' : 'Working'}</div>
                <div className="text-xs text-slate-500">{e.note || '—'} · {e.scopeType === 'all' ? 'All plants' : e.scopeType === 'plant' ? data.plants.find((p) => p.id === e.scopeId)?.code : data.lines.find((l) => l.id === e.scopeId)?.code}</div>
              </div>
              <Badge tone={e.type === 'holiday' ? 'red' : e.type === 'halfday' ? 'amber' : 'blue'}>{e.type === 'holiday' ? 0 : e.minutes || data.shifts.find((s) => s.id === e.shiftId)?.minutes || 0} min</Badge>
            </div>
          ))}
          {!monthExceptions.length && <p className="px-4 py-4 text-xs text-slate-500">No exceptions affect this view.</p>}
        </Card>
      </div>

      {dayEdit && <DayDialog iso={dayEdit.iso} info={dayEdit.info} scopeKey={scopeKey} scopeLabel={scope.type === 'all' ? 'all plants' : scope.type === 'plant' ? plant?.code : line?.code} onClose={() => setDayEdit(null)} />}
    </div>
  );
}

function DayDialog({ iso, info, scopeKey, scopeLabel, onClose }) {
  const data = useAppStore((s) => s.data);
  const commit = useAppStore((s) => s.commit);
  const existing = data.calendarExceptions.find((e) => e.date === iso && e.scopeType === scopeKey.scopeType && (e.scopeId || null) === (scopeKey.scopeId || null));
  const [type, setType] = useState(existing?.type || (info.type === 'halfday' ? 'halfday' : info.minutes ? 'working' : 'holiday'));
  const [shiftId, setShiftId] = useState(existing?.shiftId || (info.type === 'halfday' ? 'sh-half' : 'sh-normal'));
  const [minutes, setMinutes] = useState(existing?.minutes ?? '');
  const [note, setNote] = useState(existing?.note || '');
  const [error, setError] = useState('');

  const save = () => {
    if (minutes !== '' && (!Number.isInteger(Number(minutes)) || Number(minutes) < 0 || Number(minutes) > 1440)) return setError('Minutes must be a whole number between 0 and 1440');
    if (type !== 'holiday' && !shiftId) return setError('Select a shift');
    const item = { id: existing?.id || `ce-${uid('x')}`, ...scopeKey, date: iso, type, shiftId: type === 'holiday' ? null : shiftId, minutes: type === 'holiday' ? '' : minutes === '' ? '' : Number(minutes), note: note.trim() };
    commit((d) => ({ ...d, calendarExceptions: existing ? d.calendarExceptions.map((e) => (e.id === existing.id ? item : e)) : [...d.calendarExceptions, item] }), [{ entity: 'calendar', entityId: item.id, action: existing ? 'updated' : 'created', summary: `${fmtDate(iso)} set to ${type} for ${scopeLabel}${note ? ` (${note})` : ''}` }]);
    toast.success(`${fmtDate(iso)} updated for ${scopeLabel}`, { description: 'Capacity and plans recalculated.' });
    onClose();
  };
  const removeException = () => {
    commit((d) => ({ ...d, calendarExceptions: d.calendarExceptions.filter((e) => e.id !== existing.id) }), [{ entity: 'calendar', entityId: existing.id, action: 'deleted', summary: `Exception on ${fmtDate(iso)} removed for ${scopeLabel}` }]);
    toast.success('Exception removed — weekly pattern applies');
    onClose();
  };

  return (
    <Modal open onClose={onClose} size="sm" title={fmtDate(iso, 'EEEE, dd MMMM yyyy')} description={`Exception for ${scopeLabel}. Currently: ${info.minutes} min (${info.note || info.shiftName}).`}
      footer={<>{existing && <Button variant="danger-outline" className="mr-auto" onClick={removeException}>Remove exception</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save day</Button></>}>
      <div className="grid gap-3">
        <Field label="Day type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="working">Working day</option>
            <option value="halfday">Half day</option>
            <option value="holiday">Holiday (no production)</option>
          </Select>
        </Field>
        {type !== 'holiday' && (
          <>
            <Field label="Shift">
              <Select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
                {data.shifts.filter((s) => s.kind !== 'holiday' && s.status === 'active').map((s) => <option key={s.id} value={s.id}>{s.name} — {s.minutes} min</option>)}
              </Select>
            </Field>
            <Field label="Working minutes override" hint="Leave blank to use the shift's minutes" error={error}>
              <Input type="number" min={0} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </Field>
          </>
        )}
        <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Poya Day, maintenance" /></Field>
      </div>
    </Modal>
  );
}
