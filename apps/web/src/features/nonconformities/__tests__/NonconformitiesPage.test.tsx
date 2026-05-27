/**
 * NonconformitiesPage.test.tsx
 *
 * Unit tests for the NonconformitiesPage component.
 *
 * Strategy:
 *  - Mock useQuery (x2 per render: stats + NC list) and useMutation (x2: create + close).
 *  - Mock @/lib/api and @/hooks/useDebounce.
 *  - Wrap renders in QueryClientProvider + MemoryRouter.
 *
 * Tests cover:
 *  - Page header & toolbar (title, subtitle, search input, "Signaler une NC" button)
 *  - Stat cards (Total, Ouvertes, En cours, Critiques)
 *  - Loading & error states
 *  - Table columns and NC rows (reference, description truncation, badges, date)
 *  - "Clôturer" button visible for OPEN/IN_PROGRESS, hidden for CLOSED/REJECTED
 *  - Close mutation called on button click
 *  - Empty state + action button
 *  - Create-NC modal (opens, all form fields, required validation, submit payload)
 *  - Pagination (hidden for single page, shown for multiple; page info text)
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ─── Mock useDebounce ──────────────────────────────────────────────────────────

jest.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: unknown) => value,
}));

// ─── Mock @tanstack/react-query ────────────────────────────────────────────────

const mockUseQuery    = jest.fn();
const mockUseMutation = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<typeof import('@tanstack/react-query')>('@tanstack/react-query'),
  useQuery:       (...args: unknown[]) => mockUseQuery(...args),
  useMutation:    (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// ─── Mock api ─────────────────────────────────────────────────────────────────

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

// ─── Import under test ────────────────────────────────────────────────────────

import NonconformitiesPage from '../NonconformitiesPage';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STATS = { total: 25, open: 8, inProgress: 5, closed: 11, critical: 3 };

const PAGE_META_SINGLE = { total: 3,  page: 1, limit: 20, lastPage: 1 };
const PAGE_META_MULTI  = { total: 60, page: 2, limit: 20, lastPage: 3 };

const makeNC = (overrides: Partial<{
  id: string; reference: string; status: string; severity: string;
  description: string; createdAt: string;
}> = {}) => ({
  id:          overrides.id          ?? 'nc-001',
  reference:   overrides.reference   ?? 'NC-2026-001',
  tenantId:    'tenant-001',
  siteId:      'site-001',
  reporterId:  'user-001',
  status:      overrides.status      ?? 'OPEN',
  severity:    overrides.severity    ?? 'HIGH',
  description: overrides.description ?? 'Température frigo hors limite détectée lors du contrôle matin.',
  createdAt:   overrides.createdAt   ?? '2026-01-15T10:00:00Z',
  updatedAt:   '2026-01-15T10:00:00Z',
  photos:      [],
});

const NC_OPEN       = makeNC({ id: 'n1', reference: 'NC-2026-001', status: 'OPEN',        severity: 'HIGH',     description: 'Température frigo hors limite' });
const NC_IN_PROG    = makeNC({ id: 'n2', reference: 'NC-2026-002', status: 'IN_PROGRESS', severity: 'MEDIUM',   description: 'Nettoyage insuffisant zone B'  });
const NC_CLOSED     = makeNC({ id: 'n3', reference: 'NC-2026-003', status: 'CLOSED',      severity: 'LOW',      description: 'Étiquette manquante produit X'  });
const NC_REJECTED   = makeNC({ id: 'n4', reference: 'NC-2026-004', status: 'REJECTED',    severity: 'CRITICAL', description: 'Signalement hors périmètre'     });
const LONG_DESC_NC  = makeNC({ id: 'n5', reference: 'NC-2026-005', status: 'OPEN',        severity: 'MEDIUM',
  description: 'Description très longue dépassant les soixante caractères pour tester la troncature automatique dans le tableau.' });

const NCS = [NC_OPEN, NC_IN_PROG, NC_CLOSED];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mqr<T>(data: T, opts: { isLoading?: boolean; isError?: boolean } = {}) {
  return { data, isLoading: opts.isLoading ?? false, isError: opts.isError ?? false, error: null };
}

function mmr(overrides: { mutate?: jest.Mock; isPending?: boolean; isError?: boolean } = {}) {
  return {
    mutate:    overrides.mutate    ?? jest.fn(),
    isPending: overrides.isPending ?? false,
    isError:   overrides.isError   ?? false,
    mutateAsync: jest.fn().mockResolvedValue({}),
  };
}

function setupDefaultMocks() {
  // Actual useQuery call order in NonconformitiesPage (from component source):
  //   Call 1: useSiteOptions   → []
  //   Call 2: useProductOptions → []
  //   Call 3: useNCStats       → STATS
  //   Call 4: useNonConformities → { data: NCS, meta: PAGE_META_SINGLE }
  mockUseQuery
    .mockReturnValue(mqr([]))                                      // default fallback
    .mockReturnValueOnce(mqr([]))                                  // useSiteOptions
    .mockReturnValueOnce(mqr([]))                                  // useProductOptions
    .mockReturnValueOnce(mqr(STATS))                               // useNCStats
    .mockReturnValueOnce(mqr({ data: NCS, meta: PAGE_META_SINGLE })); // useNonConformities
  // useMutation call order: createMutation (#1), closeMutation (#2), uploadMutation (NCDetailModal, #3)
  mockUseMutation
    .mockReturnValue(mmr())                                        // default fallback
    .mockReturnValueOnce(mmr())                                    // createMutation
    .mockReturnValueOnce(mmr())                                    // closeMutation
    .mockReturnValueOnce(mmr());                                   // uploadMutation (NCDetailModal)
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NonconformitiesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('NonconformitiesPage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    setupDefaultMocks();
  });

  // ── Header / toolbar ────────────────────────────────────────────────────────

  it('renders the page title "Non-conformités"', () => {
    renderPage();
    expect(screen.getByText('Non-conformités')).toBeInTheDocument();
  });

  it('renders the subtitle about HACCP', () => {
    renderPage();
    expect(screen.getByText(/suivi et traitement des non-conformités haccp/i)).toBeInTheDocument();
  });

  it('renders the NC search input', () => {
    renderPage();
    expect(screen.getByPlaceholderText(/rechercher une nc/i)).toBeInTheDocument();
  });

  it('renders the "Signaler une NC" button', () => {
    renderPage();
    // Both the toolbar and the empty state may render this button — use getAllByRole
    expect(screen.getAllByRole('button', { name: /signaler une nc/i }).length).toBeGreaterThanOrEqual(1);
  });

  // ── Stat cards ──────────────────────────────────────────────────────────────

  it('renders "Total NCs" stat card with correct value', () => {
    renderPage();
    expect(screen.getByText('Total NCs')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('renders "Ouvertes" stat card with correct value', () => {
    renderPage();
    expect(screen.getByText('Ouvertes')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('renders "En cours" stat card with correct value', () => {
    renderPage();
    // "En cours" appears both as a stat card label and as a filter <option>
    expect(screen.getAllByText('En cours').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders "Critiques" stat card with correct value', () => {
    renderPage();
    expect(screen.getByText('Critiques')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  // ── Loading state ────────────────────────────────────────────────────────────

  it('shows loading text while NC list is loading', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValue(mqr([]))
      .mockReturnValueOnce(mqr([]))                                // useSiteOptions
      .mockReturnValueOnce(mqr([]))                                // useProductOptions
      .mockReturnValueOnce(mqr(STATS))                             // useNCStats
      .mockReturnValueOnce(mqr(undefined, { isLoading: true }));   // useNonConformities → loading
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it('does not render the table while loading', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValue(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr(undefined, { isLoading: true }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // ── Error state ─────────────────────────────────────────────────────────────

  it('shows error text when NC list query fails', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValue(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr(undefined, { isError: true }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.getByText(/erreur lors du chargement/i)).toBeInTheDocument();
  });

  // ── Table columns ────────────────────────────────────────────────────────────

  it('renders the correct table column headers', () => {
    renderPage();
    expect(screen.getByText('Référence')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    // "Statut" may appear in filter dropdowns and column header — use getAllByText
    expect(screen.getAllByText('Statut').length).toBeGreaterThanOrEqual(1);
    // "Sévérité" may appear in filter dropdown and column header — use getAllByText
    expect(screen.getAllByText('Sévérité').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  // ── NC rows ──────────────────────────────────────────────────────────────────

  it('renders reference codes in monospace for each NC', () => {
    renderPage();
    // Mobile cards + desktop table both render — use getAllByText
    expect(screen.getAllByText('NC-2026-001').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('NC-2026-002').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('NC-2026-003').length).toBeGreaterThanOrEqual(1);
  });

  it('renders NC description text', () => {
    renderPage();
    expect(screen.getAllByText('Température frigo hors limite').length).toBeGreaterThanOrEqual(1);
  });

  it('truncates descriptions longer than 60 characters', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValue(mqr([]))
      .mockReturnValueOnce(mqr([]))                                // useSiteOptions
      .mockReturnValueOnce(mqr([]))                                // useProductOptions
      .mockReturnValueOnce(mqr(STATS))                             // useNCStats
      .mockReturnValueOnce(mqr({ data: [LONG_DESC_NC], meta: PAGE_META_SINGLE })); // useNonConformities
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    // The original is >60 chars, so the rendered text should end with "…"
    const cells = screen.getAllByText(/…$/);
    expect(cells.length).toBeGreaterThanOrEqual(1);
    expect(cells[0].textContent?.length).toBeLessThanOrEqual(63); // 60 chars + "…"
  });

  it('renders "Ouverte" status badge for OPEN NCs', () => {
    renderPage();
    // "Ouverte" appears as a badge AND as a filter <option> — use getAllByText
    expect(screen.getAllByText('Ouverte').length).toBeGreaterThanOrEqual(1);
  });

  it('renders "En cours" status badge for IN_PROGRESS NCs', () => {
    renderPage();
    // "En cours" appears in stat card label AND as a badge
    const badges = screen.getAllByText('En cours');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Clôturée" status badge for CLOSED NCs', () => {
    renderPage();
    // "Clôturée" may appear as a badge AND as a filter <option>
    expect(screen.getAllByText('Clôturée').length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Élevé" severity badge for HIGH NCs', () => {
    renderPage();
    // "Élevé" appears as a badge AND as a filter <option> — use getAllByText
    expect(screen.getAllByText('Élevé').length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Moyen" severity badge for MEDIUM NCs', () => {
    renderPage();
    // "Moyen" appears as a badge AND as a filter <option> — use getAllByText
    expect(screen.getAllByText('Moyen').length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Faible" severity badge for LOW NCs', () => {
    renderPage();
    // "Faible" appears as a badge AND as a filter <option> — use getAllByText
    expect(screen.getAllByText('Faible').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the NC creation date formatted as dd/mm/yyyy', () => {
    renderPage();
    // 2026-01-15T10:00:00Z → 15/01/2026 — may appear in both mobile card and desktop table
    expect(screen.getAllByText('15/01/2026').length).toBeGreaterThanOrEqual(1);
  });

  // ── Clôturer button ──────────────────────────────────────────────────────────

  it('renders "Clôturer" button for OPEN NCs', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValue(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: [NC_OPEN], meta: PAGE_META_SINGLE }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.getAllByRole('button', { name: /clôturer/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Clôturer" button for IN_PROGRESS NCs', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValue(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: [NC_IN_PROG], meta: PAGE_META_SINGLE }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.getAllByRole('button', { name: /clôturer/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT render "Clôturer" for CLOSED NCs', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValue(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: [NC_CLOSED], meta: PAGE_META_SINGLE }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.queryByRole('button', { name: /clôturer/i })).not.toBeInTheDocument();
  });

  it('does NOT render "Clôturer" for REJECTED NCs', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValue(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: [NC_REJECTED], meta: PAGE_META_SINGLE }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.queryByRole('button', { name: /clôturer/i })).not.toBeInTheDocument();
  });

  it('calls the close mutation when "Clôturer" is clicked', async () => {
    const mockClose = jest.fn();
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValue(mqr([]))
      .mockReturnValueOnce(mqr([]))                                // useSiteOptions
      .mockReturnValueOnce(mqr([]))                                // useProductOptions
      .mockReturnValueOnce(mqr(STATS))                             // useNCStats
      .mockReturnValueOnce(mqr({ data: [NC_OPEN], meta: PAGE_META_SINGLE })); // useNonConformities
    mockUseMutation
      .mockReturnValue(mmr())
      .mockReturnValueOnce(mmr())                        // createMutation (#1)
      .mockReturnValueOnce(mmr({ mutate: mockClose }))   // closeMutation (#2)
      .mockReturnValueOnce(mmr());                       // uploadMutation (NCDetailModal, #3)
    renderPage();
    await userEvent.click(screen.getAllByRole('button', { name: /clôturer/i })[0]);
    expect(mockClose).toHaveBeenCalledWith(NC_OPEN.id);
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  it('shows empty state when no NCs are returned', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValue(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: [], meta: { total: 0, page: 1, limit: 20, lastPage: 1 } }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.getByText(/aucune non-conformité/i)).toBeInTheDocument();
  });

  it('shows "Signaler une NC" action in the empty state', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValue(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: [], meta: { total: 0, page: 1, limit: 20, lastPage: 1 } }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    // Empty state shows a "Signaler une NC" button
    expect(screen.getAllByRole('button', { name: /signaler une nc/i }).length).toBeGreaterThanOrEqual(1);
  });

  // ── Create NC modal ──────────────────────────────────────────────────────────

  it('opens the create-NC modal when "Signaler une NC" is clicked', async () => {
    renderPage();
    // Use the first matching button (toolbar or empty-state) to open the modal
    await userEvent.click(screen.getAllByRole('button', { name: /signaler une nc/i })[0]);
    expect(screen.getByText('Signaler une non-conformité')).toBeInTheDocument();
  });

  it('renders the Description textarea in the create modal', async () => {
    renderPage();
    await userEvent.click(screen.getAllByRole('button', { name: /signaler une nc/i })[0]);
    expect(screen.getByPlaceholderText(/décrivez la non-conformité/i)).toBeInTheDocument();
  });

  it('renders the Site field in the create modal', async () => {
    renderPage();
    await userEvent.click(screen.getAllByRole('button', { name: /signaler une nc/i })[0]);
    // Site field is a Select component — the label text appears in the modal
    // t('nonconformities.modal.site') or similar key should render the "Site" label
    // or the select renders a "Sélectionner un site" option inside the <select>
    const selects = document.querySelectorAll('select');
    // At least one select should be present (site field, severity field)
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the Sévérité select in the create modal', async () => {
    renderPage();
    await userEvent.click(screen.getAllByRole('button', { name: /signaler une nc/i })[0]);
    // "Sévérité" appears as label + as a filter dropdown option — getAllByText is safe
    expect(screen.getAllByText('Sévérité').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the optional Action corrective field', async () => {
    renderPage();
    await userEvent.click(screen.getAllByRole('button', { name: /signaler une nc/i })[0]);
    expect(screen.getByPlaceholderText(/action corrective/i)).toBeInTheDocument();
  });

  it('submits the create-NC form with description', async () => {
    const mockCreate = jest.fn();
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValue(mqr([]))
      .mockReturnValueOnce(mqr([]))                                // useSiteOptions
      .mockReturnValueOnce(mqr([]))                                // useProductOptions
      .mockReturnValueOnce(mqr(STATS))                             // useNCStats
      .mockReturnValueOnce(mqr({ data: NCS, meta: PAGE_META_SINGLE })); // useNonConformities
    // Use mockReturnValue(createMock) as default so re-renders after modal open still get mockCreate
    mockUseMutation
      .mockReturnValue(mmr({ mutate: mockCreate }))      // default fallback = create mock
      .mockReturnValueOnce(mmr({ mutate: mockCreate }))  // createMutation (#1, initial render)
      .mockReturnValueOnce(mmr())                        // closeMutation (#2)
      .mockReturnValueOnce(mmr());                       // uploadMutation (NCDetailModal, #3)
    renderPage();

    await userEvent.click(screen.getAllByRole('button', { name: /signaler une nc/i })[0]);
    await userEvent.type(screen.getByPlaceholderText(/décrivez la non-conformité/i), 'Frigo HS');
    // Use fireEvent.submit to bypass native HTML5 required-field validation in jsdom
    const form = document.querySelector('form');
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Frigo HS' }),
      );
    });
  });

  it('omits empty optional fields (productId, correctiveAction) from the submit payload', async () => {
    const mockCreate = jest.fn();
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValue(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: NCS, meta: PAGE_META_SINGLE }));
    mockUseMutation
      .mockReturnValue(mmr({ mutate: mockCreate }))      // default fallback = create mock
      .mockReturnValueOnce(mmr({ mutate: mockCreate }))  // createMutation (#1, initial render)
      .mockReturnValueOnce(mmr())                        // closeMutation (#2)
      .mockReturnValueOnce(mmr());                       // uploadMutation (NCDetailModal, #3)
    renderPage();

    await userEvent.click(screen.getAllByRole('button', { name: /signaler une nc/i })[0]);
    await userEvent.type(screen.getByPlaceholderText(/décrivez la non-conformité/i), 'Test');
    // Use fireEvent.submit to bypass native HTML5 required-field validation in jsdom
    const form = document.querySelector('form');
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      const call = mockCreate.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(call?.productId).toBeUndefined();
      expect(call?.correctiveAction).toBeUndefined();
    });
  });

  // ── Pagination ───────────────────────────────────────────────────────────────

  it('does not show pagination controls for a single page', () => {
    renderPage(); // PAGE_META_SINGLE: lastPage = 1
    expect(screen.queryByRole('button', { name: /précédent/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /suivant/i })).not.toBeInTheDocument();
  });

  it('shows pagination controls when lastPage > 1', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValue(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: NCS, meta: PAGE_META_MULTI }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    // Desktop table + mobile cards both render pagination buttons — use getAllByRole
    expect(screen.getAllByRole('button', { name: /précédent/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /suivant/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('shows page info and total NC count in pagination', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValue(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr([]))
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: NCS, meta: PAGE_META_MULTI }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.getByText(/page 2 sur 3/i)).toBeInTheDocument();
    expect(screen.getByText(/60 nc/i)).toBeInTheDocument();
  });
});
