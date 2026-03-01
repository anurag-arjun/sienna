import { useMemo } from "react";
import { MessageBlock } from "./MessageBlock";

/**
 * Represents a single message in a conversation.
 */
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** ISO timestamp */
  timestamp?: string;
  /** Model that generated this response (assistant only) */
  model?: string;
}

interface ConversationProps {
  messages: Message[];
  /** Whether a response is currently streaming */
  streaming?: boolean;
  /** Partial content being streamed (appended as last message) */
  streamingContent?: string;
}

/**
 * Conversation view — renders messages as flowing prose dialogue.
 *
 * No bubbles, no avatars. User messages appear in primary weight,
 * AI responses in a lighter weight. Dialogue flows like prose.
 */
export function Conversation({
  messages,
  streaming = false,
  streamingContent = "",
}: ConversationProps) {
  // Combine messages with optional streaming content
  const allMessages = useMemo(() => {
    if (streaming && streamingContent) {
      return [
        ...messages,
        {
          id: "__streaming__",
          role: "assistant" as const,
          content: streamingContent,
        },
      ];
    }
    return messages;
  }, [messages, streaming, streamingContent]);

  if (allMessages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-text-tertiary text-sm italic select-none">
          Start a conversation…
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-6 pb-8">
      {allMessages.map((msg, index) => (
        <MessageBlock
          key={msg.id}
          role={msg.role}
          content={msg.content}
          model={msg.model}
          isStreaming={streaming && index === allMessages.length - 1 && msg.id === "__streaming__"}
          isFirst={index === 0}
        />
      ))}

      {/* Streaming cursor indicator */}
      {streaming && !streamingContent && (
        <div className="flex items-start gap-3">
          <span className="text-text-ai text-sm opacity-60 animate-pulse">
            ●
          </span>
        </div>
      )}
    </div>
  );
}
