import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Conversation, type Message } from "./Conversation";

const sampleMessages: Message[] = [
  { id: "1", role: "user", content: "Hello, what is Rust?" },
  {
    id: "2",
    role: "assistant",
    content: "Rust is a systems programming language focused on safety and performance.",
    model: "claude-sonnet-4",
  },
  { id: "3", role: "user", content: "How does ownership work?" },
  {
    id: "4",
    role: "assistant",
    content: "Ownership is Rust's approach to memory management without a garbage collector.",
    model: "claude-sonnet-4",
  },
];

describe("Conversation", () => {
  it("shows placeholder when empty", () => {
    render(<Conversation messages={[]} />);
    expect(screen.getByText("Start a conversation…")).toBeDefined();
  });

  it("renders user messages with correct role", () => {
    render(<Conversation messages={sampleMessages} />);
    const userMsgs = screen.getAllByTestId("message-user");
    expect(userMsgs.length).toBe(2);
    expect(userMsgs[0].textContent).toContain("Hello, what is Rust?");
  });

  it("renders assistant messages with correct role", () => {
    render(<Conversation messages={sampleMessages} />);
    const aiMsgs = screen.getAllByTestId("message-assistant");
    expect(aiMsgs.length).toBe(2);
    expect(aiMsgs[0].textContent).toContain("systems programming language");
  });

  it("applies different styling for user vs assistant messages", () => {
    render(<Conversation messages={sampleMessages} />);
    const userMsg = screen.getAllByTestId("message-user")[0];
    const aiMsg = screen.getAllByTestId("message-assistant")[0];

    // User messages should have font-medium class
    const userContent = userMsg.querySelector("[class*='font-medium']");
    expect(userContent).toBeDefined();

    // AI messages should have font-normal class
    const aiContent = aiMsg.querySelector("[class*='font-normal']");
    expect(aiContent).toBeDefined();
  });

  it("shows model attribution on assistant messages", () => {
    render(<Conversation messages={sampleMessages} />);
    const models = screen.getAllByText("claude-sonnet-4");
    expect(models.length).toBe(2);
  });

  it("renders messages in order", () => {
    render(<Conversation messages={sampleMessages} />);
    const allMsgs = screen.getAllByTestId(/^message-/);
    expect(allMsgs.length).toBe(4);
    expect(allMsgs[0].getAttribute("data-role")).toBe("user");
    expect(allMsgs[1].getAttribute("data-role")).toBe("assistant");
    expect(allMsgs[2].getAttribute("data-role")).toBe("user");
    expect(allMsgs[3].getAttribute("data-role")).toBe("assistant");
  });

  it("shows streaming cursor when streaming with no content yet", () => {
    const { container } = render(
      <Conversation messages={sampleMessages} streaming={true} />,
    );
    // Should show the pulsing dot indicator
    const dot = container.querySelector(".animate-pulse");
    expect(dot).toBeDefined();
  });

  it("appends streaming content as a temporary assistant message", () => {
    render(
      <Conversation
        messages={sampleMessages}
        streaming={true}
        streamingContent="Ownership means each value has a single"
      />,
    );
    const aiMsgs = screen.getAllByTestId("message-assistant");
    // 2 original + 1 streaming
    expect(aiMsgs.length).toBe(3);
    expect(aiMsgs[2].textContent).toContain("Ownership means each value");
  });

  it("handles single message", () => {
    render(<Conversation messages={[sampleMessages[0]]} />);
    const msgs = screen.getAllByTestId(/^message-/);
    expect(msgs.length).toBe(1);
  });
});
