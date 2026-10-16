import { useMemo, useState, useEffect } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { cn, EmptyState } from './ui';

/**
 * Lightweight sortable, paginated table.
 * columns: [{ key, header, cell?: (row) => node, sort?: (row) => value, align?: 'right', className? }]
 */
export function DataTable({ columns, rows, pageSize = 25, onRowClick, empty, initialSort, rowClass, dense, footer }) {
  const [sort, setSort] = useState(initialSort || null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = col.sort || ((r) => r[col.key]);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true })) * dir;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => {
    if (page > pages - 1) setPage(0);
  }, [pages, page]);
  const visible = sorted.slice(page * pageSize, page * pageSize + pageSize);

  const toggle = (c) => {
    if (c.sortable === false) return;
    setSort((s) => (s?.key !== c.key ? { key: c.key, dir: 'asc' } : s.dir === 'asc' ? { key: c.key, dir: 'desc' } : null));
  };

  return (
    <div>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn('th', c.align === 'right' && 'text-right', c.sortable !== false && 'cursor-pointer select-none hover:text-slate-700', c.className)} onClick={() => toggle(c)} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  <span className={cn('inline-flex items-center gap-1', c.align === 'right' && 'flex-row-reverse')}>
                    {c.header}
                    {c.sortable !== false && c.header && (sort?.key === c.key ? sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3 opacity-30" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn(onRowClick && 'cursor-pointer', 'hover:bg-slate-50', rowClass?.(r))}>
                {columns.map((c) => (
                  <td key={c.key} className={cn('td', dense && 'py-1.5', c.align === 'right' && 'text-right tabular-nums', c.className)}>
                    {c.cell ? c.cell(r) : r[c.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (empty || <EmptyState title="No records match the current filters" />)}
      </div>
      {(rows.length > pageSize || footer) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
          <div>{footer}</div>
          {rows.length > pageSize && (
            <div className="flex items-center gap-2">
              <span className="tabular-nums">
                {page * pageSize + 1}–{Math.min(sorted.length, (page + 1) * pageSize)} of {sorted.length}
              </span>
              <button aria-label="Previous page" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded border border-slate-200 p-1 hover:bg-slate-50 disabled:opacity-40">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="rounded border border-slate-200 p-1 hover:bg-slate-50 disabled:opacity-40">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
