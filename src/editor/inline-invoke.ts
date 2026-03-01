/**
 * Inline AI invocation — Tab at start of line opens instruction input.
 *
 * When the cursor is at column 0 and Tab is pressed:
 * 1. A thin glowing insertion line appears
 * 2. User types a natural language instruction
 * 3. Enter submits (calls onSubmit), Esc dismisses
 *
 * UX shell only — no AI integration in this module.
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

// ── State Effects ──────────────────────────────────────────────────────

/** Activate instruction mode at a given line position */
export const activateInvoke = StateEffect.define<{ pos: number }>();

/** Dismiss instruction mode */
export const dismissInvoke = StateEffect.define<void>();

/** Submit the instruction */
export const submitInvoke = StateEffect.define<{ instruction: string }>();

// ── State ──────────────────────────────────────────────────────────────

export interface InvokeState {
  active: boolean;
  /** Line position where the invoke was triggered */
  pos: number;
  /** Current instruction text (managed by the widget) */
  instruction: string;
}

const defaultState: InvokeState = {
  active: false,
  pos: 0,
  instruction: "",
};

export const invokeField = StateField.define<InvokeState>({
  create() {
    return defaultState;
  },
  update(state, tr) {
    for (const effect of tr.effects) {
      if (effect.is(activateInvoke)) {
        return { active: true, pos: effect.value.pos, instruction: "" };
      }
      if (effect.is(dismissInvoke)) {
        return defaultState;
      }
      if (effect.is(submitInvoke)) {
        return defaultState;
      }
    }
    return state;
  },
});

// ── Widget ─────────────────────────────────────────────────────────────

class InvokeWidget extends WidgetType {
  private onSubmit: ((instruction: string) => void) | null;
  private onDismiss: (() => void) | null;

  constructor(
    onSubmit: ((instruction: string) => void) | null,
    onDismiss: (() => void) | null,
  ) {
    super();
    this.onSubmit = onSubmit;
    this.onDismiss = onDismiss;
  }

  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-invoke-widget";
    wrapper.setAttribute("data-testid", "invoke-widget");

    // Glowing line
    const line = document.createElement("div");
    line.className = "cm-invoke-line";

    // Input
    const input = document.createElement("input");
    input.type = "text";
    input.className = "cm-invoke-input";
    input.placeholder = "Describe what to write…";
    input.setAttribute("data-testid", "invoke-input");

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && input.value.trim()) {
        e.preventDefault();
        e.stopPropagation();
        this.onSubmit?.(input.value.trim());
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.onDismiss?.();
      }
    });

    // Prevent CM from stealing focus
    input.addEventListener("mousedown", (e) => e.stopPropagation());

    wrapper.appendChild(line);
    wrapper.appendChild(input);

    // Auto-focus after mount
    requestAnimationFrame(() => input.focus());

    return wrapper;
  }

  ignoreEvent() {
    return true; // Don't let CM handle events on this widget
  }
}

// ── Decoration Plugin ──────────────────────────────────────────────────

function invokeDecorations(
  state: EditorState,
  onSubmit: (instruction: string) => void,
  onDismiss: () => void,
): DecorationSet {
  const invokeState = state.field(invokeField);
  if (!invokeState.active) return Decoration.none;

  const widget = Decoration.widget({
    widget: new InvokeWidget(onSubmit, onDismiss),
    side: -1, // before the line
    block: true,
  });

  return Decoration.set([widget.range(invokeState.pos)]);
}

// ── Keymap ─────────────────────────────────────────────────────────────

function isAtLineStart(state: EditorState): boolean {
  const { head } = state.selection.main;
  const line = state.doc.lineAt(head);
  return head === line.from;
}

// ── Extension Factory ──────────────────────────────────────────────────

export interface InlineInvokeOptions {
  /** Called when the user submits an instruction */
  onSubmit?: (instruction: string, pos: number) => void;
}

/**
 * Create the inline invoke extension.
 * Tab at line start activates, Enter submits, Esc dismisses.
 */
export function inlineInvoke(options?: InlineInvokeOptions): Extension {
  const handleSubmit = (view: EditorView, instruction: string) => {
    const invokeState = view.state.field(invokeField);
    view.dispatch({ effects: submitInvoke.of({ instruction }) });
    options?.onSubmit?.(instruction, invokeState.pos);
  };

  const handleDismiss = (view: EditorView) => {
    view.dispatch({ effects: dismissInvoke.of() });
    view.focus();
  };

  // We need a reference to the view in the decoration builder
  let currentView: EditorView | null = null;

  return [
    invokeField,

    // Tab keymap — activate invoke at line start
    keymap.of([
      {
        key: "Tab",
        run(view) {
          const invokeState = view.state.field(invokeField);
          if (invokeState.active) return false; // Already active

          if (!isAtLineStart(view.state)) return false;

          const { head } = view.state.selection.main;
          view.dispatch({
            effects: activateInvoke.of({ pos: head }),
          });
          return true;
        },
      },
      {
        key: "Escape",
        run(view) {
          const invokeState = view.state.field(invokeField);
          if (!invokeState.active) return false;
          handleDismiss(view);
          return true;
        },
      },
    ]),

    // Decoration provider
    EditorView.decorations.compute([invokeField], (state) => {
      return invokeDecorations(
        state,
        (instruction) => currentView && handleSubmit(currentView, instruction),
        () => currentView && handleDismiss(currentView),
      );
    }),

    // Capture the view reference
    EditorView.updateListener.of((update) => {
      currentView = update.view;
    }),
  ];
}
