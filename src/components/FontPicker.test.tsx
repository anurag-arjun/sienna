import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { FontPicker } from "./FontPicker";

describe("FontPicker", () => {
  afterEach(cleanup);

  it("shows current font name", () => {
    render(<FontPicker currentFontId="inter" onSelect={vi.fn()} />);
    expect(screen.getByTestId("font-picker").textContent).toBe("Inter");
  });

  it("shows Literata when selected", () => {
    render(<FontPicker currentFontId="literata" onSelect={vi.fn()} />);
    expect(screen.getByTestId("font-picker").textContent).toBe("Literata");
  });

  it("opens dropdown on click", () => {
    render(<FontPicker currentFontId="inter" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByTestId("font-picker"));
    expect(screen.getByTestId("font-picker-dropdown")).toBeTruthy();
  });

  it("shows all font options", () => {
    render(<FontPicker currentFontId="inter" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByTestId("font-picker"));
    expect(screen.getByTestId("font-option-inter")).toBeTruthy();
    expect(screen.getByTestId("font-option-literata")).toBeTruthy();
    expect(screen.getByTestId("font-option-ia-writer-quattro")).toBeTruthy();
  });

  it("calls onSelect when font is clicked", () => {
    const onSelect = vi.fn();
    render(<FontPicker currentFontId="inter" onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("font-picker"));
    fireEvent.click(screen.getByTestId("font-option-literata"));
    expect(onSelect).toHaveBeenCalledWith("literata");
  });

  it("closes dropdown after selection", () => {
    render(<FontPicker currentFontId="inter" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByTestId("font-picker"));
    fireEvent.click(screen.getByTestId("font-option-literata"));
    expect(screen.queryByTestId("font-picker-dropdown")).toBeNull();
  });

  it("highlights active font", () => {
    render(<FontPicker currentFontId="literata" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByTestId("font-picker"));
    const active = screen.getByTestId("font-option-literata");
    expect(active.className).toContain("accent-warm");
  });
});
