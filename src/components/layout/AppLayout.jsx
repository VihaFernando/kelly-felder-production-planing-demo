import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CalendarRange, ClipboardList, Route as RouteIcon, Factory, TrendingUp, Users, BarChart3, CalendarDays, Settings,
  Bell, ChevronsLeft, ChevronsRight, Menu as MenuIcon, UserCircle2, Check, RotateCcw, Database, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ROLES, useAppStore } from '../../store/appStore';
import { cn, Menu } from '../common/ui';
import { fmtDateTime } from '../../utils/dateUtils';
import { OrderDetailDrawer } from '../orders/OrderDetailDrawer';
import { confirm } from '../common/confirm';

export const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/planning', label: 'Planning Board', icon: CalendarRange },
  { to: '/orders', label: 'Orders', icon: ClipboardList },
  { to: '/critical-path', label: 'Critical Path', icon: RouteIcon },
  { to: '/plants', label: 'Plants & Lines', icon: Factory, hideFor: ['plant_manager'] },
  { to: '/efficiency-ladder', label: 'Efficiency Ladder', icon: TrendingUp },
  { to: '/carder', label: 'Carder Management', icon: Users },
  { to: '/output', label: 'Production Output', icon: BarChart3 },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function readCollapsed() {
  try {
    return localStorage.getItem('kf-ui-sidebar') === '1';
  } catch {
    return false;
  }
}

export function AppLayout() {
  const location = useLocation();
  const role = useAppStore((s) => s.data.settings.user.role);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isBoard = location.pathname.startsWith('/planning');

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    try {
      localStorage.setItem('kf-ui-sidebar', collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const nav = NAV.filter((n) => !n.hideFor?.includes(role));

  return (
    <div className="flex h-full flex-col">
      <Header onMenu={() => setMobileOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <aside className={cn('hidden shrink-0 flex-col border-r border-navy-800 bg-navy-900 lg:flex', collapsed ? 'w-14' : 'w-52')}>
          <SideNav items={nav} collapsed={collapsed} />
          <button onClick={() => setCollapsed((c) => !c)} className="flex items-center gap-2 border-t border-navy-800 px-4 py-2.5 text-xs text-slate-400 hover:text-white" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
          </button>
        </aside>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setMobileOpen(false)}>
            <aside className="flex h-full w-60 flex-col bg-navy-900" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 text-white">
                <span className="text-sm font-semibold">Menu</span>
                <button aria-label="Close menu" onClick={() => setMobileOpen(false)}><X className="h-4 w-4" /></button>
              </div>
              <SideNav items={nav} collapsed={false} />
            </aside>
          </div>
        )}
        <main className={cn('min-w-0 flex-1', isBoard ? 'flex flex-col overflow-hidden' : 'overflow-y-auto')}>
          {isBoard ? <Outlet /> : <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6"><Outlet /></div>}
        </main>
      </div>
      <OrderDetailDrawer />
    </div>
  );
}

function SideNav({ items, collapsed }) {
  const dirty = useAppStore((s) => !!s.board && s.board.allocations !== s.data.allocations);
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === '/'}
          title={collapsed ? n.label : undefined}
          className={({ isActive }) =>
            cn('relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors', isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded bg-blue-400" />}
              <n.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{n.label}</span>}
              {n.to === '/planning' && dirty && <span className={cn('h-1.5 w-1.5 rounded-full bg-amber-400', collapsed ? 'absolute right-1.5 top-1.5' : 'ml-auto')} title="Unsaved board changes" />}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function Header({ onMenu }) {
  const navigate = useNavigate();
  const user = useAppStore((s) => s.data.settings.user);
  const notifications = useAppStore((s) => s.data.notifications);
  const markNotifications = useAppStore((s) => s.markNotifications);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const resetDemo = useAppStore((s) => s.resetDemo);
  const isAdmin = user.role === 'admin';
  const unread = notifications.filter((n) => !n.read).length;

  const switchRole = (role) => {
    updateSettings({ user: { ...user, role } });
    toast.success(`Switched to ${ROLES[role].label} (demo role)`);
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-navy-950 bg-navy-950 px-3 text-slate-200 sm:px-4">
      <button className="rounded p-1 text-slate-300 hover:bg-white/10 lg:hidden" onClick={onMenu} aria-label="Open menu">
        <MenuIcon className="h-5 w-5" />
      </button>
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-white text-[11px] font-bold tracking-tight text-navy-900">KF</div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold text-white">Kelly Felder</div>
          <div className="text-[11px] text-slate-400">Production Planning</div>
        </div>
      </div>
      <span className="ml-1 hidden items-center gap-1 rounded border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300 sm:inline-flex" title="Changes are saved in this browser only. No live ERP connection.">
        <Database className="h-3 w-3" /> Demo mode · local data
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Menu
          trigger={({ toggle }) => (
            <button onClick={toggle} className="relative rounded-md p-2 text-slate-300 hover:bg-white/10 hover:text-white" aria-label={`Notifications (${unread} unread)`}>
              <Bell className="h-4 w-4" />
              {unread > 0 && <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{unread}</span>}
            </button>
          )}
          items={[
            { header: `Notifications · ${unread} unread` },
            ...notifications.slice(0, 8).map((n) => ({
              label: (
                <span className="block max-w-[300px]">
                  <span className={cn('flex items-center gap-1.5 font-medium', !n.read ? 'text-slate-900' : 'text-slate-500')}>
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', n.severity === 'critical' ? 'bg-red-500' : n.severity === 'warning' ? 'bg-amber-500' : n.severity === 'success' ? 'bg-emerald-500' : 'bg-blue-500', n.read && 'opacity-30')} />
                    <span className="truncate">{n.title}</span>
                  </span>
                  <span className="block truncate pl-3 text-xs text-slate-500">{n.body}</span>
                  <span className="block pl-3 text-[11px] text-slate-400">{fmtDateTime(n.at)}</span>
                </span>
              ),
              onClick: () => {
                markNotifications([n.id]);
                if (n.link) navigate(n.link);
              },
            })),
            notifications.length === 0 && { label: 'No notifications', disabled: true },
            'divider',
            { label: 'Mark all as read', icon: Check, onClick: () => markNotifications(null), disabled: !unread },
          ]}
        />
        <Menu
          trigger={({ toggle }) => (
            <button onClick={toggle} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-white/10">
              <UserCircle2 className="h-6 w-6 text-slate-400" />
              <span className="hidden text-left leading-tight md:block">
                <span className="block text-[12px] font-medium text-white">{user.name}</span>
                <span className="block text-[11px] text-slate-400">{ROLES[user.role]?.label}</span>
              </span>
            </button>
          )}
          items={[
            { header: 'Demo role' },
            ...Object.entries(ROLES).map(([id, r]) => ({ label: r.label, icon: user.role === id ? Check : undefined, active: user.role === id, onClick: () => switchRole(id) })),
            'divider',
            { label: 'Settings', icon: Settings, onClick: () => navigate('/settings') },
            isAdmin && {
              label: 'Reset demo data',
              icon: RotateCcw,
              danger: true,
              onClick: async () => {
                if (await confirm({ title: 'Reset demo data?', message: 'All local changes (orders, plans, milestones, output, configuration) will be replaced with the original demo dataset.', confirmLabel: 'Reset data', danger: true })) {
                  resetDemo();
                  toast.success('Demo data reset');
                }
              },
            },
          ]}
        />
      </div>
    </header>
  );
}
