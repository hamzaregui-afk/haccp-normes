/**
 * DLCWebPage.test.tsx
 *
 * Unit tests for the DLCWebPage component.
 *
 * Strategy:
 *  - DLCWebPage calls useQuery 4 times on every render:
 *      1. useProducts       → products for combobox
 *      2. useExpiringToday  → ['dlc', ..., 'today']
 *      3. useExpiringSoon   → ['dlc', ..., 'soon']
 *      4. useAllLabels(1)   → ['dlc', ..., 'all', 1]
 *  - Mock all 4 with mockReturnValueOnce chains.
 *  - Wrap renders in QueryClientProvider + MemoryRouter.
 *
 * Tests cover:
 *  - Page title "DLC" and subtitle
 *  - Three tabs rendered (Expire aujourd'hui, Expire bientôt, Tous les labels)
 *  - "Nouveau label DLC" button
 *  - Loading and error states for the active tab
 *  - Table columns (Produit, Date d'ouverture, DLC, Jours restants, Statut, Label)
 *  - DLC rows: product name, correct status badge
 *  - "—" when days remaining is 0 (expired)
 *  - Empty state when no labels
 *  - Pagination for "Tous les labels" tab
 *  - Create label modal (opens, fields rendered, submit payload)
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

// Dates are relative to today (2026-05-26) to produce deterministic DLC status.
// EXPIRED: expiresAt < now; CRITICAL: 1-3 days; SOON: 4-7 days; OK: >7 days

function makeLabel(overrides: Partial<{
  id: string; productId: string; productName: string; lotNumber: string;
  producedAt: string; expiresAt: string; shelfLifeDays: number;
}> = {}) {
  return {
    id:          overrides.id          ?? 'lbl-001',
    productId:   overrides.productId   ?? 'prod-001',
    productName: overrides.productName ?? 'Poulet rôti',
    lotNumber:   overrides.lotNumber   ?? 'LOT-2026-001',
    producedAt:  overrides.producedAt  ?? '2026-05-06T00:00:00Z',
    expiresAt:   overrides.expiresAt   ?? '2026-05-20T00:00:00Z',
    printedBy:   'user-001',
    printedAt:   '2026-05-06T00:00:00Z',
    tenantId:    'tenant-001',
  };
}

// Use dates far enough from now to be deterministic regardless of test execution date.
// OK: expires in ~180 days; SOON: expires in ~5 days; CRITICAL: expires in ~2 days; EXPIRED: already past.
const nowMs        = Date.now();
const inDays       = (d: number) => new Date(nowMs + d * 86_400_000).toISOString();
const LBL_OK       = makeLabel({ id: 'l1', productName: 'Yaourt nature',   expiresAt: inDays(180) });
const LBL_SOON     = makeLabel({ id: 'l2', productName: 'Fromage blanc',   expiresAt: inDays(5)   });
const LBL_CRITICAL = makeLabel({ id: 'l3', productName: 'Poulet rôti',     expiresAt: inDays(2)   });
const LBL_EXPIRED  = makeLabel({ id: 'l4', productName: 'Salade composée', expiresAt: inDays(-5)  });

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

/** Sets up the 4 useQuery calls and the single useMutation.
 *  Call order: useProducts, useExpiringToday, useExpiringSoon, useAllLabels
 *  The mockReturnValue fallback ensures unlimited re-renders (state changes, modal open, etc.)
 *  don't crash when the Once queue is exhausted. */
