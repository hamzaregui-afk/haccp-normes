/**
 * Shared Playwright API mock helpers
 *
 * Every test that needs the backend should call setupApiMocks() before
 * navigating.  It intercepts all /api/v1/** requests with deterministic
 * fixtures so the suite runs without a live backend.
 *
 * Usage:
 *   import { setupApiMocks, AUTH_USER } from './helpers/api-mocks';
 *
 *   test.beforeEach(async ({ page }) => {
 *     await setupApiMocks(page);
 *   });
 */

import type { Page, Route } from '@playwright/test';

// ── Canonical test fixtures ───────────────────────────────────────────────────

export const AUTH_USER = {
  sub:      'cuser0001testidabc12345',
  email:    'admin@haccp.com',
  role:     'ADMIN' as const,
  tenantId: 'ctenant001testidabc1234',
};

export const AUTH_TOKENS = {
  accessToken:  'test-access-token-e2e',
  refreshToken: 'test-refresh-token-e2e',
};

export const LOGIN_RESPONSE = {
  data: {
    ...AUTH_TOKENS,
    user: AUTH_USER,
  },
};

export const CONTROL_STATS = {
  data: {
    total:      42,
    completed:  38,
    pending:     4,
    overdue:     1,
    compliance:  90,
  },
};

export const NC_STATS = {
  data: {
    total:    12,
    open:      5,
    closed:    7,
    critical:  2,
  },
};

export const NC_LIST = {
  data: [
    {
      id:          'cnc001testidabcdefghij',
      title:       'Température réfrigérateur hors limite',
      status:      'OPEN',
      severity:    'CRITICAL',
      createdAt:   '2026-05-01T10:00:00Z',
      tenantId:    AUTH_USER.tenantId,
    },
    {
      id:          'cnc002testidabcdefghij',
      title:       'Manque de nettoyage zone B',
      status:      'OPEN',
      severity:    'MAJOR',
      createdAt:   '2026-05-02T08:00:00Z',
      tenantId:    AUTH_USER.tenantId,
    },
    {
      id:          'cnc003testidabcdefghij',
      title:       'Étiquetage produit manquant',
      status:      'CLOSED',
      severity:    'MINOR',
      createdAt:   '2026-04-28T14:00:00Z',
      tenantId:    AUTH_USER.tenantId,
    },
  ],
  meta: { total: 3, page: 1, limit: 10, lastPage: 1 },
};

export const NOTIFICATIONS_LIST = {
  data: [
    {
      id:        'cnotif01testidabcdefgh',
      message:   'Contrôle en attente — Zone A',
      read:      false,
      createdAt: '2026-05-06T07:00:00Z',
    },
    {
      id:        'cnotif02testidabcdefgh',
      message:   'Rapport validé avec succès',
      read:      true,
      createdAt: '2026-05-05T15:30:00Z',
    },
  ],
};

export const USERS_LIST = {
  data: [
    {
      id:       AUTH_USER.sub,
      email:    AUTH_USER.email,
      name:     'Test Admin',
      role:     AUTH_USER.role,
      status:   'ACTIVE',
      tenantId: AUTH_USER.tenantId,
    },
  ],
  meta: { total: 1, page: 1, limit: 10, lastPage: 1 },
};

export const REPORT_STATS = {
  data: {
    total:    8,
    validated: 6,
    pending:   2,
  },
};

// ── Zustand auth state helper ─────────────────────────────────────────────────

/**
 * Injects a valid Zustand auth state into localStorage so the React app
 * treats the session as authenticated before any page load.
 *
 * Must be called AFTER the first page.goto() (localStorage is origin-scoped).
 */
export async function setAuthLocalStorage(page: Page): Promise<void> {
  await page.evaluate(
    ([user, tokens]) => {
      localStorage.setItem(
        'haccp-auth',
        JSON.stringify({
          state: {
            accessToken:  tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user,
          },
          version: 0,
        }),
      );
    },
    [AUTH_USER, AUTH_TOKENS] as const,
  );
}

// ── Route interceptors ────────────────────────────────────────────────────────

type MockEntry = {
  method:   string;
  urlGlob:  string;
  status:   number;
  body:     unknown;
};

const API_MOCKS: MockEntry[] = [
  // Auth
  {
    method:  'POST',
    urlGlob: '**/api/v1/auth/login',
    status:  200,
    body:    LOGIN_RESPONSE,
  },
  {
    method:  'POST',
    urlGlob: '**/api/v1/auth/refresh',
    status:  200,
    body:    { data: AUTH_TOKENS },
  },
  // Controls
  {
    method:  'GET',
    urlGlob: '**/api/v1/controls/tasks/stats',
    status:  200,
    body:    CONTROL_STATS,
  },
  {
    method:  'GET',
    urlGlob: '**/api/v1/controls/tasks',
    status:  200,
    body:    { data: [], meta: { total: 0, page: 1, limit: 10, lastPage: 1 } },
  },
  // Non-conformities
  {
    method:  'GET',
    urlGlob: '**/api/v1/nonconformities/stats',
    status:  200,
    body:    NC_STATS,
  },
  {
    method:  'GET',
    urlGlob: '**/api/v1/nonconformities',
    status:  200,
    body:    NC_LIST,
  },
  // Notifications
  {
    method:  'GET',
    urlGlob: '**/api/v1/notifications',
    status:  200,
    body:    NOTIFICATIONS_LIST,
  },
  // Users
  {
    method:  'GET',
    urlGlob: '**/api/v1/users',
    status:  200,
    body:    USERS_LIST,
  },
  // Reports
  {
    method:  'GET',
    urlGlob: '**/api/v1/reports/stats',
    status:  200,
    body:    REPORT_STATS,
  },
  {
    method:  'GET',
    urlGlob: '**/api/v1/reports',
    status:  200,
    body:    { data: [], meta: { total: 0, page: 1, limit: 10, lastPage: 1 } },
  },
];

/**
 * Register all API route interceptors on the given page.
 * Call this BEFORE page.goto() — Playwright registers routes synchronously.
 */
export async function setupApiMocks(page: Page): Promise<void> {
  for (const mock of API_MOCKS) {
    await page.route(mock.urlGlob, async (route: Route) => {
      if (route.request().method() !== mock.method) {
        // Let through anything that doesn't match the method (e.g. OPTIONS pre-flight)
        await route.continue();
        return;
      }
      await route.fulfill({
        status:      mock.status,
        contentType: 'application/json',
        body:        JSON.stringify(mock.body),
      });
    });
  }

  // Catch-all: return 200 for unmatched API calls instead of failing the network
  await page.route('**/api/v1/**', async (route: Route) => {
    await route.fulfill({
      status:      200,
      contentType: 'application/json',
      body:        JSON.stringify({ data: null }),
    });
  });
}

/**
 * Mock a single endpoint to return an error — useful for testing error states.
 *
 * @example
 *   await mockApiError(page, '**/api/v1/controls/tasks/stats', 503);
 */
export async function mockApiError(
  page:    Page,
  urlGlob: string,
  status:  number = 500,
  message: string = 'Internal Server Error',
): Promise<void> {
  await page.route(urlGlob, async (route: Route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({
        statusCode: status,
        error:      message,
        message,
        timestamp:  new Date().toISOString(),
        path:       new URL(route.request().url()).pathname,
      }),
    });
  });
}
