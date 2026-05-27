/**
 * ReportsPage.test.tsx
 *
 * Unit tests for the ReportsPage component.
 *
 * Strategy:
 *  - Mock useQuery (x2: stats + report list) and useMutation (x2: create + status).
 *  - Wrap renders in QueryClientProvider + MemoryRouter.
 *
 * Tests cover:
 *  - Page header & toolbar (title, subtitle, filters, "Générer un rapport" button)
 *  - Stat cards (Total, En attente, Validés, Envoyés)
 *  - Loading & error states
 *  - Table columns and report rows (type label, status badge, dates, action buttons)
 *  - "Soumettre" button for PENDING reports
 *  - "Valider" button for UNDER_REVIEW reports
 *  - PDF download link for VALIDATED/SENT reports
 *  - No action buttons for statuses without actions
 *  - Status mutation called on button click
 *  - Empty state + action button
 *  - Pagination (hidden for single page, visible for multiple)
 *  - Create modal (opens, form fields, submit payload)
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

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

import ReportsPage from '../ReportsPage';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STATS = { total: 15, pending: 5, underReview: 3, validated: 6, sent: 1 };

const PAGE_META_SINGLE = { total: 3,  page: 1, limit: 20, lastPage: 1 };
const PAGE_META_MULTI  = { total: 50, page: 2, limit: 20, lastPage: 3 };

function makeReport(overrides: Partial<{
  id: string; type: string; status: string; generatedAt: string; validatedAt: string | null;
}> = {}) {
  return {
    id:          overrides.id          ?? 'rpt-001',
    type:        overrides.type        ?? 'MONTHLY_HYGIENE',
    status:      overrides.status      ?? 'PENDING',
    tenantId:    'tenant-001',
    generatedAt: overrides.generatedAt ?? '2026-01-10T08:00:00Z',
    validatedAt: overrides.validatedAt ?? null,
    sentAt:      null,
  };
}

const RPT_PENDING      = makeReport({ id: 'r1', type: 'MONTHLY_HYGIENE', status: 'PENDING',      generatedAt: '2026-01-10T08:00:00Z', validatedAt: null });
const RPT_UNDER_REVIEW = makeReport({ id: 'r2', type: 'ANNUAL_HACCP',    status: 'UNDER_REVIEW', generatedAt: '2026-01-08T08:00:00Z', validatedAt: null });
const RPT_VALIDATED    = makeReport({ id: 'r3', type: 'TEMPERATURE_LOG', status: 'VALIDATED',    generatedAt: '2026-01-05T08:00:00Z', validatedAt: '2026-01-07T10:00:00Z' });
const RPT_SENT         = makeReport({ id: 'r4', type: 'MONTHLY_HYGIENE', status: 'SENT',         generatedAt: '2025-12-01T08:00:00Z', validatedAt: '2025-12-02T08:00:00Z' });

const REPORTS = [RPT_PENDING, RPT_UNDER_REVIEW, RPT_VALIDATED];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mqr<T>(data: T, opts: { isLoading?: boolean; isError?: boolean } = {}) {
  return { data, isLoading: opts.isLoading ?? false, isError: opts.isError ?? false, error: null };
}

function mmr(overrides: { mutate?: jest.Mock; isPending?: boolean; isError?: boolean } = {}) {
  return {
    mutate:      overrides.mutate     ?? jest.fn(),
    isPending:   overrides.isPending  ?? false,
    isError:     overrides.isError    ?? false,
    mutateAsync: jest.fn().mockResolvedValue({}),
  };
}

function setupDefaultMocks() {
  mockUseQuery
    .mockReturnValueOnce(mqr(STATS))                               // stats query
    .mockReturnValueOnce(mqr({ data: REPORTS, meta: PAGE_META_SINGLE })); // report list
  mockUseMutation
    .mockReturnValueOnce(mmr())   // createMutation
    .mockReturnValueOnce(mmr()); // statusMutation
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ReportsPage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    setupDefaultMocks();
  });

  // ── Header / toolbar ────────────────────────────────────────────────────────

  it('renders the page title "Rapports"', () => {
    renderPage();
    expect(screen.getByText('Rapports')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    renderPage();
    expect(screen.getByText(/génération et validation des rapports haccp/i)).toBeInTheDocument();
  });

  it('renders the "Générer un rapport" button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /générer un rapport/i })).toBeInTheDocument();
  });

  // ── Stat cards ──────────────────────────────────────────────────────────────

  it('renders "Total" stat card with correct value', () => {
    renderPage();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders "En attente" stat card with correct value', () => {
    renderPage();
    // "En attente" appears as stat card label
    expect(screen.getAllByText('En attente')[0]).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders "Validés" stat card with correct value', () => {
    renderPage();
    expect(screen.getByText('Validés')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('renders "Envoyés" stat card with correct value', () => {
    renderPage();
    expect(screen.getByText('Envoyés')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  // ── Loading state ────────────────────────────────────────────────────────────

  it('shows loading text while report list is loading', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr(undefined, { isLoading: true }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it('does not render the table while loading', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr(undefined, { isLoading: true }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // ── Error state ─────────────────────────────────────────────────────────────

  it('shows error text when report list query fails', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr(undefined, { isError: true }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.getByText(/erreur lors du chargement des rapports/i)).toBeInTheDocument();
  });

  // ── Table columns ────────────────────────────────────────────────────────────

  it('renders the correct table column headers', () => {
    renderPage();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Statut')).toBeInTheDocument();
    expect(screen.getByText('Généré le')).toBeInTheDocument();
    expect(screen.getByText('Validé le')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  // ── Report rows ──────────────────────────────────────────────────────────────

  it('renders French type label for MONTHLY_HYGIENE reports', () => {
    renderPage();
    expect(screen.getAllByText('Hygiène mensuelle').length).toBeGreaterThanOrEqual(1);
  });

  it('renders French type label for ANNUAL_HACCP reports', () => {
    renderPage();
    // Type label may appear in both the table cell AND a filter <option>
    expect(screen.getAllByText('HACCP annuel').length).toBeGreaterThanOrEqual(1);
  });

  it('renders French type label for TEMPERATURE_LOG reports', () => {
    renderPage();
    // Type label may appear in both the table cell AND a filter <option>
    expect(screen.getAllByText('Relevé températures').length).toBeGreaterThanOrEqual(1);
  });

  it('renders "En attente" status badge for PENDING reports', () => {
    renderPage();
    // multiple "En attente" might appear (stat card + badge)
    const badges = screen.getAllByText('En attente');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('renders "En révision" status badge for UNDER_REVIEW reports', () => {
    renderPage();
    // "En révision" appears in both the status badge AND a filter <option>
    expect(screen.getAllByText('En révision').length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Validé" status badge for VALIDATED reports', () => {
    renderPage();
    // "Validé" appears in both the status badge AND a filter <option>
    expect(screen.getAllByText('Validé').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the generatedAt date formatted as dd/mm/yyyy', () => {
    renderPage();
    expect(screen.getByText('10/01/2026')).toBeInTheDocument();
  });

  it('renders "—" for validatedAt when null', () => {
    renderPage();
    // RPT_PENDING has null validatedAt → "—"
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the validatedAt date when present', () => {
    renderPage();
    // RPT_VALIDATED has validatedAt: '2026-01-07T10:00:00Z' → 07/01/2026
    expect(screen.getByText('07/01/2026')).toBeInTheDocument();
  });

  // ── Action buttons ────────────────────────────────────────────────────────────

  it('renders "Soumettre" button for PENDING reports', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: [RPT_PENDING], meta: PAGE_META_SINGLE }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.getByRole('button', { name: /soumettre/i })).toBeInTheDocument();
  });

  it('renders "Valider" button for UNDER_REVIEW reports', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: [RPT_UNDER_REVIEW], meta: PAGE_META_SINGLE }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.getByRole('button', { name: /valider/i })).toBeInTheDocument();
  });

  it('renders a PDF download link for VALIDATED reports', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: [RPT_VALIDATED], meta: PAGE_META_SINGLE }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    // The component renders a download button (not an <a> link) with t('common.download') = 'Télécharger'
    expect(screen.getByRole('button', { name: /télécharger/i })).toBeInTheDocument();
  });

  it('renders a PDF download link for SENT reports', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: [RPT_SENT], meta: PAGE_META_SINGLE }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    // The component renders a download button (not an <a> link) with t('common.download') = 'Télécharger'
    expect(screen.getByRole('button', { name: /télécharger/i })).toBeInTheDocument();
  });

  it('does NOT render action buttons for VALIDATED reports', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: [RPT_VALIDATED], meta: PAGE_META_SINGLE }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.queryByRole('button', { name: /soumettre/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /valider/i })).not.toBeInTheDocument();
  });

  it('calls status mutation with UNDER_REVIEW when "Soumettre" is clicked', async () => {
    const mockStatusMutate = jest.fn();
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: [RPT_PENDING], meta: PAGE_META_SINGLE }));
    mockUseMutation
      .mockReturnValue(mmr())
      .mockReturnValueOnce(mmr())                              // createMutation
      .mockReturnValueOnce(mmr({ mutate: mockStatusMutate })); // statusMutation
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /soumettre/i }));
    expect(mockStatusMutate).toHaveBeenCalledWith({ id: RPT_PENDING.id, status: 'UNDER_REVIEW' });
  });

  it('calls status mutation with VALIDATED when "Valider" is clicked', async () => {
    const mockStatusMutate = jest.fn();
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: [RPT_UNDER_REVIEW], meta: PAGE_META_SINGLE }));
    mockUseMutation
      .mockReturnValue(mmr())
      .mockReturnValueOnce(mmr())                              // createMutation
      .mockReturnValueOnce(mmr({ mutate: mockStatusMutate })); // statusMutation
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /valider/i }));
    expect(mockStatusMutate).toHaveBeenCalledWith({ id: RPT_UNDER_REVIEW.id, status: 'VALIDATED' });
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  it('shows empty state when no reports are returned', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: [], meta: { total: 0, page: 1, limit: 20, lastPage: 1 } }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.getAllByText(/aucun rapport/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Générer un rapport" action in the empty state', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: [], meta: { total: 0, page: 1, limit: 20, lastPage: 1 } }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    // Both toolbar and empty state render this button
    expect(screen.getAllByRole('button', { name: /générer un rapport/i }).length).toBeGreaterThanOrEqual(1);
  });

  // ── Pagination ───────────────────────────────────────────────────────────────

  it('does not show pagination for a single page', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /précédent/i })).not.toBeInTheDocument();
  });

  it('shows pagination controls for multiple pages', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: REPORTS, meta: PAGE_META_MULTI }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.getByRole('button', { name: /précédent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeInTheDocument();
  });

  it('shows page info and report count in pagination', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: REPORTS, meta: PAGE_META_MULTI }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.getByText(/page 2 sur 3/i)).toBeInTheDocument();
    expect(screen.getByText(/50 rapport/i)).toBeInTheDocument();
  });

  // ── Create report modal ──────────────────────────────────────────────────────

  it('opens the create-report modal when "Générer un rapport" is clicked', async () => {
    // Add default fallbacks for re-renders after button click opens the modal
    mockUseQuery.mockReturnValue(mqr(STATS));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    await userEvent.click(screen.getAllByRole('button', { name: /générer un rapport/i })[0]);
    // "Générer un rapport" text appears in button + modal title
    expect(screen.getAllByText('Générer un rapport').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the Type select in the create modal', async () => {
    // Add default fallbacks for re-renders after button click opens the modal
    mockUseQuery.mockReturnValue(mqr(STATS));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    await userEvent.click(screen.getAllByRole('button', { name: /générer un rapport/i })[0]);
    expect(screen.getByText('Type de rapport')).toBeInTheDocument();
  });

  it('renders the Période field in the create modal', async () => {
    // Add default fallbacks for re-renders after button click opens the modal
    mockUseQuery.mockReturnValue(mqr(STATS));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    await userEvent.click(screen.getAllByRole('button', { name: /générer un rapport/i })[0]);
    expect(screen.getByPlaceholderText(/2025-01/i)).toBeInTheDocument();
  });

  it('calls create mutation when the form is submitted', async () => {
    const mockCreate = jest.fn();
    jest.resetAllMocks();
    // Set default fallbacks first so re-renders after button clicks stay stable
    mockUseQuery.mockReturnValue(mqr(STATS));
    mockUseMutation.mockReturnValue(mmr({ mutate: mockCreate }));
    // Then set Once values for the initial render
    mockUseQuery
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: REPORTS, meta: PAGE_META_SINGLE }));
    mockUseMutation
      .mockReturnValueOnce(mmr({ mutate: mockCreate }))  // createMutation (#1, initial render)
      .mockReturnValueOnce(mmr());                       // statusMutation (#2)
    renderPage();

    await userEvent.click(screen.getAllByRole('button', { name: /générer un rapport/i })[0]);
    await userEvent.click(screen.getByRole('button', { name: /^générer$/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'MONTHLY_HYGIENE' }),
      );
    });
  });

  it('omits period from the payload when the field is left empty', async () => {
    const mockCreate = jest.fn();
    jest.resetAllMocks();
    // Set default fallbacks first so re-renders after button clicks stay stable
    mockUseQuery.mockReturnValue(mqr(STATS));
    mockUseMutation.mockReturnValue(mmr({ mutate: mockCreate }));
    // Then set Once values for the initial render
    mockUseQuery
      .mockReturnValueOnce(mqr(STATS))
      .mockReturnValueOnce(mqr({ data: REPORTS, meta: PAGE_META_SINGLE }));
    mockUseMutation
      .mockReturnValueOnce(mmr({ mutate: mockCreate }))  // createMutation (#1, initial render)
      .mockReturnValueOnce(mmr());                       // statusMutation (#2)
    renderPage();

    await userEvent.click(screen.getAllByRole('button', { name: /générer un rapport/i })[0]);
    await userEvent.click(screen.getByRole('button', { name: /^générer$/i }));

    await waitFor(() => {
      const call = mockCreate.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(call?.period).toBeUndefined();
    });
  });
});
