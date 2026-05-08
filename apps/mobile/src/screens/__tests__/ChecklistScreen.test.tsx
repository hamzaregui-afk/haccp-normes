/**
 * ChecklistScreen.test.tsx
 *
 * Unit tests for ChecklistScreen (React Native).
 *
 * Strategy:
 *  - Mock @tanstack/react-query (useQuery, useMutation).
 *  - Mock the API client to prevent real HTTP calls.
 *  - Mock react-navigation so navigation.navigate() can be asserted.
 *  - Wrap renders in QueryClientProvider.
 *
 * Key challenge — entries state:
 *  The component initialises `entries` as a side-effect inside the template
 *  queryFn (setEntries is called from within the async queryFn). Since we mock
 *  useQuery to return data directly, the queryFn never runs automatically.
 *  Solution: setupQueriesWithEntries() uses mockImplementationOnce for the
 *  template query and calls queryFn() manually. controlClient.get is given a
 *  resolved mock so the async function completes; waitFor then lets the React
 *  state update propagate before assertions.
 *
 * Tests cover:
 *  - Loading states (task loading, template loading)
 *  - Error states (task error, template error)
 *  - Section title and submit button rendered when loaded
 *  - Checkpoint descriptions, "✓ OK" / "✗ NOK" buttons, °C TextInputs rendered
 *  - "Incomplet" Alert shown when submit pressed with unanswered checkpoints
 *  - Mutation NOT called when checkpoints are incomplete
 *  - Mutation called with correct DONE payload when all checkpoints answered
 *  - Submit button shows ActivityIndicator and is disabled when isPending
 *  - NC modal shown after success with at least one FAIL checkpoint
 *  - NC modal "Non" → Alert("Succès") shown
 *  - NC modal "Oui, créer" → navigate("Main") + Alert("Info")
 *  - Error Alert shown when mutation fails
 */

import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Navigation mock ────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

// ── react-query mock ───────────────────────────────────────────────────────────

