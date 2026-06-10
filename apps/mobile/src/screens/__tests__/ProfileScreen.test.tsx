/**
 * ProfileScreen.test.tsx
 *
 * Unit tests for the ProfileScreen (React Native).
 *
 * Strategy:
 *  - Mock expo-secure-store so no native module is needed
 *  - Provide a fake Zustand auth state via the real useAuthStore
 *
 * Tests cover:
 *  - Renders nothing when user is null (unauthenticated)
 *  - Renders the user's email initial as avatar letter
 *  - Renders the correct French role label for each role
 *  - Renders InfoRow values (email, tenantId, userId)
 *  - Renders application version and platform info
 *  - Logout button is present
 *  - Pressing logout triggers Alert.alert
 */

import React from 'react';
import { Alert } from 'react-native';
import { screen, fireEvent } from '@testing-library/react-native';

import { renderWithI18n as render } from '../../test-utils';

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('expo-secure-store', () => ({
  getItemAsync:    jest.fn().mockResolvedValue(null),
  setItemAsync:    jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// ── Auth store ─────────────────────────────────────────────────────────────────

import { useAuthStore, type JwtPayload } from '../../store/authStore';

function seedUser(user: JwtPayload | null) {
  useAuthStore.setState({ user, token: user ? 'tok' : null });
}

// ── Import under test ──────────────────────────────────────────────────────────

import { ProfileScreen } from '../ProfileScreen';

// ── Fixture ───────────────────────────────────────────────────────────────────

const TEST_USER: JwtPayload = {
  sub:      'user-abc-123',
  email:    'marie@boulangerie.fr',
  role:     'OPERATOR',
  tenantId: 'tenant-xyz-999',
};

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('ProfileScreen', () => {
  afterEach(() => {
    useAuthStore.setState({ user: null, token: null });
  });

  it('renders nothing when user is null', () => {
    seedUser(null);
    const { toJSON } = render(<ProfileScreen />);
    expect(toJSON()).toBeNull();
  });

  it('renders the first letter of the email as avatar initial', () => {
    seedUser(TEST_USER);
    render(<ProfileScreen />);
    // Email starts with 'm' → 'M'
    expect(screen.getByText('M')).toBeTruthy();
  });

  it('renders the correct role label for OPERATOR', () => {
    seedUser(TEST_USER);
    render(<ProfileScreen />);
    expect(screen.getAllByText('Opérateur').length).toBeGreaterThan(0);
  });

  it('renders ADMIN role label correctly', () => {
    seedUser({ ...TEST_USER, role: 'ADMIN' });
    render(<ProfileScreen />);
    expect(screen.getAllByText('Administrateur').length).toBeGreaterThan(0);
  });

  it('renders MANAGER role label correctly', () => {
    seedUser({ ...TEST_USER, role: 'MANAGER' });
    render(<ProfileScreen />);
    expect(screen.getAllByText('Manager').length).toBeGreaterThan(0);
  });

  it('renders QUALITY_OFFICER role label correctly', () => {
    seedUser({ ...TEST_USER, role: 'QUALITY_OFFICER' });
    render(<ProfileScreen />);
    expect(screen.getAllByText('Responsable Qualité').length).toBeGreaterThan(0);
  });

  it('renders the user email in the info section', () => {
    seedUser(TEST_USER);
    render(<ProfileScreen />);
    expect(screen.getByText('marie@boulangerie.fr')).toBeTruthy();
  });

  it('renders the tenantId in the info section', () => {
    seedUser(TEST_USER);
    render(<ProfileScreen />);
    expect(screen.getByText('tenant-xyz-999')).toBeTruthy();
  });

  it('renders the user sub in the info section', () => {
    seedUser(TEST_USER);
    render(<ProfileScreen />);
    expect(screen.getByText('user-abc-123')).toBeTruthy();
  });

  it('renders the app version "1.0.0"', () => {
    seedUser(TEST_USER);
    render(<ProfileScreen />);
    expect(screen.getByText('1.0.0')).toBeTruthy();
  });

  it('renders the platform label "NORMES HACCP Mobile"', () => {
    seedUser(TEST_USER);
    render(<ProfileScreen />);
    expect(screen.getByText('NORMES HACCP Mobile')).toBeTruthy();
  });

  it('renders the Déconnexion logout button', () => {
    seedUser(TEST_USER);
    render(<ProfileScreen />);
    expect(screen.getByText(/déconnexion/i)).toBeTruthy();
  });

  it('calls Alert.alert when logout button is pressed', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    seedUser(TEST_USER);
    render(<ProfileScreen />);
    fireEvent.press(screen.getByText('🚪  Déconnexion'));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      'Déconnexion',
      'Voulez-vous vous déconnecter ?',
      expect.any(Array),
    );
    alertSpy.mockRestore();
  });
});
