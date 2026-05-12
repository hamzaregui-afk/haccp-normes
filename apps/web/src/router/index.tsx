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
  // OPERATOR is redirected to /controls (their home), not to /dashboard
  const fallback = role === 'OPERATOR' ? '/controls' : '/dashboard';
  if (!role || !roles.includes(role)) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}

// ARCH-DECISION: OPERATOR has no access to the general dashboard (charts, NC stats,
// full KPI grid). Redirect them immediately to /controls which shows their own tasks.
function OperatorDashboardGuard({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  if (role === 'OPERATOR') return <Navigate to="/controls" replace />;
  return <>{children}</>;
}

const S = (Component: React.LazyExoticComponent<() => JSX.Element>) => (
  <Suspense fallback={<PageLoader />}>
    <Component />
  </Suspense>
);

// ARCH-DECISION: Role-aware home redirect — OPERATOR's primary workspace is /controls
// (their own task list), so sending them to /dashboard (charts + org KPIs) is useless.
// All other roles land on /dashboard as before.
function RoleHome() {
  const role = useAuthStore((s) => s.user?.role);
  return <Navigate to={role === 'OPERATOR' ? '/controls' : '/dashboard'} replace />;
}

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
      // Default redirect — OPERATOR lands on /controls (their workspace), others on /dashboard
      { index: true, element: <RoleHome /> },

      // Dashboard — OPERATOR is redirected to /controls by OperatorDashboardGuard
      {
        path: 'dashboard',
        element: <OperatorDashboardGuard>{S(DashboardPage)}</OperatorDashboardGuard>,
      },

      // Controls & Nonconformities — open to all roles including OPERATOR
      { path: 'controls',              element: S(ControlsPage) },
      { path: 'controls/templates/:id', element: S(ChecklistEditorPage) },
      { path: 'nonconformities',       element: S(NonconformitiesPage) },

      // DLC — ADMIN, MANAGER, SUPER_ADMIN and OPERATOR (field printing)
      {
        path: 'dlc',
        element: (
          <RequireRole roles={['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'SUPER_ADMIN', 'OPERATOR']}>
            {S(DLCWebPage)}
          </RequireRole>
        ),
      },

      // Asset referential — OPERATOR has no access
      {
        path: 'products',
        element: (
          <RequireRole roles={['ADMIN', 'MANAGER', 'SUPER_ADMIN']}>
            {S(ProductsPage)}
          </RequireRole>
        ),
      },
      {
        path: 'equipments',
        element: (
          <RequireRole roles={['ADMIN', 'MANAGER', 'SUPER_ADMIN']}>
            {S(EquipmentsPage)}
          </RequireRole>
        ),
      },
      {
        path: 'suppliers',
        element: (
          <RequireRole roles={['ADMIN', 'MANAGER', 'SUPER_ADMIN']}>
            {S(SuppliersPage)}
          </RequireRole>
        ),
      },
      {
        path: 'groups',
        element: (
          <RequireRole roles={['ADMIN', 'MANAGER', 'SUPER_ADMIN']}>
            {S(GroupsPage)}
          </RequireRole>
        ),
      },
      {
        path: 'zones',
        element: (
          <RequireRole roles={['ADMIN', 'MANAGER', 'SUPER_ADMIN']}>
            {S(ZonesPage)}
          </RequireRole>
        ),
      },

      // GED — open to all roles including OPERATOR
      { path: 'documents', element: S(DocumentsPage) },

      // Reports — OPERATOR excluded
      {
        path: 'reports',
        element: (
          <RequireRole roles={['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'SUPER_ADMIN']}>
            {S(ReportsPage)}
          </RequireRole>
        ),
      },

      // Administration — MANAGER has same access as ADMIN except user/client creation
      {
        path: 'settings',
        element: (
          <RequireRole roles={['ADMIN', 'MANAGER', 'SUPER_ADMIN']}>
            {S(SettingsPage)}
          </RequireRole>
        ),
      },
      {
        path: 'audit',
        element: (
          <RequireRole roles={['ADMIN', 'MANAGER', 'SUPER_ADMIN']}>
            {S(AuditPage)}
          </RequireRole>
        ),
      },

      // Users — MANAGER can VIEW the list but cannot create/edit/delete (enforced in UsersPage)
      {
        path: 'users',
        element: (
          <RequireRole roles={['ADMIN', 'MANAGER', 'SUPER_ADMIN']}>
            {S(UsersPage)}
          </RequireRole>
        ),
      },

      // Clients — ADMIN can access (create clients for their org); SUPER_ADMIN manages all tenants
      {
        path: 'clients',
        element: (
          <RequireRole roles={['ADMIN', 'SUPER_ADMIN']}>
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
