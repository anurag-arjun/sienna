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
  /** Ref to a function that assembles context set content for injection */
  contextAssembler?: React.RefObject<(() => Promise<string>) | null>;
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
  /** Current active model ID */
  activeModelId: string;
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
  /** Switch model mid-conversation */
  switchModel: (provider: string, modelId: string) => Promise<void>;
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
  const [activeModelId, setActiveModelId] = useState("claude-sonnet-4-20250514");

  // Refs for stable callback access (avoids dependency chains)
  const streamingRef = useRef("");
  const messageIdCounter = useRef(0);
  const unlistenRef = useRef<(() => void) | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const onErrorRef = useRef(options.onError);
  const sessionOptionsRef = useRef(options.sessionOptions);
  const contextAssemblerRef = options.contextAssembler ?? useRef(null);
  const activeModelIdRef = useRef(activeModelId);
  activeModelIdRef.current = activeModelId;

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
          // Finalize: move streaming content into messages with model attribution
          const finalContent = streamingRef.current;
          if (finalContent) {
            const modelId = activeModelIdRef.current;
            setMessages((prev) => [
              ...prev,
              {
                id: nextMessageId(),
                role: "assistant",
                content: finalContent,
                model: modelId,
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

      const trimmed = text.trim();

      // Add user message immediately (shows original text, not with context)
      setMessages((prev) => [
        ...prev,
        { id: nextMessageId(), role: "user", content: trimmed },
      ]);
      setError(null);

      try {
        // Assemble context from matched context sets
        let messageWithContext = trimmed;
        const assembler = contextAssemblerRef.current;
        if (assembler) {
          try {
            const contextStr = await assembler();
            if (contextStr) {
              messageWithContext = trimmed + contextStr;
            }
          } catch {
            // Context assembly failure is non-fatal
          }
        }

        await piApi.prompt(sid, messageWithContext);
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

  // Switch model mid-conversation — stable
  const switchModel = useCallback(async (provider: string, modelId: string) => {
    const sid = sessionIdRef.current;
    if (!sid) {
      setActiveModelId(modelId);
      return;
    }
    try {
      await piApi.setModel(sid, provider, modelId);
      setActiveModelId(modelId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }, []);

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
    activeModelId,
    send,
    steer,
    abort,
    connect,
    disconnect,
    switchModel,
    error,
  };
}
