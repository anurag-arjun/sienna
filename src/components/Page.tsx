import { useState, useCallback, useRef, useEffect } from "react";
import { Editor } from "../editor";
import { Conversation } from "./Conversation";
import { ChatInput } from "./ChatInput";
import { LibraryPanel } from "./LibraryPanel";
import { useConversation } from "../hooks/useConversation";
import { resolveMode, type ModeConfig } from "../lib/note-mode";
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
  const [noteMode, setNoteMode] = useState<ModeConfig>(() => resolveMode(""));
  const scrollRef = useRef<HTMLDivElement>(null);

  const onConversationError = useCallback(
    (err: string) => console.error("Conversation error:", err),
    [],
  );

  const conversation = useConversation({
    onError: onConversationError,
  });

  const handleEditorChange = useCallback((content: string) => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    setWordCount(words);

    // Detect tag-based mode from first line
    const detected = resolveMode(content);
    setNoteMode((prev) => {
      if (prev.tag === detected.tag) return prev;

      // Auto-switch to conversation mode on #chat
      if (detected.enterBehavior === "send") {
        setMode("conversation");
      } else if (prev.enterBehavior === "send") {
        setMode("document");
      }

      return detected;
    });
  }, []);

  // Auto-scroll conversation to bottom on new content
  useEffect(() => {
    if (mode === "conversation" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mode, conversation.messages, conversation.streamingContent]);

  // Connect session when entering conversation mode.
  // conversation.connect and conversation.sessionId accessed via refs
  // to keep this callback stable.
  const sessionIdRef = useRef(conversation.sessionId);
  sessionIdRef.current = conversation.sessionId;
  const connectRef = useRef(conversation.connect);
  connectRef.current = conversation.connect;

  const handleSwitchToConversation = useCallback(async () => {
    setMode("conversation");
    if (!sessionIdRef.current) {
      try {
        await connectRef.current();
      } catch {
        // Error is set in hook state
      }
    }
  }, []);

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

  const handleOpenLibrary = useCallback(() => setLibraryOpen(true), []);
  const handleCloseLibrary = useCallback(() => setLibraryOpen(false), []);

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
          onClick={handleOpenLibrary}
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
          {noteMode.icon} {noteMode.label}
        </button>
        <span className="text-text-tertiary text-[10px] opacity-40">0</span>
      </div>

      {/* Library panel */}
      <LibraryPanel
        open={libraryOpen}
        onClose={handleCloseLibrary}
        onSelectNote={handleSelectNote}
        activeNoteId={activeNoteId}
      />
    </main>
  );
}
