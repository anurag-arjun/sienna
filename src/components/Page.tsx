import { useState, useCallback, useRef, useEffect } from "react";
import { Editor, generationField, startGeneration, insertDelta, completeGeneration } from "../editor";
import type { EditorView } from "@codemirror/view";
import { Conversation } from "./Conversation";
import { ChatInput } from "./ChatInput";
import { LibraryPanel } from "./LibraryPanel";
import { useConversation } from "../hooks/useConversation";
import { useAutoSave } from "../hooks/useAutoSave";
import { resolveMode, type ModeConfig, type NoteTag } from "../lib/note-mode";
import { buildDistillPrompt, suggestDistillTitle } from "../lib/distill";
import { notesApi, type Note } from "../api/notes";
import { piApi, type PiEvent } from "../api/pi";
import { ContextTray, ContextBadge } from "./ContextTray";
import { ContextCard } from "./ContextCard";
import { ContextSearch } from "./ContextSearch";
import { useContextItems } from "../hooks/useContextItems";

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
  const [distilling, setDistilling] = useState(false);
  const [loadedContent, setLoadedContent] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [trayOpen, setTrayOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const editorContentRef = useRef<(() => string) | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const contentRef = useRef(""); // tracks current editor content for save
  const inlineSessionRef = useRef<string | null>(null);
  const inlineUnlistenRef = useRef<(() => void) | null>(null);

  const onConversationError = useCallback(
    (err: string) => console.error("Conversation error:", err),
    [],
  );

  const conversation = useConversation({
    onError: onConversationError,
  });

  // ── Context items ────────────────────────────────────────────────
  const context = useContextItems(activeNoteId);

  // ── Note persistence ──────────────────────────────────────────────
  const activeNoteIdRef = useRef(activeNoteId);
  activeNoteIdRef.current = activeNoteId;

  const { markDirty, flush: flushSave } = useAutoSave(async () => {
    const noteId = activeNoteIdRef.current;
    const content = contentRef.current;
    if (!noteId || !content.trim()) return;
    const firstLine = content.split("\n")[0].replace(/^#\S*\s*/, "").trim();
    const title = firstLine.slice(0, 80) || "Untitled";
    await notesApi.updateNote(noteId, { content, title });
  }, 1000);

  // Load note content when activeNoteId changes
  useEffect(() => {
    // Clean up any in-progress inline generation
    if (inlineUnlistenRef.current) {
      inlineUnlistenRef.current();
      inlineUnlistenRef.current = null;
    }
    if (inlineSessionRef.current) {
      piApi.destroySession(inlineSessionRef.current).catch(() => {});
      inlineSessionRef.current = null;
    }

    if (!activeNoteId) {
      setLoadedContent("");
      setEditorKey((k) => k + 1);
      return;
    }

    let cancelled = false;
    notesApi.getNote(activeNoteId).then((note) => {
      if (cancelled || !note) return;
      contentRef.current = note.content ?? "";
      setLoadedContent(note.content ?? "");
      setEditorKey((k) => k + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [activeNoteId]);

  // Auto-create note on first meaningful content if no activeNoteId
  const createNoteIfNeeded = useCallback(
    async (content: string) => {
      if (activeNoteIdRef.current) return;
      if (content.trim().length < 2) return;

      const detected = resolveMode(content);
      const firstLine = content.split("\n")[0].replace(/^#\S*\s*/, "").trim();
      const title = firstLine.slice(0, 80) || "Untitled";

      const noteType =
        detected.enterBehavior === "send" ? "conversation" : "document";
      const tags = detected.tag ? [detected.tag] : [];

      try {
        const note = await notesApi.createNote({
          note_type: noteType,
          title,
          content,
          tags,
        });
        activeNoteIdRef.current = note.id;
        setActiveNoteId(note.id);
      } catch (err) {
        console.error("Failed to create note:", err);
      }
    },
    [],
  );

  // ── Inline AI generation ─────────────────────────────────────────
  const handleInlineInvoke = useCallback(async (instruction: string, pos: number) => {
    const view = editorViewRef.current;
    if (!view) return;

    try {
      // Create a dedicated session for inline generation
      const sessionId = await piApi.createSession({
        system_prompt: "You are a writing assistant. Generate text based on the user's instruction. Output ONLY the requested text, no explanations or markdown fences.",
        no_session: true,
      });
      inlineSessionRef.current = sessionId;

      // Start generation in the editor
      view.dispatch({ effects: startGeneration.of({ pos }) });

      // Subscribe to streaming events
      const unlisten = await piApi.onSessionEvent(sessionId, (event: PiEvent) => {
        const v = editorViewRef.current;
        if (!v) return;

        if (event.type === "text_delta") {
          const gen = v.state.field(generationField);
          if (gen.phase === "generating") {
            v.dispatch(insertDelta(gen, event.delta));
          }
        } else if (event.type === "agent_end") {
          v.dispatch({ effects: completeGeneration.of() });
          // Clean up
          inlineUnlistenRef.current?.();
          inlineUnlistenRef.current = null;
          piApi.destroySession(sessionId).catch(() => {});
          inlineSessionRef.current = null;
        }
      });
      inlineUnlistenRef.current = unlisten;

      // Send the instruction
      await piApi.prompt(sessionId, instruction);
    } catch (err) {
      console.error("Inline generation failed:", err);
    }
  }, []);

  const handleEditorChange = useCallback((content: string) => {
    contentRef.current = content;
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

    // Trigger auto-save or auto-create
    if (activeNoteIdRef.current) {
      markDirty();
    } else {
      createNoteIfNeeded(content);
    }
  }, [markDirty, createNoteIfNeeded]);

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

  // New note: flush current, reset to blank surface
  const handleNewNote = useCallback(async () => {
    await flushSave();
    setActiveNoteId(undefined);
    contentRef.current = "";
    setMode("document");
  }, [flushSave]);

  // Cmd+J toggles mode, Cmd+O toggles library, Cmd+D distills, Cmd+N new note
  const handleDistillRef = useRef<(() => Promise<void>) | null>(null);

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
      if (e.key === "d" && (e.metaKey || e.ctrlKey) && mode === "conversation") {
        e.preventDefault();
        handleDistillRef.current?.();
      }
      if (e.key === "n" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleNewNote();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, handleSwitchToConversation, handleNewNote]);

  const handleOpenLibrary = useCallback(() => setLibraryOpen(true), []);
  const handleCloseLibrary = useCallback(() => setLibraryOpen(false), []);

  // Distill: Cmd+D converts conversation to document
  const messagesRef = useRef(conversation.messages);
  messagesRef.current = conversation.messages;

  const handleDistill = useCallback(
    async (targetTag: NoteTag = "plan") => {
      const msgs = messagesRef.current;
      if (msgs.length === 0) return;

      setDistilling(true);
      try {
        const title = suggestDistillTitle(msgs, targetTag);
        const prompt = buildDistillPrompt(msgs, targetTag);

        // Create the document note
        const newNote = await notesApi.createNote({
          note_type: "document",
          title,
          content: prompt,
          tags: [targetTag],
        });

        // Link it to the conversation note if we have one
        if (activeNoteId) {
          try {
            await notesApi.addNoteLink({
              source_id: newNote.id,
              target_id: activeNoteId,
              link_type: "distilled_from",
            });
          } catch {
            // Link creation is best-effort
          }
        }

        // Switch to the new document
        setActiveNoteId(newNote.id);
        setMode("document");
      } catch (err) {
        console.error("Distill failed:", err);
      } finally {
        setDistilling(false);
      }
    },
    [activeNoteId],
  );
  handleDistillRef.current = handleDistill;

  const handleSelectNote = useCallback(
    async (note: Note) => {
      // Flush pending save for current note before switching
      await flushSave();
      setActiveNoteId(note.id);
      setMode(note.type === "conversation" ? "conversation" : "document");
    },
    [flushSave],
  );

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
              key={editorKey}
              initialContent={loadedContent}
              placeholder="Start writing…"
              onChange={handleEditorChange}
              contentRef={editorContentRef}
              viewRef={editorViewRef}
              onInlineInvoke={handleInlineInvoke}
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
              {distilling
                ? "Distilling…"
                : conversation.error
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
        <ContextBadge count={context.count} onClick={() => setTrayOpen(true)} />
      </div>

      {/* Library panel */}
      <LibraryPanel
        open={libraryOpen}
        onClose={handleCloseLibrary}
        onSelectNote={handleSelectNote}
        activeNoteId={activeNoteId}
      />

      {/* Context tray */}
      <ContextTray
        open={trayOpen}
        onClose={() => setTrayOpen(false)}
        contextCount={context.count}
      >
        <ContextSearch
          noteId={activeNoteId}
          onAdd={async (path) => {
            if (path) await context.addFile(path);
            else await context.refresh();
          }}
        />
        {context.items.length > 0 && (() => {
          const maxSize = Math.max(...context.items.map((i) => i.content_cache?.length ?? 0));
          return context.items.map((item) => (
            <ContextCard
              key={item.id}
              item={item}
              maxSize={maxSize}
              onRemove={context.remove}
            />
          ));
        })()}
      </ContextTray>
    </main>
  );
}
