import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";

const mockInvoke = vi.mocked(invoke);

describe("App", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });
  afterEach(cleanup);

  it("calls ping on mount to verify IPC bridge", async () => {
    mockInvoke.mockResolvedValue("pong: hello");
    render(<App />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("ping", { message: "hello" });
    });
  });

  it("renders editor after IPC bridge succeeds", async () => {
    mockInvoke.mockResolvedValue("pong: hello");
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector(".cm-editor")).toBeTruthy();
    });
  });

  it("still renders editor if IPC bridge fails", async () => {
    mockInvoke.mockRejectedValue(new Error("no backend"));
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector(".cm-editor")).toBeTruthy();
    });
  });
});
