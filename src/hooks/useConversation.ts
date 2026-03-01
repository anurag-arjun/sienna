/**
 * useConversation — React hook for managing a pi agent conversation.
 *
 * Handles session lifecycle, message state, streaming token accumulation,
 * and input dispatching via Tauri IPC.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { Message } from "../components/Conversation";
import type { PiEvent, CreateSessionRequest } from "../api/pi";

// Import pi API — in tests, these are mocked via the Tauri IPC mock
import { piApi } from "../api/pi";

export interface UseConversationOptions {
  /** Session creation options */
  sessionOptions?: CreateSessionRequest;
  /** Called when an error occurs */
  onError?: (error: string) => void;
}

export interface UseConversationReturn {
  /** All messages in the conversation */
  messages: Message[];
  /** Whether the AI is currently streaming a response */
  streaming: boolean;
  /** Partial streaming content (tokens accumulated so far) */
  streamingContent: string;
  /** Session ID (null if not connected) */
  sessionId: string | null;
  /** Send a message to the AI */
  send: (text: string) => Promise<void>;
  /** Steer the current generation */
  steer: (text: string) => Promise<void>;
  /** Abort the current generation */
  abort: () => Promise<void>;
  /** Create/connect a session */
  connect: (options?: CreateSessionRequest) => Promise<string>;
  /** Destroy the session */
  disconnect: () => Promise<void>;
  /** Last error message */
  error: string | null;
}

/**
 * Hook for managing a conversation with a pi agent session.
 *
 * Uses refs for option callbacks and session ID to keep all callbacks
 * referentially stable and avoid re-render cascades.
 */
export function useConversation(
  options: UseConversationOptions = {},
): UseConversationReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs for stable callback access (avoids dependency chains)
  const streamingRef = useRef("");
  const messageIdCounter = useRef(0);
  const unlistenRef = useRef<(() => void) | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const onErrorRef = useRef(options.onError);
  const sessionOptionsRef = useRef(options.sessionOptions);

  // Keep refs in sync
  useEffect(() => {
    onErrorRef.current = options.onError;
  }, [options.onError]);
  useEffect(() => {
    sessionOptionsRef.current = options.sessionOptions;
  }, [options.sessionOptions]);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Generate a unique message ID
  const nextMessageId = useCallback(() => {
    messageIdCounter.current += 1;
    return `msg-${messageIdCounter.current}`;
  }, []);

  // Handle incoming pi events — stable, no deps on options
  const handleEvent = useCallback(
    (event: PiEvent) => {
      switch (event.type) {
        case "agent_start":
          setStreaming(true);
          streamingRef.current = "";
          setStreamingContent("");
          break;

        case "text_delta":
          streamingRef.current += event.delta;
          setStreamingContent(streamingRef.current);
          break;

        case "text_end":
          // Final text — could use event.content instead of accumulated
          break;

        case "agent_end": {
          // Finalize: move streaming content into messages
          const finalContent = streamingRef.current;
          if (finalContent) {
            setMessages((prev) => [
              ...prev,
              {
                id: nextMessageId(),
                role: "assistant",
                content: finalContent,
              },
            ]);
          }
          setStreaming(false);
          setStreamingContent("");
          streamingRef.current = "";

          if (event.error) {
            setError(event.error);
            onErrorRef.current?.(event.error);
          }
          break;
        }

        case "error":
          setError(event.message);
          setStreaming(false);
          onErrorRef.current?.(event.message);
          break;

        default:
          // tool_start, tool_end, turn_end, thinking_delta — ignored for now
          break;
      }
    },
    [nextMessageId],
  );

  // Connect to a session — stable
  const connect = useCallback(
    async (connectOptions?: CreateSessionRequest) => {
      try {
        const opts = connectOptions ?? sessionOptionsRef.current ?? {};
        const sid = await piApi.createSession(opts);
        setSessionId(sid);
        setError(null);

        // Subscribe to events for this session
        const unlisten = await piApi.onSessionEvent(sid, handleEvent);
        unlistenRef.current = unlisten;

        return sid;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      }
    },
    [handleEvent],
  );

  // Send a message — uses ref for sessionId
  const send = useCallback(
    async (text: string) => {
      const sid = sessionIdRef.current;
      if (!sid) {
        setError("No active session");
        return;
      }
      if (!text.trim()) return;

      // Add user message immediately
      setMessages((prev) => [
        ...prev,
        { id: nextMessageId(), role: "user", content: text.trim() },
      ]);
      setError(null);

      try {
        await piApi.prompt(sid, text.trim());
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        onErrorRef.current?.(msg);
      }
    },
    [nextMessageId],
  );

  // Steer the current generation — stable
  const steer = useCallback(async (text: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await piApi.steer(sid, text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }, []);

  // Abort the current generation — stable
  const abort = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await piApi.abort(sid);
      setStreaming(false);

      // Preserve any partial content
      if (streamingRef.current) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextMessageId(),
            role: "assistant",
            content: streamingRef.current + " [aborted]",
          },
        ]);
        streamingRef.current = "";
        setStreamingContent("");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }, [nextMessageId]);

  // Disconnect — stable
  const disconnect = useCallback(async () => {
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    const sid = sessionIdRef.current;
    if (sid) {
      try {
        await piApi.destroySession(sid);
      } catch {
        // Ignore cleanup errors
      }
      setSessionId(null);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, []);

  return {
    messages,
    streaming,
    streamingContent,
    sessionId,
    send,
    steer,
    abort,
    connect,
    disconnect,
    error,
  };
}
