/**
 * NCFormScreen.test.tsx
 *
 * Unit tests for the NCFormScreen (React Native).
 *
 * Strategy:
 *  - Mock @tanstack/react-query (useMutation + useQuery).
 *  - useQuery for sites returns empty by default (single-site case: no site picker shown).
 *  - Mock nonconformityClient and tenantClient from api/client.
 *  - Mock useAuthStore so hasToken is truthy.
 *  - Wrap renders in QueryClientProvider.
 *
 * Tests cover:
 *  - Page title "Signaler une non-conformité"
 *  - Form labels (Description, Sévérité, Catégorie, Action corrective)
 *  - "Soumettre le signalement" button visible
 *  - Alert("Champ requis") when description is empty
 *  - Alert("Site requis") when no sites available
 *  - Severity selection (all 4 options rendered)
 *  - Category selection (all 8 options rendered)
 *  - Mutation called with correct payload (description, siteId, severity, category)
 *  - isPending: spinner shown, submit text hidden
 *  - Success Alert when onSuccess fires
 *  - Error Alert when onError fires
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── react-query mock ───────────────────────────────────────────────────────────

const mockUseMutation = jest.fn();
const mockUseQuery    = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useMutation:    (...args: unknown[]) => mockUseMutation(...args),
  useQuery:       (...args: unknown[]) => mockUseQuery(...args),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// ── Auth store mock ────────────────────────────────────────────────────────────

jest.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (s: { token: string | null }) => unknown) =>
    selector({ token: 'test-jwt-token' }),
}));

// ── API client mock ────────────────────────────────────────────────────────────

jest.mock('../../api/client', () => ({
  nonconformityClient: { post: jest.fn() },
  tenantClient:        { get:  jest.fn() },
}));

// ── Import under test ─────────────────────────────────────────────────────────

import { NCFormScreen } from '../NCFormScreen';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SITE_A = { id: 'site-001', name: 'Site A' };
const SITE_B = { id: 'site-002', name: 'Site B' };

// ── Helpers ───────────────────────────────────────────────────────────────────

function mr(mutate: jest.Mock = jest.fn(), isPending = false) {
  return { mutate, isPending };
}

/** Returns a sites query result that resolves to a list of sites. */
function sitesQuery(sites: { id: string; name: string }[] = [SITE_A]) {
  return { data: { data: { data: sites } }, isLoading: false, isError: false };
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NCFormScreen navigation={{} as never} route={{} as never} />
    </QueryClientProvider>,
  );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('NCFormScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMutation.mockReturnValue(mr());
    // Default: single site (no picker shown)
    mockUseQuery.mockReturnValue(sitesQuery([SITE_A]));
  });

  // ── Page structure ────────────────────────────────────────────────────────────

  it('renders the page title "Signaler une non-conformité"', () => {
    renderScreen();
    expect(screen.getByText('Signaler une non-conformité')).toBeTruthy();
  });

  it('renders the "Description *" label', () => {
    renderScreen();
    expect(screen.getByText('Description *')).toBeTruthy();
  });

  it('renders the description TextInput with correct placeholder', () => {
    renderScreen();
    expect(screen.getByPlaceholderText(/décrivez le problème/i)).toBeTruthy();
  });

  it('renders the "Sévérité" section label', () => {
    renderScreen();
    expect(screen.getByText('Sévérité')).toBeTruthy();
  });

  it('renders the "Catégorie" section label', () => {
    renderScreen();
    expect(screen.getByText('Catégorie')).toBeTruthy();
  });

  it('renders the "Soumettre le signalement" button', () => {
    renderScreen();
    expect(screen.getByText('Soumettre le signalement')).toBeTruthy();
  });

  // ── Site picker visibility ────────────────────────────────────────────────────

  it('does NOT show site picker when there is only 1 site', () => {
    mockUseQuery.mockReturnValue(sitesQuery([SITE_A]));
    renderScreen();
    expect(screen.queryByText('Site *')).toBeNull();
  });

  it('shows site picker when there are multiple sites', () => {
    mockUseQuery.mockReturnValue(sitesQuery([SITE_A, SITE_B]));
    renderScreen();
    expect(screen.getByText('Site *')).toBeTruthy();
    expect(screen.getByText('Site A')).toBeTruthy();
    expect(screen.getByText('Site B')).toBeTruthy();
  });

  // ── Severity options ──────────────────────────────────────────────────────────

  it('renders all 4 severity buttons', () => {
    renderScreen();
    expect(screen.getByText('Faible')).toBeTruthy();
    expect(screen.getByText('Moyen')).toBeTruthy();
    expect(screen.getByText('Élevé')).toBeTruthy();
    expect(screen.getByText('Critique')).toBeTruthy();
  });

  // ── Category options ──────────────────────────────────────────────────────────

  it('renders all 8 category buttons', () => {
    renderScreen();
    ['Température', 'Hygiène', 'Étiquetage', 'Traçabilité',
     'Équipement', 'Fournisseur', 'Procédé', 'Autre'].forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
  });

  // ── Validation ────────────────────────────────────────────────────────────────

  it('shows "Champ requis" Alert when description is empty', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Soumettre le signalement'));
    expect(Alert.alert).toHaveBeenCalledWith('Champ requis', expect.stringContaining('description'));
  });

  it('does not call mutation when description is empty', () => {
    const mockMutate = jest.fn();
    mockUseMutation.mockReturnValue(mr(mockMutate));
    renderScreen();
    fireEvent.press(screen.getByText('Soumettre le signalement'));
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('shows "Site requis" Alert when no sites are available', () => {
    mockUseQuery.mockReturnValue(sitesQuery([]));
    renderScreen();
    fireEvent.changeText(screen.getByPlaceholderText(/décrivez le problème/i), 'Description');
    fireEvent.press(screen.getByText('Soumettre le signalement'));
    expect(Alert.alert).toHaveBeenCalledWith('Site requis', expect.any(String));
  });

  // ── Successful submission ─────────────────────────────────────────────────────

  it('calls mutation with description, siteId, severity and category', () => {
    const mockMutate = jest.fn();
    mockUseMutation.mockReturnValue(mr(mockMutate));
    renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText(/décrivez le problème/i), '  Frigo HS  ');
    fireEvent.press(screen.getByText('Soumettre le signalement'));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Frigo HS',
        siteId:      'site-001',
        severity:    'MEDIUM',
        category:    'OTHER',
      }),
    );
  });

  it('calls mutation with CRITICAL severity when selected', () => {
    const mockMutate = jest.fn();
    mockUseMutation.mockReturnValue(mr(mockMutate));
    renderScreen();

    fireEvent.press(screen.getByText('Critique'));
    fireEvent.changeText(screen.getByPlaceholderText(/décrivez le problème/i), 'Test');
    fireEvent.press(screen.getByText('Soumettre le signalement'));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'CRITICAL' }),
    );
  });

  it('calls mutation with HYGIENE category when selected', () => {
    const mockMutate = jest.fn();
    mockUseMutation.mockReturnValue(mr(mockMutate));
    renderScreen();

    fireEvent.press(screen.getByText('Hygiène'));
    fireEvent.changeText(screen.getByPlaceholderText(/décrivez le problème/i), 'Test');
    fireEvent.press(screen.getByText('Soumettre le signalement'));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'HYGIENE' }),
    );
  });

  it('includes correctiveAction in mutation when provided', () => {
    const mockMutate = jest.fn();
    mockUseMutation.mockReturnValue(mr(mockMutate));
    renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText(/décrivez le problème/i), 'Frigo HS');
    fireEvent.changeText(screen.getByPlaceholderText(/action corrective/i), 'Nettoyer filtre');
    fireEvent.press(screen.getByText('Soumettre le signalement'));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ correctiveAction: 'Nettoyer filtre' }),
    );
  });

  // ── Alerts ────────────────────────────────────────────────────────────────────

  it('shows success Alert when onSuccess fires', () => {
    let capturedOnSuccess: (() => void) | undefined;
    mockUseMutation.mockImplementation(({ onSuccess }: { onSuccess?: () => void }) => {
      capturedOnSuccess = onSuccess;
      return { mutate: jest.fn(), isPending: false };
    });
    renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText(/décrivez le problème/i), 'Test');
    fireEvent.press(screen.getByText('Soumettre le signalement'));

    act(() => { capturedOnSuccess?.(); });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Succès',
      expect.stringContaining('créée'),
      expect.any(Array),
    );
  });

  it('shows error Alert when onError fires', () => {
    let capturedOnError: (() => void) | undefined;
    mockUseMutation.mockImplementation(({ onError }: { onError?: () => void }) => {
      capturedOnError = onError;
      return { mutate: jest.fn(), isPending: false };
    });
    renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText(/décrivez le problème/i), 'Test');
    fireEvent.press(screen.getByText('Soumettre le signalement'));

    act(() => { capturedOnError?.(); });

    expect(Alert.alert).toHaveBeenCalledWith('Erreur', expect.stringContaining('créer'));
  });

  // ── isPending state ───────────────────────────────────────────────────────────

  it('hides submit button text and shows spinner when mutation is pending', () => {
    mockUseMutation.mockReturnValue(mr(jest.fn(), true));
    renderScreen();
    expect(screen.queryByText('Soumettre le signalement')).toBeNull();
    expect(screen.UNSAFE_queryByType(require('react-native').ActivityIndicator)).toBeTruthy();
  });
});
