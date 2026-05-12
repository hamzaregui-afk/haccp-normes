/**
 * date.utils.test.ts
 * Unit tests for date utility functions.
 * Uses fake timers to ensure deterministic "now" comparisons.
 */

import { isExpired, addDays, daysUntil, startOfDay, endOfDay } from '../date.utils';

const FIXED_NOW = new Date('2026-05-11T15:00:00.000Z');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── isExpired ────────────────────────────────────────────────────────────────

describe('isExpired', () => {
  it('returns true for a past date', () => {
    const past = new Date('2026-01-01T00:00:00.000Z');
    expect(isExpired(past)).toBe(true);
  });

  it('returns false for a future date', () => {
    const future = new Date('2027-01-01T00:00:00.000Z');
    expect(isExpired(future)).toBe(false);
  });
});

// ─── addDays ──────────────────────────────────────────────────────────────────

describe('addDays', () => {
  it('adds positive days correctly', () => {
    const base = new Date('2026-05-10T00:00:00.000Z');
    const result = addDays(base, 5);
    expect(result.getDate()).toBe(15);
    expect(result.getMonth()).toBe(4); // May is month 4 (0-indexed)
  });

  it('handles month boundary correctly', () => {
    const base = new Date('2026-05-30T00:00:00.000Z');
    const result = addDays(base, 5);
    // 30 May + 5 = 4 June
    expect(result.getMonth()).toBe(5); // June
    expect(result.getDate()).toBe(4);
  });

  it('does not mutate the original date', () => {
    const base = new Date('2026-05-10T00:00:00.000Z');
    const originalTime = base.getTime();
    addDays(base, 10);
    expect(base.getTime()).toBe(originalTime);
  });

  it('subtracts days when given negative value', () => {
    const base = new Date('2026-05-15T00:00:00.000Z');
    const result = addDays(base, -5);
    expect(result.getDate()).toBe(10);
  });
});

// ─── daysUntil ────────────────────────────────────────────────────────────────

describe('daysUntil', () => {
  it('returns positive value for future dates', () => {
    const future = new Date('2026-05-21T15:00:00.000Z'); // exactly 10 days ahead
    expect(daysUntil(future)).toBe(10);
  });

  it('returns negative value for past dates', () => {
    const past = new Date('2026-05-01T15:00:00.000Z'); // 10 days ago
    expect(daysUntil(past)).toBeLessThan(0);
  });
});

// ─── startOfDay ───────────────────────────────────────────────────────────────

describe('startOfDay', () => {
  it('sets hours to 00:00:00.000', () => {
    const date = new Date('2026-05-11T15:30:45.123Z');
    const result = startOfDay(date);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('preserves the date', () => {
    const date = new Date('2026-05-11T23:59:59.999Z');
    const result = startOfDay(date);
    expect(result.getFullYear()).toBe(date.getFullYear());
    expect(result.getMonth()).toBe(date.getMonth());
  });

  it('does not mutate the original date', () => {
    const date = new Date('2026-05-11T15:30:00.000Z');
    const originalTime = date.getTime();
    startOfDay(date);
    expect(date.getTime()).toBe(originalTime);
  });
});

// ─── endOfDay ─────────────────────────────────────────────────────────────────

describe('endOfDay', () => {
  it('sets time to 23:59:59.999', () => {
    const date = new Date('2026-05-11T00:00:00.000Z');
    const result = endOfDay(date);
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
    expect(result.getSeconds()).toBe(59);
    expect(result.getMilliseconds()).toBe(999);
  });

  it('preserves the date', () => {
    const date = new Date('2026-05-11T00:00:00.000Z');
    const result = endOfDay(date);
    expect(result.getDate()).toBe(date.getDate());
  });

  it('does not mutate the original date', () => {
    const date = new Date('2026-05-11T12:00:00.000Z');
    const originalTime = date.getTime();
    endOfDay(date);
    expect(date.getTime()).toBe(originalTime);
  });
});
