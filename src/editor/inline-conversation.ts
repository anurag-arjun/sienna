/**
 * Inline conversation — Ctrl+Return opens a conversational space
 * at the cursor position within a document.
 *
 * Multi-turn Q&A happens inline. Esc collapses the conversation
 * into a subtle margin annotation (warm dot). Click to expand.
 *
 * State machine: idle → open → streaming → open → collapsed → open (expand)
 */

import {
  StateField,
  StateEffect,
  type Extension,
  type EditorState,
} from "@codemirror/state";
import {
  EditorView,
  Decoration,
  type DecorationSet,
  WidgetType,
  keymap,
} from "@codemirror/view";

// ── Types ──────────────────────────────────────────────────────────────

export interface InlineMessage {
  role: "user" | "assistant";
  content: string;
}

export type ConversationPhase = "open" | "streaming" | "collapsed";

export interface InlineConversation {
  id: string;
  /** Document position where the conversation is anchored */
  anchorPos: number;
  /** Messages exchanged */
  messages: InlineMessage[];
  /** Current phase */
  phase: ConversationPhase;
  /** Partial streaming content */
  streamingContent: string;
}

// ── State Effects ──────────────────────────────────────────────────────

/** Open a new inline conversation at a position */
export const openConversation = StateEffect.define<{ pos: number; id: string }>();

/** Add a user message to a conversation */
export const addUserMessage = StateEffect.define<{ id: string; content: string }>();

/** Start streaming (AI response begins) */
export const startStreaming = StateEffect.define<{ id: string }>();

/** Append a streaming delta */
export const streamDelta = StateEffect.define<{ id: string; delta: string }>();

/** Complete streaming (AI response done) */
export const completeStreaming = StateEffect.define<{ id: string }>();

/** Collapse a conversation into a margin annotation */
export const collapseConversation = StateEffect.define<{ id: string }>();

/** Expand a collapsed conversation */
export const expandConversation = StateEffect.define<{ id: string }>();

/** Remove a conversation entirely */
export const removeConversation = StateEffect.define<{ id: string }>();

/** Restore conversations (e.g. from persisted annotations) */
export const restoreConversations = StateEffect.define<InlineConversation[]>();

// ── State Field ────────────────────────────────────────────────────────

export interface ConversationFieldState {
  conversations: InlineConversation[];
}

const defaultState: ConversationFieldState = { conversations: [] };

function findConv(state: ConversationFieldState, id: string): InlineConversation | undefined {
  return state.conversations.find((c) => c.id === id);
}

function updateConv(
  state: ConversationFieldState,
  id: string,
  updater: (c: InlineConversation) => InlineConversation,
): ConversationFieldState {
  return {
    conversations: state.conversations.map((c) =>
      c.id === id ? updater(c) : c,
    ),
  };
}

