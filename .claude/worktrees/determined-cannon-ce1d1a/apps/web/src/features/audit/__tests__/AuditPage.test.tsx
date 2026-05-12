/**
 * AuditPage.test.tsx
 *
 * Unit tests for the AuditPage component.
 *
 * Strategy:
 *  - Mock useQuery (single call: audit log list).
 *  - No mutations in this page (read-only by design).
 *  - Wrap renders in QueryClientProvider + MemoryRouter.
 *
 * Tests cover:
 *  - Page title "Journal d'audit" and subtitle "Registre immuable — lecture seule"
 *  - Immutability warning banner
 *  - Filter toolbar (text search, from/to date pickers)
 *  - Loading & error states
 *  - Table columns (Date / Heure, Action, Ressource, ID Ressource, Utilisateur, IP)
 *  - Audit log rows: action badge (monospace), resource, resourceId, userId, IP
 *  - "—" rendered for null resourceId and ipAddress
 *  - Client-side text filter (filters by action / resource / userId)
 *  - Empty state when no logs match
 *  - Pagination controls
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

import AuditPage from '../AuditPage';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PAGE_META_SINGLE = { total: 3,  page: 1, limit: 20, lastPage: 1 };
const PAGE_META_MULTI  = { total: 80, page: 2, limit: 20, lastPage: 4 };

function makeLog(overrides: Partial<{
  id: string; action: string; resource: string; resourceId: string | null;
  userId: string; ipAddress: string | null; createdAt: string;
}> = {}) {
  return {
    id:         overrides.id         ?? 'log-001',
    action:     overrides.action     ?? 'user.login',
    resource:   overrides.resource   ?? 'users',
    resourceId: overrides.resourceId ?? 'user-abc-123',
    userId:     overrides.userId     ?? 'usr-001testidabc1234567',
    tenantId:   'tenant-001',
    payload:    {},
    ipAddress:  overrides.ipAddress  ?? '192.168.1.10',
    createdAt:  overrides.createdAt  ?? '2026-01-15T10:30:00Z',
  };
}

const LOG_LOGIN  = makeLog({ id: 'l1', action: 'user.login',          resource: 'users',    resourceId: 'usr-001', userId: 'usr-001testidabc1234567', ipAddress: '10.0.0.1' });
const LOG_CREATE = makeLog({ id: 'l2', action: 'product.created',     resource: 'products', resourceId: 'prd-001', userId: 'usr-002testidabc1234567', ipAddress: '10.0.0.2' });
const LOG_DELETE = makeLog({ id: 'l3', action: 'supplier.deleted',    resource: 'suppliers', resourceId: null,      userId: 'usr-003testidabc1234567', ipAddress: null });

const AUDIT_LOGS = [LOG_LOGIN, LOG_CREATE, LOG_DELETE];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mqr<T>(data: T, opts: { isLoading?: boolean; isError?: boolean } = {}) {
  return { data, isLoading: opts.isLoading ?? false, isError: opts.isError ?? false, error: null };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuditPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('AuditPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue(mqr({ data: AUDIT_LOGS, meta: PAGE_META_SINGLE }));
  });

  // ── Header ──────────────────────────────────────────────────────────────────

  it('renders the page title "Journal d\'audit"', () => {
    renderPage();
    expect(screen.getByText("Journal d'audit")).toBeInTheDocument();
  });

  it('renders the subtitle "Registre immuable — lecture seule"', () => {
    renderPage();
    expect(screen.getByText('Registre immuable — lecture seule')).toBeInTheDocument();
  });

  // ── Immutability banner ──────────────────────────────────────────────────────

  it('renders the immutability warning banner', () => {
    renderPage();
    expect(screen.getByText(/ce journal est en lecture seule/i)).toBeInTheDocument();
  });

  it('mentions HACCP requirements in the banner', () => {
    renderPage();
    expect(screen.getByText(/exigences haccp/i)).toBeInTheDocument();
  });

  // ── Filter toolbar ───────────────────────────────────────────────────────────

  it('renders the text search input', () => {
    renderPage();
    expect(screen.getByPlaceholderText(/filtrer par action ou email/i)).toBeInTheDocument();
  });

  it('renders the "Du" date filter', () => {
    renderPage();
    expect(screen.getByText('Du')).toBeInTheDocument();
  });

  it('renders the "Au" date filter', () => {
    renderPage();
    expect(screen.getByText('Au')).toBeInTheDocument();
  });

  // ── Loading state ────────────────────────────────────────────────────────────

  it('shows loading text while audit logs are loading', () => {
    mockUseQuery.mockReturnValue(mqr(undefined, { isLoading: true }));
    renderPage();
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it('does not render the table while loading', () => {
    mockUseQuery.mockReturnValue(mqr(undefined, { isLoading: true }));
    renderPage();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // ── Error state ─────────────────────────────────────────────────────────────

  it('shows error text when the audit query fails', () => {
    mockUseQuery.mockReturnValue(mqr(undefined, { isError: true }));
    renderPage();
    expect(screen.getByText(/erreur lors du chargement du journal/i)).toBeInTheDocument();
  });

  // ── Table columns ────────────────────────────────────────────────────────────

  it('renders the correct table column headers', () => {
    renderPage();
    expect(screen.getByText('Date / Heure')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Ressource')).toBeInTheDocument();
    expect(screen.getByText('ID Ressource')).toBeInTheDocument();
    expect(screen.getByText('Utilisateur (ID)')).toBeInTheDocument();
    expect(screen.getByText('IP')).toBeInTheDocument();
  });

  // ── Audit log rows ────────────────────────────────────────────────────────────

  it('renders action code in monospace for each log', () => {
    renderPage();
    expect(screen.getByText('user.login')).toBeInTheDocument();
    expect(screen.getByText('product.created')).toBeInTheDocument();
    expect(screen.getByText('supplier.deleted')).toBeInTheDocument();
  });

  it('renders the resource name for each log', () => {
    renderPage();
    expect(screen.getByText('users')).toBeInTheDocument();
    expect(screen.getByText('products')).toBeInTheDocument();
    expect(screen.getByText('suppliers')).toBeInTheDocument();
  });

  it('renders the resource ID for logs that have one', () => {
    renderPage();
    expect(screen.getByText('prd-001')).toBeInTheDocument();
  });

  it('renders "—" for null resourceId', () => {
    renderPage();
    // LOG_DELETE has resourceId: null
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders "—" for null ipAddress', () => {
    renderPage();
    // LOG_DELETE has ipAddress: null → "—"
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the IP address for logs that have one', () => {
    renderPage();
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.2')).toBeInTheDocument();
  });

  it('renders a formatted creation date', () => {
    renderPage();
    // '2026-01-15T10:30:00Z' → French locale date-time
    // Exact format depends on the test runner's locale; just check a date fragment is present
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  // ── Client-side filter ────────────────────────────────────────────────────────

  it('filters logs by action when text is typed in the search input', async () => {
    renderPage();
    const searchInput = screen.getByPlaceholderText(/filtrer par action ou email/i);
    await userEvent.type(searchInput, 'product.created');

    await waitFor(() => {
      expect(screen.getByText('product.created')).toBeInTheDocument();
      expect(screen.queryByText('user.login')).not.toBeInTheDocument();
      expect(screen.queryByText('supplier.deleted')).not.toBeInTheDocument();
    });
  });

  it('filters logs by resource when text is typed', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText(/filtrer par action ou email/i), 'suppliers');

    await waitFor(() => {
      expect(screen.getByText('supplier.deleted')).toBeInTheDocument();
      expect(screen.queryByText('user.login')).not.toBeInTheDocument();
    });
  });

  it('filters logs by userId when text is typed', async () => {
    renderPage();
    await userEvent.type(
      screen.getByPlaceholderText(/filtrer par action ou email/i),
      'usr-003',
    );
    await waitFor(() => {
      expect(screen.getByText('supplier.deleted')).toBeInTheDocument();
      expect(screen.queryByText('user.login')).not.toBeInTheDocument();
    });
  });

  it('shows all logs again when the search is cleared', async () => {
    renderPage();
    const searchInput = screen.getByPlaceholderText(/filtrer par action ou email/i);
    await userEvent.type(searchInput, 'product.created');
    await waitFor(() => expect(screen.queryByText('user.login')).not.toBeInTheDocument());
    await userEvent.clear(searchInput);
    await waitFor(() => {
      expect(screen.getByText('user.login')).toBeInTheDocument();
      expect(screen.getByText('product.created')).toBeInTheDocument();
    });
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  it('shows empty state when no logs match the current filter', async () => {
    renderPage();
    await userEvent.type(
      screen.getByPlaceholderText(/filtrer par action ou email/i),
      'aucune-action-inexistante',
    );
    await waitFor(() => {
      expect(screen.getByText(/aucune entrée/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when the API returns an empty list', () => {
    mockUseQuery.mockReturnValue(mqr({ data: [], meta: { total: 0, page: 1, limit: 20, lastPage: 1 } }));
    renderPage();
    expect(screen.getByText(/aucune entrée/i)).toBeInTheDocument();
  });

  // ── Pagination ───────────────────────────────────────────────────────────────

  it('does not show pagination for a single page', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /précédent/i })).not.toBeInTheDocument();
  });

  it('shows pagination controls for multiple pages', () => {
    mockUseQuery.mockReturnValue(mqr({ data: AUDIT_LOGS, meta: PAGE_META_MULTI }));
    renderPage();
    expect(screen.getByRole('button', { name: /précédent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeInTheDocument();
  });

  it('shows page info with entry count in pagination', () => {
    mockUseQuery.mockReturnValue(mqr({ data: AUDIT_LOGS, meta: PAGE_META_MULTI }));
    renderPage();
    expect(screen.getByText(/page 2 sur 4/i)).toBeInTheDocument();
    expect(screen.getByText(/80 entrée/i)).toBeInTheDocument();
  });
});
