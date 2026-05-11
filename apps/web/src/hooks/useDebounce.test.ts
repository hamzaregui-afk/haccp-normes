/**
 * useDebounce.test.ts
 *
 * Unit tests for the useDebounce hook.
 *
 * Tests cover:
 *  - Returns the initial value immediately (no wait)
 *  - Does NOT update the debounced value before the delay elapses
 *  - Updates the debounced value after the delay has elapsed
 *  - Resets the timer on rapid value changes (only the last value wins)
 *  - Respects a custom delayMs
 *  - Works with non-string types (number, object)
 */

import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 400));
    expect(result.current).toBe('initial');
  });

  it('does not update before the delay elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 400), {
      initialProps: { value: 'initial' },
    });

    rerender({ value: 'updated' });
    act(() => { jest.advanceTimersByTime(399); });

    expect(result.current).toBe('initial');
  });

  it('updates after the delay elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 400), {
      initialProps: { value: 'initial' },
    });

    rerender({ value: 'updated' });
    act(() => { jest.advanceTimersByTime(400); });

    expect(result.current).toBe('updated');
  });

  it('only keeps the last value when the input changes rapidly', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 400), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => { jest.advanceTimersByTime(200); });
    rerender({ value: 'c' });
    act(() => { jest.advanceTimersByTime(200); });
    // 400 ms since 'c' has NOT elapsed — still debouncing
    expect(result.current).toBe('a');

    act(() => { jest.advanceTimersByTime(200); });
    // 400 ms since 'c' — now it resolves
    expect(result.current).toBe('c');
  });

  it('respects a custom delayMs', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 1000), {
      initialProps: { value: 'start' },
    });

    rerender({ value: 'end' });
    act(() => { jest.advanceTimersByTime(999); });
    expect(result.current).toBe('start');

    act(() => { jest.advanceTimersByTime(1); });
    expect(result.current).toBe('end');
  });

  it('works with numeric values', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 400), {
      initialProps: { value: 0 },
    });

    rerender({ value: 42 });
    act(() => { jest.advanceTimersByTime(400); });
    expect(result.current).toBe(42);
  });

  it('works with object values', () => {
    const initial = { q: '' };
    const updated = { q: 'test' };

    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 400), {
      initialProps: { value: initial },
    });

    rerender({ value: updated });
    act(() => { jest.advanceTimersByTime(400); });
    expect(result.current).toEqual({ q: 'test' });
  });
});
