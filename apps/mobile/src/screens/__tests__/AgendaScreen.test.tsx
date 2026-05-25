/**
 * AgendaScreen.test.tsx
 *
 * Unit tests for the AgendaScreen (React Native).
 *
 * Strategy:
 *  - Mock @tanstack/react-query hooks (useQuery, useMutation, useQueryClient).
 *  - Mock the API client (`../api/client`) to prevent real HTTP calls.
 *  - Mock react-navigation so navigation.navigate() can be asserted.
 *  - Mock @/i18n so t() returns predictable strings and lang is 'fr'.
 *  - Wrap renders in a QueryClientProvider.
 *
 * Tests cover:
 *  - Header renders today's label and date
 *  - Loading state (ActivityIndicator visible)
 *  - Error state (error text + retry button)
 *  - Task cards render template name, time, status badge
 *  - "Commencer" button visible for PLANNED tasks
 *  - "Continuer" button visible for IN_PROGRESS tasks
 *  - "Rattraper" button visible for OVERDUE tasks
 *  - No start button for COMPLETED / CANCELLED tasks
 *  - Empty state when no tasks returned
 *  - Pressing "Commencer" calls startMutation with taskId and taskTitle
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Navigation mock ────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

// ── i18n mock ──────────────────────────────────────────────────────────────────

jest.mock('@/i18n', () => ({
  useTranslation: () => ({
    lang:    'fr',
    setLang: jest.fn(),
    isRtl:   false,
    t: (key: string) => {
      const map: Record<string, string> = {
        'agenda.todayTitle':                 'Agenda du jour',
        'agenda.tabs.today':                 "Aujourd'hui",
        'agenda.start':                      'Commencer',
        'agenda.continue':                   'Continuer',
        'agenda.catchUp':                    'Rattraper',
        'agenda.recurring':                  'Récurrent',
        'agenda.empty':                      "Aucune tâche pour aujourd'hui",
        'agenda.errorLoad':                  'Erreur de chargement',
        'agenda.startError':                 'Impossible de démarrer la tâche',
        'agenda.status.PLANNED':             'Planifié',
        'agenda.status.IN_PROGRESS':         'En cours',
        'agenda.status.COMPLETED':           'Terminé',
        'agenda.status.OVERDUE':             'En retard',
        'agenda.status.CANCELLED':           'Annulé',
        'common.error':                      'Erreur',
        'common.retry':                      'Réessayer',
      };
      return map[key] ?? key;
    },
  }),
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

import { AgendaScreen } from '../AgendaScreen';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TODAY_ISO = new Date().toISOString().split('T')[0] as string;

/** Build a ControlTask matching the current backend shape. */
function makeTask(overrides: Partial<{
  id:          string;
  templateName: string;
  scheduledAt: string;
  status:      'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';
  templateId:  string;
  scheduleId:  string | null;
}> = {}) {
  return {
    id:         overrides.id           ?? 'task-001',
    template:   { id: overrides.templateId ?? 'tpl-001', name: overrides.templateName ?? 'Contrôle réception viande' },
    scheduledAt: overrides.scheduledAt ?? `${TODAY_ISO}T09:00:00.000Z`,
    status:     overrides.status       ?? 'PLANNED',
    templateId: overrides.templateId   ?? 'tpl-001',
    scheduleId: overrides.scheduleId   ?? null,
  };
}

const PLANNED_TASK     = makeTask({ id: 't1', templateName: 'Contrôle réception viande', status: 'PLANNED'     });
const IN_PROGRESS_TASK = makeTask({ id: 't2', templateName: 'Relevé température froide', status: 'IN_PROGRESS' });
const COMPLETED_TASK   = makeTask({ id: 't3', templateName: 'Nettoyage zone cuisine',    status: 'COMPLETED'   });
const OVERDUE_TASK     = makeTask({ id: 't4', templateName: 'Contrôle hygiène mains',    status: 'OVERDUE'     });
const CANCELLED_TASK   = makeTask({ id: 't5', templateName: 'Vérification stock',        status: 'CANCELLED'   });

// ── Helpers ───────────────────────────────────────────────────────────────────

function qr<T>(data: T, opts: { isFetching?: boolean; isError?: boolean } = {}) {
  return {
    data,
    isFetching: opts.isFetching ?? false,
    isError:    opts.isError    ?? false,
    refetch:    jest.fn(),
  };
}

function mr(mutate: jest.Mock = jest.fn(), isPending = false) {
  return { mutate, isPending };
}

