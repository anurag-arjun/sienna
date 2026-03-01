import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Conversation, type Message } from "./Conversation";

describe("Conversation forking", () => {
  afterEach(cleanup);

  const messages: Message[] = [
    { id: "m1", role: "user", content: "Hello" },
    { id: "m2", role: "assistant", content: "Hi there!", model: "claude-sonnet-4-20250514" },
    { id: "m3", role: "user", content: "Tell me more" },
    { id: "m4", role: "assistant", content: "Sure thing.", model: "claude-sonnet-4-20250514" },
  ];

  it("renders fork buttons on assistant messages when onFork is provided", () => {
    render(<Conversation messages={messages} onFork={vi.fn()} />);
    const forkButtons = screen.getAllByTestId("fork-button");
    expect(forkButtons).toHaveLength(2); // two assistant messages
  });

  it("does not render fork buttons on user messages", () => {
    render(<Conversation messages={messages} onFork={vi.fn()} />);
    const userMessages = screen.getAllByTestId("message-user");
    for (const msg of userMessages) {
      expect(msg.querySelector('[data-testid="fork-button"]')).toBeNull();
    }
  });

  it("does not render fork buttons when onFork is not provided", () => {
    render(<Conversation messages={messages} />);
    expect(screen.queryByTestId("fork-button")).toBeNull();
  });

  it("calls onFork with correct message index when fork button clicked", () => {
    const onFork = vi.fn();
    render(<Conversation messages={messages} onFork={onFork} />);

    const forkButtons = screen.getAllByTestId("fork-button");
    // First fork button is on message index 1 (first assistant)
    fireEvent.click(forkButtons[0]);
    expect(onFork).toHaveBeenCalledWith(1);

    // Second fork button is on message index 3 (second assistant)
    fireEvent.click(forkButtons[1]);
    expect(onFork).toHaveBeenCalledWith(3);
  });

  it("does not show fork button on streaming message", () => {
    render(
      <Conversation
        messages={messages}
        streaming
        streamingContent="Thinking..."
        onFork={vi.fn()}
      />,
    );

    // Streaming message should not have a fork button
    const forkButtons = screen.getAllByTestId("fork-button");
    // Only 2 from the existing assistant messages, not the streaming one
    expect(forkButtons).toHaveLength(2);
  });

  it("shows model attribution alongside fork button", () => {
    render(<Conversation messages={messages} onFork={vi.fn()} />);
    const attributions = screen.getAllByTestId("model-attribution");
    expect(attributions).toHaveLength(2);
    expect(attributions[0].textContent).toBe("Sonnet 4");
  });
});
