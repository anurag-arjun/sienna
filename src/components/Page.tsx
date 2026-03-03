import { useState, useCallback, useRef, useEffect } from "react";
import {
  Editor,
  generationField,
  startGeneration,
  insertDelta,
  completeGeneration,
  dismissGeneration,
  conversationField,
  startStreaming,
  streamDelta,
  completeStreaming,
  restoreConversations,
  serializeConversations,
  deserializeConversations,
  toggleReflex,
} from "../editor";
import type { SerializedConversation } from "../editor";
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
import * as reflexApi from "../api/reflex";
import { ContextTray, ContextBadge } from "./ContextTray";
import { ContextCard } from "./ContextCard";
import { ContextSearch } from "./ContextSearch";
import { useContextItems } from "../hooks/useContextItems";
import { useContextSets } from "../hooks/useContextSets";
import { ModelPicker } from "./ModelPicker";
import { ShipSheet } from "./ShipSheet";
import type { ModelInfo } from "../lib/models";
import { useTheme } from "../hooks/useTheme";
import { useEditorFont } from "../hooks/useEditorFont";
import { FontPicker } from "./FontPicker";

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
  const [shipOpen, setShipOpen] = useState(false);
  const [reflexEnabled, setReflexEnabled] = useState(true);
  const { theme, toggle: toggleTheme } = useTheme();
  const editorFont = useEditorFont();
  const scrollRef = useRef<HTMLDivElement>(null);
  const editorContentRef = useRef<(() => string) | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const contentRef = useRef(""); // tracks current editor content for save
  const inlineSessionRef = useRef<string | null>(null);
  const inlineUnlistenRef = useRef<(() => void) | null>(null);
  const pendingConversationsRef = useRef<string | null>(null);

  // Inline conversation sessions — one pi session per inline conversation
  const inlineConvSessionsRef = useRef<Map<string, { sessionId: string; unlisten: () => void }>>(new Map());

  const onConversationError = useCallback(
    (err: string) => console.error("Conversation error:", err),
    [],
  );

  const contextAssemblerRef = useRef<(() => Promise<string>) | null>(null);

  const conversation = useConversation({
    onError: onConversationError,
    contextAssembler: contextAssemblerRef,
  });

  // ── Context sets (tag-triggered) ──────────────────────────────────
  const noteTags = noteMode.tag ? [noteMode.tag] : [];
  const contextSets = useContextSets(noteTags);

  // ── Context items (merged with set items) ────────────────────────
  const context = useContextItems(activeNoteId, contextSets.matchedSets);

  // Wire context assembler for pi injection
  useEffect(() => {
    contextAssemblerRef.current = async () => {
      const assembled = await contextSets.assembleContent();
      if (assembled.length === 0) return "";

      const parts = assembled.map((a) => {
        const header = `## ${a.label} (from set: ${a.set_name})`;
        return a.content ? `${header}\n\`\`\`\n${a.content}\n\`\`\`` : header;
      });
      return `\n\n--- Context ---\n${parts.join("\n\n")}`;
    };
  }, [contextSets.assembleContent]);

  // ── Note persistence ──────────────────────────────────────────────
  const activeNoteIdRef = useRef(activeNoteId);
  activeNoteIdRef.current = activeNoteId;

  const { markDirty, flush: flushSave } = useAutoSave(async () => {
    const noteId = activeNoteIdRef.current;
    const content = contentRef.current;
    if (!noteId || !content.trim()) return;
    const firstLine = content.split("\n")[0].replace(/^#\S*\s*/, "").trim();
    const title = firstLine.slice(0, 80) || "Untitled";

    // Extract inline conversations from CM6 state for persistence
    let inline_conversations: string | undefined;
    const view = editorViewRef.current;
    if (view) {
      const convState = view.state.field(conversationField, false);
      if (convState) {
        const serialized = serializeConversations(convState);
        inline_conversations = serialized.length > 0
          ? JSON.stringify(serialized)
          : undefined;
      }
    }

    await notesApi.updateNote(noteId, { content, title, inline_conversations });
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
    // Clean up inline conversation sessions
    for (const [, sess] of inlineConvSessionsRef.current) {
      sess.unlisten();
      piApi.destroySession(sess.sessionId).catch(() => {});
    }
    inlineConvSessionsRef.current.clear();

    if (!activeNoteId) {
      setLoadedContent("");
      setEditorKey((k) => k + 1);
      return;
    }

    let cancelled = false;
    notesApi.getNote(activeNoteId).then((note) => {
      if (cancelled || !note) return;
      contentRef.current = note.content ?? "";
      pendingConversationsRef.current = note.inline_conversations ?? null;
      setLoadedContent(note.content ?? "");
      setEditorKey((k) => k + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [activeNoteId]);

  // Restore inline conversations after editor remounts with new content
  useEffect(() => {
    const json = pendingConversationsRef.current;
    if (!json) return;
    // Small delay to ensure Editor has mounted and set viewRef
    const timer = requestAnimationFrame(() => {
      const view = editorViewRef.current;
      if (!view) return;
      try {
        const data: SerializedConversation[] = JSON.parse(json);
        if (data.length > 0) {
          const conversations = deserializeConversations(data, view.state.doc.length);
          view.dispatch({
            effects: restoreConversations.of(conversations),
          });
        }
      } catch {
        // Invalid JSON — ignore
      }
      pendingConversationsRef.current = null;
    });
    return () => cancelAnimationFrame(timer);
  }, [editorKey]);

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

  // ── Inline conversation (Ctrl+Return Q&A in document) ──────────
  const handleInlineConvSend = useCallback(async (conversationId: string, text: string) => {
    const view = editorViewRef.current;
    if (!view) return;

    try {
      let sess = inlineConvSessionsRef.current.get(conversationId);

      if (!sess) {
        // Create a new pi session for this inline conversation
        const sessionId = await piApi.createSession({
          system_prompt: "You are a helpful writing assistant. Answer questions concisely and clearly. The user is asking about the document they are writing.",
          no_session: true,
        });

        // Subscribe to streaming events
        const unlisten = await piApi.onSessionEvent(sessionId, (event: PiEvent) => {
          const v = editorViewRef.current;
          if (!v) return;

          if (event.type === "text_delta") {
            v.dispatch({
              effects: streamDelta.of({ id: conversationId, delta: event.delta }),
            });
          } else if (event.type === "agent_end" || event.type === "error") {
            v.dispatch({
              effects: completeStreaming.of({ id: conversationId }),
            });
          }
        });

        sess = { sessionId, unlisten };
        inlineConvSessionsRef.current.set(conversationId, sess);
      }

      // Mark as streaming
      view.dispatch({
        effects: startStreaming.of({ id: conversationId }),
      });

      // Send the message
      await piApi.prompt(sess.sessionId, text);
    } catch (err) {
      console.error("Inline conversation failed:", err);
    }
  }, []);

  const handleInlineConvCollapse = useCallback((conversationId: string) => {
    // Session stays alive for potential re-expansion
    // Cleanup happens on note switch
  }, []);

  const handleInlineConvExpand = useCallback((_conversationId: string) => {
    // No-op — the CM6 extension handles the state change
  }, []);

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
          const gen = v.state.field(generationField);
          if (gen.phase === "generating" && gen.generatedLength === 0) {
            // Empty response — dismiss silently
            v.dispatch({ effects: dismissGeneration.of() });
          } else {
            v.dispatch({ effects: completeGeneration.of() });
          }
          // Clean up
          inlineUnlistenRef.current?.();
          inlineUnlistenRef.current = null;
          piApi.destroySession(sessionId).catch(() => {});
          inlineSessionRef.current = null;
        } else if (event.type === "error") {
          const gen = v.state.field(generationField);
          // Remove any partially generated text
          if (gen.generatedLength > 0) {
            v.dispatch({
              changes: { from: gen.startPos, to: gen.startPos + gen.generatedLength },
              effects: dismissGeneration.of(),
            });
          } else {
            v.dispatch({ effects: dismissGeneration.of() });
          }
          // Clean up
          inlineUnlistenRef.current?.();
          inlineUnlistenRef.current = null;
          piApi.destroySession(sessionId).catch(() => {});
          inlineSessionRef.current = null;
          console.error("Inline generation error:", event.message);
        }
      });
      inlineUnlistenRef.current = unlisten;

      // Send the instruction
      await piApi.prompt(sessionId, instruction);
    } catch (err) {
      console.error("Inline generation failed:", err);
      // Clean up on failure
      const v = editorViewRef.current;
      if (v) {
        const gen = v.state.field(generationField);
        if (gen.phase !== "idle") {
          if (gen.generatedLength > 0) {
            v.dispatch({
              changes: { from: gen.startPos, to: gen.startPos + gen.generatedLength },
              effects: dismissGeneration.of(),
            });
          } else {
            v.dispatch({ effects: dismissGeneration.of() });
          }
        }
      }
      if (inlineSessionRef.current) {
        piApi.destroySession(inlineSessionRef.current).catch(() => {});
        inlineSessionRef.current = null;
      }
      if (inlineUnlistenRef.current) {
        inlineUnlistenRef.current();
        inlineUnlistenRef.current = null;
      }
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

      // Auto-disable Reflex in #chat mode
      if (detected.tag === "chat") {
        const view = editorViewRef.current;
        if (view) {
          view.dispatch({ effects: toggleReflex.of(false) });
        }
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
  const handleForkRef = useRef<((idx: number) => Promise<void>) | null>(null);

  // Messages ref for keyboard shortcuts (fork needs last assistant index)
  const messagesForKeysRef = useRef(conversation.messages);
  messagesForKeysRef.current = conversation.messages;

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
      if (e.key === "e" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setShipOpen((prev) => !prev);
      }
      if (e.key === "T" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        toggleTheme();
      }
      if (e.key === "/" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setReflexEnabled((prev) => {
          const next = !prev;
          // Toggle in CM6 state
          const view = editorViewRef.current;
          if (view) {
            view.dispatch({ effects: toggleReflex.of(next) });
          }
          // Toggle in backend
          reflexApi.toggleReflex(next).catch(() => {});
          return next;
        });
      }
      if (e.key === "b" && (e.metaKey || e.ctrlKey) && mode === "conversation") {
        e.preventDefault();
        // Fork from the last assistant message
        const msgs = messagesForKeysRef.current;
        const lastAssistantIdx = msgs.map((m, i) => ({ role: m.role, i }))
          .filter((m) => m.role === "assistant")
          .pop()?.i;
        if (lastAssistantIdx !== undefined) {
          handleForkRef.current?.(lastAssistantIdx);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, handleSwitchToConversation, handleNewNote, toggleTheme]);

  const handleOpenLibrary = useCallback(() => setLibraryOpen(true), []);
  const handleCloseLibrary = useCallback(() => setLibraryOpen(false), []);

  // ── Conversation forking ─────────────────────────────────────────
  const handleFork = useCallback(
    async (messageIndex: number) => {
      const msgs = conversation.messages;
      if (messageIndex < 0 || messageIndex >= msgs.length) return;

      const sid = conversation.sessionId;
      if (!sid) return;

      // Find the user message at or before the fork point for the entry_id
      // Fork is triggered on assistant messages; the preceding user message is the fork target
      let forkUserMsg = msgs[messageIndex];
      if (forkUserMsg.role === "assistant") {
        // Walk backwards to find the preceding user message
        for (let i = messageIndex - 1; i >= 0; i--) {
          if (msgs[i].role === "user" && msgs[i].entryId) {
            forkUserMsg = msgs[i];
            break;
          }
        }
      }

      if (!forkUserMsg.entryId) {
        console.error("Fork failed: no entry_id on target message");
        return;
      }

      const title = `Fork: ${forkUserMsg.content.slice(0, 60)}`;

      try {
        // Fork the pi session at the target user message
        const forkResult = await piApi.forkSession(sid, forkUserMsg.entryId);

        // Create the forked note
        const newNote = await notesApi.createNote({
          note_type: "conversation",
          title,
          content: null,
          tags: noteMode.tag ? [noteMode.tag] : [],
        });

        // Link to parent conversation
        if (activeNoteId) {
          try {
            await notesApi.addNoteLink({
              source_id: newNote.id,
              target_id: activeNoteId,
              link_type: "forked_from",
            });
          } catch {
            // Link creation is best-effort
          }
        }

        // Store the pi session path on the note
        if (forkResult.session_path) {
          await notesApi.updateNote(newNote.id, {
            pi_session: forkResult.session_path,
          });
        }

        // Flush current save, switch to new note
        await flushSave();
        setActiveNoteId(newNote.id);

        // Attach to the forked session (already created by pi_fork_session)
        await conversation.disconnect();
        await conversation.attachSession(forkResult.session_id);
      } catch (err) {
        console.error("Fork failed:", err);
      }
    },
    [conversation, activeNoteId, noteMode.tag, flushSave],
  );
  handleForkRef.current = handleFork;

  // Model switching
  const switchModelRef = useRef(conversation.switchModel);
  switchModelRef.current = conversation.switchModel;

  const handleModelSelect = useCallback(async (model: ModelInfo) => {
    await switchModelRef.current(model.provider, model.id);
  }, []);

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

        // Create a temporary pi session to run the synthesis
        const distillSid = await piApi.createSession({ no_session: true });

        // Accumulate the AI's streamed response
        let synthesized = "";
        const unlisten = await piApi.onSessionEvent(distillSid, (event) => {
          if (event.type === "text_delta") {
            synthesized += event.delta;
          }
        });

        try {
          await piApi.prompt(distillSid, prompt);
        } finally {
          unlisten();
          await piApi.destroySession(distillSid).catch(() => {});
        }

        if (!synthesized.trim()) {
          throw new Error("AI returned empty response");
        }

        // Create the document note with AI-synthesized content
        const newNote = await notesApi.createNote({
          note_type: "document",
          title,
          content: synthesized,
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

  // Invalidate reflex cache when context items change
  const prevContextCountRef = useRef(context.count);
  useEffect(() => {
    if (context.count !== prevContextCountRef.current) {
      prevContextCountRef.current = context.count;
      reflexApi.invalidateReflexCache().catch(() => {});
    }
  }, [context.count]);

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
              onInlineConversationSend={handleInlineConvSend}
              onInlineConversationCollapse={handleInlineConvCollapse}
              onInlineConversationExpand={handleInlineConvExpand}
              dark={theme === "dark"}
              reflex={reflexEnabled && noteMode.tag !== "chat" ? {
                onAnalyze: reflexApi.analyzeParagraph,
                noteId: activeNoteId,
                mode: noteMode.tag,
              } : undefined}
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
                onFork={handleFork}
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
        <ModelPicker
          currentModelId={conversation.activeModelId}
          onSelect={handleModelSelect}
          disabled={conversation.streaming}
        />
        <button
          onClick={toggleTheme}
          className="text-text-tertiary text-[10px] opacity-40 hover:opacity-70 transition-opacity cursor-pointer select-none"
          title={`Theme: ${theme} (Ctrl+Shift+T)`}
          data-testid="theme-toggle"
        >
          {theme === "dark" ? "◐" : "◑"}
        </button>
        <button
          onClick={() => {
            setReflexEnabled((prev) => {
              const next = !prev;
              const view = editorViewRef.current;
              if (view) {
                view.dispatch({ effects: toggleReflex.of(next) });
              }
              reflexApi.toggleReflex(next).catch(() => {});
              return next;
            });
          }}
          className={`text-[10px] transition-opacity cursor-pointer select-none ${
            reflexEnabled && noteMode.tag !== "chat"
              ? "text-accent-warm opacity-50 hover:opacity-80"
              : "text-text-tertiary opacity-30 hover:opacity-50"
          }`}
          title={`Reflex ${reflexEnabled ? "on" : "off"} (Ctrl+/)`}
          data-testid="reflex-toggle"
        >
          ◈
        </button>
        <FontPicker
          currentFontId={editorFont.font.id}
          onSelect={editorFont.setFont}
        />
        <ContextBadge count={context.count} onClick={() => setTrayOpen(true)} />
      </div>

      {/* Ship sheet */}
      <ShipSheet
        open={shipOpen}
        onClose={() => setShipOpen(false)}
        content={contentRef.current}
        title={contentRef.current.split("\n")[0].replace(/^#\S*\s*/, "").trim().slice(0, 80) || "Untitled"}
        tag={noteMode.tag}
      />

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
        {context.mergedItems.length > 0 && (() => {
          const maxSize = Math.max(...context.mergedItems.map((i) => i.content_cache?.length ?? 0));
          return context.mergedItems.map((item) => (
            <ContextCard
              key={item.id}
              item={item}
              maxSize={maxSize}
              onRemove={item.fromSet ? () => {} : context.remove}
            />
          ));
        })()}
      </ContextTray>
    </main>
  );
}
