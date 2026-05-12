/**
 * Navigation E2E tests (authenticated)
 *
 * Every test starts with:
 *  1. setupApiMocks()  — intercept all /api/v1/** calls with fixtures
 *  2. setAuthLocalStorage() — inject Zustand auth state so the app
 *     treats the session as authenticated without a real login flow
 *
 * Tests cover sidebar structure, route navigation, language switcher,
 * notification panel, user info display, and logout.
 */

import { test, expect } from '@playwright/test';
import { setupApiMocks, setAuthLocalStorage, AUTH_USER } from './helpers/api-mocks';

// ── Setup ─────────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await setupApiMocks(page);
  // Seed localStorage before navigating to the protected area
  await page.goto('/');
  await setAuthLocalStorage(page);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
});

// ── Sidebar structure ─────────────────────────────────────────────────────────

test.describe('Sidebar — structure', () => {
  test('shows the NORMES HACCP logo / brand text', async ({ page }) => {
    await expect(page.getByText('NORMES HACCP')).toBeVisible();
  });

  test('shows the OPÉRATIONS section label', async ({ page }) => {
    await expect(page.getByText('OPÉRATIONS')).toBeVisible();
  });

  test('shows the GESTION ACTIFS section label', async ({ page }) => {
    await expect(page.getByText('GESTION ACTIFS')).toBeVisible();
  });

  test('shows the ADMINISTRATION section label', async ({ page }) => {
    await expect(page.getByText('ADMINISTRATION')).toBeVisible();
  });

  test('shows authenticated user email in the sidebar footer', async ({ page }) => {
    await expect(page.getByText(AUTH_USER.email)).toBeVisible();
  });

  test('shows user role badge in the sidebar footer', async ({ page }) => {
    // Role badge text matches the user's role (case may vary)
    await expect(
      page.getByText(/admin/i).first(),
    ).toBeVisible();
  });
});

// ── Sidebar links navigation ──────────────────────────────────────────────────

test.describe('Sidebar — navigation links', () => {
  test('navigates to /dashboard via Vue d\'ensemble link', async ({ page }) => {
    await page.getByRole('link', { name: /vue d.ensemble/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('navigates to /controls via Contrôle link', async ({ page }) => {
    await page.getByRole('link', { name: /contrôle/i }).click();
    await expect(page).toHaveURL(/\/controls/);
  });

  test('navigates to /nonconformities via Non-conformité link', async ({ page }) => {
    await page.getByRole('link', { name: /non-conformit/i }).click();
    await expect(page).toHaveURL(/\/nonconformities/);
  });

  test('navigates to /products via Produits link', async ({ page }) => {
    await page.getByRole('link', { name: /produits/i }).click();
    await expect(page).toHaveURL(/\/products/);
  });

  test('navigates to /equipments via Équipements link', async ({ page }) => {
    await page.getByRole('link', { name: /équipements/i }).click();
    await expect(page).toHaveURL(/\/equipments/);
  });

  test('navigates to /suppliers via Fournisseurs link', async ({ page }) => {
    await page.getByRole('link', { name: /fournisseurs/i }).click();
    await expect(page).toHaveURL(/\/suppliers/);
  });

  test('navigates to /users via Utilisateurs link', async ({ page }) => {
    await page.getByRole('link', { name: /utilisateurs/i }).click();
    await expect(page).toHaveURL(/\/users/);
  });

  test('navigates to /reports via Rapports link', async ({ page }) => {
    await page.getByRole('link', { name: /rapports/i }).click();
    await expect(page).toHaveURL(/\/reports/);
  });

  test('navigates to /settings via Paramètres link', async ({ page }) => {
    await page.getByRole('link', { name: /param.tres/i }).click();
    await expect(page).toHaveURL(/\/settings/);
  });
});

// ── Header ────────────────────────────────────────────────────────────────────

test.describe('Header — language switcher', () => {
  test('shows FR language button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^FR$/i })).toBeVisible();
  });

  test('shows EN language button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^EN$/i })).toBeVisible();
  });

  test('shows AR language button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^AR$/i })).toBeVisible();
  });

  test('switching to EN changes the page language attribute', async ({ page }) => {
    await page.getByRole('button', { name: /^EN$/i }).click();
    const lang = await page.evaluate(() => document.documentElement.lang);
    expect(lang).toMatch(/en/i);
  });

  test('switching to AR applies RTL direction', async ({ page }) => {
    await page.getByRole('button', { name: /^AR$/i }).click();
    const dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('rtl');
  });
});

test.describe('Header — notifications', () => {
  test('shows the notification bell button', async ({ page }) => {
    await expect(page.getByLabel('Notifications')).toBeVisible();
  });

  test('opens notification panel on bell click', async ({ page }) => {
    await page.getByLabel('Notifications').click();
    // Panel heading or list should appear
    await expect(
      page.getByText(/notifications/i).first(),
    ).toBeVisible();
  });

  test('displays notification items from the API', async ({ page }) => {
    await page.getByLabel('Notifications').click();
    // First notification message from the fixture
    await expect(
      page.getByText(/Contrôle en attente/i),
    ).toBeVisible({ timeout: 4000 });
  });

  test('shows unread count badge when there are unread notifications', async ({ page }) => {
    // Fixture has 1 unread notification
    const badge = page.locator('[data-testid="notification-badge"], .notification-count, .badge');
    // Either a badge is visible, or the bell itself carries an aria-label with the count
    const badgeVisible = await badge.isVisible().catch(() => false);
    const bellLabel    = await page.getByLabel('Notifications').getAttribute('aria-label') ?? '';
    expect(badgeVisible || /1/.test(bellLabel)).toBe(true);
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────

test.describe('Logout', () => {
  test('clicking logout button redirects to /login', async ({ page }) => {
    await page.getByTitle('Déconnexion').click();
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test('after logout, navigating to /dashboard redirects to /login', async ({ page }) => {
    await page.getByTitle('Déconnexion').click();
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});

// ── RBAC — ADMIN visibility ───────────────────────────────────────────────────

test.describe('RBAC — ADMIN role visibility', () => {
  // Fixtures use ADMIN role — ADMIN can see Users and Settings but not Clients
  test('ADMIN sees the Utilisateurs link', async ({ page }) => {
    await expect(page.getByRole('link', { name: /utilisateurs/i })).toBeVisible();
  });

  test('ADMIN sees the Paramètres link', async ({ page }) => {
    await expect(page.getByRole('link', { name: /param.tres/i })).toBeVisible();
  });

  test('ADMIN does not see the Clients (tenants) link', async ({ page }) => {
    // Only SUPER_ADMIN sees the Clients link
    await expect(
      page.getByRole('link', { name: /^clients$/i }),
    ).not.toBeVisible();
  });
});