const mockUseQuery    = jest.fn();
const mockUseMutation = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery:       (...args: unknown[]) => mockUseQuery(...args),
  useMutation:    (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// ── API client mock ────────────────────────────────────────────────────────────

jest.mock('../../api/client', () => ({
  controlClient: {
    get:   jest.fn(),
    patch: jest.fn(),
  },
}));

// ── Import under test ─────────────────────────────────────────────────────────

import { ChecklistScreen } from '../ChecklistScreen';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TASK = {
  id:         'task-001',
  title:      'Contrôle réception viande',
  templateId: 'tpl-001',
};

const TEMPLATE = {
  id:          'tpl-001',
  checkpoints: ['Température viande', 'Aspect visuel produit'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function qr<T>(data: T, opts: { isLoading?: boolean; isError?: boolean } = {}) {
  return {
    data,
    isLoading: opts.isLoading ?? false,
    isError:   opts.isError   ?? false,
  };
}

function mr(mutate: jest.Mock = jest.fn(), isPending = false) {
  return { mutate, isPending };
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ChecklistScreen
        navigation={{ navigate: mockNavigate } as never}
        route={{ params: { taskId: 'task-001' } } as never}
      />
    </QueryClientProvider>,
  );
}

/**
 * Configures useQuery mocks for a fully-loaded screen WITH entries populated.
 *
 * The template useQuery mock invokes queryFn() so that the component's
 * setEntries() side-effect fires. controlClient.get must be mocked to return
 * the template data for the async queryFn to resolve cleanly.
 *
 * NOTE: call this BEFORE setting up mockUseMutation, so it doesn't override it.
 */
function setupQueriesWithEntries() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { controlClient } = require('../../api/client') as {
    controlClient: { get: jest.Mock };
  };
  controlClient.get.mockResolvedValue({ data: { data: TEMPLATE } });

  mockUseQuery
    .mockReturnValueOnce(qr(TASK)) // first call: task query
    .mockImplementationOnce(        // second call: template query
      ({ queryFn }: { queryFn?: () => Promise<unknown> }) => {
        // Fire the queryFn so setEntries() runs as its side-effect.
        void queryFn?.();
        return qr(TEMPLATE);
      },
    );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ChecklistScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: task still loading → loading view shown
    mockUseQuery.mockReturnValue(qr(undefined, { isLoading: true }));
    mockUseMutation.mockReturnValue(mr());
  });

  // ── Loading states ────────────────────────────────────────────────────────────

  it('shows "Chargement du contrôle…" while the task is loading', () => {
    renderScreen();
    expect(screen.getByText('Chargement du contrôle…')).toBeTruthy();
  });

  it('shows an ActivityIndicator while loading', () => {
    renderScreen();
    expect(
      // prefer testID; fall back to type query for the native component
      screen.queryByTestId('activity-indicator') ??
      screen.UNSAFE_queryByType(require('react-native').ActivityIndicator),
    ).toBeTruthy();
  });

  it('shows loading state while the template is loading (task already resolved)', () => {
    mockUseQuery
      .mockReturnValueOnce(qr(TASK))
      .mockReturnValueOnce(qr(undefined, { isLoading: true }));
    renderScreen();
    expect(screen.getByText('Chargement du contrôle…')).toBeTruthy();
  });

  // ── Error states ──────────────────────────────────────────────────────────────

  it('shows "Impossible de charger le contrôle." when the task query fails', () => {
    mockUseQuery.mockReturnValue(qr(undefined, { isError: true }));
    renderScreen();
    expect(screen.getByText('Impossible de charger le contrôle.')).toBeTruthy();
  });

  it('shows "Impossible de charger le contrôle." when the template query fails', () => {
    mockUseQuery
      .mockReturnValueOnce(qr(TASK))
      .mockReturnValueOnce(qr(undefined, { isError: true }));
    renderScreen();
    expect(screen.getByText('Impossible de charger le contrôle.')).toBeTruthy();
  });

  // ── Loaded structure ──────────────────────────────────────────────────────────

  it('renders the "Points de contrôle" section title when loaded', () => {
    mockUseQuery
      .mockReturnValueOnce(qr(TASK))
      .mockReturnValueOnce(qr(TEMPLATE));
    renderScreen();
    expect(screen.getByText('Points de contrôle')).toBeTruthy();
  });

  it('renders the "Soumettre le contrôle" button when loaded', () => {
    mockUseQuery
      .mockReturnValueOnce(qr(TASK))
      .mockReturnValueOnce(qr(TEMPLATE));
    renderScreen();
    expect(screen.getByText('Soumettre le contrôle')).toBeTruthy();
  });

  // ── Checkpoint rows ───────────────────────────────────────────────────────────

  it('renders checkpoint descriptions after entries are initialised', async () => {
    setupQueriesWithEntries();
    mockUseMutation.mockReturnValue(mr());
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Température viande')).toBeTruthy();
      expect(screen.getByText('Aspect visuel produit')).toBeTruthy();
    });
  });

  it('renders a "✓ OK" button for each checkpoint', async () => {
    setupQueriesWithEntries();
    mockUseMutation.mockReturnValue(mr());
    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByText('✓ OK')).toHaveLength(TEMPLATE.checkpoints.length);
    });
  });

  it('renders a "✗ NOK" button for each checkpoint', async () => {
    setupQueriesWithEntries();
    mockUseMutation.mockReturnValue(mr());
    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByText('✗ NOK')).toHaveLength(TEMPLATE.checkpoints.length);
    });
  });

  it('renders a temperature TextInput with "°C" placeholder for each checkpoint', async () => {
    setupQueriesWithEntries();
    mockUseMutation.mockReturnValue(mr());
    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('°C')).toHaveLength(TEMPLATE.checkpoints.length);
    });
  });

  // ── Submit validation (incomplete) ────────────────────────────────────────────

  it('fires an "Incomplet" Alert when submit is pressed with unanswered checkpoints', async () => {
    setupQueriesWithEntries();
    mockUseMutation.mockReturnValue(mr());
    renderScreen();

    // Wait until checkpoint rows are present (entries populated)
    await waitFor(() => expect(screen.getByText('Température viande')).toBeTruthy());

    // Press submit without answering any checkpoint → result is null for all
    fireEvent.press(screen.getByText('Soumettre le contrôle'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Incomplet',
      expect.stringContaining('résultat'),
    );
  });

  it('does NOT call the mutation when checkpoints are incomplete', async () => {
    const mockMutate = jest.fn();
    setupQueriesWithEntries();
    mockUseMutation.mockReturnValue(mr(mockMutate));
    renderScreen();

    await waitFor(() => expect(screen.getByText('Température viande')).toBeTruthy());
    fireEvent.press(screen.getByText('Soumettre le contrôle'));

    expect(mockMutate).not.toHaveBeenCalled();
  });

  // ── Successful submission (all PASS) ──────────────────────────────────────────

  it('calls mutation with status DONE and PASS results when all checkpoints are answered', async () => {
    const mockMutate = jest.fn();
    setupQueriesWithEntries();
    mockUseMutation.mockReturnValue(mr(mockMutate));
    renderScreen();

    await waitFor(() => expect(screen.getAllByText('✓ OK')).toHaveLength(2));

    // Mark every checkpoint as PASS
    screen.getAllByText('✓ OK').forEach((btn) => fireEvent.press(btn));
    fireEvent.press(screen.getByText('Soumettre le contrôle'));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'DONE',
        resultJson: expect.objectContaining({
          checkpoints: expect.arrayContaining([
            expect.objectContaining({ description: 'Température viande',    result: 'PASS' }),
            expect.objectContaining({ description: 'Aspect visuel produit', result: 'PASS' }),
          ]),
        }),
      }),
    );
  });

  it('includes a completedAt ISO timestamp in the mutation payload', async () => {
    const mockMutate = jest.fn();
    setupQueriesWithEntries();
    mockUseMutation.mockReturnValue(mr(mockMutate));
    renderScreen();

    await waitFor(() => expect(screen.getAllByText('✓ OK')).toHaveLength(2));
    screen.getAllByText('✓ OK').forEach((btn) => fireEvent.press(btn));
    fireEvent.press(screen.getByText('Soumettre le contrôle'));

    const call = mockMutate.mock.calls[0]?.[0] as { resultJson?: { completedAt?: string } };
    expect(call?.resultJson?.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // ── isPending state ───────────────────────────────────────────────────────────

  it('hides "Soumettre le contrôle" text and shows a spinner when the mutation is pending', () => {
    mockUseQuery
      .mockReturnValueOnce(qr(TASK))
      .mockReturnValueOnce(qr(TEMPLATE));
    mockUseMutation.mockReturnValue(mr(jest.fn(), true /* isPending */));
    renderScreen();

    expect(screen.queryByText('Soumettre le contrôle')).toBeNull();
    expect(screen.UNSAFE_queryByType(require('react-native').ActivityIndicator)).toBeTruthy();
  });

  // ── NC Modal (FAIL checkpoints) ───────────────────────────────────────────────

  /**
   * Helper: renders the screen with all FAIL checkpoints and simulates onSuccess
   * so that the NC modal becomes visible.
   *
   * Returns the captured onError for optional error-path tests.
   */
  async function renderWithNCModalOpen() {
    let capturedOnSuccess: (() => void) | undefined;

    setupQueriesWithEntries();
    mockUseMutation.mockImplementation(
      ({ onSuccess }: { onSuccess?: () => void; onError?: () => void }) => {
        capturedOnSuccess = onSuccess;
        return { mutate: jest.fn(), isPending: false };
      },
    );

    renderScreen();

    // Wait for checkpoint rows
    await waitFor(() => expect(screen.getAllByText('✗ NOK')).toHaveLength(2));

    // Mark all checkpoints as FAIL so onSuccess shows the NC modal
    screen.getAllByText('✗ NOK').forEach((btn) => fireEvent.press(btn));

    // entries.some(result === null) → false → mutate() is called
    fireEvent.press(screen.getByText('Soumettre le contrôle'));

    // Trigger the captured onSuccess callback (simulates mutation resolving)
    act(() => { capturedOnSuccess?.(); });

    // Wait for the modal to appear
    await waitFor(() => expect(screen.getByText('⚠️ Points de contrôle échoués')).toBeTruthy());
  }

  it('displays the NC modal title after a successful submit with FAIL entries', async () => {
    await renderWithNCModalOpen();
    expect(screen.getByText('⚠️ Points de contrôle échoués')).toBeTruthy();
  });

  it('displays the NC modal body mentioning non-conformités', async () => {
    await renderWithNCModalOpen();
    expect(screen.getByText(/non-conformités/i)).toBeTruthy();
  });

  it('renders "Non" and "Oui, créer" buttons in the NC modal', async () => {
    await renderWithNCModalOpen();
    expect(screen.getByText('Non')).toBeTruthy();
    expect(screen.getByText('Oui, créer')).toBeTruthy();
  });

  it('pressing "Non" shows a success Alert', async () => {
    await renderWithNCModalOpen();
    fireEvent.press(screen.getByText('Non'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Succès',
      expect.stringContaining('succès'),
      expect.any(Array),
    );
  });

  it('pressing "Oui, créer" navigates to Main immediately', async () => {
    await renderWithNCModalOpen();
    fireEvent.press(screen.getByText('Oui, créer'));
    expect(mockNavigate).toHaveBeenCalledWith('Main');
  });

  it('pressing "Oui, créer" shows an Info Alert about the NC tab', async () => {
    await renderWithNCModalOpen();
    fireEvent.press(screen.getByText('Oui, créer'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Info',
      expect.stringContaining('Non-conformités'),
    );
  });

  // ── Mutation error path ───────────────────────────────────────────────────────

  it('shows an error Alert when the mutation fails', async () => {
    let capturedOnError: (() => void) | undefined;

    setupQueriesWithEntries();
    mockUseMutation.mockImplementation(
      ({ onError }: { onSuccess?: () => void; onError?: () => void }) => {
        capturedOnError = onError;
        return { mutate: jest.fn(), isPending: false };
      },
    );
    renderScreen();

    await waitFor(() => expect(screen.getAllByText('✓ OK')).toHaveLength(2));
    screen.getAllByText('✓ OK').forEach((btn) => fireEvent.press(btn));
    fireEvent.press(screen.getByText('Soumettre le contrôle'));

    act(() => { capturedOnError?.(); });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Erreur',
      expect.stringContaining('soumettre'),
    );
  });
});
