/**
 * JwtStrategy unit tests
 *
 * Passport calls validate() after verifying the JWT signature.
 * We test that:
 *  - Valid payloads are parsed and returned as JwtPayload.
 *  - Invalid payloads (missing fields, wrong types) are rejected by Zod.
 *
 * Note: we cannot instantiate JwtStrategy directly because its constructor
 * calls super() with `secretOrKey: env.JWT_SECRET`, which reads process.env.
 * We mock the env module to supply a deterministic secret.
 */

jest.mock('../../config/env', () => ({
  env: {
    JWT_SECRET:         'test_jwt_secret_at_least_32_chars_xx',
    JWT_EXPIRES_IN:     '15m',
    JWT_REFRESH_SECRET: 'test_refresh_secret_at_least_32_chars',
  },
}));

import { JwtStrategy } from './jwt.strategy';

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('JwtStrategy.validate', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    strategy = new JwtStrategy();
  });

  // CUID-compatible IDs — start with 'c', no hyphens, ≥9 chars
  // Zod z.string().cuid() accepts this pattern.
  const VALID_SUB       = 'cuser0001testidabc12345';
  const VALID_TENANT    = 'ctenant001testidabc1234';
  const VALID_EMAIL     = 'admin@haccp.com';

  // ── Valid payloads ──────────────────────────────────────────────────────────

  it('returns a valid JwtPayload for a correctly-shaped token payload', () => {
    const payload = { sub: VALID_SUB, email: VALID_EMAIL, tenantId: VALID_TENANT, role: 'ADMIN' };

    const result = strategy.validate(payload);

    expect(result).toEqual({ sub: VALID_SUB, email: VALID_EMAIL, tenantId: VALID_TENANT, role: 'ADMIN' });
  });

  it('accepts all valid roles defined in the system', () => {
    const roles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'OPERATOR'];

    for (const role of roles) {
      const result = strategy.validate({ sub: VALID_SUB, email: VALID_EMAIL, tenantId: VALID_TENANT, role });
      expect(result.role).toBe(role);
    }
  });

  it('passes through sub, email and tenantId unchanged', () => {
    const payload = { sub: VALID_SUB, email: VALID_EMAIL, tenantId: VALID_TENANT, role: 'MANAGER' };

    const result = strategy.validate(payload);

    expect(result.sub).toBe(VALID_SUB);
    expect(result.email).toBe(VALID_EMAIL);
    expect(result.tenantId).toBe(VALID_TENANT);
  });

  it('strips extra fields not in the JwtPayload schema (Zod strips unknown keys)', () => {
    const payload = {
      sub:          VALID_SUB,
      email:        VALID_EMAIL,
      tenantId:     VALID_TENANT,
      role:         'OPERATOR',
      extraField:   'should-be-stripped',
      anotherExtra: 42,
    };

    const result = strategy.validate(payload);

    expect(result).not.toHaveProperty('extraField');
    expect(result).not.toHaveProperty('anotherExtra');
  });

  it('passes through optional iat and exp fields when present', () => {
    const payload = {
      sub: VALID_SUB, email: VALID_EMAIL, tenantId: VALID_TENANT,
      role: 'ADMIN', iat: 1700000000, exp: 1700003600,
    };

    const result = strategy.validate(payload);

    expect(result.iat).toBe(1700000000);
    expect(result.exp).toBe(1700003600);
  });

  // ── Invalid payloads ────────────────────────────────────────────────────────

  it('throws ZodError when sub is missing', () => {
    const payload = { email: VALID_EMAIL, tenantId: VALID_TENANT, role: 'ADMIN' };

    expect(() => strategy.validate(payload)).toThrow();
  });

  it('throws ZodError when email is missing', () => {
    const payload = { sub: VALID_SUB, tenantId: VALID_TENANT, role: 'ADMIN' };

    expect(() => strategy.validate(payload)).toThrow();
  });

  it('throws ZodError when tenantId is missing', () => {
    const payload = { sub: VALID_SUB, email: VALID_EMAIL, role: 'ADMIN' };

    expect(() => strategy.validate(payload)).toThrow();
  });

  it('throws ZodError when role is missing', () => {
    const payload = { sub: VALID_SUB, email: VALID_EMAIL, tenantId: VALID_TENANT };

    expect(() => strategy.validate(payload)).toThrow();
  });

  it('throws ZodError when role is not a recognised enum value', () => {
    const payload = { sub: VALID_SUB, email: VALID_EMAIL, tenantId: VALID_TENANT, role: 'HACKER' };

    expect(() => strategy.validate(payload)).toThrow();
  });

  it('throws ZodError when email is not a valid email address', () => {
    const payload = { sub: VALID_SUB, email: 'not-an-email', tenantId: VALID_TENANT, role: 'ADMIN' };

    expect(() => strategy.validate(payload)).toThrow();
  });

  it('throws ZodError when payload is null', () => {
    expect(() => strategy.validate(null)).toThrow();
  });

  it('throws ZodError when payload is an empty object', () => {
    expect(() => strategy.validate({})).toThrow();
  });
});
