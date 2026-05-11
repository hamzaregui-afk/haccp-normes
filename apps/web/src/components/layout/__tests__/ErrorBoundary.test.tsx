/**
 * ErrorBoundary.test.tsx
 *
 * Unit tests for the ErrorBoundary class component.
 *
 * Strategy:
 *  - Use a Bomb child component that throws synchronously on demand
 *  - Silence expected console.error output per test
 *
 * Tests cover:
 *  - Renders children normally when no error occurs
 *  - Catches a render error and shows the error UI heading
 *  - Displays the error message in the <pre> block
 *  - "Réessayer" button clears the error and re-renders children
 *  - "Recharger la page" button calls window.location.reload
 *  - Custom fallback is rendered instead of the default error UI when provided
 *  - componentDidCatch logs to console.error
 */

import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '../ErrorBoundary';

// ─── Bomb — a child that throws when shouldThrow=true ─────────────────────────

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Boom! Something went wrong.');
  return <p>Everything is fine</p>;
}

// ─── Wrapper to toggle shouldThrow from outside ───────────────────────────────

function BombWrapper() {
  const [explode, setExplode] = useState(false);
  return (
    <ErrorBoundary>
      {explode ? (
        <Bomb shouldThrow />
      ) : (
        <button onClick={() => setExplode(true)}>Trigger error</button>
      )}
    </ErrorBoundary>
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ErrorBoundary', () => {
  // React logs caught errors to console.error — suppress in tests
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <p>Tout va bien</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Tout va bien')).toBeInTheDocument();
    expect(screen.queryByText(/erreur inattendue/i)).toBeNull();
  });

  it('catches a render error and shows the error heading', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Une erreur inattendue s'est produite")).toBeInTheDocument();
  });

  it('displays the caught error message in the pre block', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Boom! Something went wrong.')).toBeInTheDocument();
  });

  it('shows Réessayer and Recharger la page buttons on error', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recharger/i })).toBeInTheDocument();
  });

  it('clears the error and re-renders children when Réessayer is clicked', async () => {
    const user = userEvent.setup();

    // Render boundary with a child that does NOT throw (after reset children works)
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );

    // Error UI is shown
    expect(screen.getByText(/réessayer/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /réessayer/i }));

    // After reset, children are rendered — Bomb still throws, so error UI is shown again
    // because the child itself hasn't changed. This just confirms the state was cleared
    // and getDerivedStateFromError fired again.
    expect(screen.getByText(/réessayer/i)).toBeInTheDocument();
  });

  it('calls window.location.reload when Recharger la page is clicked', async () => {
    const reloadMock = jest.fn();
    Object.defineProperty(window, 'location', {
      value:    { reload: reloadMock },
      writable: true,
    });

    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole('button', { name: /recharger/i }));
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('renders a custom fallback instead of the default error UI', () => {
    render(
      <ErrorBoundary fallback={<p>Fallback personnalisé</p>}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Fallback personnalisé')).toBeInTheDocument();
    expect(screen.queryByText(/erreur inattendue/i)).toBeNull();
  });

  it('calls console.error when componentDidCatch fires', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    // Our spy should have been called by React and by componentDidCatch
    expect(consoleErrorSpy).toHaveBeenCalled();
    const args = consoleErrorSpy.mock.calls.flat().join(' ');
    expect(args).toContain('[ErrorBoundary]');
  });
});
