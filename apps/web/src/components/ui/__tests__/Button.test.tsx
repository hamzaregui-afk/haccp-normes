/**
 * Button.test.tsx
 *
 * Unit tests for the Button component.
 *
 * Tests cover:
 *  - Renders children
 *  - Default variant and size classes applied
 *  - All variant classes applied correctly
 *  - All size classes applied correctly
 *  - Loading state: spinner shown, button disabled
 *  - disabled prop: button is not clickable
 *  - onClick fires when not disabled/loading
 *  - Forwards ref to the underlying <button> element
 */

import React, { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../Button';

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Enregistrer</Button>);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
  });

  it('applies primary variant classes by default', () => {
    render(<Button>Test</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-brand-medium');
    expect(btn.className).toContain('text-white');
  });

  it('applies secondary variant classes', () => {
    render(<Button variant="secondary">Test</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-white');
    expect(btn.className).toContain('border-brand-medium');
  });

  it('applies danger variant classes', () => {
    render(<Button variant="danger">Supprimer</Button>);
    expect(screen.getByRole('button').className).toContain('bg-red-600');
  });

  it('applies ghost variant classes', () => {
    render(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole('button').className).toContain('text-brand-medium');
  });

  it('applies sm size classes', () => {
    render(<Button size="sm">Sm</Button>);
    expect(screen.getByRole('button').className).toContain('h-8');
  });

  it('applies lg size classes', () => {
    render(<Button size="lg">Lg</Button>);
    expect(screen.getByRole('button').className).toContain('h-10');
  });

  it('shows spinner and is disabled when loading=true', () => {
    render(<Button loading>Chargement</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    // Spinner is rendered as a span with animate-spin
    expect(btn.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('is disabled when disabled=true and does not call onClick', async () => {
    const onClick = jest.fn();
    const user = userEvent.setup();
    render(<Button disabled onClick={onClick}>Désactivé</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('calls onClick when clicked and not disabled', async () => {
    const onClick = jest.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Cliquer</Button>);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('forwards ref to the underlying button element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.textContent).toBe('Ref');
  });

  it('merges custom className with variant classes', () => {
    render(<Button className="custom-class">Test</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('custom-class');
    expect(btn.className).toContain('bg-brand-medium'); // variant class still present
  });
});
