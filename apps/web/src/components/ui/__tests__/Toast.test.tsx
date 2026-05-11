/**
 * Toast.test.tsx
 *
 * Unit tests for the Toast notification system.
 *
 * Tests cover:
 *  - ToastContainer renders nothing when no toasts
 *  - showToast() causes a toast to appear with correct title and variant
 *  - Toast auto-dismisses after 5 s (fake timers)
 *  - Close button removes the toast immediately
 *  - Multiple toasts stack and each can be closed independently
 *  - ARIA attributes: role="alert" and aria-live="polite" are set
 */

import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastContainer, showToast } from '../Toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderContainer() {
  return render(<ToastContainer />);
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ToastContainer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders nothing when there are no toasts', () => {
    renderContainer();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a toast after showToast() is called', () => {
    renderContainer();

    act(() => {
      showToast({ title: 'Importation réussie', variant: 'success' });
    });

    expect(screen.getByText('Importation réussie')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('sets aria-live="polite" on the alert element', () => {
    renderContainer();

    act(() => {
      showToast({ title: 'Test ARIA', variant: 'info' });
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'polite');
  });

  it('renders the optional body text', () => {
    renderContainer();

    act(() => {
      showToast({ title: 'Titre', body: 'Description détaillée', variant: 'info' });
    });

    expect(screen.getByText('Description détaillée')).toBeInTheDocument();
  });

  it('auto-dismisses after 5 seconds', () => {
    renderContainer();

    act(() => {
      showToast({ title: 'Auto-dismiss', variant: 'success' });
    });

    expect(screen.getByText('Auto-dismiss')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(screen.queryByText('Auto-dismiss')).toBeNull();
  });

  it('close button removes the toast immediately', async () => {
    renderContainer();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) });

    act(() => {
      showToast({ title: 'Fermer moi', variant: 'warning' });
    });

    expect(screen.getByText('Fermer moi')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /fermer/i }));

    await waitFor(() => {
      expect(screen.queryByText('Fermer moi')).toBeNull();
    });
  });

  it('stacks multiple toasts and each is independently dismissible', async () => {
    renderContainer();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) });

    act(() => {
      showToast({ title: 'Toast A', variant: 'success' });
      showToast({ title: 'Toast B', variant: 'error' });
    });

    expect(screen.getByText('Toast A')).toBeInTheDocument();
    expect(screen.getByText('Toast B')).toBeInTheDocument();

    // Close only the first one
    const closeButtons = screen.getAllByRole('button', { name: /fermer/i });
    await user.click(closeButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText('Toast A')).toBeNull();
    });

    expect(screen.getByText('Toast B')).toBeInTheDocument();
  });

  it('shows error variant toast', () => {
    renderContainer();

    act(() => {
      showToast({ title: 'Erreur critique', variant: 'error' });
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('border-red-500');
  });
});
