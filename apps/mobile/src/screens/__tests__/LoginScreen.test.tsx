/**
 * LoginScreen.test.tsx
 *
 * Unit tests for the LoginScreen (React Native).
 *
 * Strategy:
 *  - Mock ../api/client (authClient) to prevent real HTTP
 *  - Mock ../i18n to return stable translated strings without SecureStore
 *  - Mock ../store/authStore to capture setAuth calls
 *
 * Tests cover:
 *  - Brand title is visible
 *  - Email and password inputs are rendered
 *  - Validation: shows error when fields are empty on submit
 *  - ActivityIndicator shown during loading
 *  - Successful login calls setAuth with token and user
 *  - API error: shows server error message
 *  - API error (non-axios): shows generic loginError translation
 *  - Language buttons rendered for FR / EN / AR
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';

// ── API client mock ────────────────────────────────────────────────────────────

const mockPost = jest.fn();

jest.mock('../../api/client', () => ({
  authClient: { post: (...args: unknown[]) => mockPost(...args) },
}));

// ── i18n mock ──────────────────────────────────────────────────────────────────

const mockSetLang = jest.fn().mockResolvedValue(undefined);

jest.mock('../../i18n', () => ({
  SUPPORTED_LANGUAGES: [
    { code: 'fr', label: 'Français', rtl: false },
    { code: 'en', label: 'English',  rtl: false },
    { code: 'ar', label: 'العربية',  rtl: true  },
  ],
  useTranslation: () => ({
    lang:    'fr',
    setLang: mockSetLang,
    t:       (key: string) => {
      const translations: Record<string, string> = {
        'auth.title':       'NORMES HACCP',
        'auth.subtitle':    'Sécurité alimentaire',
        'auth.login':       'Connexion',
        'auth.email':       'Adresse e-mail',
        'auth.password':    'Mot de passe',
        'auth.loginButton': 'Se connecter',
        'auth.loginError':  'Identifiants invalides',
        'common.required':  'Champs obligatoires',
      };
      return translations[key] ?? key;
    },
    isRtl: false,
  }),
}));

// ── Auth store mock ────────────────────────────────────────────────────────────

const mockSetAuth = jest.fn();

jest.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ setAuth: mockSetAuth }),
}));

// ── expo-secure-store (needed by authStore import path) ───────────────────────

jest.mock('expo-secure-store', () => ({
  getItemAsync:    jest.fn().mockResolvedValue(null),
  setItemAsync:    jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// ── Import under test ─────────────────────────────────────────────────────────

import { LoginScreen } from '../LoginScreen';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderScreen() {
  return render(
    <LoginScreen
      navigation={{ navigate: jest.fn(), replace: jest.fn() } as never}
      route={{} as never}
    />,
  );
}

const FAKE_USER = {
  sub:      'user-001',
  email:    'chef@resto.fr',
  role:     'OPERATOR',
  tenantId: 'tenant-001',
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the brand title', () => {
    renderScreen();
    expect(screen.getByText('NORMES HACCP')).toBeTruthy();
  });

  it('renders email and password inputs', () => {
    renderScreen();
    expect(screen.getByTestId('email-input')).toBeTruthy();
    expect(screen.getByTestId('password-input')).toBeTruthy();
  });

  it('renders the login button', () => {
    renderScreen();
    expect(screen.getByTestId('login-button')).toBeTruthy();
    expect(screen.getByText('Se connecter')).toBeTruthy();
  });

  it('renders language buttons for FR, EN, AR', () => {
    renderScreen();
    expect(screen.getByText('FR')).toBeTruthy();
    expect(screen.getByText('EN')).toBeTruthy();
    expect(screen.getByText('AR')).toBeTruthy();
  });

  it('shows validation error when email is empty on submit', async () => {
    renderScreen();
    fireEvent.press(screen.getByTestId('login-button'));
    await waitFor(() => {
      expect(screen.getByText('Champs obligatoires')).toBeTruthy();
    });
  });

  it('shows validation error when password is empty on submit', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('email-input'), 'user@test.fr');
    fireEvent.press(screen.getByTestId('login-button'));
    await waitFor(() => {
      expect(screen.getByText('Champs obligatoires')).toBeTruthy();
    });
  });

  it('calls setAuth with token, user AND refresh token on successful login', async () => {
    // The auth-service returns a refreshToken alongside the access token; the
    // screen must forward it to setAuth so the client can silently renew the
    // session on 401 (AUTH-1/AUTH-2).
    mockPost.mockResolvedValue({
      data: { accessToken: 'jwt-token', refreshToken: 'refresh-token', user: FAKE_USER },
    });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('email-input'), 'chef@resto.fr');
    fireEvent.changeText(screen.getByTestId('password-input'), 'secret123');
    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(mockSetAuth).toHaveBeenCalledWith('jwt-token', FAKE_USER, 'refresh-token');
    });
  });

  it('shows server error message when API returns 401 with a message', async () => {
    mockPost.mockRejectedValue({
      response: { data: { message: 'Mot de passe incorrect' } },
    });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('email-input'), 'chef@resto.fr');
    fireEvent.changeText(screen.getByTestId('password-input'), 'wrongpass');
    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(screen.getByText('Mot de passe incorrect')).toBeTruthy();
    });
  });

  it('shows generic loginError when API throws without a response body', async () => {
    mockPost.mockRejectedValue(new Error('Network error'));

    renderScreen();
    fireEvent.changeText(screen.getByTestId('email-input'), 'chef@resto.fr');
    fireEvent.changeText(screen.getByTestId('password-input'), 'pass');
    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(screen.getByText('Identifiants invalides')).toBeTruthy();
    });
  });

  it('shows ActivityIndicator while login request is pending', async () => {
    // Never resolves — simulates slow network
    mockPost.mockReturnValue(new Promise(() => {}));

    renderScreen();
    fireEvent.changeText(screen.getByTestId('email-input'), 'chef@resto.fr');
    fireEvent.changeText(screen.getByTestId('password-input'), 'pass');

    await act(async () => {
      fireEvent.press(screen.getByTestId('login-button'));
    });

    expect(screen.UNSAFE_queryByType(require('react-native').ActivityIndicator)).toBeTruthy();
  });
});
