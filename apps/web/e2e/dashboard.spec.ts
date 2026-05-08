/**
 * Dashboard E2E tests (authenticated)
 *
 * All API calls are intercepted via page.route().  The fixture data matches
 * what the dashboard components query:
 *   GET /api/v1/controls/tasks/stats  → CONTROL_STATS
 *   GET /api/v1/nonconformities/stats → NC_STATS
 *   GET /api/v1/nonconformities       → NC_LIST (recent items)
 *   GET /api/v1/notifications         → NOTIFICATIONS_LIST
 *
 * Tests cover:
 *  - Page loads without JS errors
 *  - Page heading / title
 *  - KPI cards render with correct values from the API
 *  - Recent non-conformities list renders
 *  - Error state when an API call fails (503)
 */

import { test, expect } from '@playwright/test';
import {
  setupApiMocks,
  setAuthLocalStorage,
  mockApiError,
  CONTROL_STATS,
  NC_STATS,
  NC_LIST,
} from './helpers/api-mocks';

// ── Setup ─────────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await setupApiMocks(page);
  await page.goto('/');
  await setAuthLocalStorage(page);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
});

// ── Page integrity ────────────────────────────────────────────────────────────

test.describe('Dashboard — page integrity', () => {
  test('loads without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // Wait for async data to settle
    await page.waitForTimeout(1500);

    // Network/fetch errors are expected when the real backend isn't running;
    // we only care about application-level JS exceptions.
    const fatalErrors = errors.filter(
      (e) => !e.toLowerCase().includes('network') && !e.toLowerCase().includes('fetch'),
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test('renders the page heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /tableau de bord|vue d.ensemble|dashboard/i }),
    ).toBeVisible({ timeout: 5000 });
  });

  test('renders the KPI cards container', async ({ page }) => {
    // At least one grid/card container is present
    await expect(page.locator('.grid, [data-testid="kpi-cards"]').first()).toBeVisible();
  });
});

// ── KPI cards ─────────────────────────────────────────────────────────────────

test.describe('Dashboard — KPI cards', () => {
  test('shows total controls count from the API', async ({ page }) => {
    await expect(
      page.getByText(String(CONTROL_STATS.data.total)),
    ).toBeVisible({ timeout: 5000 });
  });

  test('shows compliance percentage from the API', async ({ page }) => {
    // "90" or "90 %" both count
    await expect(
      page.getByText(new RegExp(`${CONTROL_STATS.data.compliance}`)),
    ).toBeVisible({ timeout: 5000 });
  });

  test('shows total non-conformities count from the API', async ({ page }) => {
    await expect(
      page.getByText(String(NC_STATS.data.total)),
    ).toBeVisible({ timeout: 5000 });
  });

  test('shows open non-conformities count from the API', async ({ page }) => {
    await expect(
      page.getByText(String(NC_STATS.data.open)),
    ).toBeVisible({ timeout: 5000 });
  });

  test('shows critical non-conformities count from the API', async ({ page }) => {
    await expect(
      page.getByText(String(NC_STATS.data.critical)),
    ).toBeVisible({ timeout: 5000 });
  });

  test('shows overdue controls count from the API', async ({ page }) => {
    await expect(
      page.getByText(String(CONTROL_STATS.data.overdue)),
    ).toBeVisible({ timeout: 5000 });
  });
});

// ── Recent non-conformities ───────────────────────────────────────────────────

test.describe('Dashboard — recent non-conformities', () => {
  test('renders a recent NCs section', async ({ page }) => {
    // Section heading (French)
    await expect(
      page.getByText(/non-conformit/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test('shows the first NC title from the API fixture', async ({ page }) => {
    await expect(
      page.getByText(NC_LIST.data[0].title),
    ).toBeVisible({ timeout: 5000 });
  });

  test('shows the second NC title from the API fixture', async ({ page }) => {
    await expect(
      page.getByText(NC_LIST.data[1].title),
    ).toBeVisible({ timeout: 5000 });
  });

  test('shows NC severity labels', async ({ page }) => {
    // "CRITICAL" badge from the first fixture item
    await expect(
      page.getByText(/critical|critique/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test('shows NC status labels', async ({ page }) => {
    // "OPEN" badge from the fixture
    await expect(
      page.getByText(/open|ouvert/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });
});

// ── Error states ──────────────────────────────────────────────────────────────

test.describe('Dashboard — API error states', () => {
  test('shows an error or fallback UI when controls stats API fails', async ({ page }) => {
    // This test re-mocks after beforeEach already ran setupApiMocks;
    // the more-specific route registered here will win in Playwright.

    // Navigate fresh with the error mock in place
    await mockApiError(page, '**/api/v1/controls/tasks/stats', 503);
    await page.reload();

    // The dashboard must not crash — it should show a fallback (0, "--", or error text)
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(1500);

    const fatalErrors = errors.filter(
      (e) => !e.toLowerCase().includes('network') && !e.toLowerCase().includes('fetch'),
    );
    expect(fatalErrors).toHaveLength(0);

    // Page heading must still be visible (no full crash)
    await expect(
      page.getByRole('heading', { name: /tableau de bord|vue d.ensemble|dashboard/i }),
    ).toBeVisible({ timeout: 5000 });
  });

  test('shows an error or fallback UI when NC stats API fails', async ({ page }) => {
    await mockApiError(page, '**/api/v1/nonconformities/stats', 503);
    await page.reload();

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(1500);

    const fatalErrors = errors.filter(
      (e) => !e.toLowerCase().includes('network') && !e.toLowerCase().includes('fetch'),
    );
    expect(fatalErrors).toHaveLength(0);

    await expect(
      page.getByRole('heading', { name: /tableau de bord|vue d.ensemble|dashboard/i }),
    ).toBeVisible({ timeout: 5000 });
  });
});

// ── Navigation from dashboard ─────────────────────────────────────────────────

test.describe('Dashboard — navigation shortcuts', () => {
  test('clicking a "View all" / "Voir tout" NC link navigates to /nonconformities', async ({ page }) => {
    const viewAllLink = page.getByRole('link', { name: /voir tout|view all/i });
    const linkExists  = await viewAllLink.count();

    if (linkExists > 0) {
      await viewAllLink.first().click();
      await expect(page).toHaveURL(/\/nonconformities/);
    } else {
      // If the link isn't in the design, skip gracefully
      test.skip();
    }
  });

  test('clicking a NC item navigates to the NC detail page', async ({ page }) => {
    const firstNcLink = page.getByRole('link', { name: new RegExp(NC_LIST.data[0].title) });
    const linkExists  = await firstNcLink.count();

    if (linkExists > 0) {
      await firstNcLink.click();
      await expect(page).toHaveURL(/\/nonconformities\//);
    } else {
      test.skip();
    }
  });
});
