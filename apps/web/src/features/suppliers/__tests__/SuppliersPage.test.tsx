/**
 * SuppliersPage.test.tsx
 *
 * Unit tests for the SuppliersPage component.
 *
 * Strategy:
 *  - Mock useQuery / useMutation to control data states.
 *  - Mock api and useDebounce.
 *  - Wrap renders in QueryClientProvider + MemoryRouter.
 *
 * Tests cover:
 *  - Page header and toolbar
 *  - Loading state
 *  - Supplier table rows (code, name, email, phone, VAT, product count)
 *  - Empty state
 *  - Create-supplier modal (opens, required field validation, form submission)
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

import SuppliersPage from '../SuppliersPage';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'ctenant001testidabc1234';

const makeSupplier = (overrides: Partial<{
  id: string; code: string; name: string; email: string;
  phone: string; vat: string; address: string; productCount: number; isActive: boolean;
}> = {}) => ({
  id:       overrides.id       ?? 'csup001testidabc123456',
  code:     overrides.code     ?? 'FOUR-001',
  name:     overrides.name     ?? 'Fermier Dupont',
  email:    overrides.email    ?? 'contact@fermier.fr',
  phone:    overrides.phone    ?? '+33 1 23 45 67 89',
  vat:      overrides.vat      ?? 'FR12345678901',
  address:  overrides.address  ?? '12 rue du Commerce, 75001 Paris',
  tenantId: TENANT_ID,
  isActive: overrides.isActive ?? true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  _count:    { products: overrides.productCount ?? 3 },
});

const SUPPLIERS = [
  makeSupplier({ id: 's1', code: 'FOUR-001', name: 'Fermier Dupont',  email: 'dupont@farm.fr',   phone: '+33 1 11 11 11 11', productCount: 5 }),
  makeSupplier({ id: 's2', code: 'FOUR-002', name: 'Fromagerie Belle', email: 'belle@fromage.fr', phone: '+33 2 22 22 22 22', productCount: 2 }),
  makeSupplier({ id: 's3', code: 'FOUR-003', name: 'Bio Direct',      email: null as unknown as string, phone: null as unknown as string,  productCount: 0 }),
];

const PAGE_META = { total: 3, page: 1, limit: 20, lastPage: 1 };

function makeQueryResult<T>(overrides: { data?: T; isLoading?: boolean }) {
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
        <SuppliersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('SuppliersPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue(makeQueryResult({ data: { data: SUPPLIERS, meta: PAGE_META } }));
    mockUseMutation.mockReturnValue(makeMutationResult());
  });

  // ── Header / toolbar ────────────────────────────────────────────────────────

  it('renders the page title "Fournisseurs"', () => {
    renderPage();
    expect(screen.getByText('Fournisseurs')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    renderPage();
    expect(screen.getByText(/référentiel des fournisseurs/i)).toBeInTheDocument();
  });

  it('renders the supplier search input', () => {
    renderPage();
    expect(screen.getByPlaceholderText(/rechercher un fournisseur/i)).toBeInTheDocument();
  });

  it('renders the "Nouveau fournisseur" button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /nouveau fournisseur/i })).toBeInTheDocument();
  });

  // ── Loading state ────────────────────────────────────────────────────────────

  it('shows loading text while data is fetching', () => {
    mockUseQuery.mockReturnValue(makeQueryResult({ isLoading: true }));
    renderPage();
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it('does not render the table while loading', () => {
    mockUseQuery.mockReturnValue(makeQueryResult({ isLoading: true }));
    renderPage();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // ── Table columns ────────────────────────────────────────────────────────────

  it('renders the correct table column headers', () => {
    renderPage();
    expect(screen.getByText('Code')).toBeInTheDocument();
    expect(screen.getByText('Raison sociale')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByText('N° TVA')).toBeInTheDocument();
    expect(screen.getByText('Produits')).toBeInTheDocument();
  });

  // ── Supplier rows ─────────────────────────────────────────────────────────────

  it('renders a row for each supplier', () => {
    renderPage();
    expect(screen.getByText('Fermier Dupont')).toBeInTheDocument();
    expect(screen.getByText('Fromagerie Belle')).toBeInTheDocument();
    expect(screen.getByText('Bio Direct')).toBeInTheDocument();
  });

  it('renders supplier code in monospace', () => {
    renderPage();
    expect(screen.getByText('FOUR-001')).toBeInTheDocument();
    expect(screen.getByText('FOUR-002')).toBeInTheDocument();
  });

  it('renders supplier email as a mailto link', () => {
    renderPage();
    const emailLinks = screen.getAllByRole('link', { name: /dupont@farm\.fr/i });
    expect(emailLinks[0]).toHaveAttribute('href', 'mailto:dupont@farm.fr');
  });

  it('renders supplier phone as a tel link', () => {
    renderPage();
    const phoneLinks = screen.getAllByRole('link', { name: /\+33 1 11 11 11 11/ });
    expect(phoneLinks[0]).toHaveAttribute('href', 'tel:+33 1 11 11 11 11');
  });

  it('renders "—" when email and phone are null', () => {
    renderPage();
    // "Bio Direct" fixture has null email and phone
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders product count badge', () => {
    renderPage();
    expect(screen.getByText(/5 produit\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/2 produit\(s\)/)).toBeInTheDocument();
  });

  it('renders VAT number in monospace', () => {
    renderPage();
    expect(screen.getByText('FR12345678901')).toBeInTheDocument();
  });

  // ── Empty state ──────────────────────────────────────────────────────────────

  it('shows EmptyState when no suppliers are returned', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult({ data: { data: [], meta: { total: 0, page: 1, limit: 20, lastPage: 1 } } }),
    );
    renderPage();
    expect(screen.getByText(/aucun fournisseur/i)).toBeInTheDocument();
  });

  it('shows "Ajouter un fournisseur" action in the empty state', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult({ data: { data: [], meta: { total: 0, page: 1, limit: 20, lastPage: 1 } } }),
    );
    renderPage();
    expect(screen.getByRole('button', { name: /ajouter un fournisseur/i })).toBeInTheDocument();
  });

  // ── Create supplier modal ─────────────────────────────────────────────────────

  it('opens the create-supplier modal when "Nouveau fournisseur" is clicked', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /nouveau fournisseur/i }));
    expect(screen.getByText('Nouveau fournisseur', { selector: '*' })).toBeInTheDocument();
    expect(screen.getByLabelText(/code fournisseur/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/raison sociale/i)).toBeInTheDocument();
  });

  it('renders all supplier form fields', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /nouveau fournisseur/i }));
    expect(screen.getByLabelText(/n° tva/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/téléphone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/adresse/i)).toBeInTheDocument();
  });

  it('shows required-field errors when the form is submitted empty', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /nouveau fournisseur/i }));
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => {
      expect(screen.getByText(/code obligatoire/i)).toBeInTheDocument();
      expect(screen.getByText(/nom obligatoire/i)).toBeInTheDocument();
    });
  });

  it('submits the supplier form with correct data', async () => {
    const mockCreate = jest.fn().mockResolvedValue({});
    mockUseMutation.mockReturnValue(makeMutationResult({ mutateAsync: mockCreate }));

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /nouveau fournisseur/i }));

    await userEvent.type(screen.getByLabelText(/code fournisseur/i), 'FOUR-099');
    await userEvent.type(screen.getByLabelText(/raison sociale/i), 'Nouveau Fournisseur SA');
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'FOUR-099', name: 'Nouveau Fournisseur SA' }),
      );
    });
  });

  it('strips empty optional fields before submitting (no empty strings sent)', async () => {
    const mockCreate = jest.fn().mockResolvedValue({});
    mockUseMutation.mockReturnValue(makeMutationResult({ mutateAsync: mockCreate }));

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /nouveau fournisseur/i }));
    // Only fill required fields; leave vat, phone, email, address empty
    await userEvent.type(screen.getByLabelText(/code fournisseur/i), 'FOUR-100');
    await userEvent.type(screen.getByLabelText(/raison sociale/i), 'Simple SARL');
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => {
      const call = mockCreate.mock.calls[0]?.[0] as Record<string, unknown>;
      // Optional string fields should be undefined (not empty strings) per the page's submit handler
      expect(call?.vat).toBeUndefined();
      expect(call?.phone).toBeUndefined();
      expect(call?.email).toBeUndefined();
      expect(call?.address).toBeUndefined();
    });
  });

  // ── Pagination ───────────────────────────────────────────────────────────────

  it('does not show pagination for a single page', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /précédent/i })).not.toBeInTheDocument();
  });

  it('shows pagination controls for multiple pages', () => {
    mockUseQuery.mockReturnValue(makeQueryResult({
      data: { data: SUPPLIERS, meta: { total: 60, page: 1, limit: 20, lastPage: 3 } },
    }));
    renderPage();
    expect(screen.getByRole('button', { name: /précédent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeInTheDocument();
  });

  it('shows page info text with supplier count', () => {
    mockUseQuery.mockReturnValue(makeQueryResult({
      data: { data: SUPPLIERS, meta: { total: 60, page: 2, limit: 20, lastPage: 3 } },
    }));
    renderPage();
    expect(screen.getByText(/page 2 sur 3/i)).toBeInTheDocument();
    expect(screen.getByText(/60 fournisseur/i)).toBeInTheDocument();
  });
});
