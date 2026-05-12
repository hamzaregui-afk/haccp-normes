/**
 * audit-emitter.test.ts
 *
 * Unit tests for the fire-and-forget audit event emitter.
 *
 * Strategy:
 *  - Mock global `fetch` to control success / failure responses
 *  - Verify that the correct URL, headers, and body are sent
 *  - Verify that failures are swallowed (no throw)
 *  - Verify that network timeouts are swallowed (no throw)
 */

import { emitAuditEvent, type AuditEventPayload } from '../audit-emitter';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_EVENT: AuditEventPayload = {
  userId:     'user-001',
  action:     'LOGIN',
  resource:   'users',
  resourceId: 'user-001',
  tenantId:   'tenant-abc',
  payload:    { email: 'alice@example.com' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFetchMock(status = 200, ok = true): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    json: jest.fn().mockResolvedValue({}),
  });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('emitAuditEvent', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    process.env['AUDIT_SERVICE_URL']      = 'http://audit-service:3019';
    process.env['INTERNAL_SERVICE_SECRET'] = 'test-secret-12345678';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env['AUDIT_SERVICE_URL'];
    delete process.env['INTERNAL_SERVICE_SECRET'];
    jest.clearAllMocks();
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('calls fetch with the correct URL', async () => {
    const mockFetch = makeFetchMock();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await emitAuditEvent(BASE_EVENT);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://audit-service:3019/internal/audit',
      expect.any(Object),
    );
  });

  it('sends POST method', async () => {
    const mockFetch = makeFetchMock();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await emitAuditEvent(BASE_EVENT);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe('POST');
  });

  it('sends the X-Internal-Secret header', async () => {
    const mockFetch = makeFetchMock();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await emitAuditEvent(BASE_EVENT);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)['X-Internal-Secret']).toBe(
      'test-secret-12345678',
    );
  });

  it('sends Content-Type: application/json', async () => {
    const mockFetch = makeFetchMock();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await emitAuditEvent(BASE_EVENT);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('serialises the event as JSON body including tenantId', async () => {
    const mockFetch = makeFetchMock();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await emitAuditEvent(BASE_EVENT);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body['userId']).toBe('user-001');
    expect(body['action']).toBe('LOGIN');
    expect(body['resource']).toBe('users');
    expect(body['tenantId']).toBe('tenant-abc');
  });

  // ── Failure resilience ─────────────────────────────────────────────────────

  it('does NOT throw when the audit-service returns a non-200 status', async () => {
    globalThis.fetch = makeFetchMock(500, false) as unknown as typeof fetch;

    // Must resolve without throwing
    await expect(emitAuditEvent(BASE_EVENT)).resolves.toBeUndefined();
  });

  it('does NOT throw when fetch rejects (network error)', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    await expect(emitAuditEvent(BASE_EVENT)).resolves.toBeUndefined();
  });

  it('does NOT throw when fetch times out (AbortError)', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
    ) as unknown as typeof fetch;

    await expect(emitAuditEvent(BASE_EVENT)).resolves.toBeUndefined();
  });

  // ── Payload variants ────────────────────────────────────────────────────────

  it('includes optional resourceId in the body when provided', async () => {
    const mockFetch = makeFetchMock();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await emitAuditEvent({ ...BASE_EVENT, resourceId: 'res-xyz' });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body['resourceId']).toBe('res-xyz');
  });

  it('works without an optional payload object', async () => {
    const mockFetch = makeFetchMock();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const eventWithoutPayload: AuditEventPayload = {
      userId:   'u1',
      action:   'DELETE',
      resource: 'users',
      tenantId: 'tenant-001',
    };

    await expect(emitAuditEvent(eventWithoutPayload)).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('defaults to localhost:3019 when AUDIT_SERVICE_URL is not set', async () => {
    delete process.env['AUDIT_SERVICE_URL'];
    const mockFetch = makeFetchMock();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await emitAuditEvent(BASE_EVENT);

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toMatch('http://localhost:3019/internal/audit');
  });
});
