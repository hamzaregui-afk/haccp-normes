/**
 * Select.test.tsx
 *
 * Unit tests for the Select component.
 *
 * Tests cover:
 *  - Renders a <select> element
 *  - Renders all provided options
 *  - Renders a placeholder option with empty value when placeholder prop given
 *  - Renders label and associates it with select via htmlFor / id
 *  - Shows required asterisk when required=true
 *  - Renders error message when error prop is provided
 *  - Applies error border class when error is present
 *  - Forwards ref to the underlying <select> element
 *  - Passes through disabled prop
 *  - Merges custom className
 */

import React, { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { Select } from '../Select';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PLAN_OPTIONS = [
  { value: 'starter',  label: 'Starter'  },
  { value: 'standard', label: 'Standard' },
  { value: 'premium',  label: 'Premium'  },
];

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Select', () => {
  it('renders a select element', () => {
    render(<Select options={PLAN_OPTIONS} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders all provided options', () => {
    render(<Select options={PLAN_OPTIONS} />);
    expect(screen.getByRole('option', { name: 'Starter' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Standard' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Premium' })).toBeInTheDocument();
  });

  it('renders placeholder option with empty value when placeholder is given', () => {
    render(<Select options={PLAN_OPTIONS} placeholder="Choisir un plan" />);
    const placeholder = screen.getByRole('option', { name: 'Choisir un plan' });
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).toHaveValue('');
  });

  it('does not render a placeholder option when placeholder is omitted', () => {
    render(<Select options={PLAN_OPTIONS} />);
    // Only the 3 real options
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('renders label when label prop is provided', () => {
    render(<Select options={PLAN_OPTIONS} label="Plan de facturation" id="plan" />);
    expect(screen.getByLabelText('Plan de facturation')).toBeInTheDocument();
  });

  it('does not render a label when label is omitted', () => {
    render(<Select options={PLAN_OPTIONS} />);
    expect(document.querySelector('label')).toBeNull();
  });

  it('associates label with select via htmlFor and id', () => {
    render(<Select options={PLAN_OPTIONS} label="Statut" id="status-select" />);
    const select = screen.getByLabelText('Statut');
    expect(select.id).toBe('status-select');
  });

  it('shows required asterisk when required=true and label is set', () => {
    render(<Select options={PLAN_OPTIONS} label="Plan" id="plan" required />);
    expect(document.querySelector('label')!.textContent).toContain('*');
  });

  it('does not show asterisk when required is not set', () => {
    render(<Select options={PLAN_OPTIONS} label="Plan" id="plan" />);
    expect(document.querySelector('label')!.textContent).not.toContain('*');
  });

  it('renders error message when error prop is provided', () => {
    render(<Select options={PLAN_OPTIONS} error="Sélection requise" />);
    expect(screen.getByText('Sélection requise')).toBeInTheDocument();
  });

  it('does not render error paragraph when error is absent', () => {
    render(<Select options={PLAN_OPTIONS} />);
    expect(document.querySelector('p')).toBeNull();
  });

  it('applies border-red-500 when error is set', () => {
    render(<Select options={PLAN_OPTIONS} error="Erreur" />);
    expect(screen.getByRole('combobox').className).toContain('border-red-500');
  });

  it('does not apply border-red-500 when error is absent', () => {
    render(<Select options={PLAN_OPTIONS} />);
    expect(screen.getByRole('combobox').className).not.toContain('border-red-500');
  });

  it('forwards ref to the underlying select element', () => {
    const ref = createRef<HTMLSelectElement>();
    render(<Select options={PLAN_OPTIONS} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLSelectElement);
  });

  it('passes through disabled prop', () => {
    render(<Select options={PLAN_OPTIONS} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('merges custom className with base classes', () => {
    render(<Select options={PLAN_OPTIONS} className="w-48" />);
    expect(screen.getByRole('combobox').className).toContain('w-48');
    expect(screen.getByRole('combobox').className).toContain('rounded-lg');
  });
});
