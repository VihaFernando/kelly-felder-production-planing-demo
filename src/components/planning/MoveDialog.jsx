import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, AlertTriangle, XCircle, Info } from 'lucide-react';
import { Alert, Button, Field, Input, Modal, Select, Textarea, cn } from '../common/ui';
import { validatePlacement } from '../../services/schedulingService';
import { fmtDate, isValidISO } from '../../utils/dateUtils';
import { fmtNum } from '../../utils/formatters';
import { useCan } from '../../store/appStore';

/**
 * Confirms a move or new placement. Re-validates live as the planner adjusts line/date/qty/ladder start.
 * request: { mode: 'move' | 'place' | 'edit', alloc (existing or draft), target: { lineId, startDate }, beforePlan }
 */
export function MoveDialog({ request, ctx, allocations, milestones, summaries, onCancel, onApply }) {
  const canOverride = useCan('override');
  const [lineId, setLineId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [qty, setQty] = useState(0);
  const [ladderStart, setLadderStart] = useState(0);
  const [reason, setReason] = useState('');

  const alloc = request?.alloc;
  const order = alloc ? ctx.orders[alloc.orderId] : null;
  const style = order ? ctx.styles[order.styleId] : null;
  const srcLine = request?.mode !== 'place' ? ctx.lines[alloc?.lineId] : null;

  useEffect(() => {
    if (!request) return;
    setLineId(request.target.lineId);
    setStartDate(request.target.startDate);
    setQty(alloc.qty);
    setLadderStart(alloc.ladderStart || 0);
    setReason('');
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  const tLine = ctx.lines[lineId];
  const crossPlant = !!(srcLine && tLine && srcLine.plantId !== tLine.plantId);

  const proposed = useMemo(() => (alloc ? { ...alloc, lineId, startDate, qty: Math.round(Number(qty) || 0), ladderStart: Number(ladderStart) } : null), [alloc, lineId, startDate, qty, ladderStart]);
  const result = useMemo(() => {
    if (!proposed || !isValidISO(startDate) || !lineId) return null;
    return validatePlacement(ctx, allocations, proposed, milestones);
  }, [ctx, allocations, proposed, milestones, startDate, lineId]);

  if (!request || !alloc) return null;

  const sum = summaries[alloc.orderId];
  const otherPlanned = allocations.filter((a) => a.orderId === alloc.orderId && a.id !== alloc.id).reduce((s, a) => s + a.qty, 0);
  const maxQty = Math.max(0, (order?.qty || 0) - otherPlanned);
  const qtyError = qty > maxQty ? `Exceeds unallocated quantity (${fmtNum(maxQty)} pcs) — would duplicate planned production.` : null;
  const noLadder = !ctx.levels.length ? ['No efficiency ladder levels are configured. Add levels on the Efficiency Ladder page.'] : [];
  const errors = [...(result?.errors || []), ...(qtyError ? [qtyError] : []), ...(!isValidISO(startDate) ? ['Enter a valid start date.'] : []), ...noLadder];
  const critical = (result?.warnings || []).filter((w) => w.level === 'critical');
  const warnings = (result?.warnings || []).filter((w) => w.level !== 'critical');
  const needsOverride = critical.length > 0;
  const blocked = errors.length > 0 || (needsOverride && (!canOverride || !reason.trim()));

  const plan = result?.plan;
  const avg = plan?.workingDays ? Math.round(plan.qty / plan.workingDays) : 0;
  const before = request.mode !== 'place' ? request.beforePlan : null;
  const ladderText = (steps) => (steps?.length ? steps.map((s) => `${s}%`).join(' → ') : '—');

  const apply = () => onApply({ ...proposed, overrideReason: needsOverride ? reason.trim() : undefined }, { crossPlant });

  const title = request.mode === 'place' ? `Schedule ${order?.poNo}` : request.mode === 'edit' ? `Edit allocation · ${order?.poNo}` : `Move ${order?.poNo}`;

  return (
    <Modal
      open
      size="lg"
      title={title}
      description={`${style?.code} — ${style?.description} · ${fmtNum(order?.qty)} pcs · SMV ${style?.smv} · Delivery ${fmtDate(order?.deliveryDate)}`}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>{request.mode === 'move' ? 'Cancel Move' : 'Cancel'}</Button>
          <Button variant="primary" disabled={blocked} onClick={apply}>
            {request.mode === 'place' ? 'Schedule order' : request.mode === 'edit' ? 'Apply changes' : 'Confirm move'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{request.mode === 'place' ? 'Current state' : 'From'}</div>
          {request.mode === 'place' ? (
            <div className="mt-1.5 text-[13px] text-slate-700">
              Unplanned · {fmtNum(maxQty)} pcs unallocated
              <div className="mt-1 text-xs text-slate-500">Readiness: {sum?.readiness.state === 'unknown' ? 'n/a' : `${sum?.readiness.done}/${sum?.readiness.total} prerequisites complete`}</div>
            </div>
          ) : (
            <div className="mt-1.5 space-y-0.5 text-[13px]">
              <div className="font-semibold text-slate-800">{ctx.plants[srcLine?.plantId]?.code} / {srcLine?.code}</div>
              <div className="text-slate-600">{fmtDate(before?.start)} → {fmtDate(before?.end)}</div>
              <div className="text-xs text-slate-500">{before?.workingDays} working days · {fmtNum(alloc.qty)} pcs</div>
              <div className="text-xs text-slate-500">Ladder: {ladderText(before?.steps)}</div>
            </div>
          )}
        </div>
        <div className="hidden items-center md:flex"><ArrowRight className="h-5 w-5 text-slate-400" /></div>
        <div className={cn('rounded-md border p-3', errors.length ? 'border-red-200 bg-red-50/50' : 'border-blue-200 bg-blue-50/50')}>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{request.mode === 'place' ? 'Proposed' : 'To'}</div>
          <div className="mt-1.5 space-y-0.5 text-[13px]">
            <div className="font-semibold text-slate-800">{ctx.plants[tLine?.plantId]?.code} / {tLine?.code || '—'}</div>
            <div className="text-slate-600">{plan?.days.length ? `${fmtDate(plan.days[0].date)} → ${fmtDate(plan.end)}` : '—'}</div>
            <div className="text-xs text-slate-500">{plan?.workingDays || 0} working days · ~{fmtNum(avg)} pcs/day</div>
            <div className="text-xs text-slate-500">Ladder: {ladderText(plan?.steps)}</div>
            {plan && order && <div className={cn('text-xs', plan.end > order.deliveryDate ? 'font-medium text-red-600' : 'text-slate-500')}>Est. finish {fmtDate(plan.end)} vs delivery {fmtDate(order.deliveryDate)}</div>}
          </div>
        </div>
      </div>

      {crossPlant && (
        <Alert tone="amber" className="mt-4" title={`Cross-plant move: ${ctx.plants[srcLine.plantId]?.code} → ${ctx.plants[tLine.plantId]?.code}`}>
          The receiving line has not run this style yet, so it normally starts at the bottom of the efficiency ladder. Check the ladder start level below.
        </Alert>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Line">
          <Select value={lineId} onChange={(e) => setLineId(e.target.value)}>
            {Object.values(ctx.plants).map((p) => (
              <optgroup key={p.id} label={`${p.code} — ${p.name}`}>
                {Object.values(ctx.lines).filter((l) => l.plantId === p.id).map((l) => (
                  <option key={l.id} value={l.id} disabled={l.status !== 'active' || p.status !== 'active'}>
                    {l.code}{l.status !== 'active' || p.status !== 'active' ? ' (inactive)' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Start date">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Quantity (pcs)" error={qtyError ? 'Too high' : null}>
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} disabled={request.mode === 'move'} />
        </Field>
        <Field label="Ladder start level" hint="Repeat styles can skip ramp-up">
          <Select value={ladderStart} onChange={(e) => setLadderStart(Number(e.target.value))} disabled={!ctx.levels.length}>
            {ctx.levels.map((l, i) => (
              <option key={l.id} value={i}>{l.percent}% — {l.label || `day ${l.startDay}`}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-4 space-y-2">
        {errors.map((e) => (
          <Alert key={e} tone="red" icon={XCircle} title="Cannot apply">{e}</Alert>
        ))}
        {critical.map((w, i) => (
          <Alert key={`c${i}`} tone="red" icon={AlertTriangle} title="Critical warning">{w.msg}</Alert>
        ))}
        {warnings.map((w, i) => (
          <Alert key={`w${i}`} tone="amber" title="Warning">{w.msg}</Alert>
        ))}
        {result?.info.map((w, i) => (
          <Alert key={`i${i}`} tone="gray" icon={Info}>{w.msg}</Alert>
        ))}
        {result && !errors.length && !critical.length && !warnings.length && (
          <Alert tone="blue" icon={Info}>No conflicts found. Capacity, calendar and readiness checks passed.</Alert>
        )}
        {needsOverride && !errors.length && (
          canOverride ? (
            <Field label="Override reason (required to proceed with critical warnings)" required>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Buyer agreed to revised delivery; overtime approved" rows={2} />
            </Field>
          ) : (
            <Alert tone="red" title="Override not permitted">Your demo role cannot override critical warnings. Switch to Central Planner or Administrator.</Alert>
          )
        )}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Daily capacity = MOS × working minutes × ladder efficiency ÷ SMV (simplified demo assumption). Changes stay unsaved until you click Save on the board.</p>
    </Modal>
  );
}
