/**
 * ServicesHealth.test.tsx
 *
 * Unit tests for the ServicesHealth widget.
 *
 * Strategy:
 *  - Mock @/lib/api to return controlled health responses without real HTTP
 *  - Wrap in QueryClientProvider (retries disabled for instant resolution)
 *  - Test rendering of service labels, status text, and version/uptime display
 *
 * Tests cover:
 *  - Renders the widget heading
 *  - Renders a row for every catalogued service (10 total)
 *  - Shows "Vérification…" while queries are loading
 *  - Shows "En ligne" when health endpoint returns { status: "ok" }
 *  - Shows "Hors ligne" when health endpoint errors
 *  - Displays version string when service returns a version
 *  - Displays uptime minutes when service returns uptime seconds
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ServicesHealth } from '../ServicesHealth';

// ── Mock api ──────────────────────────────────────────────────────────────────

const mockGet = jest.fn();

jest.mock('@/lib/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry:           false,
        staleTime:       Infinity,
        refetchInterval: false,
      },
    },
  });
}

function renderWidget(client = makeClient()) {
  return render(
    <QueryClientProvider client={client}>
      <ServicesHealth />
    </QueryClientProvider>,
  );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ServicesHealth', () => {
  beforeEach(() => {
    mockGet.mockClear();
  });

  it('renders the widget heading', async () => {
    // Resolve all queries immediately with a loading-like pending (never resolves)
    mockGet.mockReturnValue(new Promise(() => {}));
    renderWidget();
    expect(screen.getByText('État des microservices')).toBeInTheDocument();
  });

  it('renders a row for every catalogued service (10 total)', async () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderWidget();
    // Service labels from the SERVICES catalog
    const labels = [
      'Auth', 'Utilisateurs', 'Contrôles', 'Non-conformités',
      'Actifs / GED', 'Notifications', 'Rapports', 'DLC', 'Tenants', 'Audit',
    ];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('shows "Vérification…" while queries are pending', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderWidget();
    const statuses = screen.getAllByText('Vérification…');
    expect(statuses.length).toBe(10);
  });

  it('shows "En ligne" when a health endpoint returns status ok', async () => {
    mockGet.mockResolvedValue({ data: { status: 'ok' } });
    renderWidget();
    await waitFor(() => {
      const okStatuses = screen.getAllByText('En ligne');
      expect(okStatuses.length).toBe(10);
    });
  });

  it('shows "Hors ligne" when a health endpoint throws', async () => {
    mockGet.mockRejectedValue(new Error('Network Error'));
    renderWidget();
    await waitFor(() => {
      const downStatuses = screen.getAllByText('Hors ligne');
      expect(downStatuses.length).toBe(10);
    });
  });

  it('displays version string when the service returns a version', async () => {
    mockGet.mockResolvedValue({ data: { status: 'ok', version: '1.4.2' } });
    renderWidget();
    await waitFor(() => {
      // 10 rows each showing the same mocked version
      const versions = screen.getAllByText('v1.4.2');
      expect(versions.length).toBe(10);
    });
  });

  it('displays uptime in minutes when the service returns uptime in seconds', async () => {
    // 3 600 seconds → 60 min
    mockGet.mockResolvedValue({ data: { status: 'ok', uptime: 3600 } });
    renderWidget();
    await waitFor(() => {
      const uptimes = screen.getAllByText('60 min');
      expect(uptimes.length).toBe(10);
    });
  });

  it('renders the refresh interval label', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderWidget();
    expect(screen.getByText(/Rafraîchissement toutes les 30 s/)).toBeInTheDocument();
  });
});
