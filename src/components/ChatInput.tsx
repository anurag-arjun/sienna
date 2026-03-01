import { useState, useCallback, useRef, type KeyboardEvent } from "react";

interface ChatInputProps {
  /** Called when user submits a message (Enter) */
  onSend: (text: string) => void;
  /** Called when user wants to steer (Enter while streaming) */
  onSteer?: (text: string) => void;
  /** Whether AI is currently streaming */
  streaming?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Whether input is disabled */
  disabled?: boolean;
}

/**
 * Chat input — a minimal textarea for conversation mode.
 *
 * Enter sends. Shift+Enter inserts newline.
 * While streaming, Enter steers instead of sending.
 */
export function ChatInput({
  onSend,
  onSteer,
  streaming = false,
  placeholder = "Message…",
  disabled = false,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed) return;

        if (streaming && onSteer) {
          onSteer(trimmed);
        } else {
          onSend(trimmed);
        }
        setText("");

        // Reset textarea height
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
      }
    },
    [text, streaming, onSend, onSteer],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      // Auto-resize
      const ta = e.target;
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    },
    [],
  );

  return (
    <div className="relative" data-testid="chat-input">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={streaming ? "Steer the response…" : placeholder}
        disabled={disabled}
        rows={1}
        className="
          w-full resize-none overflow-hidden
          bg-transparent text-text-primary text-base leading-relaxed
          placeholder:text-text-tertiary placeholder:italic
          border-t border-accent-muted/30
          px-0 py-3
          focus:outline-none focus:border-accent-warm/50
          transition-colors duration-150
          disabled:opacity-40
        "
        data-testid="chat-textarea"
      />
      {/* Send hint */}
      <div className="absolute right-0 bottom-1 flex items-center gap-2">
        <span className="text-text-tertiary text-[10px] opacity-40 select-none">
          {streaming ? "Enter to steer" : "Enter to send"}
        </span>
      </div>
    </div>
  );
}
