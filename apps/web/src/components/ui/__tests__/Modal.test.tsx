/**
 * Modal.test.tsx
 *
 * Unit tests for the Modal component.
 *
 * Tests cover:
 *  - Renders nothing when open=false
 *  - Renders title and children when open=true
 *  - Optional description is shown when provided
 *  - X button calls onClose
 *  - Backdrop click calls onClose
 *  - Escape key calls onClose
 *  - Size variants apply correct max-width classes
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../Modal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_PROPS = {
  open:     true,
  onClose:  jest.fn(),
  title:    'Titre du modal',
  children: <p>Contenu du modal</p>,
};

function renderModal(overrides: Partial<typeof DEFAULT_PROPS> = {}) {
  const props = { ...DEFAULT_PROPS, onClose: jest.fn(), ...overrides };
  return { ...render(<Modal {...props} />), onClose: props.onClose };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Modal', () => {
  it('renders nothing when open=false', () => {
    render(
      <Modal open={false} onClose={jest.fn()} title="Test">
        <p>Content</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Test')).toBeNull();
  });

  it('renders the title and children when open=true', () => {
    renderModal();
    expect(screen.getByText('Titre du modal')).toBeInTheDocument();
    expect(screen.getByText('Contenu du modal')).toBeInTheDocument();
  });

  it('renders optional description when provided', () => {
    renderModal({ description: 'Sous-titre descriptif' });
    expect(screen.getByText('Sous-titre descriptif')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    renderModal({ description: undefined });
    // Only title + content — no extra paragraph
    expect(screen.queryByText('Sous-titre descriptif')).toBeNull();
  });

  it('calls onClose when the X button is clicked', async () => {
    const { onClose } = renderModal();
    const user = userEvent.setup();
    const closeBtn = screen.getByRole('button');
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const { onClose } = renderModal();
    const user = userEvent.setup();
    // The backdrop is the first div with aria-hidden
    const backdrop = document.querySelector('[aria-hidden]') as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on other key presses', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cleans up the keydown listener when unmounted', () => {
    const { onClose, unmount } = renderModal();
    unmount();
    // After unmount, Escape should not trigger the stale handler
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies max-w-sm for size="sm"', () => {
    renderModal({ size: 'sm' });
    const panel = document.querySelector('.max-w-sm');
    expect(panel).toBeInTheDocument();
  });

  it('applies max-w-2xl for size="lg"', () => {
    renderModal({ size: 'lg' });
    const panel = document.querySelector('.max-w-2xl');
    expect(panel).toBeInTheDocument();
  });
});
