/**
 * recurrence.engine.ts
 *
 * Pure, side-effect-free engine that computes task occurrence dates from a
 * ControlSchedule recurrence configuration. All dates are UTC throughout.
 *
 * Supported frequencies:
 *  DAILY   — every N days at the listed time slots
 *  WEEKLY  — every N weeks on the listed days-of-week at the listed time slots
 *  MONTHLY — every N months on the listed days-of-month at the listed time slots
 *  YEARLY  — every N years at the listed time slots (on startDate's month/day)
 *  CUSTOM  — every N hours (no time slots) or N days/weeks (with time slots)
 */

import type { RecurrenceConfig, ScheduleFrequency } from '../dto/schedule.dto';

export class RecurrenceEngine {
  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Returns all occurrence DateTimes inside [windowStart, windowEnd].
   * Respects scheduleStart (no occurrences before it) and scheduleEnd.
   */
  static getOccurrencesInWindow(
    frequency:     ScheduleFrequency,
    config:        RecurrenceConfig,
    windowStart:   Date,
    windowEnd:     Date,
    scheduleStart: Date,
    scheduleEnd:   Date | null,
  ): Date[] {
    const effectiveEnd = scheduleEnd
      ? new Date(Math.min(windowEnd.getTime(), scheduleEnd.getTime()))
      : windowEnd;

    if (scheduleStart > effectiveEnd) return [];

    switch (frequency) {
      case 'DAILY':   return this.daily(config, windowStart, effectiveEnd, scheduleStart);
      case 'WEEKLY':  return this.weekly(config, windowStart, effectiveEnd, scheduleStart);
      case 'MONTHLY': return this.monthly(config, windowStart, effectiveEnd, scheduleStart);
      case 'YEARLY':  return this.yearly(config, windowStart, effectiveEnd, scheduleStart);
      case 'CUSTOM':  return this.custom(config, windowStart, effectiveEnd, scheduleStart);
    }
  }

  /**
   * Returns the first occurrence strictly after `after`, or null if the schedule
   * is exhausted within a 90-day lookahead (treated as "no future occurrences").
   * Used to maintain ControlSchedule.nextRunAt.
   */
  static getNextOccurrence(
    frequency:     ScheduleFrequency,
    config:        RecurrenceConfig,
    after:         Date,
    scheduleStart: Date,
    scheduleEnd:   Date | null,
  ): Date | null {
    const horizon    = new Date(after.getTime() + 90 * 86_400_000);
    const afterPlusMs = new Date(after.getTime() + 1); // strictly after
    const occs = this.getOccurrencesInWindow(
      frequency, config, afterPlusMs, horizon, scheduleStart, scheduleEnd,
    );
    return occs.length > 0 ? occs[0] : null;
  }

  // ── Frequency implementations ────────────────────────────────────────────

  private static daily(
    config: RecurrenceConfig,
    from:   Date,
    to:     Date,
    start:  Date,
  ): Date[] {
    const results: Date[] = [];
    let cursor = this.startOfDayUTC(start);

    // Advance cursor to first eligible day (>= window start day)
    const fromDay = this.startOfDayUTC(from);
    while (cursor < fromDay) {
      cursor = this.addDays(cursor, config.interval);
    }

    while (cursor <= to) {
      for (const slot of config.timeSlots) {
        const occ = this.applySlot(cursor, slot);
        if (occ >= from && occ <= to) results.push(occ);
      }
      cursor = this.addDays(cursor, config.interval);
    }

    return results;
  }

  private static weekly(
    config: RecurrenceConfig,
    from:   Date,
    to:     Date,
    start:  Date,
  ): Date[] {
    if (!config.daysOfWeek?.length) return [];
    const results: Date[] = [];

    // Anchor the week cycle to the schedule's start week (Sunday = day 0)
    const startDay  = this.startOfDayUTC(start);
    const weekAnchor = this.addDays(startDay, -startDay.getUTCDay());

    let weekCursor = new Date(weekAnchor);
    while (weekCursor <= to) {
      // Check if this week falls on an active cycle slot
      const weeksDiff = Math.round(
        (weekCursor.getTime() - weekAnchor.getTime()) / (7 * 86_400_000),
      );
      if (weeksDiff % config.interval === 0) {
        for (const dow of config.daysOfWeek) {
          const dayDate = this.addDays(weekCursor, dow);
          for (const slot of config.timeSlots) {
            const occ = this.applySlot(dayDate, slot);
            if (occ >= from && occ <= to && occ >= start) results.push(occ);
          }
        }
      }
      weekCursor = this.addDays(weekCursor, 7);
    }

    return results.sort((a, b) => a.getTime() - b.getTime());
  }

