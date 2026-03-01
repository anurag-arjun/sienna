import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatInput } from "./ChatInput";

describe("ChatInput", () => {
  it("renders a textarea", () => {
    render(<ChatInput onSend={vi.fn()} />);
    expect(screen.getByTestId("chat-textarea")).toBeDefined();
  });

  it("calls onSend on Enter with text", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByTestId("chat-textarea") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "Hello world" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(onSend).toHaveBeenCalledWith("Hello world");
  });

  it("clears input after sending", () => {
    render(<ChatInput onSend={vi.fn()} />);
    const textarea = screen.getByTestId("chat-textarea") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(textarea.value).toBe("");
  });

  it("does not send on Shift+Enter", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByTestId("chat-textarea") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not send empty text", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByTestId("chat-textarea");

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("calls onSteer instead of onSend when streaming", () => {
    const onSend = vi.fn();
    const onSteer = vi.fn();
    render(<ChatInput onSend={onSend} onSteer={onSteer} streaming={true} />);
    const textarea = screen.getByTestId("chat-textarea") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "Be more concise" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(onSteer).toHaveBeenCalledWith("Be more concise");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows different placeholder when streaming", () => {
    render(<ChatInput onSend={vi.fn()} streaming={true} />);
    const textarea = screen.getByTestId("chat-textarea") as HTMLTextAreaElement;
    expect(textarea.placeholder).toBe("Steer the response…");
  });

  it("shows send hint text", () => {
    const { container } = render(<ChatInput onSend={vi.fn()} />);
    expect(container.textContent).toContain("Enter to send");
  });

  it("shows steer hint when streaming", () => {
    const { container } = render(<ChatInput onSend={vi.fn()} streaming={true} />);
    expect(container.textContent).toContain("Enter to steer");
  });
});
