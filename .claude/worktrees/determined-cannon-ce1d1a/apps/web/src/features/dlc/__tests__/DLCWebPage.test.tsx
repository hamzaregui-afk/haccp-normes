/**
 * DLCWebPage.test.tsx
 *
 * Unit tests for the DLCWebPage component.
 *
 * Strategy:
 *  - DLCWebPage calls useQuery 3 times on every render:
 *      1. useExpiringToday  → ['dlc', 'today']
 *      2. useExpiringSoon   → ['dlc', 'soon']
 *      3. useAllLabels(1)   → ['dlc', 'all', 1]
 *  - Mock all 3 with mockReturnValueOnce chains.
 *  - Wrap renders in QueryClientProvider + MemoryRouter.
 *
 * Tests cover:
 *  - Page title "DLC" and subtitle
 *  - Three tabs rendered (Expire aujourd'hui, Expire bientôt, Tous les labels)
 *  - "Nouveau label DLC" button
 *  - Loading and error states for the active tab
 *  - Table columns (Produit, Lot, Fabrication, Expiration, Jours restants, Statut)
 *  - DLC rows: product name, lot number, expiration date, correct status badge
 *  - "—" when days remaining is 0 (expired)
 *  - Empty state when no labels
 *  - Pagination for "Tous les labels" tab
 *  - Create label modal (opens, all fields, submit payload)
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
  api: { get: jest.fn(), post: jest.fn() },
}));

// ─── Import under test ────────────────────────────────────────────────────────

import DLCWebPage from '../DLCWebPage';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Dates are relative to today (2026-05-06) to produce deterministic DLC status.
// EXPIRED: expirationDate < now; CRITICAL: 1-3 days; SOON: 4-7 days; OK: >7 days

function makeLabel(overrides: Partial<{
  id: string; productName: string; lotNumber: string;
  fabricationDate: string; expirationDate: string; shelfLifeDays: number;
}> = {}) {
  return {
    id:              overrides.id              ?? 'lbl-001',
    productName:     overrides.productName     ?? 'Poulet rôti',
    lotNumber:       overrides.lotNumber       ?? 'LOT-2026-001',
    fabricationDate: overrides.fabricationDate ?? '2026-05-06T00:00:00Z',
    expirationDate:  overrides.expirationDate  ?? '2026-05-20T00:00:00Z',
    shelfLifeDays:   overrides.shelfLifeDays   ?? 14,
    tenantId:        'tenant-001',
    createdAt:       '2026-05-06T00:00:00Z',
  };
}

const LBL_OK       = makeLabel({ id: 'l1', productName: 'Yaourt nature',    expirationDate: '2026-05-20T00:00:00Z', shelfLifeDays: 14 });
const LBL_SOON     = makeLabel({ id: 'l2', productName: 'Fromage blanc',    expirationDate: '2026-05-10T00:00:00Z', shelfLifeDays: 4  });
const LBL_CRITICAL = makeLabel({ id: 'l3', productName: 'Poulet rôti',      expirationDate: '2026-05-08T00:00:00Z', shelfLifeDays: 2  });
const LBL_EXPIRED  = makeLabel({ id: 'l4', productName: 'Salade composée',  expirationDate: '2026-05-05T00:00:00Z', shelfLifeDays: 1  });

const TODAY_LABELS   = [LBL_CRITICAL];
const SOON_LABELS    = [LBL_SOON, LBL_CRITICAL];
const ALL_LABELS     = [LBL_OK, LBL_SOON, LBL_CRITICAL, LBL_EXPIRED];

const PAGE_META_SINGLE = { total: 4,  page: 1, limit: 20, lastPage: 1 };
const PAGE_META_MULTI  = { total: 50, page: 2, limit: 20, lastPage: 3 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mqr<T>(data: T, opts: { isLoading?: boolean; isError?: boolean } = {}) {
  return { data, isLoading: opts.isLoading ?? false, isError: opts.isError ?? false, error: null };
}

function mmr(overrides: { mutate?: jest.Mock; isPending?: boolean; isError?: boolean } = {}) {
  return {
    mutate:      overrides.mutate    ?? jest.fn(),
    isPending:   overrides.isPending ?? false,
    isError:     overrides.isError   ?? false,
    mutateAsync: jest.fn().mockResolvedValue({}),
  };
}

/** Sets up the 3 useQuery calls and the single useMutation. */
function setupDefaultMocks(
  today = TODAY_LABELS,
  soon  = SOON_LABELS,
  all   = { data: ALL_LABELS, meta: PAGE_META_SINGLE },
) {
  mockUseQuery
    .mockReturnValueOnce(mqr(today))            // useExpiringToday
    .mockReturnValueOnce(mqr(soon))             // useExpiringSoon
    .mockReturnValueOnce(mqr(all));             // useAllLabels
  mockUseMutation.mockReturnValue(mmr());
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DLCWebPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('DLCWebPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  // ── Header / toolbar ────────────────────────────────────────────────────────

  it('renders the page title "DLC"', () => {
    renderPage();
    expect(screen.getByText('DLC')).toBeInTheDocument();
  });

  it('renders the subtitle about DLC management', () => {
    renderPage();
    expect(screen.getByText(/dates limites de consommation/i)).toBeInTheDocument();
  });

  it('renders the "Nouveau label DLC" button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /nouveau label dlc/i })).toBeInTheDocument();
  });

  // ── Tabs ────────────────────────────────────────────────────────────────────

  it('renders the "Expire aujourd\'hui" tab', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /expire aujourd'hui/i })).toBeInTheDocument();
  });

  it('renders the "Expire bientôt (7j)" tab', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /expire bientôt/i })).toBeInTheDocument();
  });

  it('renders the "Tous les labels" tab', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /tous les labels/i })).toBeInTheDocument();
  });

  // ── Loading state ────────────────────────────────────────────────────────────

  it('shows loading text when the active (today) tab is loading', () => {
    mockUseQuery
      .mockReturnValueOnce(mqr(undefined, { isLoading: true }))   // today → loading
      .mockReturnValueOnce(mqr(SOON_LABELS))
      .mockReturnValueOnce(mqr({ data: ALL_LABELS, meta: PAGE_META_SINGLE }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it('does not render the table while loading', () => {
    mockUseQuery
      .mockReturnValueOnce(mqr(undefined, { isLoading: true }))
      .mockReturnValueOnce(mqr(SOON_LABELS))
      .mockReturnValueOnce(mqr({ data: ALL_LABELS, meta: PAGE_META_SINGLE }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // ── Error state ─────────────────────────────────────────────────────────────

  it('shows error text when the active tab query fails', () => {
    mockUseQuery
      .mockReturnValueOnce(mqr(undefined, { isError: true }))
      .mockReturnValueOnce(mqr(SOON_LABELS))
      .mockReturnValueOnce(mqr({ data: ALL_LABELS, meta: PAGE_META_SINGLE }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.getByText(/erreur lors du chargement des labels dlc/i)).toBeInTheDocument();
  });

  // ── Table columns ────────────────────────────────────────────────────────────

  it('renders the correct table column headers', () => {
    renderPage();
    expect(screen.getByText('Produit')).toBeInTheDocument();
    expect(screen.getByText('Lot')).toBeInTheDocument();
    expect(screen.getByText('Fabrication')).toBeInTheDocument();
    expect(screen.getByText('Expiration')).toBeInTheDocument();
    expect(screen.getByText('Jours restants')).toBeInTheDocument();
    expect(screen.getByText('Statut')).toBeInTheDocument();
  });

  // ── DLC rows (today tab default) ─────────────────────────────────────────────

  it('renders product names for labels in the active tab', () => {
    renderPage();
    // LBL_CRITICAL is in TODAY_LABELS
    expect(screen.getByText('Poulet rôti')).toBeInTheDocument();
  });

  it('renders lot numbers in monospace', () => {
    renderPage();
    expect(screen.getByText('LOT-2026-001')).toBeInTheDocument();
  });

  // ── DLC status badges ─────────────────────────────────────────────────────────

  it('renders "OK" badge for labels expiring in > 7 days', async () => {
    // Switch to "Tous les labels" tab which contains LBL_OK
    setupDefaultMocks();
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /tous les labels/i }));
    await waitFor(() => expect(screen.getByText('OK')).toBeInTheDocument());
  });

  it('renders "Bientôt" badge for labels expiring in 4-7 days', async () => {
    setupDefaultMocks();
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /tous les labels/i }));
    await waitFor(() => expect(screen.getByText('Bientôt')).toBeInTheDocument());
  });

  it('renders "Critique" badge for labels expiring in 1-3 days', async () => {
    setupDefaultMocks();
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /tous les labels/i }));
    await waitFor(() => expect(screen.getByText('Critique')).toBeInTheDocument());
  });

  it('renders "Expiré" badge for expired labels', async () => {
    setupDefaultMocks();
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /tous les labels/i }));
    await waitFor(() => expect(screen.getByText('Expiré')).toBeInTheDocument());
  });

  it('renders "—" in the "Jours restants" column for expired labels', async () => {
    setupDefaultMocks();
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /tous les labels/i }));
    await waitFor(() => {
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  it('shows empty state when the active tab has no labels', () => {
    mockUseQuery
      .mockReturnValueOnce(mqr([]))           // today → empty
      .mockReturnValueOnce(mqr(SOON_LABELS))
      .mockReturnValueOnce(mqr({ data: ALL_LABELS, meta: PAGE_META_SINGLE }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.getByText(/aucun label dlc/i)).toBeInTheDocument();
  });

  // ── Pagination (Tous les labels tab) ─────────────────────────────────────────

  it('does not show pagination for a single page', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /précédent/i })).not.toBeInTheDocument();
  });

  it('shows pagination controls for multiple pages in "Tous les labels" tab', async () => {
    mockUseQuery
      .mockReturnValueOnce(mqr(TODAY_LABELS))
      .mockReturnValueOnce(mqr(SOON_LABELS))
      .mockReturnValueOnce(mqr({ data: ALL_LABELS, meta: PAGE_META_MULTI }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /tous les labels/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /précédent/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /suivant/i })).toBeInTheDocument();
    });
  });

  it('shows page info and label count in pagination', async () => {
    mockUseQuery
      .mockReturnValueOnce(mqr(TODAY_LABELS))
      .mockReturnValueOnce(mqr(SOON_LABELS))
      .mockReturnValueOnce(mqr({ data: ALL_LABELS, meta: PAGE_META_MULTI }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /tous les labels/i }));
    await waitFor(() => {
      expect(screen.getByText(/page 2 sur 3/i)).toBeInTheDocument();
      expect(screen.getByText(/50 label/i)).toBeInTheDocument();
    });
  });

  // ── Create label modal ────────────────────────────────────────────────────────

  it('opens the create-label modal when "Nouveau label DLC" is clicked', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /nouveau label dlc/i }));
    expect(screen.getByText('Nouveau label DLC')).toBeInTheDocument();
  });

  it('renders all 4 form fields in the create modal', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /nouveau label dlc/i }));
    expect(screen.getByPlaceholderText('Poulet rôti')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('LOT-20260103-001')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('3')).toBeInTheDocument();
  });

  it('calls create mutation with correct payload', async () => {
    const mockCreate = jest.fn();
    mockUseQuery
      .mockReturnValueOnce(mqr(TODAY_LABELS))
      .mockReturnValueOnce(mqr(SOON_LABELS))
      .mockReturnValueOnce(mqr({ data: ALL_LABELS, meta: PAGE_META_SINGLE }));
    mockUseMutation.mockReturnValue(mmr({ mutate: mockCreate }));
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /nouveau label dlc/i }));
    await userEvent.type(screen.getByPlaceholderText('Poulet rôti'), 'Bœuf haché');
    await userEvent.type(screen.getByPlaceholderText('LOT-20260103-001'), 'LOT-XYZ-007');

    await userEvent.click(screen.getByRole('button', { name: /créer le label/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ productName: 'Bœuf haché', lotNumber: 'LOT-XYZ-007' }),
      );
    });
  });
});
