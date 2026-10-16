import { memo, useMemo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { AlertTriangle, ChevronDown, ChevronRight, Lock, CheckCircle2, XCircle, CircleDashed } from 'lucide-react';
import { cn } from '../common/ui';
import { fmtDate, fromISO } from '../../utils/dateUtils';
import { fmtCompact, fmtNum } from '../../utils/formatters';
import { getDayInfo, getOperators } from '../../services/capacityService';
import { LANE_HEIGHT, LEFT_WIDTH, ROW_PAD, TONE_CLASSES } from './boardUtils';

const TONE_ICON = { green: CheckCircle2, red: XCircle, amber: AlertTriangle, gray: CircleDashed };

export function BoardHeader({ days, dayWidth, today, ctx, originRef }) {
  const months = useMemo(() => {
    const out = [];
    days.forEach((iso, i) => {
      const key = iso.slice(0, 7);
      if (!out.length || out[out.length - 1].key !== key) out.push({ key, start: i, count: 1, label: fmtDate(iso, dayWidth < 30 ? 'MMM yyyy' : 'MMMM yyyy') });
      else out[out.length - 1].count++;
    });
    return out;
  }, [days, dayWidth]);

  return (
    <div className="sticky top-0 z-30 flex border-b border-slate-300 bg-white" style={{ width: LEFT_WIDTH + days.length * dayWidth }}>
      <div className="sticky left-0 z-40 flex shrink-0 items-end border-r border-slate-300 bg-slate-50 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500" style={{ width: LEFT_WIDTH }}>
        <span className="w-7">#</span>
        <span className="flex-1">Plant / Line</span>
        <span className="w-[84px] text-right">Operators</span>
      </div>
      <div ref={originRef} className="relative">
        <div className="flex h-6 border-b border-slate-200">
          {months.map((m) => (
            <div key={m.key} className="truncate border-r border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold leading-6 text-slate-700" style={{ width: m.count * dayWidth }}>
              {m.label}
            </div>
          ))}
        </div>
        <div className="flex h-8">
          {days.map((iso) => {
            const d = fromISO(iso);
            const dow = d.getDay();
            const ex = ctx.exceptions.get(`all:*:${iso}`);
            const isToday = iso === today;
            return (
              <div
                key={iso}
                title={`${fmtDate(iso, 'EEEE dd MMM yyyy')}${ex ? ` — ${ex.note || ex.type}` : ''}`}
                className={cn('flex shrink-0 flex-col items-center justify-center border-r border-slate-100 text-[10px] leading-tight', dow === 0 || dow === 6 ? 'bg-slate-100 text-slate-500' : 'text-slate-600', ex?.type === 'holiday' && 'bg-red-50 text-red-600', isToday && '!bg-blue-600 !text-white')}
                style={{ width: dayWidth }}
              >
                <span className="font-semibold">{d.getDate()}</span>
                <span className="opacity-75">{fmtDate(iso, dayWidth >= 34 ? 'EEE' : 'EEEEE')}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const PlantRow = memo(function PlantRow({ plant, lineCount, expanded, onToggle, days, dayWidth, dailyTotals, showSubtotals, index }) {
  return (
    <div className="flex border-b border-slate-200 bg-slate-50" style={{ width: LEFT_WIDTH + days.length * dayWidth }}>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-slate-300 bg-slate-100 px-2 py-1.5 text-left hover:bg-slate-200/70"
        style={{ width: LEFT_WIDTH }}
      >
        <span className="w-5 text-[11px] text-slate-400">{index}</span>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}
        <span className="whitespace-nowrap text-[12px] font-semibold text-slate-800">{plant.code}</span>
        <span className="truncate text-[11px] text-slate-500">{plant.name}</span>
        <span className="ml-auto rounded bg-white px-1.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">{lineCount}</span>
      </button>
      <div className="flex">
        {days.map((iso) => (
          <div key={iso} className="flex shrink-0 items-center justify-center border-r border-slate-200/60 text-[9px] tabular-nums text-slate-500" style={{ width: dayWidth }}>
            {showSubtotals && dailyTotals[iso] ? fmtCompact(dailyTotals[iso]) : ''}
          </div>
        ))}
      </div>
    </div>
  );
});

function dayCellClass(info, isToday) {
  if (isToday) return 'bg-blue-50/70';
  if (info.type === 'holiday') return 'bg-red-50 hatch';
  if (info.minutes === 0) return 'bg-slate-100 hatch';
  if (info.type === 'halfday') return 'bg-amber-50';
  return '';
}

export const LineRow = memo(function LineRow({ line, rowNo, ctx, days, dayWidth, today, blocks, laneCount, preview, highlightOrderId, draggingId, onBlockClick, onBlockContext, onHover, canPlan }) {
  const { setNodeRef, isOver } = useDroppable({ id: `line:${line.id}`, data: { lineId: line.id } });
  const height = laneCount * LANE_HEIGHT + ROW_PAD * 2;
  const ops = getOperators(ctx, line, today);

  return (
    <div className="flex border-b border-slate-200" style={{ width: LEFT_WIDTH + days.length * dayWidth, height }}>
      <div className="sticky left-0 z-20 flex shrink-0 items-center border-r border-slate-300 bg-white px-2" style={{ width: LEFT_WIDTH }}>
        <span className="w-7 text-[11px] tabular-nums text-slate-400">{rowNo}</span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1">
            <span className="text-[12px] font-semibold text-slate-800">{line.code}</span>
            {ops.source !== 'workforce' && (
              <span title={ops.source === 'none' ? 'No workforce (MOS) configured for this month — capacity is zero' : 'No monthly carder record — using line default operators'}>
                <AlertTriangle className={cn('h-3 w-3', ops.source === 'none' ? 'text-red-500' : 'text-amber-500')} />
              </span>
            )}
          </div>
          <div className="truncate text-[10.5px] text-slate-500">{line.name}</div>
        </div>
        <div className="w-[84px] text-right text-[11px] tabular-nums text-slate-600">
          {ops.count || '—'} <span className="text-slate-400">MOS</span>
        </div>
      </div>
      <div ref={setNodeRef} className={cn('relative', isOver && 'bg-blue-50/40')} style={{ width: days.length * dayWidth }}>
        <div className="absolute inset-0 flex">
          {days.map((iso) => {
            const info = getDayInfo(ctx, line, iso);
            return <div key={iso} title={info.minutes === 0 || info.type === 'halfday' || info.exception ? `${fmtDate(iso)} · ${info.note || info.shiftName} (${info.minutes} min)` : undefined} className={cn('h-full shrink-0 border-r border-slate-100', dayCellClass(info, iso === today))} style={{ width: dayWidth }} />;
          })}
        </div>
        {blocks.map((b) => (
          <Block key={b.id} b={b} dayWidth={dayWidth} highlighted={highlightOrderId === b.orderId} dragging={draggingId === b.id} onClick={onBlockClick} onContext={onBlockContext} onHover={onHover} canPlan={canPlan} />
        ))}
        {preview && (
          <div
            className={cn('pointer-events-none absolute z-10 rounded border-2 border-dashed', preview.invalid ? 'border-red-500 bg-red-500/10' : TONE_CLASSES.blue.ghost)}
            style={{ left: preview.from * dayWidth + 1, width: Math.max(dayWidth, (preview.to - preview.from + 1) * dayWidth) - 2, top: ROW_PAD, height: LANE_HEIGHT - 4 }}
          >
            <span className={cn('absolute -top-0.5 left-1 whitespace-nowrap text-[10px] font-semibold', preview.invalid ? 'text-red-700' : 'text-blue-800')}>
              {preview.label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

const Block = memo(function Block({ b, dayWidth, highlighted, dragging, onClick, onContext, onHover, canPlan }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: b.id, data: { type: 'alloc', allocId: b.id }, disabled: !canPlan });
  const t = TONE_CLASSES[b.tone];
  const Icon = TONE_ICON[b.tone];
  const width = (b.to - b.from + 1) * dayWidth - 2;
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="button"
      aria-label={`${b.poNo} ${b.styleCode}, ${b.qty} pieces, ${b.statusLabel}`}
      onClick={() => onClick(b)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContext(b, e);
      }}
      onMouseEnter={(e) => onHover(b, e.currentTarget)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        'absolute z-[5] flex items-center gap-1 overflow-hidden border-l-[3px] px-1.5 text-left shadow-[0_1px_0_rgba(15,23,42,0.06)] ring-1 ring-inset ring-slate-900/5 transition-shadow',
        b.clippedLeft ? 'rounded-r' : 'rounded',
        t.bar,
        canPlan ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        highlighted && 'z-[6] ring-2 ring-blue-600 ring-offset-1',
        dragging && 'opacity-30',
        b.conflict && 'outline outline-1 outline-offset-[-1px] outline-red-500',
        'hover:shadow-md',
      )}
      style={{ left: b.from * dayWidth + 1, width, top: ROW_PAD + b.lane * LANE_HEIGHT, height: LANE_HEIGHT - 4 }}
    >
      {Icon && width > 40 && <Icon className="h-3 w-3 shrink-0 opacity-80" />}
      {b.locked && <Lock className="h-3 w-3 shrink-0 opacity-70" />}
      <span className="truncate text-[11px] font-semibold leading-none">{b.poNo}</span>
      {width > 110 && <span className="truncate text-[10.5px] leading-none opacity-75">{b.styleCode}</span>}
      {width > 170 && <span className="ml-auto shrink-0 text-[10.5px] tabular-nums leading-none opacity-75">{fmtNum(b.qty)}</span>}
      {b.progress > 0 && <span className={cn('absolute bottom-0 left-0 h-[3px]', t.accent)} style={{ width: `${Math.min(100, b.progress)}%` }} />}
    </div>
  );
});