export const conversationField = StateField.define<ConversationFieldState>({
  create() {
    return defaultState;
  },
  update(state, tr) {
    let newState = state;

    // Adjust anchor positions when document changes
    if (tr.docChanged && newState.conversations.length > 0) {
      newState = {
        conversations: newState.conversations.map((conv) => {
          let newPos = conv.anchorPos;
          tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
            if (fromA <= conv.anchorPos) {
              newPos += inserted.length - (toA - fromA);
            }
          });
          return newPos !== conv.anchorPos
            ? { ...conv, anchorPos: Math.max(0, newPos) }
            : conv;
        }),
      };
    }

    for (const effect of tr.effects) {
      if (effect.is(openConversation)) {
        const existing = findConv(newState, effect.value.id);
        if (existing) continue;
        newState = {
          conversations: [
            ...newState.conversations,
            {
              id: effect.value.id,
              anchorPos: effect.value.pos,
              messages: [],
              phase: "open",
              streamingContent: "",
            },
          ],
        };
      }
      if (effect.is(addUserMessage)) {
        const conv = findConv(newState, effect.value.id);
        if (!conv || conv.phase === "collapsed") continue;
        newState = updateConv(newState, effect.value.id, (c) => ({
          ...c,
          messages: [
            ...c.messages,
            { role: "user", content: effect.value.content },
          ],
        }));
      }
      if (effect.is(startStreaming)) {
        const conv = findConv(newState, effect.value.id);
        if (!conv) continue;
        newState = updateConv(newState, effect.value.id, (c) => ({
          ...c,
          phase: "streaming",
          streamingContent: "",
        }));
      }
      if (effect.is(streamDelta)) {
        const conv = findConv(newState, effect.value.id);
        if (!conv || conv.phase !== "streaming") continue;
        newState = updateConv(newState, effect.value.id, (c) => ({
          ...c,
          streamingContent: c.streamingContent + effect.value.delta,
        }));
      }
      if (effect.is(completeStreaming)) {
        const conv = findConv(newState, effect.value.id);
        if (!conv || conv.phase !== "streaming") continue;
        newState = updateConv(newState, effect.value.id, (c) => ({
          ...c,
          phase: "open",
          messages: [
            ...c.messages,
            { role: "assistant", content: c.streamingContent },
          ],
          streamingContent: "",
        }));
      }
      if (effect.is(collapseConversation)) {
        const conv = findConv(newState, effect.value.id);
        if (!conv) continue;
        newState = updateConv(newState, effect.value.id, (c) => ({
          ...c,
          phase: "collapsed",
          streamingContent: "",
        }));
      }
      if (effect.is(expandConversation)) {
        const conv = findConv(newState, effect.value.id);
        if (!conv || conv.phase !== "collapsed") continue;
        newState = updateConv(newState, effect.value.id, (c) => ({
          ...c,
          phase: "open",
        }));
      }
      if (effect.is(removeConversation)) {
        newState = {
          conversations: newState.conversations.filter(
            (c) => c.id !== effect.value.id,
          ),
        };
      }
      if (effect.is(restoreConversations)) {
        newState = { conversations: effect.value };
      }
    }

    return newState;
  },
});

// ── Widgets ────────────────────────────────────────────────────────────

let convIdCounter = 0;

/** Generate a unique conversation ID */
export function nextConversationId(): string {
  convIdCounter += 1;
  return `inline-conv-${convIdCounter}`;
}

/** Reset ID counter (for tests) */
export function resetConversationIdCounter(): void {
  convIdCounter = 0;
}

/**
 * Open conversation widget — renders the full inline Q&A below the anchor line.
 * Vanilla DOM, no React. Minimal and warm.
 */
class OpenConversationWidget extends WidgetType {
  private convId: string;
  private messages: InlineMessage[];
  private streamingContent: string;
  private phase: ConversationPhase;
  private onSend: ((id: string, text: string) => void) | null;
  private onCollapse: ((id: string) => void) | null;

  constructor(
    conv: InlineConversation,
    onSend: ((id: string, text: string) => void) | null,
    onCollapse: ((id: string) => void) | null,
  ) {
    super();
    this.convId = conv.id;
    this.messages = conv.messages;
    this.streamingContent = conv.streamingContent;
    this.phase = conv.phase;
    this.onSend = onSend;
    this.onCollapse = onCollapse;
  }

