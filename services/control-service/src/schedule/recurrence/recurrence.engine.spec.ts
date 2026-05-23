/**
 * recurrence.engine.spec.ts
 *
 * Unit tests for RecurrenceEngine — validates occurrence computation for all
 * supported frequencies. No I/O, no DB — pure functions only.
 */

import { RecurrenceEngine } from './recurrence.engine';
import type { RecurrenceConfig } from '../dto/schedule.dto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const utc = (iso: string) => new Date(iso);
const isos = (dates: Date[]) => dates.map((d) => d.toISOString());

// ─── DAILY ────────────────────────────────────────────────────────────────────

describe('RecurrenceEngine — DAILY', () => {
  const config: RecurrenceConfig = {
    interval:            1,
    timeSlots:           ['08:00', '18:00'],
    advanceGenerateDays: 7,
  };

  it('generates both daily slots within a 2-day window', () => {
    const start = utc('2025-01-01T00:00:00Z');
    const from  = utc('2025-01-01T00:00:00Z');
    const to    = utc('2025-01-02T23:59:59Z');

    const occs = RecurrenceEngine.getOccurrencesInWindow(
      'DAILY', config, from, to, start, null,
    );

    expect(isos(occs)).toEqual([
      '2025-01-01T08:00:00.000Z',
      '2025-01-01T18:00:00.000Z',
      '2025-01-02T08:00:00.000Z',
      '2025-01-02T18:00:00.000Z',
    ]);
  });

  it('respects scheduleStart — no occurrences before it', () => {
    const start = utc('2025-01-03T00:00:00Z');
    const from  = utc('2025-01-01T00:00:00Z');
    const to    = utc('2025-01-05T23:59:59Z');

    const occs = RecurrenceEngine.getOccurrencesInWindow(
      'DAILY', config, from, to, start, null,
    );

    expect(occs[0].toISOString()).toMatch(/^2025-01-03/);
  });

  it('respects scheduleEnd — no occurrences after it', () => {
    const start = utc('2025-01-01T00:00:00Z');
    const from  = utc('2025-01-01T00:00:00Z');
    const to    = utc('2025-01-10T23:59:59Z');
    const end   = utc('2025-01-03T12:00:00Z');

    const occs = RecurrenceEngine.getOccurrencesInWindow(
      'DAILY', config, from, to, start, end,
    );

    expect(occs.every((d) => d <= end)).toBe(true);
  });

  it('interval=2 generates every other day', () => {
    const cfg: RecurrenceConfig = { ...config, interval: 2 };
    const start = utc('2025-01-01T00:00:00Z');
    const from  = utc('2025-01-01T00:00:00Z');
    const to    = utc('2025-01-07T23:59:59Z');

    const occs = RecurrenceEngine.getOccurrencesInWindow(
      'DAILY', cfg, from, to, start, null,
    );

    const days = [...new Set(occs.map((d) => d.getUTCDate()))];
    expect(days).toEqual([1, 3, 5, 7]);
  });
});

// ─── WEEKLY ───────────────────────────────────────────────────────────────────

describe('RecurrenceEngine — WEEKLY', () => {
  it('generates Mon + Thu at 08:00 weekly', () => {
    // 2025-01-06 is a Monday, 2025-01-09 is a Thursday
    const config: RecurrenceConfig = {
      interval:            1,
      daysOfWeek:          [1, 4], // Mon=1, Thu=4
      timeSlots:           ['08:00'],
      advanceGenerateDays: 7,
    };
    const start = utc('2025-01-06T00:00:00Z');
    const from  = utc('2025-01-06T00:00:00Z');
    const to    = utc('2025-01-12T23:59:59Z');

    const occs = RecurrenceEngine.getOccurrencesInWindow(
      'WEEKLY', config, from, to, start, null,
    );

    expect(isos(occs)).toEqual([
      '2025-01-06T08:00:00.000Z', // Monday
      '2025-01-09T08:00:00.000Z', // Thursday
    ]);
  });

  it('bi-weekly (interval=2) skips alternate weeks', () => {
    const config: RecurrenceConfig = {
      interval:            2,
      daysOfWeek:          [1], // Monday only
      timeSlots:           ['09:00'],
      advanceGenerateDays: 7,
    };
    // Week of Jan 6 (active), week of Jan 13 (skip), week of Jan 20 (active)
    const start = utc('2025-01-06T00:00:00Z');
    const from  = utc('2025-01-06T00:00:00Z');
    const to    = utc('2025-01-27T23:59:59Z');

    const occs = RecurrenceEngine.getOccurrencesInWindow(
      'WEEKLY', config, from, to, start, null,
    );

    const days = occs.map((d) => d.getUTCDate());
    expect(days).toEqual([6, 20]); // Jan 6 and Jan 20 (skip Jan 13)
  });

  it('returns empty when daysOfWeek is absent', () => {
    const config: RecurrenceConfig = {
      interval:            1,
      timeSlots:           ['08:00'],
      advanceGenerateDays: 7,
    };
    const occs = RecurrenceEngine.getOccurrencesInWindow(
      'WEEKLY', config,
      utc('2025-01-01T00:00:00Z'),
      utc('2025-01-31T23:59:59Z'),
      utc('2025-01-01T00:00:00Z'),
      null,
    );
    expect(occs).toHaveLength(0);
  });
});

