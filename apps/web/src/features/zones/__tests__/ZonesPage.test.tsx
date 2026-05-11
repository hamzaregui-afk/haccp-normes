/**
 * ZonesPage.test.tsx
 *
 * Unit tests for the Sites & Zones management page.
 *
 * Strategy:
 *  - Mock useQuery, useMutation via @tanstack/react-query.
 *  - Mock api, useAuthStore, i18n.
 *
 * Coverage:
 *  - Page title "Sites & Zones"
 *  - Empty state when no sites
 *  - Site card renders with site name and zone count
 *  - Zones listed under each site
 *  - New site modal trigger (ADMIN role shows button)
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUseQuery    = jest.fn();
const mockUseMutation = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<typeof import('@tanstack/react-query')>('@tanstack/react-query'),
  useQuery:    (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}));

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

jest.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (s: { user: { role: string } }) => unknown) =>
    selector({ user: { role: 'ADMIN', sub: 'u1', tenantId: 't1', email: 'admin@test.com' } }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// ─── Import under test ────────────────────────────────────────────────────────

import ZonesPage from '../ZonesPage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ZonesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SITE_WITH_ZONES = {
  id: 's1',
  name: 'Cuisines centrales',
  address: '12 rue des Boulangers',
  tenantId: 't1',
  zones: [
    { id: 'z1', name: 'Réception marchandises', siteId: 's1' },
    { id: 'z2', name: 'Chambre froide positive', siteId: 's1' },
  ],
  _count: { zones: 2 },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ZonesPage', () => {
  beforeEach(() => {
    mockUseMutation.mockReturnValue({
      mutate: jest.fn(),
      mutateAsync: jest.fn(),
      isPending: false,
      isError: false,
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('renders page header', () => {
    mockUseQuery.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderPage();
    expect(screen.getByText('Sites & Zones')).toBeInTheDocument();
  });

  it('shows empty state when no sites', () => {
    mockUseQuery.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderPage();
    expect(screen.getByText(/aucun site/i)).toBeInTheDocument();
  });

  it('renders site card with name', () => {
    mockUseQuery.mockReturnValue({
      data: [SITE_WITH_ZONES],
      isLoading: false,
      isError: false,
    });
    renderPage();
    expect(screen.getByText('Cuisines centrales')).toBeInTheDocument();
  });

  it('renders zones under site', () => {
    mockUseQuery.mockReturnValue({
      data: [SITE_WITH_ZONES],
      isLoading: false,
      isError: false,
    });
    renderPage();
    expect(screen.getByText('Réception marchandises')).toBeInTheDocument();
    expect(screen.getByText('Chambre froide positive')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderPage();
    // During loading the skeleton is shown — site names should not be present
    expect(screen.queryByText('Cuisines centrales')).not.toBeInTheDocument();
  });

  it('shows "Nouveau site" button for ADMIN', () => {
    mockUseQuery.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderPage();
    expect(screen.getByText(/nouveau site/i)).toBeInTheDocument();
  });
});
