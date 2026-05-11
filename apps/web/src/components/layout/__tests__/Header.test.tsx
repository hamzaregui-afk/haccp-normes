/**
 * Header.test.tsx
 *
 * Unit tests for the Header component.
 *
 * Strategy:
 *  - Mock @/components/notifications (NotificationBell has WebSocket deps)
 *  - Mock @/i18n to control SUPPORTED_LANGUAGES and setLanguage
 *  - jsdom provides localStorage — we stub getItem for lang init
 *
 * Tests cover:
 *  - Renders the page title
 *  - Renders optional subtitle
 *  - Does not render subtitle when omitted
 *  - Renders icon badge when icon prop is provided
 *  - Does not render icon badge when icon is omitted
 *  - Renders one button per supported language
 *  - Active language button has aria-pressed="true"
 *  - Inactive language buttons have aria-pressed="false"
 *  - Clicking an inactive language calls setLanguage with its code
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Building2 } from 'lucide-react';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/components/notifications', () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}));

const mockSetLanguage = jest.fn();

jest.mock('@/i18n', () => ({
  SUPPORTED_LANGUAGES: [
    { code: 'fr', label: 'Français', dir: 'ltr' },
    { code: 'en', label: 'English',  dir: 'ltr' },
    { code: 'ar', label: 'العربية',  dir: 'rtl' },
  ],
  setLanguage: (...args: unknown[]) => mockSetLanguage(...args),
}));

// ── Subject ───────────────────────────────────────────────────────────────────

import { Header } from '../Header';

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Header', () => {
  beforeEach(() => {
    mockSetLanguage.mockClear();
    // Default language stored in localStorage
    localStorage.setItem('haccp_lang', 'fr');
  });

  it('renders the page title', () => {
    render(<Header title="Tableau de bord" />);
    expect(screen.getByRole('heading', { name: 'Tableau de bord' })).toBeInTheDocument();
  });

  it('renders optional subtitle when provided', () => {
    render(<Header title="Contrôles" subtitle="Vue d'ensemble des contrôles qualité" />);
    expect(screen.getByText("Vue d'ensemble des contrôles qualité")).toBeInTheDocument();
  });

  it('does not render subtitle when omitted', () => {
    render(<Header title="Contrôles" />);
    expect(document.querySelector('p')).toBeNull();
  });

  it('renders the icon wrapper when icon prop is provided', () => {
    render(<Header title="Clients" icon={Building2} />);
    // Lucide renders an <svg>
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('does not render an icon wrapper when icon is omitted', () => {
    render(<Header title="Clients" />);
    expect(document.querySelector('svg')).toBeNull();
  });

  it('applies custom iconColor class when provided', () => {
    render(<Header title="T" icon={Building2} iconColor="bg-red-100 text-red-700" />);
    // The wrapper div around the icon should contain the custom class
    const iconWrapper = document.querySelector('.bg-red-100');
    expect(iconWrapper).toBeInTheDocument();
  });

  it('renders one language button per supported language (FR / EN / AR)', () => {
    render(<Header title="T" />);
    // Each language code is displayed as uppercase text in a button
    expect(screen.getByRole('button', { name: 'FR' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AR' })).toBeInTheDocument();
  });

  it('marks the current language button as aria-pressed="true"', () => {
    localStorage.setItem('haccp_lang', 'fr');
    render(<Header title="T" />);
    expect(screen.getByRole('button', { name: 'FR' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks inactive language buttons as aria-pressed="false"', () => {
    localStorage.setItem('haccp_lang', 'fr');
    render(<Header title="T" />);
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'AR' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls setLanguage with the correct code when a language button is clicked', async () => {
    const user = userEvent.setup();
    render(<Header title="T" />);
    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect(mockSetLanguage).toHaveBeenCalledWith('en');
  });

  it('renders the NotificationBell', () => {
    render(<Header title="T" />);
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
  });
});
