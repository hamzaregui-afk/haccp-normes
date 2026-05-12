/**
 * ProductsPage.test.tsx
 *
 * Unit tests for the ProductsPage component.
 *
 * Strategy:
 *  - Mock `@tanstack/react-query` useQuery / useMutation.
 *  - Mock `@/lib/api` to prevent real HTTP.
 *  - Mock `@/hooks/useDebounce` to return values immediately.
 *  - Wrap renders in QueryClientProvider + MemoryRouter.
 *
 * Tests cover:
 *  - Page header and toolbar
 *  - Loading state
 *  - Product table rows (code, name, category, supplier, DLC, temperature)
 *  - Empty state
 *  - Create-product modal (opens, fields rendered, form submission)
 *  - Pagination controls
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
  api: { get: jest.fn(), post: jest.fn() },
}));

// ─── Import under test ────────────────────────────────────────────────────────

import ProductsPage from '../ProductsPage';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'ctenant001testidabc1234';

const makeProduct = (overrides: Partial<{
  id: string; code: string; name: string; category: string;
  supplierId: string; dlcDays: number; tempStorage: number; isActive: boolean;
}> = {}) => ({
  id:          overrides.id          ?? 'cprod001testidabc123456',
  code:        overrides.code        ?? 'PROD-001',
  name:        overrides.name        ?? 'Filet de bœuf',
  category:    overrides.category    ?? 'Viande',
  packaging:   null,
  dlcDays:     overrides.dlcDays     ?? 5,
  tempStorage: overrides.tempStorage ?? 4,
  supplierId:  overrides.supplierId  ?? null,
  supplier:    null,
  tenantId:    TENANT_ID,
  isActive:    overrides.isActive    ?? true,
  createdAt:   '2026-01-01T00:00:00Z',
  updatedAt:   '2026-01-01T00:00:00Z',
});

const PRODUCTS = [
  makeProduct({ id: 'p1', code: 'PROD-001', name: 'Filet de bœuf',   category: 'Viande',         dlcDays: 5, tempStorage: 4 }),
  makeProduct({ id: 'p2', code: 'LAIT-001', name: 'Lait entier',      category: 'Produits laitiers', dlcDays: 7, tempStorage: 6 }),
  makeProduct({ id: 'p3', code: 'TOMT-001', name: 'Tomates bio', category: 'Légumes',         dlcDays: 3, tempStorage: 10 }),
];

const PAGE_META = { total: 3, page: 1, limit: 20, lastPage: 1 };

function makeQueryResult<T>(overrides: { data?: T; isLoading?: boolean; isError?: boolean }) {
  return { data: overrides.data, isLoading: overrides.isLoading ?? false, isError: false, error: null };
}

function makeMutationResult(overrides: { isPending?: boolean; mutateAsync?: jest.Mock } = {}) {
  return {
    isPending:   overrides.isPending   ?? false,
    mutateAsync: overrides.mutateAsync ?? jest.fn().mockResolvedValue({}),
    isError:     false,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ProductsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // First call: product list query; subsequent calls: suppliers-select inside ProductForm
    mockUseQuery
      .mockReturnValueOnce(makeQueryResult({ data: { data: PRODUCTS, meta: PAGE_META } }))
      .mockReturnValue(makeQueryResult({ data: [] })); // suppliers for select
    mockUseMutation.mockReturnValue(makeMutationResult());
  });

  // ── Header / toolbar ────────────────────────────────────────────────────────

  it('renders the page title "Produits"', () => {
    renderPage();
    expect(screen.getByText('Produits')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    renderPage();
    expect(screen.getByText(/catalogue des produits/i)).toBeInTheDocument();
  });

  it('renders the product search input', () => {
    renderPage();
    expect(screen.getByPlaceholderText(/rechercher un produit/i)).toBeInTheDocument();
  });

  it('renders the "Nouveau produit" button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /nouveau produit/i })).toBeInTheDocument();
  });

  // ── Loading state ────────────────────────────────────────────────────────────

  it('shows loading text while data is fetching', () => {
    mockUseQuery.mockReturnValue(makeQueryResult({ isLoading: true }));
    mockUseMutation.mockReturnValue(makeMutationResult());
    renderPage();
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it('does not render the table while loading', () => {
    mockUseQuery.mockReturnValue(makeQueryResult({ isLoading: true }));
    mockUseMutation.mockReturnValue(makeMutationResult());
    renderPage();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // ── Table columns ────────────────────────────────────────────────────────────

  it('renders the correct table column headers', () => {
    renderPage();
    expect(screen.getByText('Code')).toBeInTheDocument();
    expect(screen.getByText('Produit')).toBeInTheDocument();
    expect(screen.getByText('Catégorie')).toBeInTheDocument();
    expect(screen.getByText('Fournisseur')).toBeInTheDocument();
    expect(screen.getByText('DLC')).toBeInTheDocument();
    expect(screen.getByText('Stockage')).toBeInTheDocument();
  });

  // ── Product rows ─────────────────────────────────────────────────────────────

  it('renders a row for each product', () => {
    renderPage();
    expect(screen.getByText('Filet de bœuf')).toBeInTheDocument();
    expect(screen.getByText('Lait entier')).toBeInTheDocument();
    expect(screen.getByText('Tomates bio')).toBeInTheDocument();
  });

  it('renders product code as a monospace badge', () => {
    renderPage();
    expect(screen.getByText('PROD-001')).toBeInTheDocument();
    expect(screen.getByText('LAIT-001')).toBeInTheDocument();
  });

  it('renders product category as a badge', () => {
    renderPage();
    expect(screen.getByText('Viande')).toBeInTheDocument();
    expect(screen.getByText('Produits laitiers')).toBeInTheDocument();
    expect(screen.getByText('Légumes')).toBeInTheDocument();
  });

  it('renders DLC days with "j" suffix', () => {
    renderPage();
    expect(screen.getByText(/5j/)).toBeInTheDocument();
    expect(screen.getByText(/7j/)).toBeInTheDocument();
  });

  it('renders "—" when supplier is null', () => {
    renderPage();
    // All fixture products have null supplier
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders supplier name when present', () => {
    mockUseQuery
      .mockReturnValueOnce(makeQueryResult({
        data: {
          data: [{
            ...makeProduct({ id: 'p1' }),
            supplier: { id: 'sup-1', name: 'Fermier Dupont', code: 'FOUR-01' },
          }],
          meta: PAGE_META,
        },
      }))
      .mockReturnValue(makeQueryResult({ data: [] }));

    renderPage();
    expect(screen.getByText('Fermier Dupont')).toBeInTheDocument();
  });

  // ── Empty state ──────────────────────────────────────────────────────────────

  it('shows EmptyState when no products are returned', () => {
    mockUseQuery
      .mockReturnValueOnce(makeQueryResult({ data: { data: [], meta: { total: 0, page: 1, limit: 20, lastPage: 1 } } }))
      .mockReturnValue(makeQueryResult({ data: [] }));
    mockUseMutation.mockReturnValue(makeMutationResult());
    renderPage();
    expect(screen.getByText(/aucun produit/i)).toBeInTheDocument();
  });

  it('shows "Créer un produit" action in the empty state', () => {
    mockUseQuery
      .mockReturnValueOnce(makeQueryResult({ data: { data: [], meta: { total: 0, page: 1, limit: 20, lastPage: 1 } } }))
      .mockReturnValue(makeQueryResult({ data: [] }));
    mockUseMutation.mockReturnValue(makeMutationResult());
    renderPage();
    expect(screen.getByRole('button', { name: /créer un produit/i })).toBeInTheDocument();
  });

  // ── Create modal ─────────────────────────────────────────────────────────────

  it('opens the create-product modal when "Nouveau produit" is clicked', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /nouveau produit/i }));
    // Modal title
    expect(screen.getByText('Nouveau produit', { selector: '*' })).toBeInTheDocument();
    // Form fields
    expect(screen.getByLabelText(/code produit/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nom du produit/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/catégorie/i)).toBeInTheDocument();
  });

  it('submits the product form with the correct data', async () => {
    const mockCreate = jest.fn().mockResolvedValue({});
    mockUseMutation.mockReturnValue(makeMutationResult({ mutateAsync: mockCreate }));

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /nouveau produit/i }));

    await userEvent.type(screen.getByLabelText(/code produit/i), 'NEW-001');
    await userEvent.type(screen.getByLabelText(/nom du produit/i), 'Fromage AOP');
    await userEvent.type(screen.getByLabelText(/catégorie/i), 'Produits laitiers');
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'NEW-001', name: 'Fromage AOP', category: 'Produits laitiers' }),
      );
    });
  });

  it('shows required field errors when the form is submitted empty', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /nouveau produit/i }));
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => {
      expect(screen.getByText(/code obligatoire/i)).toBeInTheDocument();
    });
  });

  // ── Pagination ───────────────────────────────────────────────────────────────

  it('does not show pagination for a single page', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /précédent/i })).not.toBeInTheDocument();
  });

  it('shows pagination controls for multiple pages', () => {
    mockUseQuery
      .mockReturnValueOnce(makeQueryResult({
        data: { data: PRODUCTS, meta: { total: 60, page: 1, limit: 20, lastPage: 3 } },
      }))
      .mockReturnValue(makeQueryResult({ data: [] }));
    mockUseMutation.mockReturnValue(makeMutationResult());

    renderPage();
    expect(screen.getByRole('button', { name: /précédent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeInTheDocument();
  });

  it('shows page info text', () => {
    mockUseQuery
      .mockReturnValueOnce(makeQueryResult({
        data: { data: PRODUCTS, meta: { total: 60, page: 2, limit: 20, lastPage: 3 } },
      }))
      .mockReturnValue(makeQueryResult({ data: [] }));
    mockUseMutation.mockReturnValue(makeMutationResult());

    renderPage();
    expect(screen.getByText(/page 2 sur 3/i)).toBeInTheDocument();
  });
});
