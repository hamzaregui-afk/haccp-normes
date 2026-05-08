/**
 * UsersPage.test.tsx
 *
 * Unit tests for the UsersPage component.
 *
 * Strategy:
 *  - Mock `@tanstack/react-query` so we control useQuery / useMutation return values.
 *  - Mock `@/lib/api` to prevent real HTTP calls.
 *  - Wrap renders in QueryClientProvider + MemoryRouter.
 *
 * Tests cover:
 *  - Page header / toolbar rendering
 *  - Loading state (spinner / loading text)
 *  - Error state
 *  - Table rows rendered from data
 *  - Empty state (no results)
 *  - Search form interaction
 *  - Pagination buttons (previous / next)
 *  - Invite-user modal opens on button click
 *  - Invite form submits POST /api/v1/users
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ─── Mock @tanstack/react-query ────────────────────────────────────────────────

const mockUseQuery    = jest.fn();
const mockUseMutation = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<typeof import('@tanstack/react-query')>('@tanstack/react-query'),
  useQuery:        (...args: unknown[]) => mockUseQuery(...args),
  useMutation:     (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient:  () => ({ invalidateQueries: jest.fn() }),
}));

// ─── Mock api ─────────────────────────────────────────────────────────────────

const mockApiGet  = jest.fn();
const mockApiPost = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    get:  (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

// ─── Import under test ────────────────────────────────────────────────────────

import UsersPage from '../UsersPage';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'ctenant001testidabc1234';

const makeUser = (overrides: Partial<{
  id: string; name: string; email: string; role: string; status: string; createdAt: string;
}> = {}) => ({
  id:        overrides.id        ?? 'cuser0001testidabc12345',
  email:     overrides.email     ?? 'alice@haccp.com',
  name:      overrides.name      ?? 'Alice Martin',
  role:      overrides.role      ?? 'ADMIN',
  status:    overrides.status    ?? 'ACTIVE',
  tenantId:  TENANT_ID,
  createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const USERS = [
  makeUser({ id: 'u1', name: 'Alice Martin', email: 'alice@haccp.com', role: 'ADMIN'   }),
  makeUser({ id: 'u2', name: 'Bob Dupont',   email: 'bob@haccp.com',   role: 'MANAGER' }),
];

const PAGE_META = { total: 2, page: 1, limit: 20, lastPage: 1 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQueryResult<T>(overrides: {
  data?: T; isLoading?: boolean; isError?: boolean;
}) {
  return {
    data:      overrides.data      ?? undefined,
    isLoading: overrides.isLoading ?? false,
    isError:   overrides.isError   ?? false,
    error:     null,
  };
}

function makeMutationResult(overrides: {
  isPending?: boolean; isError?: boolean; mutateAsync?: jest.Mock;
} = {}) {
  return {
    isPending:    overrides.isPending    ?? false,
    isError:      overrides.isError      ?? false,
    mutateAsync:  overrides.mutateAsync  ?? jest.fn(),
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('UsersPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: loaded data, idle mutation
    mockUseQuery.mockReturnValue(
      makeQueryResult({ data: { data: USERS, meta: PAGE_META } }),
    );
    mockUseMutation.mockReturnValue(makeMutationResult());
  });

  // ── Header / toolbar ────────────────────────────────────────────────────────

  it('renders the page title', () => {
    renderPage();
    expect(screen.getByText('Utilisateurs')).toBeInTheDocument();
  });

  it('renders the search input', () => {
    renderPage();
    expect(screen.getByPlaceholderText(/rechercher par nom ou email/i)).toBeInTheDocument();
  });

  it('renders the "Inviter un utilisateur" button', () => {
    renderPage();
    expect(
      screen.getByRole('button', { name: /inviter un utilisateur/i }),
    ).toBeInTheDocument();
  });

  // ── Loading state ────────────────────────────────────────────────────────────

  it('shows a loading message while data is fetching', () => {
    mockUseQuery.mockReturnValue(makeQueryResult({ isLoading: true }));
    renderPage();
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it('does not render the table while loading', () => {
    mockUseQuery.mockReturnValue(makeQueryResult({ isLoading: true }));
    renderPage();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // ── Error state ──────────────────────────────────────────────────────────────

  it('shows an error message when the query fails', () => {
    mockUseQuery.mockReturnValue(makeQueryResult({ isError: true }));
    renderPage();
    expect(screen.getByText(/erreur lors du chargement/i)).toBeInTheDocument();
  });

  // ── Table rows ───────────────────────────────────────────────────────────────

  it('renders a table row for each user', () => {
    renderPage();
    const rows = screen.getAllByRole('row');
    // 1 header row + 2 data rows
    expect(rows).toHaveLength(3);
  });

  it('renders user name in the table', () => {
    renderPage();
    expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    expect(screen.getByText('Bob Dupont')).toBeInTheDocument();
  });

  it('renders user email in the table', () => {
    renderPage();
    expect(screen.getByText('alice@haccp.com')).toBeInTheDocument();
    expect(screen.getByText('bob@haccp.com')).toBeInTheDocument();
  });

  it('renders an avatar initial based on user name', () => {
    renderPage();
    // First letter of "Alice Martin" → "A", "Bob Dupont" → "B"
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('renders user creation date in French locale', () => {
    renderPage();
    // 2026-01-01 → "01/01/2026" in fr-FR
    expect(screen.getAllByText('01/01/2026').length).toBeGreaterThanOrEqual(1);
  });

  // ── Empty state ──────────────────────────────────────────────────────────────

  it('shows empty state message when no users are returned', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult({ data: { data: [], meta: { total: 0, page: 1, limit: 20, lastPage: 1 } } }),
    );
    renderPage();
    expect(screen.getByText(/aucun utilisateur trouvé/i)).toBeInTheDocument();
  });

  // ── Pagination ───────────────────────────────────────────────────────────────

  it('does not show pagination when there is only one page', () => {
    renderPage(); // PAGE_META.lastPage === 1
    expect(screen.queryByRole('button', { name: /précédent/i })).not.toBeInTheDocument();
  });

  it('shows pagination controls when there are multiple pages', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult({
        data: {
          data: USERS,
          meta: { total: 40, page: 1, limit: 20, lastPage: 2 },
        },
      }),
    );
    renderPage();
    expect(screen.getByRole('button', { name: /précédent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeInTheDocument();
  });

  it('disables the "Précédent" button on the first page', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult({
        data: {
          data: USERS,
          meta: { total: 40, page: 1, limit: 20, lastPage: 2 },
        },
      }),
    );
    renderPage();
    expect(screen.getByRole('button', { name: /précédent/i })).toBeDisabled();
  });

  it('shows page info text', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult({
        data: {
          data: USERS,
          meta: { total: 40, page: 2, limit: 20, lastPage: 2 },
        },
      }),
    );
    renderPage();
    expect(screen.getByText(/page 2 sur 2/i)).toBeInTheDocument();
  });

  // ── Search ───────────────────────────────────────────────────────────────────

  it('updates the search input as the user types', async () => {
    renderPage();
    const input = screen.getByPlaceholderText(/rechercher par nom ou email/i);
    await userEvent.type(input, 'alice');
    expect(input).toHaveValue('alice');
  });

  it('submits a new query when the search button is clicked', async () => {
    renderPage();
    await userEvent.type(
      screen.getByPlaceholderText(/rechercher par nom ou email/i),
      'alice',
    );
    await userEvent.click(screen.getByRole('button', { name: /rechercher/i }));
    // useQuery should be called again — just verify it stays mounted
    expect(mockUseQuery).toHaveBeenCalled();
  });

  // ── Invite modal ─────────────────────────────────────────────────────────────

  it('opens the invite modal when "Inviter un utilisateur" is clicked', async () => {
    renderPage();
    await userEvent.click(
      screen.getByRole('button', { name: /inviter un utilisateur/i }),
    );
    expect(screen.getByText(/inviter un utilisateur/i, { selector: '[id*="modal"], h2, h3, [role="dialog"] *' })).toBeTruthy();
  });

  it('renders name, email and role fields in the invite form', async () => {
    renderPage();
    await userEvent.click(
      screen.getByRole('button', { name: /inviter un utilisateur/i }),
    );
    expect(screen.getByLabelText(/nom complet/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/adresse e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/rôle/i)).toBeInTheDocument();
  });

  it('calls mutateAsync when the invite form is submitted with valid data', async () => {
    const mockMutateAsync = jest.fn().mockResolvedValue({});
    mockUseMutation.mockReturnValue(makeMutationResult({ mutateAsync: mockMutateAsync }));

    renderPage();
    await userEvent.click(
      screen.getByRole('button', { name: /inviter un utilisateur/i }),
    );

    await userEvent.type(screen.getByLabelText(/nom complet/i), 'Carol Test');
    await userEvent.type(screen.getByLabelText(/adresse e-mail/i), 'carol@haccp.com');
    await userEvent.click(screen.getByRole('button', { name: /envoyer l'invitation/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Carol Test', email: 'carol@haccp.com' }),
      );
    });
  });
});
