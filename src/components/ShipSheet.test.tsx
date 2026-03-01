import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ShipSheet } from "./ShipSheet";

// Mock dialog plugin
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

describe("ShipSheet", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    content: "# Hello\n\nThis is a test document.",
    title: "Hello",
    tag: "plan" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders when open", () => {
    render(<ShipSheet {...defaultProps} />);
    expect(screen.getByTestId("ship-sheet")).toBeInTheDocument();
    expect(screen.getByText("Ship")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<ShipSheet {...defaultProps} open={false} />);
    expect(screen.queryByTestId("ship-sheet")).not.toBeInTheDocument();
  });

  it("shows save, copy MD, and copy text buttons", () => {
    render(<ShipSheet {...defaultProps} />);
    expect(screen.getByTestId("ship-save")).toBeInTheDocument();
    expect(screen.getByTestId("ship-copy-md")).toBeInTheDocument();
    expect(screen.getByTestId("ship-copy-text")).toBeInTheDocument();
  });

  it("shows GitHub push fields", () => {
    render(<ShipSheet {...defaultProps} />);
    expect(screen.getByTestId("ship-gh-owner")).toBeInTheDocument();
    expect(screen.getByTestId("ship-gh-repo")).toBeInTheDocument();
    expect(screen.getByTestId("ship-gh-path")).toBeInTheDocument();
    expect(screen.getByTestId("ship-gh-branch")).toBeInTheDocument();
    expect(screen.getByTestId("ship-gh-message")).toBeInTheDocument();
    expect(screen.getByTestId("ship-gh-push")).toBeInTheDocument();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<ShipSheet {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("ship-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when X is clicked", () => {
    const onClose = vi.fn();
    render(<ShipSheet {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("✕"));
    expect(onClose).toHaveBeenCalled();
  });

  it("copies markdown to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<ShipSheet {...defaultProps} />);
    fireEvent.click(screen.getByTestId("ship-copy-md"));

    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(defaultProps.content);
    });
  });

  it("copies stripped text to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<ShipSheet {...defaultProps} />);
    fireEvent.click(screen.getByTestId("ship-copy-text"));

    await vi.waitFor(() => {
      const calledWith = writeText.mock.calls[0][0];
      // Should not contain markdown markers
      expect(calledWith).not.toContain("#");
      expect(calledWith).toContain("Hello");
      expect(calledWith).toContain("This is a test document.");
    });
  });

  it("pre-fills GitHub path from title", () => {
    render(<ShipSheet {...defaultProps} />);
    const pathInput = screen.getByTestId("ship-gh-path") as HTMLInputElement;
    expect(pathInput.value).toBe("hello.md");
  });

  it("push button is disabled without owner/repo", () => {
    render(<ShipSheet {...defaultProps} />);
    const pushBtn = screen.getByTestId("ship-gh-push") as HTMLButtonElement;
    expect(pushBtn.disabled).toBe(true);
  });
});
