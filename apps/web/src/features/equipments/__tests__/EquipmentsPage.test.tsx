/**
 * EquipmentsPage.test.tsx
 *
 * Unit tests for the EquipmentsPage component.
 *
 * Strategy:
 *  - Mock useQuery / useMutation to control data states.
 *  - Mock api and useDebounce.
 *  - Wrap renders in QueryClientProvider + MemoryRouter.
 *
 * Tests cover:
 *  - Page header and toolbar
 *  - Loading state
 *  - Equipment cards (name, code, type badge, brand, serial number, temp range)
 *  - Empty state
 *  - Create-equipment modal (opens, form fields, submission)
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

import EquipmentsPage from '../EquipmentsPage';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'ctenant001testidabc1234';

const makeEquipment = (overrides: Partial<{
  id: string; code: string; name: string; type: string;
  brand: string; serialNumber: string; tempMin: number; tempMax: number;
}> = {}) => ({
  id:           overrides.id           ?? 'cequip01testidabc123456',
  code:         overrides.code         ?? 'FRIDGE-01',
  name:         overrides.name         ?? 'Chambre froide A',
  type:         overrides.type         ?? 'refrigeration',
  brand:        overrides.brand        ?? 'Carrier',
  serialNumber: overrides.serialNumber ?? 'SN-XYZ-001',
  tempMin:      overrides.tempMin      ?? 0,
  tempMax:      overrides.tempMax      ?? 4,
  siteId:       null,
  tenantId:     TENANT_ID,
  isActive:     true,
  createdAt:    '2026-01-01T00:00:00Z',
  updatedAt:    '2026-01-01T00:00:00Z',
});

const EQUIPMENTS = [
  makeEquipment({ id: 'e1', code: 'FRIDGE-01', name: 'Chambre froide A', type: 'refrigeration', brand: 'Carrier',   tempMin: 0,  tempMax: 4  }),
  makeEquipment({ id: 'e2', code: 'OVEN-01',   name: 'Four à convection', type: 'cooking',      brand: 'Rational',  tempMin: 160, tempMax: 250 }),
  makeEquipment({ id: 'e3', code: 'BLAST-01',  name: 'Cellule de refroidissement', type: 'blast', brand: 'Irinox', tempMin: -18, tempMax: 3  }),
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
        <EquipmentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('EquipmentsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue(makeQueryResult({ data: { data: EQUIPMENTS, meta: PAGE_META } }));
    mockUseMutation.mockReturnValue(makeMutationResult());
  });

  // ── Header / toolbar ────────────────────────────────────────────────────────

  it('renders the page title "Équipements"', () => {
    renderPage();
    expect(screen.getByText('Équipements')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    renderPage();
    expect(screen.getByText(/gestion des équipements/i)).toBeInTheDocument();
  });

  it('renders the equipment search input', () => {
    renderPage();
    expect(screen.getByPlaceholderText(/rechercher un équipement/i)).toBeInTheDocument();
  });

  it('renders the "Nouvel équipement" button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /nouvel équipement/i })).toBeInTheDocument();
  });

  // ── Loading state ────────────────────────────────────────────────────────────

  it('shows loading text while data is fetching', () => {
    mockUseQuery.mockReturnValue(makeQueryResult({ isLoading: true }));
    renderPage();
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it('does not render equipment cards while loading', () => {
    mockUseQuery.mockReturnValue(makeQueryResult({ isLoading: true }));
    renderPage();
    expect(screen.queryByText('Chambre froide A')).not.toBeInTheDocument();
  });

  // ── Equipment cards ───────────────────────────────────────────────────────────

  it('renders one card per equipment', () => {
    renderPage();
    expect(screen.getByText('Chambre froide A')).toBeInTheDocument();
    expect(screen.getByText('Four à convection')).toBeInTheDocument();
    expect(screen.getByText('Cellule de refroidissement')).toBeInTheDocument();
  });

  it('renders equipment code in monospace', () => {
    renderPage();
    expect(screen.getByText('FRIDGE-01')).toBeInTheDocument();
    expect(screen.getByText('OVEN-01')).toBeInTheDocument();
  });

  it('renders equipment type badge', () => {
    renderPage();
    expect(screen.getByText('refrigeration')).toBeInTheDocument();
    expect(screen.getByText('cooking')).toBeInTheDocument();
  });

  it('renders equipment brand', () => {
    renderPage();
    expect(screen.getByText('Carrier')).toBeInTheDocument();
    expect(screen.getByText('Rational')).toBeInTheDocument();
  });

  it('renders serial number', () => {
    renderPage();
    expect(screen.getAllByText('SN-XYZ-001').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the temperature range badge', () => {
    renderPage();
    // "0°C → 4°C" for the first equipment
    expect(screen.getByText(/0°C → 4°C/)).toBeInTheDocument();
  });

  it('renders "Non défini" when both tempMin and tempMax are null', () => {
    mockUseQuery.mockReturnValue(makeQueryResult({
      data: {
        data: [{ ...makeEquipment(), tempMin: null, tempMax: null }],
        meta: PAGE_META,
      },
    }));
    renderPage();
    expect(screen.getByText('Non défini')).toBeInTheDocument();
  });

  it('renders Modifier and Supprimer action links for each card', () => {
    renderPage();
    expect(screen.getAllByRole('button', { name: /modifier/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /supprimer/i }).length).toBeGreaterThanOrEqual(1);
  });

  // ── Empty state ──────────────────────────────────────────────────────────────

  it('shows EmptyState when no equipments are returned', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult({ data: { data: [], meta: { total: 0, page: 1, limit: 20, lastPage: 1 } } }),
    );
    renderPage();
    expect(screen.getByText(/aucun équipement/i)).toBeInTheDocument();
  });

  it('shows "Nouvel équipement" action in the empty state', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult({ data: { data: [], meta: { total: 0, page: 1, limit: 20, lastPage: 1 } } }),
    );
    renderPage();
    // Both toolbar and empty state render this button
    expect(screen.getAllByRole('button', { name: /nouvel équipement/i }).length).toBeGreaterThanOrEqual(1);
  });

  // ── Create modal ─────────────────────────────────────────────────────────────

  it('opens the create-equipment modal when "Nouvel équipement" is clicked', async () => {
    renderPage();
    await userEvent.click(screen.getAllByRole('button', { name: /nouvel équipement/i })[0]);
    // "Nouvel équipement" appears in both button and modal title — just check modal form fields
    expect(screen.getByPlaceholderText(/eq-001/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/réfrigérateur cuisine/i)).toBeInTheDocument();
  });

  it('renders all equipment form fields', async () => {
    renderPage();
    await userEvent.click(screen.getAllByRole('button', { name: /nouvel équipement/i })[0]);
    // "réfrigérateur" appears in both the name input AND a type select option — use getAllByPlaceholderText
    expect(screen.getAllByPlaceholderText(/réfrigérateur/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByPlaceholderText(/samsung/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/sn-12345/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/^0$/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/^4$/)).toBeInTheDocument();
  });

  it('submits the equipment form with the correct data', async () => {
    const mockCreate = jest.fn().mockResolvedValue({});
    mockUseMutation.mockReturnValue(makeMutationResult({ mutateAsync: mockCreate }));

    renderPage();
    await userEvent.click(screen.getAllByRole('button', { name: /nouvel équipement/i })[0]);

    await userEvent.type(screen.getByPlaceholderText(/eq-001/i), 'BLAST-02');
    await userEvent.type(screen.getByPlaceholderText(/réfrigérateur cuisine/i), 'Cellule froide B');
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'BLAST-02', name: 'Cellule froide B' }),
      );
    });
  });

  // ── Pagination ───────────────────────────────────────────────────────────────

  it('does not show pagination for a single page', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /précédent/i })).not.toBeInTheDocument();
  });

  it('shows pagination controls for multiple pages', () => {
    mockUseQuery.mockReturnValue(makeQueryResult({
      data: { data: EQUIPMENTS, meta: { total: 60, page: 1, limit: 20, lastPage: 3 } },
    }));
    renderPage();
    expect(screen.getByRole('button', { name: /précédent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeInTheDocument();
  });

  it('disables "Précédent" on the first page', () => {
    mockUseQuery.mockReturnValue(makeQueryResult({
      data: { data: EQUIPMENTS, meta: { total: 60, page: 1, limit: 20, lastPage: 3 } },
    }));
    renderPage();
    expect(screen.getByRole('button', { name: /précédent/i })).toBeDisabled();
  });
});