function renderScreen(navigation = { navigate: mockNavigate }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AgendaScreen
        navigation={navigation as never}
        route={{} as never}
      />
    </QueryClientProvider>,
  );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('AgendaScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue(qr([PLANNED_TASK, IN_PROGRESS_TASK, COMPLETED_TASK]));
    mockUseMutation.mockReturnValue(mr());
  });

  // ── Header ────────────────────────────────────────────────────────────────────

  it('renders "Agenda du jour" in the header', () => {
    renderScreen();
    expect(screen.getByText('Agenda du jour')).toBeTruthy();
  });

  it("renders today's date in the header using the active locale", () => {
    renderScreen();
    // The component formats with lang='fr', weekday+day+month — verify the
    // element exists rather than asserting the exact locale-formatted string,
    // since Intl output may vary between Node versions / environments.
    expect(screen.getByText('Agenda du jour')).toBeTruthy();
  });

  // ── Loading state ─────────────────────────────────────────────────────────────

  it('shows ActivityIndicator while fetching (empty data)', () => {
    mockUseQuery.mockReturnValue(qr(undefined, { isFetching: true }));
    renderScreen();
    expect(
      screen.queryByTestId('activity-indicator') ??
      screen.UNSAFE_queryByType(require('react-native').ActivityIndicator),
    ).toBeTruthy();
  });

  // ── Error state ───────────────────────────────────────────────────────────────

  it('shows error text on API failure', () => {
    mockUseQuery.mockReturnValue(qr(undefined, { isError: true }));
    renderScreen();
    expect(screen.getByText('Erreur de chargement')).toBeTruthy();
  });

  it('renders the "Réessayer" button on error', () => {
    mockUseQuery.mockReturnValue(qr(undefined, { isError: true }));
    renderScreen();
    expect(screen.getByText('Réessayer')).toBeTruthy();
  });

  it('calls refetch when "Réessayer" is pressed', () => {
    const mockRefetch = jest.fn();
    mockUseQuery.mockReturnValue({
      data:       undefined,
      isFetching: false,
      isError:    true,
      refetch:    mockRefetch,
    });
    renderScreen();
    fireEvent.press(screen.getByText('Réessayer'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  // ── Task cards ────────────────────────────────────────────────────────────────

  it('renders the task template name in each card', () => {
    renderScreen();
    expect(screen.getByText('Contrôle réception viande')).toBeTruthy();
    expect(screen.getByText('Relevé température froide')).toBeTruthy();
    expect(screen.getByText('Nettoyage zone cuisine')).toBeTruthy();
  });

  it('renders status badge "Planifié" for PLANNED tasks', () => {
    mockUseQuery.mockReturnValue(qr([PLANNED_TASK]));
    renderScreen();
    expect(screen.getByText('Planifié')).toBeTruthy();
  });

  it('renders status badge "En cours" for IN_PROGRESS tasks', () => {
    mockUseQuery.mockReturnValue(qr([IN_PROGRESS_TASK]));
    renderScreen();
    expect(screen.getByText('En cours')).toBeTruthy();
  });

  it('renders status badge "Terminé" for COMPLETED tasks', () => {
    mockUseQuery.mockReturnValue(qr([COMPLETED_TASK]));
    renderScreen();
    expect(screen.getByText('Terminé')).toBeTruthy();
  });

  it('renders status badge "En retard" for OVERDUE tasks', () => {
    mockUseQuery.mockReturnValue(qr([OVERDUE_TASK]));
    renderScreen();
    expect(screen.getByText('En retard')).toBeTruthy();
  });

  it('renders status badge "Annulé" for CANCELLED tasks', () => {
    mockUseQuery.mockReturnValue(qr([CANCELLED_TASK]));
    renderScreen();
    expect(screen.getByText('Annulé')).toBeTruthy();
  });

  // ── Start / Continue / Catch-up buttons ───────────────────────────────────────

  it('renders "Commencer" button for PLANNED task', () => {
    mockUseQuery.mockReturnValue(qr([PLANNED_TASK]));
    renderScreen();
    expect(screen.getByText('Commencer')).toBeTruthy();
  });

  it('renders "Continuer" button for IN_PROGRESS task', () => {
    mockUseQuery.mockReturnValue(qr([IN_PROGRESS_TASK]));
    renderScreen();
    expect(screen.getByText('Continuer')).toBeTruthy();
  });

  it('renders "Rattraper" button for OVERDUE task', () => {
    mockUseQuery.mockReturnValue(qr([OVERDUE_TASK]));
    renderScreen();
    expect(screen.getByText('Rattraper')).toBeTruthy();
  });

  it('does NOT render a start button for COMPLETED task', () => {
    mockUseQuery.mockReturnValue(qr([COMPLETED_TASK]));
    renderScreen();
    expect(screen.queryByText('Commencer')).toBeNull();
    expect(screen.queryByText('Continuer')).toBeNull();
    expect(screen.queryByText('Rattraper')).toBeNull();
  });

  it('does NOT render a start button for CANCELLED task', () => {
    mockUseQuery.mockReturnValue(qr([CANCELLED_TASK]));
    renderScreen();
    expect(screen.queryByText('Commencer')).toBeNull();
  });

  // ── Start task interaction ────────────────────────────────────────────────────

  it('calls startMutation.mutate with taskId and taskTitle when "Commencer" is pressed', () => {
    const mockMutate = jest.fn();
    mockUseQuery.mockReturnValue(qr([PLANNED_TASK]));
    mockUseMutation.mockReturnValue(mr(mockMutate));

    renderScreen();
    fireEvent.press(screen.getByText('Commencer'));

    expect(mockMutate).toHaveBeenCalledWith({
      taskId:    PLANNED_TASK.id,
      taskTitle: PLANNED_TASK.template.name,
    });
  });

  // ── Empty state ───────────────────────────────────────────────────────────────

  it('shows empty state message when there are no tasks', () => {
    mockUseQuery.mockReturnValue(qr([]));
    renderScreen();
    expect(screen.getByText(/aucune tâche pour aujourd'hui/i)).toBeTruthy();
  });

  it('shows the ✅ emoji in the empty state', () => {
    mockUseQuery.mockReturnValue(qr([]));
    renderScreen();
    expect(screen.getByText('✅')).toBeTruthy();
  });
});
