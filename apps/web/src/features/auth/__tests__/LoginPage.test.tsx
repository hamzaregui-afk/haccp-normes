/**
 * LoginPage.test.tsx
 *
 * Unit tests for the LoginPage component.
 *
 * Strategy:
 *  - Render the form and verify field presence.
 *  - Trigger client-side validation (LoginSchema via Zod) on an empty submit.
 *  - Mock `@/lib/api` for the happy-path API call.
 *  - Mock `@/store/auth.store` so state side-effects are controllable.
 *  - Mock `react-router-dom` so navigation assertions work without a real router.
 *
 * Note: LoginPage does NOT use @tanstack/react-query (it calls api.post() directly),
 * so QueryClientProvider wrapping is not required here.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// ─── Module mocks (must be hoisted before the import under test) ───────────

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  // Re-export everything so <MemoryRouter> still works in the render wrapper
  ...jest.requireActual<typeof import('react-router-dom')>('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockSetTokens = jest.fn();

jest.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (s: { setTokens: jest.Mock }) => unknown) =>
    selector({ setTokens: mockSetTokens }),
}));

const mockApiPost = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

// ─── Import under test (after mocks are registered) ──────────────────────

import LoginPage from '../LoginPage';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderLoginPage() {
  return render(
    // MemoryRouter provides the routing context required by useNavigate
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. Renders form fields ────────────────────────────────────────────────

  it('renders the email and password input fields', () => {
    renderLoginPage();

    expect(screen.getByLabelText(/adresse e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument();
  });

  it('renders the submit button with the correct label', () => {
    renderLoginPage();

    expect(
      screen.getByRole('button', { name: /se connecter/i }),
    ).toBeInTheDocument();
  });

  it('renders the NORMES HACCP brand name', () => {
    renderLoginPage();

    // There may be multiple occurrences (mobile + desktop panels)
    const brandElements = screen.getAllByText(/normes haccp/i);
    expect(brandElements.length).toBeGreaterThanOrEqual(1);
  });

  // ── 2. Validation error on empty / invalid submit ─────────────────────────

  it('shows a validation error when the form is submitted with empty fields', async () => {
    renderLoginPage();

    // Use fireEvent.submit to bypass native HTML5 required validation in jsdom
    const form = document.querySelector('form');
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      expect(
        screen.getByText(/veuillez saisir un email et un mot de passe valides/i),
      ).toBeInTheDocument();
    });

    // API must NOT be called when validation fails
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('shows a validation error when only the email is entered (missing password)', async () => {
    renderLoginPage();

    await userEvent.type(screen.getByLabelText(/adresse e-mail/i), 'admin@test.com');
    // Use fireEvent.submit to bypass native HTML5 required validation in jsdom
    const form = document.querySelector('form');
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      expect(
        screen.getByText(/veuillez saisir un email et un mot de passe valides/i),
      ).toBeInTheDocument();
    });

    expect(mockApiPost).not.toHaveBeenCalled();
  });

  // ── 3. Successful login flow ──────────────────────────────────────────────

  it('calls api.post() with email and password on a valid submit', async () => {
    const fakeUser = {
      sub:      'user-001',
      email:    'admin@haccp.com',
      role:     'ADMIN',
      tenantId: 'tenant-aaa',
    };
    mockApiPost.mockResolvedValue({
      data: {
        accessToken:  'access-jwt',
        refreshToken: 'refresh-jwt',
        user:         fakeUser,
      },
    });

    renderLoginPage();

    await userEvent.type(screen.getByLabelText(/adresse e-mail/i), 'admin@haccp.com');
    await userEvent.type(screen.getByLabelText(/mot de passe/i), 'StrongPass123!');
    await userEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/api/v1/auth/login',
        { email: 'admin@haccp.com', password: 'StrongPass123!' },
      );
    });
  });

  it('calls setTokens() and navigates to /dashboard on a successful login', async () => {
    const fakeUser = {
      sub:      'user-001',
      email:    'admin@haccp.com',
      role:     'ADMIN',
      tenantId: 'tenant-aaa',
    };
    mockApiPost.mockResolvedValue({
      data: {
        accessToken:  'access-jwt',
        refreshToken: 'refresh-jwt',
        user:         fakeUser,
      },
    });

    renderLoginPage();

    await userEvent.type(screen.getByLabelText(/adresse e-mail/i), 'admin@haccp.com');
    await userEvent.type(screen.getByLabelText(/mot de passe/i), 'StrongPass123!');
    await userEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => {
      expect(mockSetTokens).toHaveBeenCalledWith('access-jwt', 'refresh-jwt', fakeUser);
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });

  // ── 4. API error handling ─────────────────────────────────────────────────

  it('displays an error message when the API call fails', async () => {
    mockApiPost.mockRejectedValue(new Error('401 Unauthorized'));

    renderLoginPage();

    await userEvent.type(screen.getByLabelText(/adresse e-mail/i), 'wrong@haccp.com');
    await userEvent.type(screen.getByLabelText(/mot de passe/i), 'WrongPass999!');
    await userEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/identifiants incorrects\. veuillez réessayer/i),
      ).toBeInTheDocument();
    });

    // Navigation must NOT happen on failure
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does NOT navigate to /dashboard when the API call fails', async () => {
    mockApiPost.mockRejectedValue(new Error('Network Error'));

    renderLoginPage();

    await userEvent.type(screen.getByLabelText(/adresse e-mail/i), 'user@haccp.com');
    await userEvent.type(screen.getByLabelText(/mot de passe/i), 'SomePassword1!');
    await userEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => {
      expect(screen.getByText(/identifiants incorrects/i)).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockSetTokens).not.toHaveBeenCalled();
  });
});