  eq(other: OpenConversationWidget): boolean {
    // Reuse DOM when possible to preserve focus
    return (
      this.convId === other.convId &&
      this.messages.length === other.messages.length &&
      this.streamingContent === other.streamingContent &&
      this.phase === other.phase
    );
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-inline-conv";
    wrapper.setAttribute("data-testid", `inline-conv-${this.convId}`);
    wrapper.setAttribute("data-conv-id", this.convId);

    // Anchor line — thin warm separator
    const anchor = document.createElement("div");
    anchor.className = "cm-inline-conv-anchor";
    wrapper.appendChild(anchor);

    // Messages
    const messagesEl = document.createElement("div");
    messagesEl.className = "cm-inline-conv-messages";

    for (const msg of this.messages) {
      const msgEl = document.createElement("div");
      msgEl.className =
        msg.role === "user"
          ? "cm-inline-conv-msg-user"
          : "cm-inline-conv-msg-assistant";
      msgEl.textContent = msg.content;
      messagesEl.appendChild(msgEl);
    }

    // Streaming content
    if (this.phase === "streaming" && this.streamingContent) {
      const streamEl = document.createElement("div");
      streamEl.className = "cm-inline-conv-msg-assistant cm-inline-conv-streaming";
      streamEl.textContent = this.streamingContent;
      messagesEl.appendChild(streamEl);
    } else if (this.phase === "streaming") {
      const pulseEl = document.createElement("div");
      pulseEl.className = "cm-inline-conv-pulse";
      pulseEl.textContent = "●";
      messagesEl.appendChild(pulseEl);
    }

    wrapper.appendChild(messagesEl);

    // Input — only when not streaming
    if (this.phase !== "streaming") {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "cm-inline-conv-input";
      input.placeholder = this.messages.length === 0
        ? "Ask a question…"
        : "Follow up…";
      input.setAttribute("data-testid", `inline-conv-input-${this.convId}`);

      const convId = this.convId;
      const onSend = this.onSend;
      const onCollapse = this.onCollapse;

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && input.value.trim()) {
          e.preventDefault();
          e.stopPropagation();
          onSend?.(convId, input.value.trim());
          input.value = "";
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCollapse?.(convId);
        }
      });

      // Prevent CM from stealing focus
      input.addEventListener("mousedown", (e) => e.stopPropagation());

      wrapper.appendChild(input);

      // Auto-focus input on first render (no messages yet)
      if (this.messages.length === 0) {
        requestAnimationFrame(() => input.focus());
      }
    }

    return wrapper;
  }

  updateDOM(dom: HTMLElement, _view: EditorView): boolean {
    // Update messages in place to preserve input focus
    const messagesEl = dom.querySelector(".cm-inline-conv-messages");
    if (!messagesEl) return false;

    // Rebuild messages
    messagesEl.innerHTML = "";
    for (const msg of this.messages) {
      const msgEl = document.createElement("div");
      msgEl.className =
        msg.role === "user"
          ? "cm-inline-conv-msg-user"
          : "cm-inline-conv-msg-assistant";
      msgEl.textContent = msg.content;
      messagesEl.appendChild(msgEl);
    }

    // Streaming content
    if (this.phase === "streaming" && this.streamingContent) {
      const streamEl = document.createElement("div");
      streamEl.className = "cm-inline-conv-msg-assistant cm-inline-conv-streaming";
      streamEl.textContent = this.streamingContent;
      messagesEl.appendChild(streamEl);
    } else if (this.phase === "streaming") {
      const pulseEl = document.createElement("div");
      pulseEl.className = "cm-inline-conv-pulse";
      pulseEl.textContent = "●";
      messagesEl.appendChild(pulseEl);
    }

    // Toggle input visibility
    const existingInput = dom.querySelector<HTMLInputElement>(".cm-inline-conv-input");
    if (this.phase === "streaming" && existingInput) {
      existingInput.style.display = "none";
    } else if (this.phase !== "streaming" && existingInput) {
      existingInput.style.display = "";
    }

    return true;
  }

  ignoreEvent(event: Event): boolean {
    // Let the widget handle all interactive events
    return (
      event.type === "mousedown" ||
      event.type === "focusin" ||
      event.type === "keydown" ||
      event.type === "input"
    );
  }

  get estimatedHeight(): number {
    // Rough estimate: anchor + messages + input
    return 60 + this.messages.length * 28 + (this.streamingContent ? 28 : 0);
  }
}

/**
 * Collapsed conversation widget — a subtle warm dot at end of line.
 * Click to expand.
 */
class CollapsedConversationWidget extends WidgetType {
  private convId: string;
  private messageCount: number;
  private onExpand: ((id: string) => void) | null;

  constructor(
    conv: InlineConversation,
    onExpand: ((id: string) => void) | null,
  ) {
    super();
    this.convId = conv.id;
    this.messageCount = conv.messages.length;
    this.onExpand = onExpand;
  }

  eq(other: CollapsedConversationWidget): boolean {
    return this.convId === other.convId && this.messageCount === other.messageCount;
  }

