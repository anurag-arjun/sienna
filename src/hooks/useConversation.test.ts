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
});