// ─── MONTHLY ──────────────────────────────────────────────────────────────────

describe('RecurrenceEngine — MONTHLY', () => {
  it('generates 1st of each month at 09:00', () => {
    const config: RecurrenceConfig = {
      interval:            1,
      daysOfMonth:         [1],
      timeSlots:           ['09:00'],
      advanceGenerateDays: 7,
    };
    const start = utc('2025-01-01T00:00:00Z');
    const from  = utc('2025-01-01T00:00:00Z');
    const to    = utc('2025-03-31T23:59:59Z');

    const occs = RecurrenceEngine.getOccurrencesInWindow(
      'MONTHLY', config, from, to, start, null,
    );

    expect(isos(occs)).toEqual([
      '2025-01-01T09:00:00.000Z',
      '2025-02-01T09:00:00.000Z',
      '2025-03-01T09:00:00.000Z',
    ]);
  });

  it('clamps day-of-month to last day of short months (e.g. Feb 31 → Feb 28)', () => {
    const config: RecurrenceConfig = {
      interval:            1,
      daysOfMonth:         [31],
      timeSlots:           ['06:00'],
      advanceGenerateDays: 7,
    };
    const start = utc('2025-02-01T00:00:00Z');
    const from  = utc('2025-02-01T00:00:00Z');
    const to    = utc('2025-02-28T23:59:59Z');

    const occs = RecurrenceEngine.getOccurrencesInWindow(
      'MONTHLY', config, from, to, start, null,
    );

    // Feb 2025 has 28 days — occurrence should be on the 28th
    expect(occs[0]?.getUTCDate()).toBe(28);
  });

  it('quarterly (interval=3) generates every 3 months', () => {
    const config: RecurrenceConfig = {
      interval:            3,
      daysOfMonth:         [1],
      timeSlots:           ['08:00'],
      advanceGenerateDays: 7,
    };
    const start = utc('2025-01-01T00:00:00Z');
    const from  = utc('2025-01-01T00:00:00Z');
    const to    = utc('2025-12-31T23:59:59Z');

    const occs = RecurrenceEngine.getOccurrencesInWindow(
      'MONTHLY', config, from, to, start, null,
    );

    const months = occs.map((d) => d.getUTCMonth() + 1);
    expect(months).toEqual([1, 4, 7, 10]);
  });
});

// ─── CUSTOM / HOURS ───────────────────────────────────────────────────────────

describe('RecurrenceEngine — CUSTOM (HOURS)', () => {
  it('generates every 4 hours', () => {
    const config: RecurrenceConfig = {
      interval:            4,
      timeSlots:           ['00:00'], // ignored for HOURS
      intervalUnit:        'HOURS',
      advanceGenerateDays: 1,
    };
    const start = utc('2025-01-01T00:00:00Z');
    const from  = utc('2025-01-01T00:00:00Z');
    const to    = utc('2025-01-01T23:59:59Z');

    const occs = RecurrenceEngine.getOccurrencesInWindow(
      'CUSTOM', config, from, to, start, null,
    );

    const hours = occs.map((d) => d.getUTCHours());
    expect(hours).toEqual([0, 4, 8, 12, 16, 20]);
  });
});

// ─── getNextOccurrence ────────────────────────────────────────────────────────

describe('RecurrenceEngine.getNextOccurrence', () => {
  it('returns the first future occurrence', () => {
    const config: RecurrenceConfig = {
      interval:            1,
      timeSlots:           ['08:00'],
      advanceGenerateDays: 7,
    };
    const after = utc('2025-01-01T10:00:00Z'); // after 08:00
    const next  = RecurrenceEngine.getNextOccurrence(
      'DAILY', config, after, utc('2025-01-01T00:00:00Z'), null,
    );
    expect(next?.toISOString()).toBe('2025-01-02T08:00:00.000Z');
  });

  it('returns null when endDate is already past', () => {
    const config: RecurrenceConfig = {
      interval:            1,
      timeSlots:           ['08:00'],
      advanceGenerateDays: 7,
    };
    const after = utc('2025-06-01T00:00:00Z');
    const next  = RecurrenceEngine.getNextOccurrence(
      'DAILY', config, after,
      utc('2025-01-01T00:00:00Z'),
      utc('2025-01-31T23:59:59Z'), // end is in the past
    );
    expect(next).toBeNull();
  });
});