  toDOM(): HTMLElement {
    const dot = document.createElement("span");
    dot.className = "cm-inline-conv-dot";
    dot.setAttribute("data-testid", `inline-conv-dot-${this.convId}`);
    dot.setAttribute("data-conv-id", this.convId);
    dot.setAttribute("title", `${this.messageCount} messages — click to expand`);
    dot.textContent = "●";

    const convId = this.convId;
    const onExpand = this.onExpand;

    dot.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onExpand?.(convId);
    });

    dot.addEventListener("mousedown", (e) => e.stopPropagation());

    return dot;
  }

  ignoreEvent(event: Event): boolean {
    return event.type === "mousedown" || event.type === "click";
  }
}

// ── Decoration Builder ─────────────────────────────────────────────────

function buildDecorations(
  state: EditorState,
  onSend: (id: string, text: string) => void,
  onCollapse: (id: string) => void,
  onExpand: (id: string) => void,
): DecorationSet {
  const { conversations } = state.field(conversationField);
  if (conversations.length === 0) return Decoration.none;

  const decorations: { pos: number; deco: ReturnType<typeof Decoration.widget> }[] = [];

  for (const conv of conversations) {
    // Clamp position to document bounds
    const pos = Math.min(conv.anchorPos, state.doc.length);

    if (conv.phase === "collapsed") {
      // Inline dot at end of anchor line
      const line = state.doc.lineAt(pos);
      decorations.push({
        pos: line.to,
        deco: Decoration.widget({
          widget: new CollapsedConversationWidget(conv, onExpand),
          side: 1, // after the line content
        }),
      });
    } else {
      // Block widget below the anchor line
      const line = state.doc.lineAt(pos);
      decorations.push({
        pos: line.to,
        deco: Decoration.widget({
          widget: new OpenConversationWidget(conv, onSend, onCollapse),
          side: 1,
          block: true,
        }),
      });
    }
  }

  // Sort by position (required by CM6)
  decorations.sort((a, b) => a.pos - b.pos);

  return Decoration.set(decorations.map((d) => d.deco.range(d.pos)));
}

// ── Extension Factory ──────────────────────────────────────────────────

export interface InlineConversationOptions {
  /** Called when user sends a message in an inline conversation */
  onSend?: (conversationId: string, text: string) => void;
  /** Called when a conversation is collapsed */
  onCollapse?: (conversationId: string) => void;
  /** Called when a conversation is expanded */
  onExpand?: (conversationId: string) => void;
}

/**
 * Create the inline conversation extension.
 * Ctrl+Return opens a conversation at cursor. Esc collapses.
 */
export function inlineConversation(options?: InlineConversationOptions): Extension {
  let currentView: EditorView | null = null;

  const handleSend = (id: string, text: string) => {
    if (!currentView) return;
    currentView.dispatch({
      effects: addUserMessage.of({ id, content: text }),
    });
    options?.onSend?.(id, text);
  };

  const handleCollapse = (id: string) => {
    if (!currentView) return;
    const convState = currentView.state.field(conversationField);
    const conv = convState.conversations.find((c) => c.id === id);

    // If no messages, remove instead of collapse
    if (!conv || conv.messages.length === 0) {
      currentView.dispatch({
        effects: removeConversation.of({ id }),
      });
    } else {
      currentView.dispatch({
        effects: collapseConversation.of({ id }),
      });
    }
    currentView.focus();
    options?.onCollapse?.(id);
  };

  const handleExpand = (id: string) => {
    if (!currentView) return;
    currentView.dispatch({
      effects: expandConversation.of({ id }),
    });
    options?.onExpand?.(id);
  };

  return [
    conversationField,

    // Ctrl+Return keymap — open conversation at cursor
    keymap.of([
      {
        key: "Ctrl-Enter",
        run(view) {
          const { head } = view.state.selection.main;
          const id = nextConversationId();
          view.dispatch({
            effects: openConversation.of({ pos: head, id }),
          });
          return true;
        },
      },
    ]),

    // Decorations
    EditorView.decorations.compute([conversationField], (state) => {
      return buildDecorations(state, handleSend, handleCollapse, handleExpand);
    }),

    // Capture view reference
    EditorView.updateListener.of((update) => {
      currentView = update.view;
    }),
  ];
}
