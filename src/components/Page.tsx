import { useState, useCallback, useRef, useEffect } from "react";
import { Editor } from "../editor";
import { Conversation } from "./Conversation";
import { ChatInput } from "./ChatInput";
import { LibraryPanel } from "./LibraryPanel";
import { useConversation } from "../hooks/useConversation";
import type { Note } from "../api/notes";

export type PageMode = "document" | "conversation";

/**
 * The Page — the single surface where everything happens.
 * Writing, conversing, gathering, navigating, shipping.
 * No toolbar, no status bar, no menu bar. The window is the document.
 *
 * Mode toggles between document (editor) and conversation (chat).
 * Cmd+J / Ctrl+J switches modes.
 */
export function Page({ ready }: { ready: boolean }) {
  const [mode, setMode] = useState<PageMode>("document");
  const [wordCount, setWordCount] = useState(0);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversation = useConversation({
    onError: (err) => console.error("Conversation error:", err),
  });

  const handleEditorChange = useCallback((content: string) => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    setWordCount(words);
  }, []);

  // Auto-scroll conversation to bottom on new content
  useEffect(() => {
    if (mode === "conversation" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mode, conversation.messages, conversation.streamingContent]);

  // Connect session when entering conversation mode
  const handleSwitchToConversation = useCallback(async () => {
    setMode("conversation");
    if (!conversation.sessionId) {
      try {
        await conversation.connect();
      } catch {
        // Error is set in hook state
      }
    }
  }, [conversation]);

  // Cmd+J toggles mode, Cmd+O toggles library
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (mode === "document") {
          handleSwitchToConversation();
        } else {
          setMode("document");
        }
      }
      if (e.key === "o" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setLibraryOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, handleSwitchToConversation]);

  const handleSelectNote = useCallback((note: Note) => {
    setActiveNoteId(note.id);
    setMode(note.type === "conversation" ? "conversation" : "document");
  }, []);

  const readingTime = Math.max(1, Math.ceil(wordCount / 250));

  return (
    <main className="flex-1 flex flex-col items-center overflow-hidden">
      <div className="w-full max-w-2xl flex-1 flex flex-col px-[var(--spacing-page-x)] py-[var(--spacing-page-y)] min-h-0">
        {!ready ? (
          <p className="text-text-tertiary text-sm select-none">Starting…</p>
        ) : mode === "document" ? (
          /* ── Document mode: Editor ─────────────────────────── */
          <div className="flex-1 flex flex-col min-h-0">
            <Editor
              placeholder="Start writing…"
              onChange={handleEditorChange}
              autoFocus
            />
          </div>
        ) : (
          /* ── Conversation mode: Messages + Input ──────────── */
          <div className="flex-1 flex flex-col min-h-0">
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto min-h-0"
              data-testid="conversation-scroll"
            >
              <Conversation
                messages={conversation.messages}
                streaming={conversation.streaming}
                streamingContent={conversation.streamingContent}
              />
            </div>
            <ChatInput
              onSend={conversation.send}
              onSteer={conversation.steer}
              streaming={conversation.streaming}
              disabled={!conversation.sessionId}
              placeholder={
                conversation.sessionId ? "Message…" : "Connecting…"
              }
            />
          </div>
        )}

        {/* Footer whisper — contextual to mode */}
        <div className="h-8 flex items-center justify-center">
          {mode === "document" ? (
            <span
              className={`text-text-tertiary text-xs transition-opacity duration-200 ${
                wordCount > 0 ? "opacity-40" : "opacity-0"
              }`}
            >
              {wordCount} word{wordCount !== 1 ? "s" : ""} · {readingTime} min
              read
            </span>
          ) : (
            <span className="text-text-tertiary text-xs opacity-40">
              {conversation.error
                ? conversation.error
                : conversation.streaming
                  ? "Streaming…"
                  : conversation.sessionId
                    ? "Connected"
                    : "No session"}
            </span>
          )}
        </div>
      </div>

      {/* Mode indicator + Context tray */}
      <div className="h-6 flex items-center justify-center gap-3">
        <button
          onClick={() => setLibraryOpen(true)}
          className="text-text-tertiary text-[10px] opacity-40 hover:opacity-70 transition-opacity cursor-pointer select-none"
          title="Library (Ctrl+O)"
        >
          ☰
        </button>
        <button
          onClick={() =>
            mode === "document"
              ? handleSwitchToConversation()
              : setMode("document")
          }
          className="text-text-tertiary text-[10px] opacity-40 hover:opacity-70 transition-opacity cursor-pointer select-none"
          data-testid="mode-toggle"
          title={`Switch to ${mode === "document" ? "conversation" : "document"} (Ctrl+J)`}
        >
          {mode === "document" ? "✎ write" : "◆ chat"}
        </button>
        <span className="text-text-tertiary text-[10px] opacity-40">0</span>
      </div>

      {/* Library panel */}
      <LibraryPanel
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelectNote={handleSelectNote}
        activeNoteId={activeNoteId}
      />
    </main>
  );
}