  private static monthly(
    config: RecurrenceConfig,
    from:   Date,
    to:     Date,
    start:  Date,
  ): Date[] {
    if (!config.daysOfMonth?.length) return [];
    const results: Date[] = [];

    let yr  = start.getUTCFullYear();
    let mon = start.getUTCMonth();

    while (new Date(Date.UTC(yr, mon, 1)) <= to) {
      const daysInMonth = new Date(Date.UTC(yr, mon + 1, 0)).getUTCDate();
      for (const dom of config.daysOfMonth) {
        const effectiveDom = Math.min(dom, daysInMonth);
        const dayDate = new Date(Date.UTC(yr, mon, effectiveDom));
        for (const slot of config.timeSlots) {
          const occ = this.applySlot(dayDate, slot);
          if (occ >= from && occ <= to && occ >= start) results.push(occ);
        }
      }
      // Advance by interval months
      mon += config.interval;
      if (mon > 11) { yr += Math.floor(mon / 12); mon = mon % 12; }
    }

    return results.sort((a, b) => a.getTime() - b.getTime());
  }

  private static yearly(
    config: RecurrenceConfig,
    from:   Date,
    to:     Date,
    start:  Date,
  ): Date[] {
    // Yearly = same month + day as startDate, every N years, at listed timeSlots
    const results: Date[] = [];
    const anchorMon = start.getUTCMonth();
    const anchorDom = start.getUTCDate();

    let yr = start.getUTCFullYear();
    while (yr <= to.getUTCFullYear() + 1) {
      const daysInMonth = new Date(Date.UTC(yr, anchorMon + 1, 0)).getUTCDate();
      const dom = Math.min(anchorDom, daysInMonth);
      const dayDate = new Date(Date.UTC(yr, anchorMon, dom));
      for (const slot of config.timeSlots) {
        const occ = this.applySlot(dayDate, slot);
        if (occ >= from && occ <= to && occ >= start) results.push(occ);
      }
      yr += config.interval;
    }

    return results.sort((a, b) => a.getTime() - b.getTime());
  }

  private static custom(
    config: RecurrenceConfig,
    from:   Date,
    to:     Date,
    start:  Date,
  ): Date[] {
    const unit = config.intervalUnit ?? 'DAYS';
    const results: Date[] = [];

    if (unit === 'HOURS') {
      // Hour-based: occurrences are start + N*interval*3600s (no time slots)
      const intervalMs = config.interval * 3_600_000;
      const elapsed = from.getTime() - start.getTime();
      const periods  = Math.max(0, Math.ceil(elapsed / intervalMs));
      let cursor = new Date(start.getTime() + periods * intervalMs);

      while (cursor <= to) {
        if (cursor >= from) results.push(new Date(cursor));
        cursor = new Date(cursor.getTime() + intervalMs);
      }
    } else {
      // Day/week-based with time slots — same logic as DAILY/WEEKLY
      const intervalMs = unit === 'WEEKS'
        ? config.interval * 7 * 86_400_000
        : config.interval * 86_400_000;

      let cursor = this.startOfDayUTC(start);
      const fromDay = this.startOfDayUTC(from);
      while (cursor < fromDay) cursor = new Date(cursor.getTime() + intervalMs);

      while (cursor <= to) {
        for (const slot of config.timeSlots) {
          const occ = this.applySlot(cursor, slot);
          if (occ >= from && occ <= to && occ >= start) results.push(occ);
        }
        cursor = new Date(cursor.getTime() + intervalMs);
      }
    }

    return results;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Returns a new Date with the UTC time portion set to HH:mm from slot string. */
  private static applySlot(date: Date, slot: string): Date {
    const [h, m] = slot.split(':').map(Number) as [number, number];
    const d = new Date(date);
    d.setUTCHours(h, m, 0, 0);
    return d;
  }

  private static startOfDayUTC(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  private static addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }
}
