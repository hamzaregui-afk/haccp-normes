import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';

import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthStore } from '@/store/auth.store';
import type { UserRole } from '@haccp/shared-types';

// ─── Lazy feature pages ───────────────────────────────────────────────────────
const LoginPage           = lazy(() => import('@/features/auth/LoginPage'));
const DashboardPage       = lazy(() => import('@/features/dashboard/DashboardPage'));
const UsersPage           = lazy(() => import('@/features/users/UsersPage'));
const ClientsPage         = lazy(() => import('@/features/clients/ClientsPage'));
const ControlsPage           = lazy(() => import('@/features/controls/ControlsPage'));
const ChecklistEditorPage    = lazy(() => import('@/features/controls/ChecklistEditorPage'));
const NonconformitiesPage = lazy(() => import('@/features/nonconformities/NonconformitiesPage'));
const ProductsPage        = lazy(() => import('@/features/products/ProductsPage'));
const EquipmentsPage      = lazy(() => import('@/features/equipments/EquipmentsPage'));
const SuppliersPage       = lazy(() => import('@/features/suppliers/SuppliersPage'));
const GroupsPage          = lazy(() => import('@/features/groups/GroupsPage'));
const ZonesPage           = lazy(() => import('@/features/zones/ZonesPage'));
const ReportsPage         = lazy(() => import('@/features/reports/ReportsPage'));
const SettingsPage        = lazy(() => import('@/features/settings/SettingsPage'));
const DLCWebPage          = lazy(() => import('@/features/dlc/DLCWebPage'));
const AuditPage           = lazy(() => import('@/features/audit/AuditPage'));
const DocumentsPage       = lazy(() => import('@/features/documents/DocumentsPage'));

// ─── Fallback spinner ────────────────────────────────────────────────────────
const PageLoader = () => (
  <div className="flex h-full items-center justify-center">
    <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand-medium border-t-transparent" />
  </div>
);

// ─── Route guards ─────────────────────────────────────────────────────────────
function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  if (!role || !roles.includes(role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

const S = (Component: React.LazyExoticComponent<() => JSX.Element>) => (
  <Suspense fallback={<PageLoader />}>
    <Component />
  </Suspense>
);

// ─── Router ───────────────────────────────────────────────────────────────────
// ARCH-DECISION: Explicit ReturnType annotation prevents TS2742 ("inferred type
// cannot be named without a reference to @remix-run/router") which occurs in pnpm
// workspaces where the transitive package path is not part of the public resolution.
export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  {
    path: '/login',
    element: <Suspense fallback={null}><LoginPage /></Suspense>,
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard',       element: S(DashboardPage) },
      { path: 'controls',        element: S(ControlsPage) },
      { path: 'controls/templates/:id', element: S(ChecklistEditorPage) },
      { path: 'nonconformities', element: S(NonconformitiesPage) },
      { path: 'products',        element: S(ProductsPage) },
      { path: 'equipments',      element: S(EquipmentsPage) },
      { path: 'suppliers',       element: S(SuppliersPage) },
      { path: 'groups',          element: S(GroupsPage) },
      { path: 'zones',           element: S(ZonesPage) },
      { path: 'documents',       element: S(DocumentsPage) },
      { path: 'reports',         element: S(ReportsPage) },
      { path: 'dlc',            element: S(DLCWebPage) },
      {
        path: 'settings',
        element: (
          <RequireRole roles={['ADMIN', 'SUPER_ADMIN']}>
            {S(SettingsPage)}
          </RequireRole>
        ),
      },
      {
        path: 'audit',
        element: (
          <RequireRole roles={['ADMIN', 'SUPER_ADMIN']}>
            {S(AuditPage)}
          </RequireRole>
        ),
      },
      {
        path: 'users',
        element: (
          <RequireRole roles={['ADMIN', 'SUPER_ADMIN']}>
            {S(UsersPage)}
          </RequireRole>
        ),
      },
      {
        path: 'clients',
        element: (
          <RequireRole roles={['SUPER_ADMIN']}>
            {S(ClientsPage)}
          </RequireRole>
        ),
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