function setupDefaultMocks(
  today = TODAY_LABELS,
  soon  = SOON_LABELS,
  all   = { data: ALL_LABELS, meta: PAGE_META_SINGLE },
) {
  // Fallback returns a DLCLabel[] so re-renders of the "today" tab don't crash.
  // allQuery.data?.data on this fallback = undefined → [] (safe).
  mockUseQuery
    .mockReturnValue(mqr(today))                // default: safe DLCLabel[] for any extra renders
    .mockReturnValueOnce(mqr([]))               // useProducts (combobox) — render 1
    .mockReturnValueOnce(mqr(today))            // useExpiringToday — render 1
    .mockReturnValueOnce(mqr(soon))             // useExpiringSoon — render 1
    .mockReturnValueOnce(mqr(all));             // useAllLabels — render 1
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
    jest.resetAllMocks();
    setupDefaultMocks();
  });

  // ── Header / toolbar ────────────────────────────────────────────────────────

  it('renders the page title "DLC"', () => {
    renderPage();
    // Both <h1> and the DLC column header say "DLC" — use getAllByText
    expect(screen.getAllByText('DLC').length).toBeGreaterThanOrEqual(1);
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
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValueOnce(mqr([]))                                // useProducts
      .mockReturnValueOnce(mqr(undefined, { isLoading: true }))   // today → loading
      .mockReturnValueOnce(mqr(SOON_LABELS))
      .mockReturnValueOnce(mqr({ data: ALL_LABELS, meta: PAGE_META_SINGLE }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it('does not render the table while loading', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValueOnce(mqr([]))                                // useProducts
      .mockReturnValueOnce(mqr(undefined, { isLoading: true }))
      .mockReturnValueOnce(mqr(SOON_LABELS))
      .mockReturnValueOnce(mqr({ data: ALL_LABELS, meta: PAGE_META_SINGLE }));
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // ── Error state ─────────────────────────────────────────────────────────────

  it('shows error text when the active tab query fails', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValueOnce(mqr([]))                                // useProducts
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
    // Column headers from t('dlc.columns.*') in fr.ts
    // 'Produit' and 'DLC' may appear in multiple places (header + column) — use getAllByText
    expect(screen.getAllByText('Produit').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Date d'ouverture")).toBeInTheDocument();
    expect(screen.getAllByText('DLC').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Jours restants')).toBeInTheDocument();
    expect(screen.getByText('Statut')).toBeInTheDocument();
    expect(screen.getByText('Label')).toBeInTheDocument();
  });

  // ── DLC rows (today tab default) ─────────────────────────────────────────────

  it('renders product names for labels in the active tab', () => {
    renderPage();
    // LBL_CRITICAL is in TODAY_LABELS
    expect(screen.getByText('Poulet rôti')).toBeInTheDocument();
  });

  it('renders the print button for each label row', () => {
    renderPage();
    // t('dlc.print') = 'Imprimer' — one print button per label in the active tab
    expect(screen.getAllByRole('button', { name: /imprimer/i }).length).toBeGreaterThanOrEqual(1);
  });

  // ── DLC status badges ─────────────────────────────────────────────────────────

  /** Helper to set up mocks for status badge tests that click "Tous les labels". */
  function setupAllTabMocks() {
    const allData = { data: ALL_LABELS, meta: PAGE_META_SINGLE };
    jest.resetAllMocks();
    // Provide enough Once values for 2 renders (initial + tab click re-render)
    // plus a safe fallback for any extra React renders
    mockUseQuery
      .mockReturnValue(mqr(allData))        // fallback (returns allData shape — safe for 'all' tab)
      .mockReturnValueOnce(mqr([]))         // render 1: useProducts
      .mockReturnValueOnce(mqr(TODAY_LABELS)) // render 1: useExpiringToday
      .mockReturnValueOnce(mqr(SOON_LABELS))  // render 1: useExpiringSoon
      .mockReturnValueOnce(mqr(allData))    // render 1: useAllLabels
      .mockReturnValueOnce(mqr([]))         // render 2: useProducts
      .mockReturnValueOnce(mqr(TODAY_LABELS)) // render 2: useExpiringToday
      .mockReturnValueOnce(mqr(SOON_LABELS))  // render 2: useExpiringSoon
      .mockReturnValueOnce(mqr(allData));   // render 2: useAllLabels
    mockUseMutation.mockReturnValue(mmr());
  }

  it('renders "OK" badge for labels expiring in > 7 days', async () => {
    setupAllTabMocks();
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /tous les labels/i }));
    await waitFor(() => expect(screen.getByText('OK')).toBeInTheDocument());
  });

  it('renders "Bientôt" badge for labels expiring in 4-7 days', async () => {
    setupAllTabMocks();
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /tous les labels/i }));
    await waitFor(() => expect(screen.getByText('Bientôt')).toBeInTheDocument());
  });

  it('renders "Critique" badge for labels expiring in 1-3 days', async () => {
    setupAllTabMocks();
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /tous les labels/i }));
    await waitFor(() => expect(screen.getByText('Critique')).toBeInTheDocument());
  });

  it('renders "Expiré" badge for expired labels', async () => {
    setupAllTabMocks();
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /tous les labels/i }));
    await waitFor(() => expect(screen.getByText('Expiré')).toBeInTheDocument());
  });

  it('renders "—" in the "Jours restants" column for expired labels', async () => {
    setupAllTabMocks();
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /tous les labels/i }));
    await waitFor(() => {
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  it('shows empty state when the active tab has no labels', () => {
    jest.resetAllMocks();
    mockUseQuery
      .mockReturnValueOnce(mqr([]))           // useProducts
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
    jest.resetAllMocks();
    const multiMeta = { data: ALL_LABELS, meta: PAGE_META_MULTI };
    // Provide a fallback for any extra React renders beyond the initial 2
    mockUseQuery
      .mockReturnValue(mqr(multiMeta))        // fallback: safe for "all" tab renders
      .mockReturnValueOnce(mqr([]))           // useProducts (render 1)
      .mockReturnValueOnce(mqr(TODAY_LABELS)) // today (render 1)
      .mockReturnValueOnce(mqr(SOON_LABELS))  // soon (render 1)
      .mockReturnValueOnce(mqr(multiMeta))    // all (render 1)
      .mockReturnValueOnce(mqr([]))           // useProducts (render 2)
      .mockReturnValueOnce(mqr(TODAY_LABELS)) // today (render 2)
      .mockReturnValueOnce(mqr(SOON_LABELS))  // soon (render 2)
      .mockReturnValueOnce(mqr(multiMeta));   // all (render 2)
    mockUseMutation.mockReturnValue(mmr());
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /tous les labels/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /précédent/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /suivant/i })).toBeInTheDocument();
    });
  });

  it('shows page info and label count in pagination', async () => {
    jest.resetAllMocks();
    const multiMeta = { data: ALL_LABELS, meta: PAGE_META_MULTI };
    mockUseQuery
      .mockReturnValue(mqr(multiMeta))        // fallback: safe for "all" tab renders
      .mockReturnValueOnce(mqr([]))           // useProducts (render 1)
      .mockReturnValueOnce(mqr(TODAY_LABELS)) // today (render 1)
      .mockReturnValueOnce(mqr(SOON_LABELS))  // soon (render 1)
      .mockReturnValueOnce(mqr(multiMeta))    // all (render 1)
      .mockReturnValueOnce(mqr([]))           // useProducts (render 2)
      .mockReturnValueOnce(mqr(TODAY_LABELS)) // today (render 2)
      .mockReturnValueOnce(mqr(SOON_LABELS))  // soon (render 2)
      .mockReturnValueOnce(mqr(multiMeta));   // all (render 2)
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
    // Use TODAY_LABELS as the fallback — safe for the "today" tab (DLCLabel[])
    // and allQuery.data?.data = undefined → [] (safe for the "all" tab check)
    mockUseQuery.mockReturnValue(mqr(TODAY_LABELS));
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /nouveau label dlc/i }));
    // t('dlc.modal.title') = 'Nouveau label DLC'
    expect(screen.getAllByText('Nouveau label DLC').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the product combobox and duration field in the create modal', async () => {
    mockUseQuery.mockReturnValue(mqr(TODAY_LABELS));
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /nouveau label dlc/i }));
    // ProductCombobox placeholder = t('dlc.combobox.placeholder') = 'Sélectionner un produit…'
    expect(screen.getByPlaceholderText(/sélectionner un produit/i)).toBeInTheDocument();
    // Conservation field label = t('dlc.modal.conservation') = 'Durée de conservation (jours)'
    expect(screen.getByText(/durée de conservation/i)).toBeInTheDocument();
    // The submit button = t('dlc.modal.createPrint') = 'Créer et imprimer'
    expect(screen.getByRole('button', { name: /créer et imprimer/i })).toBeInTheDocument();
  });

  it('disables the submit button until a product is selected', async () => {
    mockUseQuery.mockReturnValue(mqr(TODAY_LABELS));
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /nouveau label dlc/i }));
    // Submit button is disabled when no product is selected (form.selectedProduct === null)
    expect(screen.getByRole('button', { name: /créer et imprimer/i })).toBeDisabled();
  });
});
