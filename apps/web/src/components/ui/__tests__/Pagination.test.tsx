/**
 * Pagination.test.tsx
 *
 * Unit tests for the Pagination component.
 *
 * Tests cover:
 *  - Renders nothing when lastPage <= 1
 *  - Shows total results count
 *  - Prev button is disabled on page 1
 *  - Next button is disabled on last page
 *  - Clicking Prev calls onPrev
 *  - Clicking Next calls onNext
 *  - Clicking a page pill calls onPage with the correct page number
 *  - Current page pill has aria-current="page"
 *  - Page window clamps correctly near boundaries
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from '../Pagination';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_PROPS = {
  page:     1,
  lastPage: 5,
  total:    100,
  onPrev:   jest.fn(),
  onNext:   jest.fn(),
  onPage:   jest.fn(),
};

function renderPagination(overrides: Partial<typeof BASE_PROPS> = {}) {
  const props = { ...BASE_PROPS, onPrev: jest.fn(), onNext: jest.fn(), onPage: jest.fn(), ...overrides };
  return { ...render(<Pagination {...props} />), props };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Pagination', () => {
  it('renders nothing when lastPage is 1', () => {
    const { container } = renderPagination({ lastPage: 1, total: 10 });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when lastPage is 0', () => {
    const { container } = renderPagination({ lastPage: 0, total: 0 });
    expect(container.firstChild).toBeNull();
  });

  it('shows the total results count', () => {
    renderPagination({ total: 42 });
    expect(screen.getByText(/42 résultat/)).toBeInTheDocument();
  });

  it('shows singular "résultat" when total is 1', () => {
    renderPagination({ total: 1, lastPage: 2 });
    expect(screen.getByText('1 résultat')).toBeInTheDocument();
  });

  it('disables Prev button on page 1', () => {
    renderPagination({ page: 1 });
    expect(screen.getByLabelText('Page précédente')).toBeDisabled();
  });

  it('enables Prev button on page > 1', () => {
    renderPagination({ page: 2 });
    expect(screen.getByLabelText('Page précédente')).not.toBeDisabled();
  });

  it('disables Next button on last page', () => {
    renderPagination({ page: 5, lastPage: 5 });
    expect(screen.getByLabelText('Page suivante')).toBeDisabled();
  });

  it('enables Next button when not on last page', () => {
    renderPagination({ page: 3, lastPage: 5 });
    expect(screen.getByLabelText('Page suivante')).not.toBeDisabled();
  });

  it('calls onPrev when Prev is clicked', async () => {
    const { props } = renderPagination({ page: 2 });
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Page précédente'));
    expect(props.onPrev).toHaveBeenCalledTimes(1);
  });

  it('calls onNext when Next is clicked', async () => {
    const { props } = renderPagination({ page: 3 });
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Page suivante'));
    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  it('calls onPage with the correct number when a page pill is clicked', async () => {
    const { props } = renderPagination({ page: 1, lastPage: 5 });
    const user = userEvent.setup();
    // Page pills visible: 1-5 (window of up to 5 pages)
    await user.click(screen.getByLabelText('Page 3'));
    expect(props.onPage).toHaveBeenCalledWith(3);
  });

  it('marks current page pill with aria-current="page"', () => {
    renderPagination({ page: 2 });
    expect(screen.getByLabelText('Page 2')).toHaveAttribute('aria-current', 'page');
  });

  it('does not mark other pills with aria-current', () => {
    renderPagination({ page: 2 });
    expect(screen.getByLabelText('Page 1')).not.toHaveAttribute('aria-current', 'page');
  });

  it('renders up to 5 page pills when total pages > 5', () => {
    renderPagination({ page: 1, lastPage: 10 });
    // Pages 1–5 should be visible
    const pillButtons = screen.getAllByRole('button').filter((btn) => /^Page \d+$/.test(btn.getAttribute('aria-label') ?? ''));
    expect(pillButtons).toHaveLength(5);
  });
});
