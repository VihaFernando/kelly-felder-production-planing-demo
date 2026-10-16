import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useSensor, useSensors } from '@dnd-kit/core';
import {
  ChevronLeft, ChevronRight, Undo2, Redo2, Save, Download, Plus, AlignHorizontalJustifyStart, Eye, Inbox, FilterX, Trash2,
  Lock, Unlock, ExternalLink, Pencil, CalendarX2, ListChecks, Factory, Check, Eraser, ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore, useCan } from '../store/appStore';
import { useDerived } from '../hooks/useDerived';
import { Button, Checkbox, FilterSelect, Menu, SearchInput, cn, Badge } from '../components/common/ui';
import { confirm } from '../components/common/confirm';
import { BoardHeader, LineRow, PlantRow } from '../components/planning/BoardGrid';
import { MoveDialog } from '../components/planning/MoveDialog';
import { DailyAlignDialog } from '../components/planning/DailyAlignDialog';
import { UnplannedPanel } from '../components/planning/UnplannedPanel';
import { LEFT_WIDTH, RANGE_PRESETS, TONE_CLASSES, TONE_LABEL, assignLanes, blockTone, spanInRange } from '../components/planning/boardUtils';
import { LineFormModal } from '../components/masterdata/MasterForms';
import { OrderFormModal } from '../components/orders/OrderFormModal';
import { planAllocation, dailyAlign } from '../services/schedulingService';
import { exportCsv } from '../services/importExportService';
import { addDaysISO, diffDays, eachDay, fmtDate, fmtShort, startOfWeekISO } from '../utils/dateUtils';
import { fmtNum, pct, uid } from '../utils/formatters';
import { STATUS } from '../components/common/ui';

const EMPTY_FILTERS = { q: '', plant: '', line: '', buyer: '', style: '', status: '', readiness: '', risk: '' };

function defaultStart(today, presetDays) {
  return presetDays >= 60 ? addDaysISO(startOfWeekISO(today), -7) : startOfWeekISO(today);
}

