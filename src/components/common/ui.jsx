import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, Clock, Inbox, Loader2, Search, X, XCircle, Ban, CircleDot } from 'lucide-react';

export function cn(...c) {
  return c.filter(Boolean).join(' ');
}

const BTN = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600 disabled:bg-blue-300 disabled:border-blue-300',
  secondary: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300 disabled:text-slate-400',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent disabled:text-slate-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 border-red-600 disabled:bg-red-300',
  'danger-outline': 'bg-white text-red-600 hover:bg-red-50 border-red-200',
  dark: 'bg-white/10 text-slate-100 hover:bg-white/15 border-white/10',
};

export const Button = forwardRef(function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, className, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-medium transition-colors',
        size === 'sm' ? 'h-7 px-2 text-xs' : size === 'icon' ? 'h-8 w-8' : size === 'icon-sm' ? 'h-7 w-7' : 'h-8 px-3 text-[13px]',
        BTN[variant],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : Icon ? <Icon className={size === 'sm' || size === 'icon-sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> : null}
      {children}
    </button>
  );
});

const TONES = {
  gray: 'bg-slate-100 text-slate-600 ring-slate-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  dark: 'bg-slate-800 text-white ring-slate-800',
};

export function Badge({ tone = 'gray', icon: Icon, children, className, title }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset', TONES[tone], className)}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

export const STATUS = {
  // planning status
  unplanned: { label: 'Unplanned', tone: 'gray', icon: CircleDashed },
  planned: { label: 'Planned', tone: 'blue', icon: CircleDot },
  partial: { label: 'Partially planned', tone: 'amber', icon: CircleDashed },
  in_production: { label: 'In production', tone: 'indigo', icon: Loader2 },
  completed: { label: 'Completed', tone: 'green', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', tone: 'gray', icon: Ban },
  // risk
  ok: { label: 'On track', tone: 'green', icon: CheckCircle2 },
  at_risk: { label: 'At risk', tone: 'amber', icon: AlertTriangle },
  critical: { label: 'Critical', tone: 'red', icon: XCircle },
  // readiness
  ready: { label: 'Ready', tone: 'green', icon: CheckCircle2 },
  pending: { label: 'Pending', tone: 'gray', icon: Clock },
  blocked: { label: 'Blocked', tone: 'red', icon: Ban },
  unknown: { label: 'No checklist', tone: 'gray', icon: CircleDashed },
  // milestone
  in_progress: { label: 'In progress', tone: 'blue', icon: Loader2 },
  overdue: { label: 'Overdue', tone: 'red', icon: XCircle },
  // master data
  active: { label: 'Active', tone: 'green', icon: null },
  inactive: { label: 'Inactive', tone: 'gray', icon: null },
};

export function StatusBadge({ status, label, className }) {
  const s = STATUS[status] || { label: status, tone: 'gray' };
  const Icon = s.icon === Loader2 ? CircleDot : s.icon;
  return <Badge tone={s.tone} icon={Icon} className={className}>{label || s.label}</Badge>;
}

export function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, icon: Icon, onClick }) {
  const toneCls = { red: 'text-red-600', amber: 'text-amber-600', green: 'text-emerald-600', blue: 'text-blue-600' }[tone] || 'text-slate-900';
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={cn('card flex min-w-0 flex-col items-start px-3.5 py-3 text-left', onClick && 'transition-colors hover:border-slate-300 hover:bg-slate-50')}>
      <div className="flex w-full items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        <span className="truncate">{label}</span>
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
      </div>
      <div className={cn('mt-1 text-xl font-semibold tabular-nums', toneCls)}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-slate-500">{sub}</div>}
    </Comp>
  );
}

