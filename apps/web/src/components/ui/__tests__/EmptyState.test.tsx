/**
 * EmptyState.test.tsx
 *
 * Unit tests for the EmptyState component.
 *
 * Tests cover:
 *  - Renders title and description
 *  - Renders the icon in an illustration circle
 *  - Does NOT render a button when actionLabel or onAction is absent
 *  - Renders a button when both actionLabel and onAction are provided
 *  - Clicking the action button calls onAction
 *  - Does not render the button if only actionLabel is provided (without onAction)
 *  - Does not render the button if only onAction is provided (without actionLabel)
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Package } from 'lucide-react';
import { EmptyState } from '../EmptyState';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_PROPS = {
  icon:        Package,
  title:       'Aucun produit',
  description: 'Commencez par créer votre premier produit.',
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('EmptyState', () => {
  it('renders the title', () => {
    render(<EmptyState {...BASE_PROPS} />);
    expect(screen.getByText('Aucun produit')).toBeInTheDocument();
  });

  it('renders the description', () => {
    render(<EmptyState {...BASE_PROPS} />);
    expect(screen.getByText('Commencez par créer votre premier produit.')).toBeInTheDocument();
  });

  it('renders an SVG icon inside the illustration circle', () => {
    render(<EmptyState {...BASE_PROPS} />);
    // Lucide renders <svg> elements
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('does not render a button when actionLabel and onAction are absent', () => {
    render(<EmptyState {...BASE_PROPS} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not render a button when only actionLabel is provided', () => {
    render(<EmptyState {...BASE_PROPS} actionLabel="Créer un produit" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not render a button when only onAction is provided', () => {
    render(<EmptyState {...BASE_PROPS} onAction={jest.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders a button when both actionLabel and onAction are provided', () => {
    render(<EmptyState {...BASE_PROPS} actionLabel="Créer un produit" onAction={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Créer un produit' })).toBeInTheDocument();
  });

  it('calls onAction when the action button is clicked', async () => {
    const onAction = jest.fn();
    const user = userEvent.setup();
    render(<EmptyState {...BASE_PROPS} actionLabel="Créer" onAction={onAction} />);
    await user.click(screen.getByRole('button', { name: 'Créer' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
