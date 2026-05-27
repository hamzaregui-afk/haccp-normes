/**
 * GroupsPage.test.tsx
 *
 * Unit tests for the GroupsPage component.
 *
 * Strategy:
 *  - Mock `@tanstack/react-query` useQuery / useMutation to control states.
 *  - Mock `@/lib/api` to prevent real HTTP calls.
 *  - Mock `@/hooks/useDebounce` to return the input immediately (no timeout).
 *  - Wrap renders in QueryClientProvider + MemoryRouter.
 *
 * Tests cover:
 *  - Toolbar (search, "Nouveau groupe" button)
 *  - Loading state
 *  - Group cards rendered (name, member count)
 *  - Empty state (EmptyState component)
 *  - Client-side search filter
 *  - Create group modal opens / form submits
 *  - Add member modal opens for a group
 *  - Delete button calls mutation
 *  - Pagination controls
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ─── Mock useDebounce — return value immediately ──────────────────────────────

jest.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: unknown) => value,
}));

// ─── Mock @tanstack/react-query ────────────────────────────────────────────────

const mockUseQuery    = jest.fn();
const mockUseMutation = jest.fn();
const mockInvalidate  = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<typeof import('@tanstack/react-query')>('@tanstack/react-query'),
  useQuery:       (...args: unknown[]) => mockUseQuery(...args),
  useMutation:    (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

// ─── Mock api ─────────────────────────────────────────────────────────────────

const mockApiGet    = jest.fn();
const mockApiPost   = jest.fn();
const mockApiDelete = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    get:    (...args: unknown[]) => mockApiGet(...args),
    post:   (...args: unknown[]) => mockApiPost(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}));

// ─── Import under test ────────────────────────────────────────────────────────

import GroupsPage from '../GroupsPage';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'ctenant001testidabc1234';

const makeGroup = (overrides: Partial<{
  id: string; name: string; memberCount: number;
}> = {}) => ({
  id:        overrides.id         ?? 'cgroup01testidabc123456',
  name:      overrides.name       ?? 'Équipe cuisine',
  tenantId:  TENANT_ID,
  createdAt: '2026-01-01T00:00:00Z',
  _count:    { members: overrides.memberCount ?? 3 },
  members:   undefined,
});

const GROUPS = [
  makeGroup({ id: 'g1', name: 'Équipe cuisine',   memberCount: 3 }),
  makeGroup({ id: 'g2', name: 'Équipe qualité',   memberCount: 2 }),
  makeGroup({ id: 'g3', name: 'Responsables site', memberCount: 5 }),
];

const PAGE_META = { total: 3, page: 1, limit: 20, lastPage: 1 };

function makeQueryResult<T>(overrides: {
  data?: T; isLoading?: boolean; isError?: boolean;
}) {
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
        <GroupsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('GroupsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // useQuery: group list query (first call is groups, second is inside AddMemberModal when open)
    mockUseQuery.mockReturnValue(
      makeQueryResult({ data: { data: GROUPS, meta: PAGE_META } }),
    );
    // useMutation: createMutation first, deleteMutation second
    mockUseMutation
      .mockReturnValueOnce(makeMutationResult())  // createMutation
      .mockReturnValueOnce(makeMutationResult())  // deleteMutation
      .mockReturnValue(makeMutationResult());     // addMember mutation (inside AddMemberModal)
  });

  // ── Toolbar ──────────────────────────────────────────────────────────────────

  it('renders the page title "Groupes"', () => {
    renderPage();
    expect(screen.getByText('Groupes')).toBeInTheDocument();
  });

  it('renders the group search input', () => {
    renderPage();
    expect(screen.getByPlaceholderText(/rechercher un groupe/i)).toBeInTheDocument();
  });

  it('renders the "Nouveau groupe" button', () => {
    renderPage();
    expect(
      screen.getByRole('button', { name: /nouveau groupe/i }),
    ).toBeInTheDocument();
  });

  // ── Loading state ────────────────────────────────────────────────────────────

  it('shows a loading message while data is fetching', () => {
    mockUseQuery.mockReturnValue(makeQueryResult({ isLoading: true }));
    mockUseMutation.mockReturnValue(makeMutationResult());
    renderPage();
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  // ── Group cards ───────────────────────────────────────────────────────────────

  it('renders one card per group', () => {
    renderPage();
    expect(screen.getByText('Équipe cuisine')).toBeInTheDocument();
    expect(screen.getByText('Équipe qualité')).toBeInTheDocument();
    expect(screen.getByText('Responsables site')).toBeInTheDocument();
  });

  it('renders member count for each group card', () => {
    renderPage();
    // "3 membres", "2 membres", "5 membres"
    expect(screen.getByText(/3 membre/)).toBeInTheDocument();
    expect(screen.getByText(/2 membre/)).toBeInTheDocument();
    expect(screen.getByText(/5 membre/)).toBeInTheDocument();
  });

  it('renders singular "membre" when count is 1', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult({
        data: {
          data: [makeGroup({ name: 'Solo', memberCount: 1 })],
          meta: PAGE_META,
        },
      }),
    );
    mockUseMutation.mockReturnValue(makeMutationResult());
    renderPage();
    expect(screen.getByText(/1 membre$/)).toBeInTheDocument();
  });

  it('renders "Ajouter un membre" action link for each card', () => {
    renderPage();
    const links = screen.getAllByRole('button', { name: /ajouter un membre/i });
    expect(links).toHaveLength(3);
  });

  it('renders the delete button for each card', () => {
    renderPage();
    const deleteBtns = screen.getAllByTitle('Supprimer le groupe');
    expect(deleteBtns).toHaveLength(3);
  });

  // ── Empty state ──────────────────────────────────────────────────────────────

  it('shows EmptyState when there are no groups', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult({ data: { data: [], meta: { total: 0, page: 1, limit: 20, lastPage: 1 } } }),
    );
    mockUseMutation.mockReturnValue(makeMutationResult());
    renderPage();
    expect(screen.getByText(/aucun groupe/i)).toBeInTheDocument();
  });

  it('shows actionable "Créer un groupe" button in the empty state', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult({ data: { data: [], meta: { total: 0, page: 1, limit: 20, lastPage: 1 } } }),
    );
    mockUseMutation.mockReturnValue(makeMutationResult());
    renderPage();
    expect(
      screen.getByRole('button', { name: /créer un groupe/i }),
    ).toBeInTheDocument();
  });

  // ── Client-side search filter ────────────────────────────────────────────────

  it('filters groups by search term (client-side)', async () => {
    renderPage();
    const searchInput = screen.getByPlaceholderText(/rechercher un groupe/i);
    await userEvent.type(searchInput, 'qualité');
    // "Équipe qualité" should remain; "Équipe cuisine" and "Responsables site" should disappear
    expect(screen.getByText('Équipe qualité')).toBeInTheDocument();
    expect(screen.queryByText('Équipe cuisine')).not.toBeInTheDocument();
    expect(screen.queryByText('Responsables site')).not.toBeInTheDocument();
  });

  it('shows all groups when search is cleared', async () => {
    renderPage();
    const searchInput = screen.getByPlaceholderText(/rechercher un groupe/i);
    await userEvent.type(searchInput, 'qualité');
    await userEvent.clear(searchInput);
    expect(screen.getByText('Équipe cuisine')).toBeInTheDocument();
    expect(screen.getByText('Équipe qualité')).toBeInTheDocument();
    expect(screen.getByText('Responsables site')).toBeInTheDocument();
  });

  // ── Create group modal ────────────────────────────────────────────────────────

  it('opens the create-group modal when "Nouveau groupe" is clicked', async () => {
    renderPage();
    await userEvent.click(
      screen.getByRole('button', { name: /nouveau groupe/i }),
    );
    // After opening, both the toolbar button and the modal <h2> carry "Nouveau groupe";
    // target the heading specifically to avoid "multiple elements found" error.
    expect(screen.getByRole('heading', { name: /nouveau groupe/i })).toBeInTheDocument();
    // Input / Select use htmlFor={id} but no id is passed from the form — use placeholder instead
    expect(screen.getByPlaceholderText(/Équipe cuisine froide/i)).toBeInTheDocument();
  });

  it('submits the group name when the create form is submitted', async () => {
    const mockCreate = jest.fn().mockResolvedValue({});
    // Use mockImplementation so re-renders (triggered by modal open state change) always see
    // the same stable createMutation object with mockCreate — mockReturnValueOnce is consumed
    // on re-render and would replace mockCreate with the default mock.
    mockUseMutation.mockReset();
    const createResult = makeMutationResult({ mutateAsync: mockCreate });
    mockUseMutation.mockImplementation(() => createResult);

    renderPage();
    await userEvent.click(
      screen.getByRole('button', { name: /nouveau groupe/i }),
    );
    // Input doesn't have an id, so getByLabelText won't work — use placeholder instead
    await userEvent.type(screen.getByPlaceholderText(/Équipe cuisine froide/i), 'Nouveau groupe test');
    await userEvent.click(screen.getByRole('button', { name: /créer le groupe/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Nouveau groupe test' }),
      );
    });
  });

  it('does not submit the create form when name is empty (required validation)', async () => {
    const mockCreate = jest.fn().mockResolvedValue({});
    // Same stable-reference approach as the submit test above
    mockUseMutation.mockReset();
    const createResult = makeMutationResult({ mutateAsync: mockCreate });
    mockUseMutation.mockImplementation(() => createResult);

    renderPage();
    await userEvent.click(
      screen.getByRole('button', { name: /nouveau groupe/i }),
    );
    // Wait for modal to be fully open
    const submitBtn = await screen.findByRole('button', { name: /créer le groupe/i });
    // Submit without typing a name
    await userEvent.click(submitBtn);

    // react-hook-form blocks submission when required field is empty.
    // Whether the error message appears in the DOM depends on jsdom's form submission
    // behaviour with HTML5 `required` — but the key invariant is that the mutation
    // must never be called when the name is blank.
    await waitFor(() => {
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  // ── Add member modal ──────────────────────────────────────────────────────────

  it('opens the add-member modal when "Ajouter un membre" is clicked on a card', async () => {
    // useQuery is called twice: once for groups list, once for users inside AddMemberModal
    mockUseQuery
      .mockReturnValueOnce(makeQueryResult({ data: { data: GROUPS, meta: PAGE_META } }))
      .mockReturnValue(makeQueryResult({ data: [] })); // users in select = empty

    renderPage();
    const addBtns = screen.getAllByRole('button', { name: /ajouter un membre/i });
    await userEvent.click(addBtns[0]); // click first group's "Ajouter un membre"

    // Modal is open: the h2 heading carries the modal title.
    // Card buttons also say "Ajouter un membre", so target the heading specifically.
    expect(screen.getByRole('heading', { name: /ajouter un membre/i })).toBeInTheDocument();
    // Select has no id → getByLabelText won't work; use combobox role instead
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  // ── Delete mutation ───────────────────────────────────────────────────────────

  it('calls delete mutation when the delete button is clicked', async () => {
    const mockDelete = jest.fn().mockResolvedValue({});
    // Reset to clear the beforeEach queue so mockDelete lands at slot 2 (deleteMutation)
    mockUseMutation.mockReset();
    mockUseMutation
      .mockReturnValueOnce(makeMutationResult())                     // create
      .mockReturnValueOnce(makeMutationResult({ mutateAsync: mockDelete })); // delete

    renderPage();
    const deleteButtons = screen.getAllByTitle('Supprimer le groupe');
    await userEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  // ── Pagination ───────────────────────────────────────────────────────────────

  it('does not show pagination when there is only one page', () => {
    renderPage(); // PAGE_META.lastPage === 1
    expect(screen.queryByRole('button', { name: /précédent/i })).not.toBeInTheDocument();
  });

  it('shows pagination when there are multiple pages', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult({
        data: { data: GROUPS, meta: { total: 60, page: 1, limit: 20, lastPage: 3 } },
      }),
    );
    mockUseMutation.mockReturnValue(makeMutationResult());
    renderPage();
    expect(screen.getByRole('button', { name: /précédent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeInTheDocument();
  });
});
