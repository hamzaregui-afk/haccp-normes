/**
 * usePagination.test.ts
 *
 * Unit tests for the usePagination hook.
 *
 * Tests cover:
 *  - Default initial state: page=1, limit=20
 *  - Custom initial page and limit honoured
 *  - setPage: updates page
 *  - setPage: clamps to 1 when given 0 or negative value
 *  - nextPage: increments page by 1
 *  - prevPage: decrements page by 1
 *  - prevPage: does not go below 1
 *  - reset: returns to initial page
 *  - limit is stable (read-only, matches initialLimit)
 */

import { renderHook, act } from '@testing-library/react';
import { usePagination } from './usePagination';

describe('usePagination', () => {
  it('starts at page 1 with limit 20 by default', () => {
    const { result } = renderHook(() => usePagination());
    expect(result.current.page).toBe(1);
    expect(result.current.limit).toBe(20);
  });

  it('honours a custom initial page', () => {
    const { result } = renderHook(() => usePagination(3));
    expect(result.current.page).toBe(3);
  });

  it('honours a custom initial limit', () => {
    const { result } = renderHook(() => usePagination(1, 50));
    expect(result.current.limit).toBe(50);
  });

  it('setPage updates the page', () => {
    const { result } = renderHook(() => usePagination());
    act(() => { result.current.setPage(5); });
    expect(result.current.page).toBe(5);
  });

  it('setPage clamps to 1 when given 0', () => {
    const { result } = renderHook(() => usePagination());
    act(() => { result.current.setPage(0); });
    expect(result.current.page).toBe(1);
  });

  it('setPage clamps to 1 when given a negative number', () => {
    const { result } = renderHook(() => usePagination());
    act(() => { result.current.setPage(-10); });
    expect(result.current.page).toBe(1);
  });

  it('nextPage increments page by 1', () => {
    const { result } = renderHook(() => usePagination(2));
    act(() => { result.current.nextPage(); });
    expect(result.current.page).toBe(3);
  });

  it('prevPage decrements page by 1', () => {
    const { result } = renderHook(() => usePagination(4));
    act(() => { result.current.prevPage(); });
    expect(result.current.page).toBe(3);
  });

  it('prevPage does not go below 1', () => {
    const { result } = renderHook(() => usePagination(1));
    act(() => { result.current.prevPage(); });
    expect(result.current.page).toBe(1);
  });

  it('reset returns to initialPage', () => {
    const { result } = renderHook(() => usePagination(2));
    act(() => { result.current.nextPage(); });
    act(() => { result.current.nextPage(); });
    expect(result.current.page).toBe(4);
    act(() => { result.current.reset(); });
    expect(result.current.page).toBe(2);
  });

  it('limit remains stable across page changes', () => {
    const { result } = renderHook(() => usePagination(1, 10));
    act(() => { result.current.nextPage(); });
    expect(result.current.limit).toBe(10);
  });
});
