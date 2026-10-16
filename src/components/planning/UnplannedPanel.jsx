import { memo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CalendarPlus, GripVertical, PanelRightClose } from 'lucide-react';
import { StatusBadge, cn, SearchInput } from '../common/ui';
import { fmtShort } from '../../utils/dateUtils';
import { fmtNum } from '../../utils/formatters';

export function UnplannedPanel({ items, ctx, search, onSearch, onSchedule, onOpen, onClose, highlightOrderId, canPlan }) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <div>
          <div className="text-[13px] font-semibold text-slate-800">Awaiting planning</div>
          <div className="text-[11px] text-slate-500">{items.length} orders · drag onto a line</div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Hide unplanned panel">
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>
      <div className="border-b border-slate-200 p-2">
        <SearchInput value={search} onChange={onSearch} placeholder="Filter unplanned…" />
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-2 scroll-thin">
        {items.map((s) => (
          <UnplannedItem key={s.order.id} s={s} ctx={ctx} onSchedule={onSchedule} onOpen={onOpen} highlighted={highlightOrderId === s.order.id} canPlan={canPlan} />
        ))}
        {!items.length && <p className="px-2 py-6 text-center text-xs text-slate-500">All orders are planned.</p>}
      </div>
    </aside>
  );
}

const UnplannedItem = memo(function UnplannedItem({ s, ctx, onSchedule, onOpen, highlighted, canPlan }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `order:${s.order.id}`, data: { type: 'order', orderId: s.order.id }, disabled: !canPlan });
  const style = ctx.styles[s.order.styleId];
  const buyer = ctx.buyers[style?.buyerId];
  const unallocated = s.order.qty - s.plannedQty;
  return (
    <div ref={setNodeRef} className={cn('group rounded-md border bg-white p-2 transition-colors', highlighted ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200 hover:border-slate-300', isDragging && 'opacity-40')}>
      <div className="flex items-start gap-1.5">
        <button {...listeners} {...attributes} className={cn('mt-0.5 text-slate-300', canPlan ? 'cursor-grab hover:text-slate-500 active:cursor-grabbing' : 'cursor-not-allowed')} aria-label={`Drag ${s.order.poNo} onto the board`}>
          <GripVertical className="h-4 w-4" />
        </button>
        <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(s.order.id)}>
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-slate-800">{s.order.poNo}</span>
            <span className="truncate text-[11px] text-slate-500">{style?.code}</span>
          </div>
          <div className="truncate text-[11px] text-slate-500">{buyer?.name} · {style?.category}</div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-600">
            <span className="tabular-nums"><b className="font-semibold">{fmtNum(unallocated)}</b>{s.plannedQty > 0 && ` / ${fmtNum(s.order.qty)}`} pcs</span>
            <span className={cn(s.daysToDelivery <= 21 ? 'font-medium text-red-600' : 'text-slate-500')}>Due {fmtShort(s.order.deliveryDate)}</span>
          </div>
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-1 pl-5">
        <div className="flex gap-1">
          {s.status === 'partial' && <StatusBadge status="partial" label="Partial" />}
          <StatusBadge status={s.readiness.state} label={s.readiness.state === 'unknown' ? 'No checklist' : `Ready ${s.readiness.done}/${s.readiness.total}`} />
        </div>
        {canPlan && (
          <button onClick={() => onSchedule(s.order.id)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-50">
            <CalendarPlus className="h-3 w-3" /> Schedule
          </button>
        )}
      </div>
    </div>
  );
});
