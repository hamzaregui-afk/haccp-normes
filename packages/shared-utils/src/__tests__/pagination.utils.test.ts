/**
 * pagination.utils.test.ts
 * Unit tests for toPaginationMeta and toSkipTake helpers.
 */

import { toPaginationMeta, toSkipTake, DEFAULT_PAGINATION, MAX_LIMIT } from '../pagination.utils';

describe('toPaginationMeta', () => {
  it('calculates totalPages correctly', () => {
    const meta = toPaginationMeta(100, { page: 1, limit: 20 });
    expect(meta.totalPages).toBe(5);
  });

  it('rounds up for non-divisible totals', () => {
    const meta = toPaginationMeta(21, { page: 1, limit: 20 });
    expect(meta.totalPages).toBe(2);
  });

  it('returns hasNextPage=true when not on last page', () => {
    const meta = toPaginationMeta(100, { page: 1, limit: 20 });
    expect(meta.hasNextPage).toBe(true);
  });

  it('returns hasNextPage=false on last page', () => {
    const meta = toPaginationMeta(100, { page: 5, limit: 20 });
    expect(meta.hasNextPage).toBe(false);
  });

  it('returns hasPrevPage=false on first page', () => {
    const meta = toPaginationMeta(100, { page: 1, limit: 20 });
    expect(meta.hasPrevPage).toBe(false);
  });

  it('returns hasPrevPage=true after first page', () => {
    const meta = toPaginationMeta(100, { page: 2, limit: 20 });
    expect(meta.hasPrevPage).toBe(true);
  });

  it('echoes page and limit through', () => {
    const meta = toPaginationMeta(50, { page: 3, limit: 10 });
    expect(meta.page).toBe(3);
    expect(meta.limit).toBe(10);
    expect(meta.total).toBe(50);
  });

  it('handles zero total gracefully', () => {
    const meta = toPaginationMeta(0, { page: 1, limit: 20 });
    expect(meta.totalPages).toBe(0);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPrevPage).toBe(false);
  });
});

describe('toSkipTake', () => {
  it('returns skip=0 for page 1', () => {
    expect(toSkipTake({ page: 1, limit: 20 })).toEqual({ skip: 0, take: 20 });
  });

  it('returns correct skip for page 2', () => {
    expect(toSkipTake({ page: 2, limit: 20 })).toEqual({ skip: 20, take: 20 });
  });

  it('returns correct skip for page 3 with limit 10', () => {
    expect(toSkipTake({ page: 3, limit: 10 })).toEqual({ skip: 20, take: 10 });
  });
});

describe('constants', () => {
  it('DEFAULT_PAGINATION has page=1 and limit=20', () => {
    expect(DEFAULT_PAGINATION).toEqual({ page: 1, limit: 20 });
  });

  it('MAX_LIMIT is 100', () => {
    expect(MAX_LIMIT).toBe(100);
  });
});
