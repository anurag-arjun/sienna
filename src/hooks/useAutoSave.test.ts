import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoSave } from "./useAutoSave";

describe("useAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls save after delay when marked dirty", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave(save, 500));

    act(() => {
      result.current.markDirty();
    });

    // Not called yet
    expect(save).not.toHaveBeenCalled();

    // After delay
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("debounces rapid markDirty calls", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave(save, 500));

    act(() => {
      result.current.markDirty();
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      result.current.markDirty();
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      result.current.markDirty();
    });

    // Not called yet — timer keeps resetting
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush immediately saves pending changes", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave(save, 5000));

    act(() => {
      result.current.markDirty();
    });

    await act(async () => {
      await result.current.flush();
    });

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush does nothing when not dirty", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave(save, 500));

    await act(async () => {
      await result.current.flush();
    });

    expect(save).not.toHaveBeenCalled();
  });

  it("does not double-save after flush then timer", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave(save, 500));

    act(() => {
      result.current.markDirty();
    });

    await act(async () => {
      await result.current.flush();
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("handles save errors gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const save = vi.fn().mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useAutoSave(save, 500));

    act(() => {
      result.current.markDirty();
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
