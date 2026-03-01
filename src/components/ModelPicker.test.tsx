import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ModelPicker } from "./ModelPicker";
import { MODEL_REGISTRY } from "../lib/models";

describe("ModelPicker", () => {
  afterEach(cleanup);

  it("renders trigger with current model short name", () => {
    render(
      <ModelPicker
        currentModelId="claude-sonnet-4-20250514"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId("model-picker-trigger").textContent).toBe(
      "Sonnet 4",
    );
  });

  it("falls back to raw ID for unknown model", () => {
    render(
      <ModelPicker currentModelId="custom-model" onSelect={vi.fn()} />,
    );
    expect(screen.getByTestId("model-picker-trigger").textContent).toBe(
      "custom-model",
    );
  });

  it("opens dropdown on click", () => {
    render(
      <ModelPicker
        currentModelId="claude-sonnet-4-20250514"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("model-picker-dropdown")).toBeNull();
    fireEvent.click(screen.getByTestId("model-picker-trigger"));
    expect(screen.getByTestId("model-picker-dropdown")).toBeTruthy();
  });

  it("shows all provider groups", () => {
    render(
      <ModelPicker
        currentModelId="claude-sonnet-4-20250514"
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("model-picker-trigger"));

    expect(screen.getByTestId("model-group-anthropic")).toBeTruthy();
    expect(screen.getByTestId("model-group-openai")).toBeTruthy();
    expect(screen.getByTestId("model-group-google")).toBeTruthy();
  });

  it("shows all models as options", () => {
    render(
      <ModelPicker
        currentModelId="claude-sonnet-4-20250514"
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("model-picker-trigger"));

    const options = screen.getAllByTestId("model-option");
    expect(options.length).toBe(MODEL_REGISTRY.length);
  });

  it("calls onSelect when a model is clicked", () => {
    const onSelect = vi.fn();
    render(
      <ModelPicker
        currentModelId="claude-sonnet-4-20250514"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId("model-picker-trigger"));

    const gptOption = screen
      .getAllByTestId("model-option")
      .find((el) => el.getAttribute("data-model-id") === "gpt-4.1");
    expect(gptOption).toBeTruthy();
    fireEvent.click(gptOption!);

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "gpt-4.1", provider: "openai" }),
    );
  });

  it("closes dropdown after selection", () => {
    render(
      <ModelPicker
        currentModelId="claude-sonnet-4-20250514"
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("model-picker-trigger"));
    expect(screen.getByTestId("model-picker-dropdown")).toBeTruthy();

    const option = screen.getAllByTestId("model-option")[0];
    fireEvent.click(option);
    expect(screen.queryByTestId("model-picker-dropdown")).toBeNull();
  });

  it("does not open when disabled", () => {
    render(
      <ModelPicker
        currentModelId="claude-sonnet-4-20250514"
        onSelect={vi.fn()}
        disabled
      />,
    );
    fireEvent.click(screen.getByTestId("model-picker-trigger"));
    expect(screen.queryByTestId("model-picker-dropdown")).toBeNull();
  });

  it("highlights current model in dropdown", () => {
    render(
      <ModelPicker
        currentModelId="claude-sonnet-4-20250514"
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("model-picker-trigger"));

    const currentOption = screen
      .getAllByTestId("model-option")
      .find(
        (el) =>
          el.getAttribute("data-model-id") === "claude-sonnet-4-20250514",
      );
    expect(currentOption?.className).toContain("text-accent-blue");
  });
});
