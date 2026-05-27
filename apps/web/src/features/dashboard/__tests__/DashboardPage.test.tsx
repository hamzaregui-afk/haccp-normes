/**
 * DashboardPage.test.tsx
 *
 * Unit tests for the DashboardPage component.
 *
 * Strategy:
 *  - Mock `@tanstack/react-query` useQuery and useQueries to control data states.
 *  - Mock recharts (ResponsiveContainer) to avoid ResizeObserver issues in jsdom.
 *  - Mock `@/lib/api` so no real HTTP calls are made.
 *  - Wrap renders in QueryClientProvider for the real react-query internals
 *    that might remain after partial mocking.
 *
 * Tests cover:
 *  - KPI cards render with loaded data.
 *  - Loading skeleton state (animate-pulse placeholders) appears before data arrives.
 *  - Chart sections render when data is present.
 *  - Recent NC table renders rows from loaded data.
 *  - Empty-state message renders when there are no open NCs.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ─── Mock recharts — ResizeObserver is not available in jsdom ─────────────────

jest.mock('recharts', () => {
  const Actual = jest.requireActual<typeof import('recharts')>('recharts');
  return {
    ...Actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

// ─── Mock api (no real HTTP) ──────────────────────────────────────────────────

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn() },
}));

// ─── Mock useAuthStore (currentUser = null → non-operator view) ───────────────

jest.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (s: { user: null }) => unknown) => selector({ user: null }),
}));

// ─── Mock useTenantId ─────────────────────────────────────────────────────────

jest.mock('@/hooks/useTenantId', () => ({
  useTenantId: () => 'tenant-test',
}));

// ─── Mock useQueries / useQuery from @tanstack/react-query ────────────────────
//
// We do a factory mock so individual tests can override return values via
// the `mockUseQueries` / `mockUseQuery` references exported below.

const mockUseQueries = jest.fn();
const mockUseQuery   = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<typeof import('@tanstack/react-query')>('@tanstack/react-query'),
  useQueries: (...args: unknown[]) => mockUseQueries(...args),
  useQuery:   (...args: unknown[]) => mockUseQuery(...args),
}));

// ─── Import under test (after mocks) ─────────────────────────────────────────

import DashboardPage from '../DashboardPage';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeQueryResult<T>(overrides: {
  data?: T;
  isLoading?: boolean;
  isError?: boolean;
}) {
  return {
    data:      overrides.data      ?? undefined,
    isLoading: overrides.isLoading ?? false,
    isError:   overrides.isError   ?? false,
    error:     null,
  };
}

const CONTROL_STATS = {
  todayTotal:     10,
  todayCompleted:  7,
  openOverdue:     2,
  complianceRate: 70,
};

const NC_STATS = {
  total:      25,
  open:        5,
  inProgress:  3,
  closed:     15,
  rejected:    2,
  critical:    1,
};

const RECENT_NCS = [
  {
    id:          'nc-001',
    reference:   'NC-2026-001',
    description: 'Température hors limite au stockage froid',
    status:      'OPEN',
    createdAt:   '2026-01-15T08:00:00Z',
  },
  {
    id:          'nc-002',
    reference:   'NC-2026-002',
    description: 'Défaut hygiène poste de découpe',
    status:      'IN_PROGRESS',
    createdAt:   '2026-01-16T09:30:00Z',
  },
];

// Default empty result for any useQuery call not explicitly mocked.
// The component calls useQuery for: ncChart, complianceChart, activeSchedules,
// zones, DlcAlertWidget, RecentNcControlsWidget — always set a safe fallback.
const EMPTY_QUERY = makeQueryResult({ data: undefined });

/** Sets up useQueries and useQuery with fully-loaded data. */
function setupLoadedMocks() {
  mockUseQueries.mockReturnValue([
    makeQueryResult({ data: CONTROL_STATS }),
    makeQueryResult({ data: NC_STATS }),
    makeQueryResult({ data: RECENT_NCS }),
  ]);
  // Set a safe default for every useQuery call, then override the first two.
  mockUseQuery.mockReturnValue(EMPTY_QUERY);
  mockUseQuery
    .mockReturnValueOnce(makeQueryResult({ data: [] }))   // ncChartQuery (1st)
    .mockReturnValueOnce(makeQueryResult({ data: [] }));  // complianceChartQuery (2nd)
  // 3rd+: activeSchedulesQuery, zonesQuery, DlcAlertWidget, RecentNcControlsWidget → EMPTY_QUERY
}