export function Card({ title, actions, children, className, bodyClass, subtitle }) {
  return (
    <section className={cn('card min-w-0', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold text-slate-800">{title}</h2>
            {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={bodyClass ?? 'p-4'}>{children}</div>
    </section>
  );
}

export function Field({ label, error, hint, children, className, required }) {
  return (
    <label className={cn('block', className)}>
      {label && (
        <span className="mb-1 block text-xs font-medium text-slate-600">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </span>
      )}
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

export const Input = forwardRef(function Input({ className, error, ...props }, ref) {
  return <input ref={ref} className={cn('input', error && 'input-error', className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, error, children, ...props }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn('input appearance-none pr-7', error && 'input-error', className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
    </div>
  );
});

export const Textarea = forwardRef(function Textarea({ className, error, ...props }, ref) {
  return <textarea ref={ref} className={cn('input h-auto min-h-[64px] py-1.5', error && 'input-error', className)} {...props} />;
});

export function Checkbox({ label, checked, onChange, className }) {
  return (
    <label className={cn('inline-flex cursor-pointer select-none items-center gap-1.5 text-[13px] text-slate-700', className)}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-600" />
      {label}
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input pl-8 pr-7" />
      {value && (
        <button aria-label="Clear search" onClick={() => onChange('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function FilterSelect({ value, onChange, options, placeholder, className }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={cn('min-w-[130px]', value && 'border-blue-400 bg-blue-50/40', className)}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div role="tablist" className={cn('flex gap-1 border-b border-slate-200', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn('-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors', value === t.value ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800')}
        >
          {t.label}
          {t.count != null && <span className={cn('rounded px-1.5 text-[11px]', value === t.value ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <Icon className="h-8 w-8 text-slate-300" />
      <p className="mt-2 text-[13px] font-medium text-slate-700">{title}</p>
      {children && <p className="mt-1 max-w-sm text-xs text-slate-500">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

function useFocusOnOpen(open, ref) {
  useEffect(() => {
    if (!open || !ref.current) return;
    const prev = document.activeElement;
    const el = ref.current.querySelector('[data-autofocus], input:not([type=hidden]), select, textarea, button');
    el?.focus();
    return () => prev?.focus?.();
  }, [open, ref]);
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  const ref = useRef(null);
  const titleId = useId();
  useEscape(open, onClose);
  useFocusOnOpen(open, ref);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cn('w-full rounded-lg border border-slate-200 bg-white shadow-xl', w)}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 id={titleId} className="text-[15px] font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          <button aria-label="Close" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 rounded-b-lg">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = 'max-w-xl', headerExtra }) {
  const ref = useRef(null);
  useEscape(open, onClose);
  useFocusOnOpen(open, ref);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/25" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Details'} className={cn('flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl', width)}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-slate-900">{title}</h2>
            {subtitle && <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-1">
            {headerExtra}
            <button aria-label="Close panel" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

/** Small dropdown menu. items: [{ label, icon, onClick, danger, disabled }] or 'divider' */
export function Menu({ trigger, items, align = 'right', className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const k = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, [open]);
  return (
    <div ref={ref} className={cn('relative', className)}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div role="menu" className={cn('absolute z-50 mt-1 min-w-[180px] rounded-md border border-slate-200 bg-white py-1 shadow-lg', align === 'right' ? 'right-0' : 'left-0')}>
          {items.filter(Boolean).map((it, i) =>
            it === 'divider' ? (
              <div key={i} className="my-1 border-t border-slate-100" />
            ) : it.header ? (
              <div key={i} className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{it.header}</div>
            ) : (
              <button
                key={i}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick?.();
                }}
                className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] disabled:opacity-40', it.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50', it.active && 'bg-blue-50 text-blue-700')}
              >
                {it.icon && <it.icon className="h-3.5 w-3.5 shrink-0" />}
                <span className="flex-1">{it.label}</span>
                {it.hint && <span className="text-[11px] text-slate-400">{it.hint}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function KeyValue({ items, cols = 2 }) {
  return (
    <dl className={cn('grid gap-x-4 gap-y-2.5', cols === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2')}>
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{k}</dt>
          <dd className="mt-0.5 truncate text-[13px] text-slate-800">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressBar({ value, tone = 'blue', className }) {
  const c = { blue: 'bg-blue-600', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' }[tone];
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-slate-200', className)}>
      <div className={cn('h-full rounded-full', c)} style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
    </div>
  );
}

export function Alert({ tone = 'amber', icon: Icon = AlertTriangle, title, children, className }) {
  const c = { amber: 'border-amber-200 bg-amber-50 text-amber-900', red: 'border-red-200 bg-red-50 text-red-900', blue: 'border-blue-200 bg-blue-50 text-blue-900', gray: 'border-slate-200 bg-slate-50 text-slate-700' }[tone];
  return (
    <div className={cn('flex gap-2 rounded-md border px-3 py-2 text-[13px]', c, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={cn(title && 'mt-0.5', 'text-xs opacity-90')}>{children}</div>}
      </div>
    </div>
  );
}
