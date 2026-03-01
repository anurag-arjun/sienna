import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConversation } from "./useConversation";

// Mock the pi API module
vi.mock("../api/pi", () => {
  let eventCallback: ((event: unknown) => void) | null = null;
  const unlisten = vi.fn();

  return {
    piApi: {
      createSession: vi.fn().mockResolvedValue("test-session-123"),
      prompt: vi.fn().mockResolvedValue(undefined),
      steer: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockResolvedValue(undefined),
      destroySession: vi.fn().mockResolvedValue(undefined),
      getMessages: vi.fn().mockResolvedValue([]),
      onSessionEvent: vi.fn().mockImplementation((_sid: string, cb: (event: unknown) => void) => {
        eventCallback = cb;
        return Promise.resolve(unlisten);
      }),
      onEvent: vi.fn(),
      getState: vi.fn(),
      setModel: vi.fn(),
    },
    // Test helper to simulate events
    __simulateEvent: (event: unknown) => eventCallback?.(event),
    __getUnlisten: () => unlisten,
  };
});

// Access the mock helpers
async function getSimulateEvent() {
  const mod = await import("../api/pi") as unknown as {
    __simulateEvent: (event: unknown) => void;
  };
  return mod.__simulateEvent;
}

async function getPiApi() {
  const mod = await import("../api/pi");
  return mod.piApi;
}

