import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import { ContextTray, ContextBadge } from "./ContextTray";

describe("ContextTray", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders nothing when closed", () => {
    render(
      <ContextTray open={false} onClose={vi.fn()} contextCount={0} />,
    );
    expect(screen.queryByTestId("context-tray-overlay")).toBeNull();
  });

  it("renders overlay and panel when open", async () => {
    render(
      <ContextTray open={true} onClose={vi.fn()} contextCount={3} />,
    );

    // Should show overlay
    expect(screen.getByTestId("context-tray-overlay")).toBeTruthy();
    // Should show panel
    expect(screen.getByTestId("context-tray-panel")).toBeTruthy();
    // Should show handle
    expect(screen.getByTestId("context-tray-handle")).toBeTruthy();
    // Should show count
    expect(screen.getByText("3 items")).toBeTruthy();
  });

  it("shows singular item text for count of 1", () => {
    render(
      <ContextTray open={true} onClose={vi.fn()} contextCount={1} />,
    );
    expect(screen.getByText("1 item")).toBeTruthy();
  });

  it("shows empty state when no children", () => {
    render(
      <ContextTray open={true} onClose={vi.fn()} contextCount={0} />,
    );
    expect(screen.getByText("No context attached")).toBeTruthy();
    expect(screen.getByText("0 items")).toBeTruthy();
  });

  it("renders children in content area", () => {
    render(
      <ContextTray open={true} onClose={vi.fn()} contextCount={1}>
        <div data-testid="test-child">Context item</div>
      </ContextTray>,
    );
    expect(screen.getByTestId("test-child")).toBeTruthy();
    expect(screen.getByText("Context item")).toBeTruthy();
  });

  it("calls onClose when overlay is clicked", () => {
    const onClose = vi.fn();
    render(
      <ContextTray open={true} onClose={onClose} contextCount={0} />,
    );

    // Click the overlay (not the panel)
    fireEvent.click(screen.getByTestId("context-tray-overlay"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when panel content is clicked", () => {
    const onClose = vi.fn();
    render(
      <ContextTray open={true} onClose={onClose} contextCount={0} />,
    );

    fireEvent.click(screen.getByTestId("context-tray-panel"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(
      <ContextTray open={true} onClose={onClose} contextCount={0} />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("transitions through opening → open states", async () => {
    // Mock requestAnimationFrame to fire immediately
    const origRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    };

    render(
      <ContextTray open={true} onClose={vi.fn()} contextCount={0} />,
    );

    // After rAF fires, panel should be visible (translateY: 0)
    const panel = screen.getByTestId("context-tray-panel");
    expect(panel.style.transform).toBe("translateY(0)");

    window.requestAnimationFrame = origRAF;
  });

  it("transitions to closing → closed on close", async () => {
    vi.useFakeTimers();

    const { rerender } = render(
      <ContextTray open={true} onClose={vi.fn()} contextCount={0} />,
    );

    // Close the tray
    rerender(
      <ContextTray open={false} onClose={vi.fn()} contextCount={0} />,
    );

    // Panel should still be in DOM during closing animation
    expect(screen.getByTestId("context-tray-panel")).toBeTruthy();

    // After animation completes, should be gone
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByTestId("context-tray-panel")).toBeNull();

    vi.useRealTimers();
  });

  it("updates context count dynamically", () => {
    const { rerender } = render(
      <ContextTray open={true} onClose={vi.fn()} contextCount={2} />,
    );
    expect(screen.getByText("2 items")).toBeTruthy();

    rerender(
      <ContextTray open={true} onClose={vi.fn()} contextCount={5} />,
    );
    expect(screen.getByText("5 items")).toBeTruthy();
  });
});

describe("ContextBadge", () => {
  afterEach(cleanup);

  it("renders count", () => {
    render(<ContextBadge count={3} onClick={vi.fn()} />);
    expect(screen.getByTestId("context-badge").textContent).toBe("3");
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<ContextBadge count={0} onClick={onClick} />);
    fireEvent.click(screen.getByTestId("context-badge"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows zero count", () => {
    render(<ContextBadge count={0} onClick={vi.fn()} />);
    expect(screen.getByTestId("context-badge").textContent).toBe("0");
  });
});
