/**
 * Input.test.tsx
 *
 * Unit tests for the Input component.
 *
 * Tests cover:
 *  - Renders a bare input without wrapper label by default
 *  - Renders label text when label prop is provided
 *  - Associates label with input via htmlFor / id
 *  - Shows required asterisk (*) when required=true
 *  - Shows error message when error prop is provided
 *  - Applies error border class when error is present
 *  - Error class is absent when no error
 *  - Forwards ref to the underlying <input> element
 *  - Passes through native props (placeholder, disabled, type)
 *  - Merges custom className with base classes
 */

import React, { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { Input } from '../Input';

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Input', () => {
  it('renders an input element', () => {
    render(<Input />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders a label when label prop is provided', () => {
    render(<Input label="Nom du restaurant" id="restaurant-name" />);
    expect(screen.getByLabelText('Nom du restaurant')).toBeInTheDocument();
  });

  it('does not render a label when label prop is omitted', () => {
    render(<Input placeholder="Rechercher..." />);
    expect(screen.queryByText(/label/i)).toBeNull();
    // No <label> element in the DOM
    expect(document.querySelector('label')).toBeNull();
  });

  it('associates label with input via htmlFor and id', () => {
    render(<Input label="Prénom" id="first-name" />);
    const input = screen.getByLabelText('Prénom');
    expect(input).toBeInTheDocument();
    expect(input.id).toBe('first-name');
  });

  it('shows a red asterisk when required=true and label is set', () => {
    render(<Input label="Email" id="email" required />);
    // The asterisk span is inside the label
    const label = document.querySelector('label')!;
    expect(label.textContent).toContain('*');
  });

  it('does not show an asterisk when required is not set', () => {
    render(<Input label="Email" id="email" />);
    const label = document.querySelector('label')!;
    expect(label.textContent).not.toContain('*');
  });

  it('renders error message text when error prop is provided', () => {
    render(<Input error="Ce champ est obligatoire" />);
    expect(screen.getByText('Ce champ est obligatoire')).toBeInTheDocument();
  });

  it('does not render error paragraph when error is absent', () => {
    render(<Input />);
    expect(document.querySelector('p')).toBeNull();
  });

  it('applies border-red-500 class when error is set', () => {
    render(<Input error="Erreur" />);
    const input = screen.getByRole('textbox');
    expect(input.className).toContain('border-red-500');
  });

  it('does not apply border-red-500 when error is absent', () => {
    render(<Input />);
    expect(screen.getByRole('textbox').className).not.toContain('border-red-500');
  });

  it('forwards ref to the underlying input element', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('passes through placeholder prop', () => {
    render(<Input placeholder="Entrer une valeur" />);
    expect(screen.getByPlaceholderText('Entrer une valeur')).toBeInTheDocument();
  });

  it('passes through disabled prop', () => {
    render(<Input disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('passes through type prop', () => {
    render(<Input type="email" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('type', 'email');
  });

  it('merges custom className with base classes', () => {
    render(<Input className="my-custom-class" />);
    const input = screen.getByRole('textbox');
    expect(input.className).toContain('my-custom-class');
    expect(input.className).toContain('rounded-lg');
  });
});
