import { act, renderHook } from '@testing-library/react';
import { useDebouncedPatientSearch } from './useDebouncedPatientSearch';

describe('useDebouncedPatientSearch', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('runs only the last query after the delay', () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedPatientSearch(run, 250));
    act(() => { result.current.schedule('a'); result.current.schedule('ab'); });
    act(() => { jest.advanceTimersByTime(249); });
    expect(run).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1); });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toBe('ab');
  });

  it('marks a run stale once a newer query or cancel arrives', () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedPatientSearch(run, 250));
    act(() => { result.current.schedule('a'); jest.advanceTimersByTime(250); });
    const isCurrentA: () => boolean = run.mock.calls[0][1];
    expect(isCurrentA()).toBe(true);
    act(() => { result.current.schedule('b'); });
    expect(isCurrentA()).toBe(false);
    act(() => { jest.advanceTimersByTime(250); });
    const isCurrentB: () => boolean = run.mock.calls[1][1];
    expect(isCurrentB()).toBe(true);
    act(() => { result.current.cancel(); });
    expect(isCurrentB()).toBe(false);
  });

  it('does not run a pending query after cancel', () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedPatientSearch(run, 250));
    act(() => { result.current.schedule('a'); result.current.cancel(); jest.advanceTimersByTime(500); });
    expect(run).not.toHaveBeenCalled();
  });
});