describe("useConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with empty state", () => {
    const { result } = renderHook(() => useConversation());
    expect(result.current.messages).toEqual([]);
    expect(result.current.streaming).toBe(false);
    expect(result.current.streamingContent).toBe("");
    expect(result.current.sessionId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("connect creates a session and returns ID", async () => {
    const { result } = renderHook(() => useConversation());

    let sid: string;
    await act(async () => {
      sid = await result.current.connect();
    });

    expect(sid!).toBe("test-session-123");
    expect(result.current.sessionId).toBe("test-session-123");
  });

  it("send adds user message and calls prompt", async () => {
    const piApi = await getPiApi();
    const { result } = renderHook(() => useConversation());

    await act(async () => {
      await result.current.connect();
    });

    await act(async () => {
      await result.current.send("Hello AI");
    });

    expect(result.current.messages.length).toBe(1);
    expect(result.current.messages[0].role).toBe("user");
    expect(result.current.messages[0].content).toBe("Hello AI");
    expect(piApi.prompt).toHaveBeenCalledWith("test-session-123", "Hello AI");
  });

  it("does not send empty messages", async () => {
    const piApi = await getPiApi();
    const { result } = renderHook(() => useConversation());

    await act(async () => {
      await result.current.connect();
    });

    await act(async () => {
      await result.current.send("   ");
    });

    expect(result.current.messages.length).toBe(0);
    expect(piApi.prompt).not.toHaveBeenCalled();
  });

  it("accumulates streaming tokens from text_delta events", async () => {
    const simulateEvent = await getSimulateEvent();
    const { result } = renderHook(() => useConversation());

    await act(async () => {
      await result.current.connect();
    });

    act(() => {
      simulateEvent({ type: "agent_start", session_id: "test-session-123" });
    });
    expect(result.current.streaming).toBe(true);

    act(() => {
      simulateEvent({ type: "text_delta", session_id: "test-session-123", content_index: 0, delta: "Hello" });
    });
    expect(result.current.streamingContent).toBe("Hello");

    act(() => {
      simulateEvent({ type: "text_delta", session_id: "test-session-123", content_index: 0, delta: " world" });
    });
    expect(result.current.streamingContent).toBe("Hello world");
  });

  it("finalizes streaming content into messages on agent_end", async () => {
    const simulateEvent = await getSimulateEvent();
    const { result } = renderHook(() => useConversation());

    await act(async () => {
      await result.current.connect();
    });

    act(() => {
      simulateEvent({ type: "agent_start", session_id: "test-session-123" });
      simulateEvent({ type: "text_delta", session_id: "test-session-123", content_index: 0, delta: "Response text" });
      simulateEvent({ type: "agent_end", session_id: "test-session-123", error: null });
    });

    expect(result.current.streaming).toBe(false);
    expect(result.current.streamingContent).toBe("");
    expect(result.current.messages.length).toBe(1);
    expect(result.current.messages[0].role).toBe("assistant");
    expect(result.current.messages[0].content).toBe("Response text");
  });

  it("sets error on error event", async () => {
    const simulateEvent = await getSimulateEvent();
    const onError = vi.fn();
    const { result } = renderHook(() => useConversation({ onError }));

    await act(async () => {
      await result.current.connect();
    });

    act(() => {
      simulateEvent({ type: "error", session_id: "test-session-123", message: "API rate limit" });
    });

    expect(result.current.error).toBe("API rate limit");
    expect(onError).toHaveBeenCalledWith("API rate limit");
  });

  it("disconnect destroys session", async () => {
    const piApi = await getPiApi();
    const { result } = renderHook(() => useConversation());

    await act(async () => {
      await result.current.connect();
    });

    await act(async () => {
      await result.current.disconnect();
    });

    expect(piApi.destroySession).toHaveBeenCalledWith("test-session-123");
    expect(result.current.sessionId).toBeNull();
  });

  it("send without session sets error", async () => {
    const { result } = renderHook(() => useConversation());

    await act(async () => {
      await result.current.send("Hello");
    });

    expect(result.current.error).toBe("No active session");
  });

  it("hydrates messages from pi session on connect", async () => {
    const piApi = await getPiApi();
    (piApi.getMessages as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!", model: "claude-sonnet-4-20250514" },
      { role: "user", content: "How are you?" },
      { role: "assistant", content: "I'm doing well!", model: "claude-sonnet-4-20250514" },
    ]);

    const { result } = renderHook(() => useConversation());

    await act(async () => {
      await result.current.connect();
    });

    expect(piApi.getMessages).toHaveBeenCalledWith("test-session-123");
    expect(result.current.messages).toHaveLength(4);
    expect(result.current.messages[0].role).toBe("user");
    expect(result.current.messages[0].content).toBe("Hello");
    expect(result.current.messages[1].role).toBe("assistant");
    expect(result.current.messages[1].content).toBe("Hi there!");
    expect(result.current.messages[1].model).toBe("claude-sonnet-4-20250514");
    expect(result.current.messages[3].content).toBe("I'm doing well!");
  });

  it("hydrates empty session without error", async () => {
    const piApi = await getPiApi();
    (piApi.getMessages as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const { result } = renderHook(() => useConversation());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.error).toBeNull();
  });

  it("handles hydration failure gracefully", async () => {
    const piApi = await getPiApi();
    (piApi.getMessages as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("JSONL parse error"),
    );

    const { result } = renderHook(() => useConversation());

    await act(async () => {
      await result.current.connect();
    });

    // Should still connect successfully despite hydration failure
    expect(result.current.sessionId).toBe("test-session-123");
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.error).toBeNull();
  });

  it("injects context via append_system_prompt on connect, not in send", async () => {
    const piApi = await getPiApi();
    const contextAssembler = { current: vi.fn().mockResolvedValue("\n\n--- Context ---\nSome context data") };

    const { result } = renderHook(() =>
      useConversation({ contextAssembler }),
    );

    await act(async () => {
      await result.current.connect();
    });

    // Context should be passed as append_system_prompt on session creation
    expect(piApi.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        append_system_prompt: "\n\n--- Context ---\nSome context data",
      }),
    );

    // Send a message — should NOT include context in the message text
    await act(async () => {
      await result.current.send("Hello AI");
    });

    expect(piApi.prompt).toHaveBeenCalledWith("test-session-123", "Hello AI");
  });

  it("clears messages on disconnect", async () => {
    const piApi = await getPiApi();
    (piApi.getMessages as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!", model: "claude-sonnet-4-20250514" },
    ]);

    const { result } = renderHook(() => useConversation());

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.messages).toHaveLength(2);

    await act(async () => {
      await result.current.disconnect();
    });
    expect(result.current.messages).toHaveLength(0);
  });
});
