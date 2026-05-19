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
const ClientDetailPage    = lazy(() => import('@/features/clients/ClientDetailPage'));
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

/**
 * RequireModule — blocks access to a route when the tenant doesn't have the module enabled.
 *
 * ARCH-DECISION: SUPER_ADMIN bypasses all module checks — matches backend ModuleGuard.
 * Users who lose module access mid-session (e.g., tenant downgrade) are redirected to
 * /dashboard rather than shown a blank page or error.
 */
function RequireModule({ moduleKey, children }: { moduleKey: string; children: React.ReactNode }) {
  const hasModule = useAuthStore((s) => s.hasModule);
  // ARCH-DECISION: Always fall back to /dashboard (not /controls) to avoid infinite
  // redirect loops — if OPERATOR's HACCP_CONTROLS module is missing and we redirected
  // to /controls, RequireModule would catch it again and loop. /dashboard is the safe
  // landing page; OperatorDashboardGuard runs there and redirects to /controls only
  // when that module is actually enabled.
  if (!hasModule(moduleKey)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// ARCH-DECISION: OPERATOR has no access to the general dashboard (charts, NC stats,
// full KPI grid). Redirect them to /controls only when HACCP_CONTROLS module is enabled —
// guarding against the mis-configured edge case where an OPERATOR tenant has no modules.
function OperatorDashboardGuard({ children }: { children: React.ReactNode }) {
  const role      = useAuthStore((s) => s.user?.role);
  const hasModule = useAuthStore((s) => s.hasModule);
  if (role === 'OPERATOR' && hasModule('HACCP_CONTROLS')) return <Navigate to="/controls" replace />;
  return <>{children}</>;
}

const S = (Component: React.LazyExoticComponent<() => JSX.Element>) => (
  <Suspense fallback={<PageLoader />}>
    <Component />
  </Suspense>
);

// ARCH-DECISION: Role-aware home redirect — OPERATOR's primary workspace is /controls.
// Only redirect there when HACCP_CONTROLS module is enabled; fall back to /dashboard
// for mis-configured tenants (OperatorDashboardGuard shows what it can there).
function RoleHome() {
  const role      = useAuthStore((s) => s.user?.role);
  const hasModule = useAuthStore((s) => s.hasModule);
  const target    = role === 'OPERATOR' && hasModule('HACCP_CONTROLS') ? '/controls' : '/dashboard';
  return <Navigate to={target} replace />;
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
        element: (
          <RequireModule moduleKey="DASHBOARD">
            <OperatorDashboardGuard>{S(DashboardPage)}</OperatorDashboardGuard>
          </RequireModule>
        ),
      },

      // Controls & Nonconformities — open to all roles including OPERATOR
      {
        path: 'controls',
        element: (
          <RequireModule moduleKey="HACCP_CONTROLS">{S(ControlsPage)}</RequireModule>
        ),
      },
      {
        path: 'controls/templates/:id',
        element: (
          <RequireModule moduleKey="HACCP_CONTROLS">{S(ChecklistEditorPage)}</RequireModule>
        ),
      },
      {
        path: 'nonconformities',
        element: (
          <RequireModule moduleKey="NONCONFORMITIES">{S(NonconformitiesPage)}</RequireModule>
        ),
      },

      // DLC — ADMIN, MANAGER, SUPER_ADMIN and OPERATOR (field printing)
      {
        path: 'dlc',
        element: (
          <RequireRole roles={['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'SUPER_ADMIN', 'OPERATOR']}>
            <RequireModule moduleKey="DLC">{S(DLCWebPage)}</RequireModule>
          </RequireRole>
        ),
      },

      // Asset referential — OPERATOR has no access
      {
        path: 'products',
        element: (
          <RequireRole roles={['ADMIN', 'MANAGER', 'SUPER_ADMIN']}>
            <RequireModule moduleKey="PRODUCTS">{S(ProductsPage)}</RequireModule>
          </RequireRole>
        ),
      },
      {
        path: 'equipments',
        element: (
          <RequireRole roles={['ADMIN', 'MANAGER', 'SUPER_ADMIN']}>
            <RequireModule moduleKey="EQUIPMENTS">{S(EquipmentsPage)}</RequireModule>
          </RequireRole>
        ),
      },
      {
        path: 'suppliers',
        element: (
          <RequireRole roles={['ADMIN', 'MANAGER', 'SUPER_ADMIN']}>
            <RequireModule moduleKey="SUPPLIERS">{S(SuppliersPage)}</RequireModule>
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
            {/* Zones are tied to HACCP_CONTROLS — they are control-point locations */}
            <RequireModule moduleKey="HACCP_CONTROLS">{S(ZonesPage)}</RequireModule>
          </RequireRole>
        ),
      },

      // GED — open to all roles including OPERATOR
      {
        path: 'documents',
        element: (
          <RequireModule moduleKey="GED">{S(DocumentsPage)}</RequireModule>
        ),
      },

      // Reports — OPERATOR excluded
      {
        path: 'reports',
        element: (
          <RequireRole roles={['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'SUPER_ADMIN']}>
            <RequireModule moduleKey="REPORTS">{S(ReportsPage)}</RequireModule>
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
            <RequireModule moduleKey="AUDIT">{S(AuditPage)}</RequireModule>
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
      // Client detail — SUPER_ADMIN only (full tenant management panel)
      {
        path: 'clients/:id',
        element: (
          <RequireRole roles={['SUPER_ADMIN']}>
            {S(ClientDetailPage)}
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
