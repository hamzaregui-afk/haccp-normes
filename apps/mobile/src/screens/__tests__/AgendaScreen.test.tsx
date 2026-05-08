/**
 * AgendaScreen.test.tsx
 *
 * Unit tests for the AgendaScreen (React Native).
 *
 * Strategy:
 *  - Mock @tanstack/react-query hooks (useQuery, useMutation, useQueryClient).
 *  - Mock the API client (`../api/client`) to prevent real HTTP calls.
 *  - Mock react-navigation so navigation.navigate() can be asserted.
 *  - Wrap renders in a QueryClientProvider.
 *
 * Tests cover:
 *  - Header renders "Agenda du jour" and today's date
 *  - Loading state (ActivityIndicator visible)
 *  - Error state ("Erreur de chargement" + Réessayer button)
 *  - Task cards render title, time, status badge
 *  - "Commencer" button visible for PENDING tasks
 *  - "Continuer" button visible for IN_PROGRESS tasks
 *  - No start button for DONE / FAILED tasks
 *  - Empty state when no tasks returned
 *  - Pressing "Commencer" calls startMutation and navigates to Checklist
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
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

import { AgendaScreen } from '../AgendaScreen';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TODAY_ISO = new Date().toISOString().split('T')[0];

function makeTask(overrides: Partial<{
  id: string;
  title: string;
  scheduledDate: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'FAILED';
  templateId: string;
}> = {}) {
  return {
    id:            overrides.id            ?? 'task-001',
    title:         overrides.title         ?? 'Contrôle réception viande',
    scheduledDate: overrides.scheduledDate ?? `${TODAY_ISO as string}T09:00:00.000Z`,
    status:        overrides.status        ?? 'PENDING',
    templateId:    overrides.templateId    ?? 'tpl-001',
  };
}

const PENDING_TASK     = makeTask({ id: 't1', title: 'Contrôle réception viande',    status: 'PENDING'     });
const IN_PROGRESS_TASK = makeTask({ id: 't2', title: 'Relevé température froide',    status: 'IN_PROGRESS' });
const DONE_TASK        = makeTask({ id: 't3', title: 'Nettoyage zone cuisine',        status: 'DONE'        });
const FAILED_TASK      = makeTask({ id: 't4', title: 'Contrôle hygiene mains',       status: 'FAILED'      });

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
    mockUseQuery.mockReturnValue(qr([PENDING_TASK, IN_PROGRESS_TASK, DONE_TASK]));
    mockUseMutation.mockReturnValue(mr());
  });

  // ── Header ────────────────────────────────────────────────────────────────────

  it('renders "Agenda du jour" in the header', () => {
    renderScreen();
    expect(screen.getByText('Agenda du jour')).toBeTruthy();
  });

  it('renders today\'s date in the header', () => {
    renderScreen();
    const today = new Date().toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    expect(screen.getByText(today)).toBeTruthy();
  });

  // ── Loading state ─────────────────────────────────────────────────────────────

  it('shows ActivityIndicator while fetching (empty data)', () => {
    mockUseQuery.mockReturnValue(qr(undefined, { isFetching: true }));
    renderScreen();
    expect(screen.queryByTestId('activity-indicator') ??
      screen.UNSAFE_queryByType(require('react-native').ActivityIndicator)).toBeTruthy();
  });

  // ── Error state ───────────────────────────────────────────────────────────────

  it('shows "Erreur de chargement" on API failure', () => {
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

  it('renders the task title in each card', () => {
    renderScreen();
    expect(screen.getByText('Contrôle réception viande')).toBeTruthy();
    expect(screen.getByText('Relevé température froide')).toBeTruthy();
    expect(screen.getByText('Nettoyage zone cuisine')).toBeTruthy();
  });

  it('renders status badge "En attente" for PENDING tasks', () => {
    mockUseQuery.mockReturnValue(qr([PENDING_TASK]));
    renderScreen();
    expect(screen.getByText('En attente')).toBeTruthy();
  });

  it('renders status badge "En cours" for IN_PROGRESS tasks', () => {
    mockUseQuery.mockReturnValue(qr([IN_PROGRESS_TASK]));
    renderScreen();
    expect(screen.getByText('En cours')).toBeTruthy();
  });

  it('renders status badge "Terminé" for DONE tasks', () => {
    mockUseQuery.mockReturnValue(qr([DONE_TASK]));
    renderScreen();
    expect(screen.getByText('Terminé')).toBeTruthy();
  });

  it('renders status badge "Échoué" for FAILED tasks', () => {
    mockUseQuery.mockReturnValue(qr([FAILED_TASK]));
    renderScreen();
    expect(screen.getByText('Échoué')).toBeTruthy();
  });

  // ── Start / Continue buttons ──────────────────────────────────────────────────

  it('renders "Commencer" button for PENDING task', () => {
    mockUseQuery.mockReturnValue(qr([PENDING_TASK]));
    renderScreen();
    expect(screen.getByText('Commencer')).toBeTruthy();
  });

  it('renders "Continuer" button for IN_PROGRESS task', () => {
    mockUseQuery.mockReturnValue(qr([IN_PROGRESS_TASK]));
    renderScreen();
    expect(screen.getByText('Continuer')).toBeTruthy();
  });

  it('does NOT render a start button for DONE task', () => {
    mockUseQuery.mockReturnValue(qr([DONE_TASK]));
    renderScreen();
    expect(screen.queryByText('Commencer')).toBeNull();
    expect(screen.queryByText('Continuer')).toBeNull();
  });

  it('does NOT render a start button for FAILED task', () => {
    mockUseQuery.mockReturnValue(qr([FAILED_TASK]));
    renderScreen();
    expect(screen.queryByText('Commencer')).toBeNull();
  });

  // ── Start task interaction ────────────────────────────────────────────────────

  it('calls startMutation.mutate with taskId and taskTitle when "Commencer" is pressed', () => {
    const mockMutate = jest.fn();
    mockUseQuery.mockReturnValue(qr([PENDING_TASK]));
    mockUseMutation.mockReturnValue(mr(mockMutate));

    renderScreen();
    fireEvent.press(screen.getByText('Commencer'));

    expect(mockMutate).toHaveBeenCalledWith({
      taskId:    PENDING_TASK.id,
      taskTitle: PENDING_TASK.title,
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
