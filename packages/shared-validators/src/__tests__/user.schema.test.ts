/**
 * user.schema.test.ts
 * Unit tests for user-related Zod validation schemas.
 */

import { LoginSchema, RegisterSchema, PaginationQuerySchema } from '../user.schema';

// ─── LoginSchema ──────────────────────────────────────────────────────────────

describe('LoginSchema', () => {
  const VALID = { email: 'chef@restaurant.fr', password: 'secret' };

  it('accepts valid credentials', () => {
    expect(() => LoginSchema.parse(VALID)).not.toThrow();
  });

  it('rejects invalid email', () => {
    expect(() => LoginSchema.parse({ ...VALID, email: 'not-an-email' })).toThrow();
  });

  it('rejects empty password', () => {
    expect(() => LoginSchema.parse({ ...VALID, password: '' })).toThrow();
  });

  it('rejects missing fields', () => {
    expect(() => LoginSchema.parse({})).toThrow();
  });
});

// ─── RegisterSchema ───────────────────────────────────────────────────────────

describe('RegisterSchema', () => {
  const VALID = {
    email:     'nouveau@haccp.fr',
    password:  'Secure1pass',
    firstName: 'Jean',
    lastName:  'Dupont',
  };

  it('accepts valid registration data', () => {
    expect(() => RegisterSchema.parse(VALID)).not.toThrow();
  });

  it('rejects password shorter than 8 chars', () => {
    expect(() => RegisterSchema.parse({ ...VALID, password: 'Sh0rt' })).toThrow();
  });

  it('rejects password without uppercase letter', () => {
    expect(() => RegisterSchema.parse({ ...VALID, password: 'nosecure1' })).toThrow();
  });

  it('rejects password without a number', () => {
    expect(() => RegisterSchema.parse({ ...VALID, password: 'NoNumberPass' })).toThrow();
  });

  it('rejects empty firstName', () => {
    expect(() => RegisterSchema.parse({ ...VALID, firstName: '' })).toThrow();
  });

  it('rejects invalid email', () => {
    expect(() => RegisterSchema.parse({ ...VALID, email: 'bad' })).toThrow();
  });
});

// ─── PaginationQuerySchema ────────────────────────────────────────────────────

describe('PaginationQuerySchema', () => {
  it('applies defaults when query is empty', () => {
    const result = PaginationQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.search).toBeUndefined();
  });

  it('coerces string page to number', () => {
    const result = PaginationQuerySchema.parse({ page: '3', limit: '10' });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
  });

  it('rejects page < 1', () => {
    expect(() => PaginationQuerySchema.parse({ page: 0 })).toThrow();
  });

  it('rejects limit > 500', () => {
    expect(() => PaginationQuerySchema.parse({ limit: 501 })).toThrow();
  });

  it('accepts optional search string', () => {
    const result = PaginationQuerySchema.parse({ search: 'poulet' });
    expect(result.search).toBe('poulet');
  });

  it('rejects search longer than 200 chars', () => {
    expect(() => PaginationQuerySchema.parse({ search: 'x'.repeat(201) })).toThrow();
  });
});
