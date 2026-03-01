/**
 * MessageBlock — a single message in the conversation flow.
 *
 * User messages: full text-primary weight, slightly more spacing above.
 * AI messages: lighter text-ai color, prose-like flow.
 * No bubbles, no borders, no avatars. Just text weight and color.
 */

interface MessageBlockProps {
  role: "user" | "assistant";
  content: string;
  model?: string;
  isStreaming?: boolean;
  isFirst?: boolean;
}

export function MessageBlock({
  role,
  content,
  model,
  isStreaming = false,
  isFirst = false,
}: MessageBlockProps) {
  const isUser = role === "user";

  return (
    <div
      className={`
        relative
        ${isUser ? "mt-2" : "mt-0"}
        ${isFirst ? "mt-0" : ""}
      `}
      data-role={role}
      data-testid={`message-${role}`}
    >
      {/* Content */}
      <div
        className={`
          text-base leading-relaxed whitespace-pre-wrap break-words
          ${isUser ? "text-text-primary font-medium" : "text-text-ai font-normal"}
          ${isStreaming ? "animate-pulse-subtle" : ""}
        `}
      >
        {content}
        {isStreaming && (
          <span className="inline-block w-[2px] h-[1.1em] bg-accent-warm ml-[1px] align-text-bottom animate-blink" />
        )}
      </div>

      {/* Model attribution whisper (assistant only) */}
      {!isUser && model && !isStreaming && (
        <div className="mt-1">
          <span className="text-text-tertiary text-[10px] opacity-40 select-none">
            {model}
          </span>
        </div>
      )}
    </div>
  );
}
