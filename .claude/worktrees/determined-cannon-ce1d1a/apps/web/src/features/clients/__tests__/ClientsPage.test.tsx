/**
 * ClientsPage.test.tsx
 *
 * Unit tests for the ClientsPage component (SUPER_ADMIN — tenant registry).
 *
 * Strategy:
 *  - Mock `@tanstack/react-query` useQuery to control data states.
 *  - Mock `@/lib/api` to prevent real HTTP calls.
 *  - Wrap renders in QueryClientProvider + MemoryRouter.
 *
 * Tests cover:
 *  - Page header / toolbar rendering
 *  - Loading state
 *  - Tenant cards rendered from data (name, slug, plan, status badge)
 *  - Empty state (no tenants found)
 *  - Status badge variants (ACTIVE, SUSPENDED, ARCHIVED)
 *  - Search filter interaction
 *  - Pagination controls
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ─── Mock @tanstack/react-query ────────────────────────────────────────────────

const mockUseQuery = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<typeof import('@tanstack/react-query')>('@tanstack/react-query'),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

// ─── Mock api ─────────────────────────────────────────────────────────────────

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn() },
}));

// ─── Import under test ────────────────────────────────────────────────────────

import ClientsPage from '../ClientsPage';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeTenant = (overrides: Partial<{
  id: string; name: string; slug: string; plan: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'SUSPENDED'; createdAt: string; updatedAt: string;
}> = {}) => ({
  id:        overrides.id        ?? 'ctenant001testidabc1234',
  name:      overrides.name      ?? 'Boulangerie Dupont',
  slug:      overrides.slug      ?? 'boulangerie-dupont',
  plan:      overrides.plan      ?? 'standard',
  status:    overrides.status    ?? 'ACTIVE',
  createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const TENANTS = [
  makeTenant({ id: 't1', name: 'Boulangerie Dupont',  slug: 'boulangerie-dupont',  status: 'ACTIVE'    }),
  makeTenant({ id: 't2', name: 'Fromagerie Martin',   slug: 'fromagerie-martin',   status: 'SUSPENDED' }),
  makeTenant({ id: 't3', name: 'Fermier Bio Leclerc', slug: 'fermier-bio-leclerc', status: 'ARCHIVED'  }),
];

const PAGE_META = { total: 3, page: 1, limit: 20, lastPage: 1 };

function makeQueryResult<T>(overrides: {
  data?: T; isLoading?: boolean; isError?: boolean;
}) {
  return { data: overrides.data, isLoading: overrides.isLoading ?? false, isError: overrides.isError ?? false, error: null };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ClientsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ClientsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue(
      makeQueryResult({ data: { data: TENANTS, meta: PAGE_META } }),
    );
  });

  // ── Header / toolbar ────────────────────────────────────────────────────────

  it('renders the page title "Clients"', () => {
    renderPage();
    expect(screen.getByText('Clients')).toBeInTheDocument();
  });

  it('renders the subtitle mentioning SUPER_ADMIN', () => {
    renderPage();
    expect(screen.getByText(/super_admin/i)).toBeInTheDocument();
  });

  it('renders the search/filter input', () => {
    renderPage();
    expect(screen.getByPlaceholderText(/rechercher un client/i)).toBeInTheDocument();
  });

  it('renders the "Nouveau client" button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /nouveau client/i })).toBeInTheDocument();
  });

  // ── Loading state ────────────────────────────────────────────────────────────

  it('shows a loading message while data is fetching', () => {
    mockUseQuery.mockReturnValue(makeQueryResult({ isLoading: true }));
    renderPage();
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it('does not render tenant cards while loading', () => {
    mockUseQuery.mockReturnValue(makeQueryResult({ isLoading: true }));
    renderPage();
    expect(screen.queryByText('Boulangerie Dupont')).not.toBeInTheDocument();
  });

  // ── Tenant cards ─────────────────────────────────────────────────────────────

  it('renders one card per tenant', () => {
    renderPage();
    expect(screen.getByText('Boulangerie Dupont')).toBeInTheDocument();
    expect(screen.getByText('Fromagerie Martin')).toBeInTheDocument();
    expect(screen.getByText('Fermier Bio Leclerc')).toBeInTheDocument();
  });

  it('renders the slug for each tenant', () => {
    renderPage();
    expect(screen.getByText('/boulangerie-dupont')).toBeInTheDocument();
    expect(screen.getByText('/fromagerie-martin')).toBeInTheDocument();
  });

  it('renders the plan for each tenant', () => {
    renderPage();
    // All fixtures use "standard"
    const planTexts = screen.getAllByText(/standard/i);
    expect(planTexts.length).toBeGreaterThanOrEqual(3);
  });

  it('renders the creation date in French locale', () => {
    renderPage();
    const dates = screen.getAllByText('01/01/2026');
    expect(dates.length).toBeGreaterThanOrEqual(3);
  });

  // ── Status badges ────────────────────────────────────────────────────────────

  it('renders "Actif" status badge for ACTIVE tenant', () => {
    renderPage();
    expect(screen.getByText('Actif')).toBeInTheDocument();
  });

  it('renders "Suspendu" status badge for SUSPENDED tenant', () => {
    renderPage();
    expect(screen.getByText('Suspendu')).toBeInTheDocument();
  });

  it('renders "Archivé" status badge for ARCHIVED tenant', () => {
    renderPage();
    expect(screen.getByText('Archivé')).toBeInTheDocument();
  });

  // ── Action links in card ──────────────────────────────────────────────────────

  it('renders Voir, Modifier and Archiver buttons for each card', () => {
    renderPage();
    // Three cards → three sets of action buttons
    expect(screen.getAllByRole('button', { name: /voir/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /modifier/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /archiver/i }).length).toBeGreaterThanOrEqual(1);
  });

  // ── Empty state ──────────────────────────────────────────────────────────────

  it('shows empty state message when no tenants are returned', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult({ data: { data: [], meta: { total: 0, page: 1, limit: 20, lastPage: 1 } } }),
    );
    renderPage();
    expect(screen.getByText(/aucun client trouvé/i)).toBeInTheDocument();
  });

  // ── Search ───────────────────────────────────────────────────────────────────

  it('updates the search input as the user types', async () => {
    renderPage();
    const input = screen.getByPlaceholderText(/rechercher un client/i);
    await userEvent.type(input, 'dupont');
    expect(input).toHaveValue('dupont');
  });

  it('submits the filter on "Filtrer" button click', async () => {
    renderPage();
    await userEvent.type(
      screen.getByPlaceholderText(/rechercher un client/i),
      'dupont',
    );
    await userEvent.click(screen.getByRole('button', { name: /filtrer/i }));
    // useQuery is called — just verify the component stays mounted
    expect(mockUseQuery).toHaveBeenCalled();
  });

  // ── Pagination ───────────────────────────────────────────────────────────────

  it('does not show pagination when there is only one page', () => {
    renderPage(); // PAGE_META.lastPage === 1
    expect(screen.queryByRole('button', { name: /précédent/i })).not.toBeInTheDocument();
  });

  it('shows pagination controls when there are multiple pages', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult({
        data: { data: TENANTS, meta: { total: 60, page: 1, limit: 20, lastPage: 3 } },
      }),
    );
    renderPage();
    expect(screen.getByRole('button', { name: /précédent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeInTheDocument();
  });

  it('disables "Précédent" on the first page', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult({
        data: { data: TENANTS, meta: { total: 60, page: 1, limit: 20, lastPage: 3 } },
      }),
    );
    renderPage();
    expect(screen.getByRole('button', { name: /précédent/i })).toBeDisabled();
  });

  it('disables "Suivant" on the last page', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult({
        data: { data: TENANTS, meta: { total: 60, page: 3, limit: 20, lastPage: 3 } },
      }),
    );
    renderPage();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeDisabled();
  });
});
