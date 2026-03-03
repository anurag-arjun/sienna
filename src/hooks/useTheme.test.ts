import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "./useTheme";

// Mock settings API
vi.mock("../api/settings", () => ({
  getSetting: vi.fn().mockResolvedValue(null),
  setSetting: vi.fn().mockResolvedValue(undefined),
}));

import { getSetting, setSetting } from "../api/settings";

describe("useTheme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.classList.remove("theme-light");
  });

  it("defaults to dark theme", async () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("loads saved light theme", async () => {
    vi.mocked(getSetting).mockResolvedValueOnce("light");
    const { result } = renderHook(() => useTheme());

    // Wait for async load
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.theme).toBe("light");
    expect(document.body.classList.contains("theme-light")).toBe(true);
  });

  it("toggle switches dark to light", async () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggle();
    });

    expect(result.current.theme).toBe("light");
    expect(document.body.classList.contains("theme-light")).toBe(true);
    expect(setSetting).toHaveBeenCalledWith("theme", "light");
  });

  it("toggle switches light to dark", async () => {
    vi.mocked(getSetting).mockResolvedValueOnce("light");
    const { result } = renderHook(() => useTheme());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => {
      result.current.toggle();
    });

    expect(result.current.theme).toBe("dark");
    expect(document.body.classList.contains("theme-light")).toBe(false);
    expect(setSetting).toHaveBeenCalledWith("theme", "dark");
  });

  it("setTheme applies directly", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme("light");
    });

    expect(result.current.theme).toBe("light");
    expect(document.body.classList.contains("theme-light")).toBe(true);
  });
});
