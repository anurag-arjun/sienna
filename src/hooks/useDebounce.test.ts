import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "./useDebounce";

describe("useDebounce", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("hello", 100));
    expect(result.current).toBe("hello");
  });

  it("debounces value changes", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "a", delay: 100 } },
    );

    expect(result.current).toBe("a");

    rerender({ value: "b", delay: 100 });
    // Not yet updated
    expect(result.current).toBe("a");

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe("a");

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe("b");

    vi.useRealTimers();
  });

  it("resets timer on rapid changes", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "a", delay: 100 } },
    );

    rerender({ value: "b", delay: 100 });
    act(() => {
      vi.advanceTimersByTime(80);
    });
    // Change again before timer fires
    rerender({ value: "c", delay: 100 });
    act(() => {
      vi.advanceTimersByTime(80);
    });
    // "b" was never emitted
    expect(result.current).toBe("a");

    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(result.current).toBe("c");

    vi.useRealTimers();
  });
});
