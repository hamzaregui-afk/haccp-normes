/**
 * dlc.utils.test.ts
 * Unit tests for getDlcInfo and computeDlc — DLC calculation utilities.
 * Uses fake timers to make date-relative assertions deterministic.
 */

import { getDlcInfo, computeDlc } from '../dlc.utils';

const NOW = new Date('2026-05-11T12:00:00.000Z');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── getDlcInfo ───────────────────────────────────────────────────────────────

describe('getDlcInfo', () => {
  describe('EXPIRED', () => {
    it('returns EXPIRED when expiry is in the past', () => {
      const past = new Date('2026-05-10T00:00:00.000Z');
      const info = getDlcInfo(past);
      expect(info.status).toBe('EXPIRED');
      expect(info.label).toBe('EXPIRÉ');
      expect(info.daysRemaining).toBeLessThan(0);
    });
  });

  describe('WARNING', () => {
    it('returns WARNING when within default threshold (2 days)', () => {
      const soon = new Date('2026-05-12T00:00:00.000Z'); // ~1 day ahead
      const info = getDlcInfo(soon);
      expect(info.status).toBe('WARNING');
    });

    it('uses custom warningDays threshold', () => {
      const inFiveDays = new Date('2026-05-16T00:00:00.000Z');
      const info = getDlcInfo(inFiveDays, 7);  // 7-day threshold
      expect(info.status).toBe('WARNING');
    });

    it('WARNING label shows daysRemaining', () => {
      const soon = new Date('2026-05-12T00:00:00.000Z');
      const info = getDlcInfo(soon);
      expect(info.label).toContain('restant');
    });
  });

  describe('SAFE', () => {
    it('returns SAFE when expiry is well in the future', () => {
      const future = new Date('2026-06-01T00:00:00.000Z');
      const info = getDlcInfo(future);
      expect(info.status).toBe('SAFE');
    });

    it('SAFE label shows daysRemaining', () => {
      const future = new Date('2026-05-21T00:00:00.000Z'); // ~10 days
      const info = getDlcInfo(future);
      expect(info.label).toContain('restant');
      expect(info.daysRemaining).toBeGreaterThan(2);
    });
  });
});

// ─── computeDlc ───────────────────────────────────────────────────────────────

describe('computeDlc', () => {
  it('adds shelfLifeDays to producedAt', () => {
    const produced = new Date('2026-05-10T00:00:00.000Z');
    const result = computeDlc(produced, 5);
    expect(result.toISOString()).toBe(new Date('2026-05-15T00:00:00.000Z').toISOString());
  });

  it('does not mutate the input date', () => {
    const produced = new Date('2026-05-10T00:00:00.000Z');
    const originalTime = produced.getTime();
    computeDlc(produced, 3);
    expect(produced.getTime()).toBe(originalTime);
  });

  it('handles zero shelf life', () => {
    const produced = new Date('2026-05-10T00:00:00.000Z');
    const result = computeDlc(produced, 0);
    expect(result.toDateString()).toBe(produced.toDateString());
  });

  it('handles large shelf life (1 year)', () => {
    const produced = new Date('2026-01-01T00:00:00.000Z');
    const result = computeDlc(produced, 365);
    expect(result.getFullYear()).toBe(2027);
  });
});