/** Sets up all hooks to be in the loading state. */
function setupLoadingMocks() {
  mockUseQueries.mockReturnValue([
    makeQueryResult({ isLoading: true }),
    makeQueryResult({ isLoading: true }),
    makeQueryResult({ isLoading: true }),
  ]);
  // All useQuery calls return loading state.
  mockUseQuery.mockReturnValue(makeQueryResult({ isLoading: true }));
}

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. Page structure ─────────────────────────────────────────────────────

  it('renders the page title and subtitle', () => {
    setupLoadedMocks();
    renderDashboard();

    expect(screen.getByText("Vue d'ensemble")).toBeInTheDocument();
    expect(screen.getByText('Tableau de bord HACCP')).toBeInTheDocument();
  });

  // ── 2. KPI cards — loaded data ────────────────────────────────────────────

  it('renders all four KPI card labels', () => {
    setupLoadedMocks();
    renderDashboard();

    expect(screen.getByText('Contrôles du jour')).toBeInTheDocument();
    expect(screen.getByText('Non-conformités ouvertes')).toBeInTheDocument();
    expect(screen.getByText('Tâches en retard')).toBeInTheDocument();
    expect(screen.getByText('Taux de conformité')).toBeInTheDocument();
  });

  it('renders KPI values from control stats', () => {
    setupLoadedMocks();
    renderDashboard();

    // Controls: "7 / 10"
    expect(screen.getByText('7 / 10')).toBeInTheDocument();
    // Compliance rate: "70%"
    expect(screen.getByText('70%')).toBeInTheDocument();
    // Overdue: "2"
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders KPI values from NC stats', () => {
    setupLoadedMocks();
    renderDashboard();

    // Open NCs: "5"
    expect(screen.getByText('5')).toBeInTheDocument();
    // Critical sub-text
    expect(screen.getByText(/dont 1 critique/i)).toBeInTheDocument();
  });

  // ── 3. Loading state ──────────────────────────────────────────────────────

  it('renders animated pulse skeletons while data is loading', () => {
    setupLoadingMocks();
    const { container } = renderDashboard();

    const pulsingElements = container.querySelectorAll('.animate-pulse');
    expect(pulsingElements.length).toBeGreaterThan(0);
  });

  it('renders skeleton placeholders (not values) for KPI cards while loading', () => {
    setupLoadingMocks();
    const { container } = renderDashboard();

    // KpiCard shows an animate-pulse skeleton instead of the value when loading=true
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
  });

  // ── 4. Charts render ──────────────────────────────────────────────────────

  it('renders the NC monthly bar chart section', () => {
    setupLoadedMocks();
    renderDashboard();

    expect(screen.getByText('Non-conformités par mois')).toBeInTheDocument();
    expect(screen.getAllByTestId('responsive-container').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the compliance rate line chart section', () => {
    setupLoadedMocks();
    renderDashboard();

    expect(screen.getByText(/taux de conformité/i)).toBeInTheDocument();
  });

  // ── 5. Recent NCs table ───────────────────────────────────────────────────

  it('renders recent NC rows with reference and description', () => {
    setupLoadedMocks();
    renderDashboard();

    expect(screen.getByText('NC-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Température hors limite au stockage froid')).toBeInTheDocument();
    expect(screen.getByText('NC-2026-002')).toBeInTheDocument();
  });

  it('renders correct French status labels for NCs', () => {
    setupLoadedMocks();
    renderDashboard();

    expect(screen.getByText('Ouverte')).toBeInTheDocument();
    expect(screen.getByText('En cours')).toBeInTheDocument();
  });

  // ── 6. Empty state ────────────────────────────────────────────────────────

  it('renders the empty-state message when there are no open NCs', () => {
    mockUseQueries.mockReturnValue([
      makeQueryResult({ data: CONTROL_STATS }),
      makeQueryResult({ data: NC_STATS }),
      makeQueryResult({ data: [] }),   // empty recent NCs
    ]);
    mockUseQuery.mockReturnValue(EMPTY_QUERY);
    mockUseQuery
      .mockReturnValueOnce(makeQueryResult({ data: [] }))
      .mockReturnValueOnce(makeQueryResult({ data: [] }));

    renderDashboard();

    // The noOpenNc key renders the empty-state text (emoji stripped in regex)
    expect(screen.getByText(/aucune non-conformité ouverte/i)).toBeInTheDocument();
  });
});
