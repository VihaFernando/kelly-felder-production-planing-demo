import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button, EmptyState, Modal } from '../common/ui';
import { fmtShort } from '../../utils/dateUtils';

export function DailyAlignDialog({ open, changes, ctx, rangeLabel, onCancel, onApply }) {
  if (!open) return null;
  return (
    <Modal
      open
      size="lg"
      title="Daily Align — preview"
      description={`Visible lines, allocations starting ${rangeLabel}. Locked allocations are never moved; gaps between orders are preserved.`}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={!changes.length} onClick={onApply}>
            Apply {changes.length} change{changes.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <b className="font-semibold text-slate-700">Rules:</b> (1) a start on a non-working day moves to the next working day for that line&apos;s calendar; (2) overlapping allocations on a line are sequenced in start order, each beginning the working day after the previous finishes. Durations are recalculated from capacity.
      </div>
      {changes.length ? (
        <div className="overflow-hidden rounded-md border border-slate-200">
          <table className="w-full">
            <thead>
              <tr>{['Order', 'Line', 'Start', 'Finish', 'Reason'].map((h) => <th key={h} className="th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.allocId}>
                  <td className="td font-medium">{ctx.orders[c.orderId]?.poNo}</td>
                  <td className="td">{ctx.lines[c.lineId]?.code}</td>
                  <td className="td"><span className="text-slate-500">{fmtShort(c.fromStart)}</span> <ArrowRight className="inline h-3 w-3 text-slate-400" /> <b className="font-semibold">{fmtShort(c.toStart)}</b></td>
                  <td className="td"><span className="text-slate-500">{fmtShort(c.fromEnd)}</span> <ArrowRight className="inline h-3 w-3 text-slate-400" /> <b className="font-semibold">{fmtShort(c.toEnd)}</b></td>
                  <td className="td text-xs text-slate-600">{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={CheckCircle2} title="Plan is already aligned">No non-working-day starts or overlaps in the visible range.</EmptyState>
      )}
    </Modal>
  );
}
