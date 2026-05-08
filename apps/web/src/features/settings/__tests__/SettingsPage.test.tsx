/**
 * SettingsPage.test.tsx
 *
 * Unit tests for the SettingsPage component.
 *
 * Strategy:
 *  - Mock useQuery (single call: tenant settings) and useMutation (single: update).
 *  - react-hook-form is NOT mocked — it runs normally in jsdom.
 *  - Wrap renders in QueryClientProvider + MemoryRouter.
 *
 * Tests cover:
 *  - Page title "Paramètres" and subtitle
 *  - Three section cards: Informations, Sécurité, Notifications
 *  - Loading state
 *  - Form fields pre-populated from API data (name, SIRET, address, sector)
 *  - Three notification toggles visible
 *  - "Enregistrer" button
 *  - Required-field validation for name (react-hook-form)
 *  - Mutation called with merged form values + toggle states on submit
 *  - Success toast shown after save
 *  - "Changer le mot de passe" button in the Security section
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
  api: { get: jest.fn(), patch: jest.fn() },
}));

// ─── Import under test ────────────────────────────────────────────────────────

import SettingsPage from '../SettingsPage';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_SETTINGS = {
  name:                    'Boulangerie Dupont',
  siret:                   '123 456 789 00012',
  address:                 '12 rue des Boulangers, 75001 Paris',
  sector:                  'RESTAURATION',
  notifyNewNc:             true,
  notifyValidatedReports:  false,
  notifyCriticalDlc:       true,
};

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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('SettingsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue(mqr(TENANT_SETTINGS));
    mockUseMutation.mockReturnValue(mmr());
  });

  // ── Header ──────────────────────────────────────────────────────────────────

  it('renders the page title "Paramètres"', () => {
    renderPage();
    expect(screen.getByText('Paramètres')).toBeInTheDocument();
  });

  it('renders the subtitle about configuration', () => {
    renderPage();
    expect(screen.getByText(/configuration de l'établissement/i)).toBeInTheDocument();
  });

  // ── Loading state ────────────────────────────────────────────────────────────

  it('shows loading text while settings are loading', () => {
    mockUseQuery.mockReturnValue(mqr(undefined, { isLoading: true }));
    renderPage();
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it('does not show the form while loading', () => {
    mockUseQuery.mockReturnValue(mqr(undefined, { isLoading: true }));
    renderPage();
    expect(screen.queryByRole('button', { name: /enregistrer/i })).not.toBeInTheDocument();
  });

  // ── Section cards ────────────────────────────────────────────────────────────

  it('renders the "Informations de l\'établissement" section', () => {
    renderPage();
    expect(screen.getByText("Informations de l'établissement")).toBeInTheDocument();
  });

  it('renders the "Sécurité" section', () => {
    renderPage();
    expect(screen.getByText('Sécurité')).toBeInTheDocument();
  });

  it('renders the "Notifications" section', () => {
    renderPage();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  // ── Form fields ─────────────────────────────────────────────────────────────

  it('pre-populates the establishment name from API data', async () => {
    renderPage();
    await waitFor(() => {
      const nameInput = screen.getByPlaceholderText('Boulangerie Dupont') as HTMLInputElement;
      expect(nameInput.value).toBe('Boulangerie Dupont');
    });
  });

  it('pre-populates the SIRET field from API data', async () => {
    renderPage();
    await waitFor(() => {
      const siretInput = screen.getByPlaceholderText('123 456 789 00012') as HTMLInputElement;
      expect(siretInput.value).toBe('123 456 789 00012');
    });
  });

  it('renders the sector select with correct options', () => {
    renderPage();
    expect(screen.getByText('Restauration')).toBeInTheDocument();
    expect(screen.getByText('Industrie alimentaire')).toBeInTheDocument();
    expect(screen.getByText('Grande distribution')).toBeInTheDocument();
    expect(screen.getByText('Traiteur')).toBeInTheDocument();
    expect(screen.getByText('Autre')).toBeInTheDocument();
  });

  // ── Notification toggles ─────────────────────────────────────────────────────

  it('renders the "Nouvelles non-conformités par email" toggle', () => {
    renderPage();
    expect(screen.getByText('Nouvelles non-conformités par email')).toBeInTheDocument();
  });

  it('renders the "Rapports validés par email" toggle', () => {
    renderPage();
    expect(screen.getByText('Rapports validés par email')).toBeInTheDocument();
  });

  it('renders the "Alertes DLC critiques" toggle', () => {
    renderPage();
    expect(screen.getByText('Alertes DLC critiques')).toBeInTheDocument();
  });

  // ── Security section ─────────────────────────────────────────────────────────

  it('renders the "Changer le mot de passe" button in the Security section', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /changer le mot de passe/i })).toBeInTheDocument();
  });

  it('mentions the 24h token expiry in the security section', () => {
    renderPage();
    expect(screen.getByText(/24h/i)).toBeInTheDocument();
  });

  // ── Save button ─────────────────────────────────────────────────────────────

  it('renders the "Enregistrer" submit button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeInTheDocument();
  });

  it('calls the update mutation with form values on submit', async () => {
    const mockMutate = jest.fn();
    mockUseMutation.mockReturnValue(mmr({ mutate: mockMutate }));
    renderPage();

    await waitFor(() =>
      expect((screen.getByPlaceholderText('Boulangerie Dupont') as HTMLInputElement).value).toBe(
        'Boulangerie Dupont',
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Boulangerie Dupont' }),
      );
    });
  });

  it('includes the toggle state in the mutation payload', async () => {
    const mockMutate = jest.fn();
    mockUseMutation.mockReturnValue(mmr({ mutate: mockMutate }));
    renderPage();

    await waitFor(() =>
      expect((screen.getByPlaceholderText('Boulangerie Dupont') as HTMLInputElement).value).toBeTruthy(),
    );

    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          notifyNewNc:            true,   // pre-populated from TENANT_SETTINGS
          notifyValidatedReports: false,
          notifyCriticalDlc:      true,
        }),
      );
    });
  });

  it('shows a required-field error when name is cleared and the form is submitted', async () => {
    renderPage();

    await waitFor(() =>
      expect((screen.getByPlaceholderText('Boulangerie Dupont') as HTMLInputElement).value).toBeTruthy(),
    );

    const nameInput = screen.getByPlaceholderText('Boulangerie Dupont');
    await userEvent.clear(nameInput);
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => {
      expect(screen.getByText(/champ obligatoire/i)).toBeInTheDocument();
    });
  });

  // ── Success toast ────────────────────────────────────────────────────────────

  it('shows a success toast after settings are saved', async () => {
    let capturedOnSuccess: (() => void) | undefined;
    mockUseMutation.mockImplementation(({ onSuccess }: { onSuccess?: () => void }) => {
      capturedOnSuccess = onSuccess;
      return { mutate: jest.fn(), isPending: false, isError: false };
    });
    renderPage();

    // Trigger onSuccess to simulate a successful save
    await waitFor(() => expect(capturedOnSuccess).toBeDefined());
    capturedOnSuccess?.();

    await waitFor(() => {
      expect(screen.getByText(/paramètres enregistrés/i)).toBeInTheDocument();
    });
  });
});
