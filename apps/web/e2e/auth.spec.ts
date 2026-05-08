/**
 * Authentication E2E tests
 *
 * All backend calls are intercepted with page.route() — no live server needed.
 * Tests cover:
 *  - Unauthenticated redirect to /login
 *  - Form validation (empty submit, invalid email format)
 *  - Failed login (401 response → error message)
 *  - Successful login (200 response → redirect to /dashboard, tokens stored)
 *  - Already-authenticated user is redirected away from /login
 *  - Logout clears state and redirects to /login
 */

import { test, expect } from '@playwright/test';
import {
  setupApiMocks,
  setAuthLocalStorage,
  mockApiError,
  LOGIN_RESPONSE,
  AUTH_USER,
} from './helpers/api-mocks';

// ── Unauthenticated access ────────────────────────────────────────────────────

test.describe('Login page (unauthenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('redirects to /login when not authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows the NORMES HACCP brand name', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('NORMES HACCP')).toBeVisible();
  });

  test('renders email and password fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('renders the submit button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /se connecter/i })).toBeVisible();
  });

  // ── Empty-form validation ───────────────────────────────────────────────────

  test('focuses the email field when submitting an empty form', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /se connecter/i }).click();
    // HTML5 required validation focuses the first empty required field
    await expect(page.locator('input[type="email"]')).toBeFocused();
  });

  test('shows password field error when only email is filled', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@haccp.com');
    await page.getByRole('button', { name: /se connecter/i }).click();
    // Either HTML5 focus or a custom error message
    const passwordInput = page.locator('input[type="password"]');
    const isFocused = await passwordInput.evaluate((el) => el === document.activeElement);
    const hasError   = await page.locator('[role="alert"], .error, [data-testid="error"]').count();
    expect(isFocused || hasError > 0).toBe(true);
  });
});

// ── Failed login ──────────────────────────────────────────────────────────────

test.describe('Login — invalid credentials', () => {
  test('shows an error message when the API returns 401', async ({ page }) => {
    // Register 401 BEFORE the generic setupApiMocks (more specific route wins)
    await mockApiError(page, '**/api/v1/auth/login', 401, 'Invalid credentials');
    await setupApiMocks(page);

    await page.goto('/login');
    await page.locator('input[type="email"]').fill('wrong@haccp.com');
    await page.locator('input[type="password"]').fill('WrongPassword1!');
    await page.getByRole('button', { name: /se connecter/i }).click();

    // An error notification / inline message should appear
    await expect(
      page.locator('[role="alert"], [data-testid="login-error"], .error-message'),
    ).toBeVisible({ timeout: 5000 });
  });

  test('keeps the user on /login after a failed attempt', async ({ page }) => {
    await mockApiError(page, '**/api/v1/auth/login', 401, 'Invalid credentials');
    await setupApiMocks(page);

    await page.goto('/login');
    await page.locator('input[type="email"]').fill('wrong@haccp.com');
    await page.locator('input[type="password"]').fill('WrongPassword1!');
    await page.getByRole('button', { name: /se connecter/i }).click();
    await page.waitForTimeout(500);

    await expect(page).toHaveURL(/\/login/);
  });

  test('does not store tokens in localStorage after a failed login', async ({ page }) => {
    await mockApiError(page, '**/api/v1/auth/login', 401, 'Invalid credentials');
    await setupApiMocks(page);

    await page.goto('/login');
    await page.locator('input[type="email"]').fill('wrong@haccp.com');
    await page.locator('input[type="password"]').fill('bad');
    await page.getByRole('button', { name: /se connecter/i }).click();
    await page.waitForTimeout(500);

    const stored = await page.evaluate(() => localStorage.getItem('haccp-auth'));
    if (stored) {
      const parsed = JSON.parse(stored);
      // If state exists, accessToken must be null/undefined
      expect(parsed?.state?.accessToken).toBeFalsy();
    } else {
      expect(stored).toBeNull();
    }
  });
});

// ── Successful login ──────────────────────────────────────────────────────────

test.describe('Login — valid credentials', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('redirects to /dashboard after successful login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(AUTH_USER.email);
    await page.locator('input[type="password"]').fill('CorrectPass1!');
    await page.getByRole('button', { name: /se connecter/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 8000 });
  });

  test('stores access token in localStorage after login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(AUTH_USER.email);
    await page.locator('input[type="password"]').fill('CorrectPass1!');
    await page.getByRole('button', { name: /se connecter/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 8000 });

    const stored = await page.evaluate(() => localStorage.getItem('haccp-auth'));
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.state.accessToken).toBe(LOGIN_RESPONSE.data.accessToken);
  });

  test('stores user email in localStorage after login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(AUTH_USER.email);
    await page.locator('input[type="password"]').fill('CorrectPass1!');
    await page.getByRole('button', { name: /se connecter/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 8000 });

    const stored  = await page.evaluate(() => localStorage.getItem('haccp-auth'));
    const parsed  = JSON.parse(stored!);
    expect(parsed.state.user.email).toBe(AUTH_USER.email);
  });

  test('calls POST /api/v1/auth/login with email and password', async ({ page }) => {
    let capturedBody: Record<string, unknown> | null = null;

    await page.route('**/api/v1/auth/login', async (route) => {
      capturedBody = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify(LOGIN_RESPONSE),
      });
    });

    await page.goto('/login');
    await page.locator('input[type="email"]').fill(AUTH_USER.email);
    await page.locator('input[type="password"]').fill('CorrectPass1!');
    await page.getByRole('button', { name: /se connecter/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 8000 });
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!['email']).toBe(AUTH_USER.email);
    expect(capturedBody!['password']).toBe('CorrectPass1!');
  });
});

// ── Already authenticated ─────────────────────────────────────────────────────

test.describe('Already-authenticated user', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('is redirected away from /login to /dashboard', async ({ page }) => {
    // Seed localStorage on a first load, then go to /login
    await page.goto('/');
    await setAuthLocalStorage(page);
    await page.goto('/login');

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });
  });

  test('can access /dashboard directly', async ({ page }) => {
    await page.goto('/');
    await setAuthLocalStorage(page);
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/dashboard/);
    // Page must not be the login page
    await expect(page.locator('input[type="email"]')).not.toBeVisible();
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────

test.describe('Logout', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/');
    await setAuthLocalStorage(page);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('redirects to /login after clicking logout', async ({ page }) => {
    await page.getByTitle('Déconnexion').click();
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test('clears the accessToken from localStorage after logout', async ({ page }) => {
    await page.getByTitle('Déconnexion').click();
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });

    const stored = await page.evaluate(() => localStorage.getItem('haccp-auth'));
    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed?.state?.accessToken).toBeFalsy();
    }
  });
});
