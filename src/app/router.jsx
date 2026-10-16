import { lazy, Suspense } from 'react';
import { createBrowserRouter, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';

const OverviewPage = lazy(() => import('../pages/OverviewPage'));
const PlanningBoardPage = lazy(() => import('../pages/PlanningBoardPage'));
const OrdersPage = lazy(() => import('../pages/OrdersPage'));
const CriticalPathPage = lazy(() => import('../pages/CriticalPathPage'));
const PlantsLinesPage = lazy(() => import('../pages/PlantsLinesPage'));
const EfficiencyLadderPage = lazy(() => import('../pages/EfficiencyLadderPage'));
const CarderManagementPage = lazy(() => import('../pages/CarderManagementPage'));
const ProductionOutputPage = lazy(() => import('../pages/ProductionOutputPage'));
const CalendarPage = lazy(() => import('../pages/CalendarPage'));
const SettingsPage = lazy(() => import('../pages/SettingsPage'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-sm text-slate-500">Page not found.</p>
      <Link to="/" className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline">Back to overview</Link>
    </div>
  );
}

const page = (Component) => (
  <Suspense fallback={<PageLoader />}>
    <Component />
  </Suspense>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: page(OverviewPage) },
      { path: 'planning', element: page(PlanningBoardPage) },
      { path: 'orders', element: page(OrdersPage) },
      { path: 'critical-path', element: page(CriticalPathPage) },
      { path: 'plants', element: page(PlantsLinesPage) },
      { path: 'efficiency-ladder', element: page(EfficiencyLadderPage) },
      { path: 'carder', element: page(CarderManagementPage) },
      { path: 'output', element: page(ProductionOutputPage) },
      { path: 'calendar', element: page(CalendarPage) },
      { path: 'settings', element: page(SettingsPage) },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