export default function PlanningBoardPage() {
  const data = useAppStore((s) => s.data);
  const board = useAppStore((s) => s.board);
  const boardApply = useAppStore((s) => s.boardApply);
  const boardUndo = useAppStore((s) => s.boardUndo);
  const boardRedo = useAppStore((s) => s.boardRedo);
  const boardSave = useAppStore((s) => s.boardSave);
  const boardDiscard = useAppStore((s) => s.boardDiscard);
  const openOrder = useAppStore((s) => s.openOrder);
  const canPlan = useCan('plan');
  const d = useDerived({ board: true });
  const { ctx, analysis, orders: summaries, allocations, today } = d;
  const dirty = !!board && board.allocations !== data.allocations;

  const [params] = useSearchParams();
  const navigate = useNavigate();
  const focusOrderId = params.get('order');

  const [presetId, setPresetId] = useState(data.settings.defaultHorizon || '3m');
  const preset = RANGE_PRESETS.find((p) => p.id === presetId) || RANGE_PRESETS[2];
  const [rangeStart, setRangeStart] = useState(() => defaultStart(today, preset.days));
  const days = useMemo(() => eachDay(rangeStart, preset.days), [rangeStart, preset.days]);
  const dayWidth = preset.dayWidth;
  const rangeEnd = days[days.length - 1];

  const [collapsed, setCollapsed] = useState(() => new Set());
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [onlyUnplanned, setOnlyUnplanned] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [showSubtotals, setShowSubtotals] = useState(true);
  const [panelSearch, setPanelSearch] = useState('');
  const [moveReq, setMoveReq] = useState(null);
  const [align, setAlign] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [hover, setHover] = useState(null);
  const [lineModal, setLineModal] = useState(false);
  const [orderModal, setOrderModal] = useState(false);
  const [activeDrag, setActiveDrag] = useState(null);
  const [preview, setPreview] = useState(null);

  const scrollRef = useRef(null);
  const originRef = useRef(null);
  const pointer = useRef({ x: 0, y: 0 });
  const previewKey = useRef('');

  const setFilter = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));
  const filtersActive = Object.values(filters).some(Boolean) || hideCompleted || onlyUnplanned;

  // ---------- Row model ----------
  const visiblePlants = useMemo(() => {
    return data.plants
      .filter((p) => (filters.plant ? p.id === filters.plant : p.status === 'active'))
      .map((p) => {
        const lines = data.lines.filter((l) => l.plantId === p.id && (l.status === 'active' || allocations.some((a) => a.lineId === l.id)) && (!filters.line || l.id === filters.line));
        return { plant: p, lines };
      })
      .filter((g) => g.lines.length);
  }, [data.plants, data.lines, allocations, filters.plant, filters.line]);

  const orderMatches = useCallback(
    (s) => {
      if (!s) return false;
      const style = ctx.styles[s.order.styleId];
      if (filters.buyer && style?.buyerId !== filters.buyer) return false;
      if (filters.style && s.order.styleId !== filters.style) return false;
      if (filters.status && s.status !== filters.status) return false;
      if (filters.readiness && s.readiness.state !== filters.readiness) return false;
      if (filters.risk && s.risk !== filters.risk) return false;
      if (hideCompleted && s.status === 'completed') return false;
      if (filters.q) {
        const q = filters.q.toLowerCase();
        const hay = `${s.order.poNo} ${s.order.soNo} ${style?.code} ${style?.description} ${ctx.buyers[style?.buyerId]?.name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    },
    [ctx, filters, hideCompleted],
  );

  const blocksByLine = useMemo(() => {
    const out = {};
    if (onlyUnplanned) return out;
    for (const entry of Object.values(analysis)) {
      const a = entry.alloc;
      const s = summaries[a.orderId];
      if (!orderMatches(s)) continue;
      const span = spanInRange(entry.plan.start, entry.plan.end, rangeStart, days.length);
      if (!span) continue;
      const tone = blockTone(s, entry);
      (out[a.lineId] ||= []).push({
        id: a.id, orderId: a.orderId, poNo: s.order.poNo, styleCode: ctx.styles[s.order.styleId]?.code, qty: a.qty, start: entry.plan.start, end: entry.plan.end,
        from: span.from, to: span.to, clippedLeft: span.clippedLeft, tone, statusLabel: TONE_LABEL[tone], conflict: entry.conflicts.length > 0, locked: !!a.locked, progress: pct(s.good, s.order.qty), lane: 0,
      });
    }
    const lanes = {};
    for (const [lineId, list] of Object.entries(out)) lanes[lineId] = assignLanes(list);
    return { blocks: out, lanes };
  }, [analysis, summaries, orderMatches, rangeStart, days.length, ctx, onlyUnplanned]);

  const plantTotals = useMemo(() => {
    if (!showSubtotals) return {};
    const inRange = new Set(days);
    const out = {};
    for (const entry of Object.values(analysis)) {
      const line = ctx.lines[entry.alloc.lineId];
      if (!line) continue;
      const t = (out[line.plantId] ||= {});
      for (const day of entry.plan.days) if (inRange.has(day.date)) t[day.date] = (t[day.date] || 0) + day.qty;
    }
    return out;
  }, [analysis, ctx, days, showSubtotals]);

  const unplanned = useMemo(() => {
    const q = panelSearch.toLowerCase();
    return Object.values(summaries)
      .filter((s) => (s.status === 'unplanned' || s.order.qty - s.plannedQty > 0) && s.status !== 'completed' && s.status !== 'cancelled' && orderMatches({ ...s, status: s.status }))
      .filter((s) => !q || `${s.order.poNo} ${ctx.styles[s.order.styleId]?.code}`.toLowerCase().includes(q))
      .sort((a, b) => (a.order.deliveryDate < b.order.deliveryDate ? -1 : 1));
  }, [summaries, panelSearch, orderMatches, ctx]);

  // ---------- Focus an order from ?order= ----------
  useEffect(() => {
    if (!focusOrderId) return;
    const s = summaries[focusOrderId];
    if (!s) return;
    if (s.start) {
      const inView = s.start >= rangeStart && s.start <= rangeEnd;
      if (!inView) setRangeStart(addDaysISO(startOfWeekISO(s.start), -7));
      const lineId = s.allocs[0]?.lineId;
      const plantId = ctx.lines[lineId]?.plantId;
      setCollapsed((c) => {
        if (!c.has(plantId)) return c;
        const n = new Set(c);
        n.delete(plantId);
        return n;
      });
      setTimeout(() => {
        const row = document.getElementById(`row-${lineId}`);
        const sc = scrollRef.current;
        if (row && sc) {
          row.scrollIntoView({ block: 'center' });
          const idx = diffDays(s.start, inView ? rangeStart : addDaysISO(startOfWeekISO(s.start), -7));
          sc.scrollLeft = Math.max(0, idx * dayWidth - 200);
        }
      }, 60);
    } else {
      setShowPanel(true);
    }
  }, [focusOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Scroll to today on first render ----------
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const idx = diffDays(today, rangeStart);
    if (idx > 0 && idx < days.length && !focusOrderId) sc.scrollLeft = Math.max(0, idx * dayWidth - 160);
  }, [rangeStart, presetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Keyboard shortcuts & unload guard ----------
  useEffect(() => {
    const h = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.target.closest('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); boardUndo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); boardRedo(); }
      else if (k === 's') { e.preventDefault(); if (useAppStore.getState().boardDirty()) boardSave(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [boardUndo, boardRedo, boardSave]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // ---------- Drag & drop ----------
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (!activeDrag) return;
    const h = (e) => { pointer.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('pointermove', h);
    return () => window.removeEventListener('pointermove', h);
  }, [activeDrag]);

  const draftFor = useCallback(
    (drag) => {
      if (drag.type === 'alloc') return allocations.find((a) => a.id === drag.allocId);
      const s = summaries[drag.orderId];
      const remaining = s.order.qty - s.plannedQty;
      return { id: `new-${drag.orderId}`, orderId: drag.orderId, lineId: '', startDate: today, qty: remaining, ladderStart: 0 };
    },
    [allocations, summaries, today],
  );

  const computeTarget = useCallback(
    (over, drag) => {
      if (!over?.data.current?.lineId || !originRef.current) return null;
      const originLeft = originRef.current.getBoundingClientRect().left;
      const x = pointer.current.x - drag.grabOffset - originLeft;
      let idx = drag.type === 'alloc' ? Math.round(x / dayWidth) : Math.floor(x / dayWidth);
      idx = Math.max(0, Math.min(days.length - 1, idx));
      return { lineId: over.data.current.lineId, startDate: days[idx] };
    },
    [dayWidth, days],
  );

  const onDragStart = (e) => {
    const act = e.activatorEvent;
    pointer.current = { x: act?.clientX ?? 0, y: act?.clientY ?? 0 };
    const meta = e.active.data.current;
    const initial = e.active.rect.current.initial;
    const grabOffset = meta.type === 'alloc' && initial ? pointer.current.x - initial.left : 0;
    setHover(null);
    setActiveDrag({ ...meta, id: e.active.id, grabOffset });
  };

  const onDragMove = (e) => {
    if (!activeDrag) return;
    const target = computeTarget(e.over, activeDrag);
    const key = target ? `${target.lineId}:${target.startDate}` : '';
    if (key === previewKey.current) return;
    previewKey.current = key;
    if (!target) return setPreview(null);
    const draft = draftFor(activeDrag);
    if (!draft) return;
    const line = ctx.lines[target.lineId];
    const plan = planAllocation(ctx, { ...draft, lineId: target.lineId, startDate: target.startDate });
    const span = spanInRange(plan.days[0]?.date || target.startDate, plan.end, rangeStart, days.length) || { from: 0, to: 0 };
    setPreview({ lineId: target.lineId, from: span.from, to: span.to, invalid: line?.status !== 'active', label: `${line?.code} · ${fmtShort(plan.days[0]?.date || target.startDate)} → ${fmtShort(plan.end)}` });
  };

  const endDrag = () => {
    setActiveDrag(null);
    setPreview(null);
    previewKey.current = '';
  };

  const onDragEnd = (e) => {
    const drag = activeDrag;
    const target = drag ? computeTarget(e.over, drag) : null;
    endDrag();
    if (!drag || !target) return;
    const alloc = draftFor(drag);
    if (!alloc) return;
    if (drag.type === 'alloc' && alloc.lineId === target.lineId && alloc.startDate === target.startDate) return;
    setMoveReq({ mode: drag.type === 'alloc' ? 'move' : 'place', alloc, target, beforePlan: drag.type === 'alloc' ? analysis[alloc.id]?.plan : null });
  };

  const scheduleFromPanel = (orderId) => {
    const alloc = draftFor({ type: 'order', orderId });
    const firstLine = visiblePlants[0]?.lines.find((l) => l.status === 'active');
    setMoveReq({ mode: 'place', alloc, target: { lineId: firstLine?.id || data.lines[0]?.id, startDate: addDaysISO(today, 7) } });
  };

  const applyMove = (proposed, meta) => {
    const { overrideReason, ...clean } = proposed;
    const order = ctx.orders[clean.orderId];
    const tLine = ctx.lines[clean.lineId];
    let next;
    let label;
    if (moveReq.mode === 'place') {
      const created = { ...clean, id: uid('al') };
      next = [...allocations, created];
      label = `${order.poNo} scheduled on ${tLine.code} from ${fmtShort(clean.startDate)}`;
      clean.id = created.id;
    } else {
      const before = allocations.find((a) => a.id === clean.id);
      next = allocations.map((a) => (a.id === clean.id ? clean : a));
      const src = ctx.lines[before.lineId];
      label = moveReq.mode === 'edit' ? `${order.poNo} allocation edited` : `${order.poNo} moved ${src.code} → ${tLine.code}, start ${fmtShort(clean.startDate)}`;
      if (meta.crossPlant) label += ' (cross-plant)';
    }
    if (overrideReason) label += ` — override: ${overrideReason}`;
    const before = allocations.find((a) => a.id === clean.id);
    boardApply(next, label, { allocId: clean.id, before: before ? { lineId: before.lineId, startDate: before.startDate, ladderStart: before.ladderStart, qty: before.qty } : null, after: { lineId: clean.lineId, startDate: clean.startDate, ladderStart: clean.ladderStart, qty: clean.qty, overrideReason } });
    setMoveReq(null);
    toast.success(moveReq.mode === 'place' ? 'Order scheduled' : 'Production slot moved', { description: 'Unsaved — click Save to keep this plan.' });
    if (overrideReason) toast.warning('Critical warning overridden', { description: overrideReason });
  };

  // ---------- Toolbar actions ----------
  const shift = (dir) => setRangeStart((s) => addDaysISO(s, dir * (preset.days >= 60 ? 28 : preset.days >= 28 ? 14 : 7)));
  const goToday = () => {
    setRangeStart(defaultStart(today, preset.days));
    setTimeout(() => {
      const sc = scrollRef.current;
      if (sc) sc.scrollLeft = Math.max(0, diffDays(today, defaultStart(today, preset.days)) * dayWidth - 160);
    }, 0);
  };
  const changePreset = (id) => {
    const p = RANGE_PRESETS.find((x) => x.id === id);
    setPresetId(id);
    setRangeStart(defaultStart(today, p.days));
  };

  const openAlign = () => {
    const lineIds = new Set(visiblePlants.flatMap((g) => g.lines.map((l) => l.id)));
    setAlign(dailyAlign(ctx, allocations, rangeStart, rangeEnd, lineIds));
  };
  const applyAlign = () => {
    const byId = Object.fromEntries(align.map((c) => [c.allocId, c]));
    boardApply(allocations.map((a) => (byId[a.id] ? { ...a, startDate: byId[a.id].toStart } : a)), `Daily Align: ${align.length} allocation(s) realigned`);
    toast.success(`Daily Align applied to ${align.length} allocation(s)`, { description: 'Unsaved — review and Save.' });
    setAlign(null);
  };

  const discard = async () => {
    if (await confirm({ title: 'Discard unsaved board changes?', message: `${board?.changes?.length || 0} change(s) since the last save will be lost. Saved plans and all other data are not affected.`, confirmLabel: 'Discard changes', danger: true })) {
      boardDiscard();
      toast('Board changes discarded');
    }
  };

  const clearRange = async () => {
    const lineIds = new Set(visiblePlants.flatMap((g) => g.lines.map((l) => l.id)));
    const targets = allocations.filter((a) => lineIds.has(a.lineId) && a.startDate > today && a.startDate <= rangeEnd && !a.locked && !(summaries[a.orderId]?.good > 0));
    if (!targets.length) return toast('No future, unlocked allocations without output in view');
    if (await confirm({ title: `Unschedule ${targets.length} future allocation(s)?`, message: 'Allocations starting after today on the visible lines will return to the unplanned list. Locked allocations and orders with recorded output are kept. You can undo this before saving.', confirmLabel: 'Unschedule', danger: true })) {
      const ids = new Set(targets.map((a) => a.id));
      boardApply(allocations.filter((a) => !ids.has(a.id)), `Cleared ${targets.length} future allocation(s) from view`);
    }
  };

  const doExport = () => {
    const rows = Object.values(analysis).filter((e) => e.plan.end >= rangeStart && e.plan.start <= rangeEnd);
    exportCsv(`planning-board-${rangeStart}.csv`, rows, [
      { header: 'Production Order', value: (e) => ctx.orders[e.alloc.orderId]?.poNo },
      { header: 'Style', value: (e) => ctx.styles[ctx.orders[e.alloc.orderId]?.styleId]?.code },
      { header: 'Plant', value: (e) => ctx.plants[ctx.lines[e.alloc.lineId]?.plantId]?.code },
      { header: 'Line', value: (e) => ctx.lines[e.alloc.lineId]?.code },
      { header: 'Start', value: (e) => e.plan.start },
      { header: 'Finish', value: (e) => e.plan.end },
      { header: 'Working Days', value: (e) => e.plan.workingDays },
      { header: 'Planned Qty', value: (e) => e.alloc.qty },
      { header: 'Ladder Start %', value: (e) => e.plan.startEfficiency },
      { header: 'Ladder Target %', value: (e) => e.plan.efficiency },
      { header: 'Status', value: (e) => TONE_LABEL[blockTone(summaries[e.alloc.orderId], e)] },
      { header: 'Issues', value: (e) => e.issues.map((i) => i.msg).join('; ') },
    ]);
    toast.success(`Exported ${rows.length} allocations${dirty ? ' (including unsaved changes)' : ''}`);
  };

  const toggleLock = (b) => {
    boardApply(allocations.map((a) => (a.id === b.id ? { ...a, locked: !a.locked } : a)), `${b.poNo} ${b.locked ? 'unlocked' : 'locked'}`);
  };
  const unschedule = async (b) => {
    const s = summaries[b.orderId];
    const ok = await confirm({ title: `Unschedule ${b.poNo}?`, message: s.good > 0 ? `This order already has ${fmtNum(s.good)} good pieces recorded. Output records are kept, but the allocation will be removed from the board.` : 'The allocation returns to the unplanned list. You can undo this before saving.', confirmLabel: 'Unschedule', danger: true });
    if (ok) boardApply(allocations.filter((a) => a.id !== b.id), `${b.poNo} unscheduled`, { allocId: b.id });
  };

  const onBlockClick = useCallback((b) => openOrder(b.orderId), [openOrder]);
  const onBlockContext = useCallback((b, e) => setCtxMenu({ b, x: e.clientX, y: e.clientY }), []);
  const hoverTimer = useRef(null);
  const onHover = useCallback((b, el) => {
    clearTimeout(hoverTimer.current);
    if (!b) return setHover(null);
    hoverTimer.current = setTimeout(() => setHover({ b, rect: el.getBoundingClientRect() }), 250);
  }, []);

  const todayIdx = diffDays(today, rangeStart);
  const filterOptions = useMemo(() => ({
    plants: data.plants.map((p) => ({ value: p.id, label: p.code })),
    lines: data.lines.filter((l) => !filters.plant || l.plantId === filters.plant).map((l) => ({ value: l.id, label: l.code })),
    buyers: data.buyers.map((b) => ({ value: b.id, label: b.name })),
    styles: data.styles.map((s) => ({ value: s.id, label: s.code })),
  }), [data, filters.plant]);

  let rowNo = 0;
  const activeEntry = activeDrag ? (activeDrag.type === 'alloc' ? analysis[activeDrag.allocId] : null) : null;
  const activeOrder = activeDrag ? ctx.orders[activeDrag.type === 'alloc' ? activeEntry?.alloc.orderId : activeDrag.orderId] : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-1 text-[15px] font-semibold text-slate-900">Planning Board</h1>
          <div className="flex rounded-md border border-slate-300 p-0.5" role="group" aria-label="Date range">
            {RANGE_PRESETS.map((p) => (
              <button key={p.id} onClick={() => changePreset(p.id)} className={cn('rounded px-2.5 py-1 text-xs font-medium', presetId === p.id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100')}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" icon={ChevronLeft} onClick={() => shift(-1)} aria-label="Previous period" />
            <Button onClick={goToday}>Today</Button>
            <Button size="icon" icon={ChevronRight} onClick={() => shift(1)} aria-label="Next period" />
          </div>
          <span className="text-xs tabular-nums text-slate-500">{fmtDate(rangeStart)} – {fmtDate(rangeEnd)}</span>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button icon={Inbox} onClick={() => setShowPanel((v) => !v)} className={cn(showPanel && 'border-blue-300 bg-blue-50 text-blue-700')}>
              Unplanned <Badge tone={unplanned.length ? 'amber' : 'gray'}>{unplanned.length}</Badge>
            </Button>
            {canPlan && <Button icon={Plus} onClick={() => setOrderModal(true)}>Order</Button>}
            {canPlan && <Button icon={Factory} onClick={() => setLineModal(true)}>Add Line</Button>}
            <Menu
              trigger={({ toggle }) => <Button icon={Eye} onClick={toggle}>View</Button>}
              items={[
                { header: 'Board view' },
                { label: 'Plant subtotals (pcs/day)', icon: showSubtotals ? Check : undefined, onClick: () => setShowSubtotals((v) => !v) },
                { label: 'Unplanned panel', icon: showPanel ? Check : undefined, onClick: () => setShowPanel((v) => !v) },
                'divider',
                { label: 'Expand all plants', icon: ChevronsUpDown, onClick: () => setCollapsed(new Set()) },
                { label: 'Collapse all plants', icon: ChevronsDownUp, onClick: () => setCollapsed(new Set(data.plants.map((p) => p.id))) },
              ]}
            />
            <Button icon={Download} onClick={doExport}>Export</Button>
            <div className="mx-1 h-5 w-px bg-slate-200" />
            <Button size="icon" icon={Undo2} onClick={boardUndo} disabled={!board?.past.length} title="Undo (Ctrl+Z)" aria-label="Undo" />
            <Button size="icon" icon={Redo2} onClick={boardRedo} disabled={!board?.future.length} title="Redo (Ctrl+Y)" aria-label="Redo" />
            {canPlan && <Button icon={AlignHorizontalJustifyStart} onClick={openAlign}>Daily Align</Button>}
            {canPlan && (
              <Menu
                trigger={({ toggle }) => <Button icon={Eraser} onClick={toggle}>Clear</Button>}
                items={[
                  { label: 'Clear filters', icon: FilterX, disabled: !filtersActive, onClick: () => { setFilters(EMPTY_FILTERS); setHideCompleted(false); setOnlyUnplanned(false); } },
                  { label: 'Discard unsaved changes…', icon: Trash2, disabled: !dirty, onClick: discard },
                  'divider',
                  { label: 'Unschedule future allocations in view…', icon: CalendarX2, danger: true, onClick: clearRange },
                ]}
              />
            )}
            <Button variant={dirty ? 'primary' : 'secondary'} icon={Save} disabled={!dirty} onClick={boardSave} title="Save (Ctrl+S)">
              {dirty ? `Save · ${board.changes.length}` : 'Saved'}
            </Button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <SearchInput value={filters.q} onChange={setFilter('q')} placeholder="Search PO, SO, style, buyer…" className="w-56" />
          <FilterSelect value={filters.plant} onChange={(v) => setFilters((f) => ({ ...f, plant: v, line: '' }))} options={filterOptions.plants} placeholder="All plants" className="!min-w-[110px]" />
          <FilterSelect value={filters.line} onChange={setFilter('line')} options={filterOptions.lines} placeholder="All lines" className="!min-w-[110px]" />
          <FilterSelect value={filters.buyer} onChange={setFilter('buyer')} options={filterOptions.buyers} placeholder="All buyers" />
          <FilterSelect value={filters.style} onChange={setFilter('style')} options={filterOptions.styles} placeholder="All styles" className="!min-w-[110px]" />
          <FilterSelect value={filters.status} onChange={setFilter('status')} options={['planned', 'partial', 'in_production', 'completed'].map((s) => ({ value: s, label: STATUS[s].label }))} placeholder="Any status" className="!min-w-[115px]" />
          <FilterSelect value={filters.readiness} onChange={setFilter('readiness')} options={['ready', 'pending', 'at_risk', 'blocked'].map((s) => ({ value: s, label: STATUS[s].label }))} placeholder="Any readiness" className="!min-w-[120px]" />
          <FilterSelect value={filters.risk} onChange={setFilter('risk')} options={['ok', 'at_risk', 'critical'].map((s) => ({ value: s, label: STATUS[s].label }))} placeholder="Any risk" className="!min-w-[100px]" />
          <Checkbox label="Hide completed" checked={hideCompleted} onChange={setHideCompleted} className="ml-1" />
          <Checkbox label="Only unplanned" checked={onlyUnplanned} onChange={(v) => { setOnlyUnplanned(v); if (v) setShowPanel(true); }} />
          {filtersActive && <Button size="sm" variant="ghost" icon={FilterX} onClick={() => { setFilters(EMPTY_FILTERS); setHideCompleted(false); setOnlyUnplanned(false); }}>Clear filters</Button>}
        </div>
      </div>

      {!canPlan && <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">View only — your demo role cannot change the plan. Switch to Central Planner in the user menu.</div>}
      {dirty && <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900"><b className="font-semibold">Unsaved changes:</b> {board.changes[board.changes.length - 1]?.label}{board.changes.length > 1 && ` (+${board.changes.length - 1} more)`}. Other pages show the last saved plan until you save.</div>}

      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragMove={onDragMove} onDragOver={onDragMove} onDragEnd={onDragEnd} onDragCancel={endDrag} autoScroll={{ threshold: { x: 0.08, y: 0.12 }, acceleration: 6 }}>
        <div className="flex min-h-0 flex-1">
          <div ref={scrollRef} className="relative min-w-0 flex-1 overflow-auto bg-white scroll-thin" onScroll={() => hover && setHover(null)}>
            <div className="relative" style={{ width: LEFT_WIDTH + days.length * dayWidth }}>
              <BoardHeader days={days} dayWidth={dayWidth} today={today} ctx={ctx} originRef={originRef} />
              <div className="relative">
                {todayIdx >= 0 && todayIdx < days.length && <div className="pointer-events-none absolute bottom-0 top-0 z-[8] w-0.5 bg-blue-600/70" style={{ left: LEFT_WIDTH + todayIdx * dayWidth + dayWidth / 2 - 1 }} />}
                {visiblePlants.map(({ plant, lines }) => {
                  const open = !collapsed.has(plant.id);
                  return (
                    <div key={plant.id}>
                      <PlantRow
                        plant={plant}
                        index={visiblePlants.findIndex((g) => g.plant.id === plant.id) + 1}
                        lineCount={lines.length}
                        expanded={open}
                        onToggle={() => setCollapsed((c) => { const n = new Set(c); n.has(plant.id) ? n.delete(plant.id) : n.add(plant.id); return n; })}
                        days={days}
                        dayWidth={dayWidth}
                        dailyTotals={plantTotals[plant.id] || {}}
                        showSubtotals={showSubtotals}
                      />
                      {open && lines.map((line) => {
                        rowNo++;
                        return (
                          <div key={line.id} id={`row-${line.id}`}>
                            <LineRow
                              line={line}
                              rowNo={rowNo}
                              ctx={ctx}
                              days={days}
                              dayWidth={dayWidth}
                              today={today}
                              blocks={blocksByLine.blocks?.[line.id] || EMPTY}
                              laneCount={blocksByLine.lanes?.[line.id] || 1}
                              preview={preview?.lineId === line.id ? preview : null}
                              highlightOrderId={focusOrderId}
                              draggingId={activeDrag?.type === 'alloc' ? activeDrag.allocId : null}
                              onBlockClick={onBlockClick}
                              onBlockContext={onBlockContext}
                              onHover={onHover}
                              canPlan={canPlan}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {!visiblePlants.length && <div className="sticky left-0 w-[min(100vw,600px)] p-10 text-center text-sm text-slate-500">No lines match the current filters.</div>}
              </div>
            </div>
          </div>
          {showPanel && (
            <UnplannedPanel items={unplanned} ctx={ctx} search={panelSearch} onSearch={setPanelSearch} onSchedule={scheduleFromPanel} onOpen={openOrder} onClose={() => setShowPanel(false)} highlightOrderId={focusOrderId} canPlan={canPlan} />
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeOrder && (
            <div className="pointer-events-none inline-flex items-center gap-2 rounded border-l-[3px] border-blue-600 bg-white px-2 py-1 text-[11px] shadow-lg ring-1 ring-slate-900/10">
              <b className="font-semibold">{activeOrder.poNo}</b>
              <span className="text-slate-500">{ctx.styles[activeOrder.styleId]?.code}</span>
              <span className="tabular-nums text-slate-500">{fmtNum(activeEntry?.alloc.qty ?? activeOrder.qty)} pcs</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <Legend />

      {hover && !activeDrag && <BlockTooltip hover={hover} d={d} />}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            { label: 'Open order details', icon: ExternalLink, onClick: () => openOrder(ctxMenu.b.orderId) },
            canPlan && { label: 'Edit allocation…', icon: Pencil, onClick: () => { const a = allocations.find((x) => x.id === ctxMenu.b.id); setMoveReq({ mode: 'edit', alloc: a, target: { lineId: a.lineId, startDate: a.startDate }, beforePlan: analysis[a.id]?.plan }); } },
            canPlan && { label: ctxMenu.b.locked ? 'Unlock (allow Daily Align)' : 'Lock (exclude from Daily Align)', icon: ctxMenu.b.locked ? Unlock : Lock, onClick: () => toggleLock(ctxMenu.b) },
            { label: 'Critical path', icon: ListChecks, onClick: () => navigate(`/critical-path?order=${ctxMenu.b.orderId}`) },
            canPlan && 'divider',
            canPlan && { label: 'Unschedule…', icon: CalendarX2, danger: true, onClick: () => unschedule(ctxMenu.b) },
          ]}
        />
      )}
      {moveReq && <MoveDialog request={moveReq} ctx={ctx} allocations={allocations} milestones={data.milestones} summaries={summaries} onCancel={() => setMoveReq(null)} onApply={applyMove} />}
      <DailyAlignDialog open={!!align} changes={align || []} ctx={ctx} rangeLabel={`${fmtShort(rangeStart)} – ${fmtShort(rangeEnd)}`} onCancel={() => setAlign(null)} onApply={applyAlign} />
      <LineFormModal open={lineModal} onClose={() => setLineModal(false)} defaultPlantId={filters.plant} />
      <OrderFormModal open={orderModal} onClose={() => setOrderModal(false)} />
    </div>
  );
}

const EMPTY = [];

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600">
      {Object.entries(TONE_LABEL).map(([tone, label]) => (
        <span key={tone} className="inline-flex items-center gap-1.5">
          <span className={cn('h-3 w-4 rounded-sm border-l-[3px]', TONE_CLASSES[tone].bar)} />
          {label}
        </span>
      ))}
      <span className="h-3 w-px bg-slate-200" />
      <span className="inline-flex items-center gap-1.5"><span className="h-3 w-0.5 bg-blue-600" /> Today</span>
      <span className="inline-flex items-center gap-1.5"><span className="hatch h-3 w-4 rounded-sm bg-slate-100 ring-1 ring-slate-200" /> Non-working</span>
      <span className="inline-flex items-center gap-1.5"><span className="hatch h-3 w-4 rounded-sm bg-red-50 ring-1 ring-red-200" /> Holiday</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm bg-amber-50 ring-1 ring-amber-200" /> Half day</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm outline outline-1 outline-red-500" /> Overlap</span>
      <span className="inline-flex items-center gap-1.5"><Lock className="h-3 w-3" /> Locked</span>
      <span className="ml-auto hidden text-slate-400 md:inline">Drag to move · Click for details · Right-click for actions</span>
    </div>
  );
}

function BlockTooltip({ hover, d }) {
  const { b, rect } = hover;
  const entry = d.analysis[b.id];
  const s = d.orders[b.orderId];
  if (!entry || !s) return null;
  const style = d.ctx.styles[s.order.styleId];
  const top = rect.top > 260 ? rect.top - 8 : rect.bottom + 8;
  const left = Math.min(window.innerWidth - 320, Math.max(8, rect.left));
  return createPortal(
    <div className="pointer-events-none fixed z-50 w-[300px] rounded-md border border-slate-200 bg-white p-3 text-xs shadow-xl" style={{ top, left, transform: rect.top > 260 ? 'translateY(-100%)' : undefined }}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-slate-900">{s.order.poNo}</span>
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', TONE_CLASSES[b.tone].bar)}>{b.statusLabel}</span>
      </div>
      <div className="mt-0.5 text-slate-500">{style?.code} — {style?.description}</div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-slate-600">
        <span>Line</span><span className="text-right font-medium text-slate-800">{d.ctx.lines[entry.alloc.lineId]?.code}</span>
        <span>Dates</span><span className="text-right font-medium text-slate-800">{fmtShort(entry.plan.start)} → {fmtShort(entry.plan.end)}</span>
        <span>Planned qty</span><span className="text-right font-medium text-slate-800">{fmtNum(entry.alloc.qty)} pcs</span>
        <span>Efficiency ladder</span><span className="text-right font-medium text-slate-800">{entry.plan.steps.length ? entry.plan.steps.map((x) => `${x}%`).join(' → ') : '—'}</span>
        <span>Good / order</span><span className="text-right font-medium text-slate-800">{fmtNum(s.good)} / {fmtNum(s.order.qty)}</span>
        <span>Delivery</span><span className="text-right font-medium text-slate-800">{fmtDate(s.order.deliveryDate)}</span>
        <span>Readiness</span><span className="text-right font-medium text-slate-800">{s.readiness.state === 'unknown' ? 'n/a' : `${s.readiness.done}/${s.readiness.total} · ${STATUS[s.readiness.state].label}`}</span>
      </div>
      {entry.issues.filter((i) => i.level !== 'info').length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          {entry.issues.filter((i) => i.level !== 'info').slice(0, 4).map((i, k) => (
            <li key={k} className={cn('flex gap-1.5', i.level === 'critical' ? 'text-red-700' : 'text-amber-800')}>• {i.msg}</li>
          ))}
        </ul>
      )}
    </div>,
    document.body,
  );
}

function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => !ref.current?.contains(e.target) && onClose();
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [onClose]);
  return createPortal(
    <div ref={ref} role="menu" className="fixed z-50 min-w-[220px] rounded-md border border-slate-200 bg-white py-1 shadow-lg" style={{ top: Math.min(y, window.innerHeight - 220), left: Math.min(x, window.innerWidth - 240) }}>
      {items.filter(Boolean).map((it, i) =>
        it === 'divider' ? <div key={i} className="my-1 border-t border-slate-100" /> : (
          <button key={i} role="menuitem" onClick={() => { onClose(); it.onClick(); }} className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]', it.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50')}>
            <it.icon className="h-3.5 w-3.5" /> {it.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
