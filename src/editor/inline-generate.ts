/**
 * Inline AI generation — connects invoke UX to pi agent.
 *
 * State machine: idle → generating → preview → idle
 * - generating: streaming text at insertion point (lighter style)
 * - preview: generation complete, Enter accepts / Esc dismisses
 */

import {
  StateField,
  StateEffect,
  type Extension,
  type TransactionSpec,
} from "@codemirror/state";
import {
  EditorView,
  Decoration,
  type DecorationSet,
  keymap,
} from "@codemirror/view";

// ── State Effects ──────────────────────────────────────────────────────

/** Start generation at a position */
export const startGeneration = StateEffect.define<{ pos: number }>();

/** Append a text delta from the AI stream */
export const appendDelta = StateEffect.define<{ text: string }>();

/** Mark generation as complete (enter preview mode) */
export const completeGeneration = StateEffect.define<void>();

/** Accept the generated text (normalize styling) */
export const acceptGeneration = StateEffect.define<void>();

/** Dismiss the generated text (remove it) */
export const dismissGeneration = StateEffect.define<void>();

/** Generation error */
export const errorGeneration = StateEffect.define<{ message: string }>();

// ── State ──────────────────────────────────────────────────────────────

export type GenerationPhase = "idle" | "generating" | "preview" | "error";

export interface GenerationState {
  phase: GenerationPhase;
  /** Document position where generation started */
  startPos: number;
  /** Length of generated text inserted so far */
  generatedLength: number;
  /** Error message if phase is "error" */
  error: string | null;
}

const defaultState: GenerationState = {
  phase: "idle",
  startPos: 0,
  generatedLength: 0,
  error: null,
};

export const generationField = StateField.define<GenerationState>({
  create() {
    return defaultState;
  },
  update(state, tr) {
    let newState = state;

    // Adjust positions if doc changed before our range
    if (tr.docChanged && state.phase !== "idle") {
      let offset = 0;
      tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
        if (fromA < state.startPos) {
          offset += inserted.length - (toA - fromA);
        }
      });
      if (offset !== 0) {
        newState = { ...newState, startPos: newState.startPos + offset };
      }
    }

    for (const effect of tr.effects) {
      if (effect.is(startGeneration)) {
        return {
          phase: "generating" as const,
          startPos: effect.value.pos,
          generatedLength: 0,
          error: null,
        };
      }
      if (effect.is(appendDelta)) {
        if (newState.phase !== "generating") return newState;
        return {
          ...newState,
          generatedLength: newState.generatedLength + effect.value.text.length,
        };
      }
      if (effect.is(completeGeneration)) {
        if (newState.phase !== "generating") return newState;
        return { ...newState, phase: "preview" as const };
      }
      if (effect.is(acceptGeneration)) {
        return defaultState;
      }
      if (effect.is(dismissGeneration)) {
        return defaultState;
      }
      if (effect.is(errorGeneration)) {
        return {
          ...defaultState,
          phase: "error" as const,
          error: effect.value.message,
        };
      }
    }

    return newState;
  },
});

// ── Decorations ────────────────────────────────────────────────────────

/** Mark class for generated text (lighter appearance) */
const generatedMark = Decoration.mark({
  class: "cm-generated-text",
});

function generationDecorations(state: GenerationState): DecorationSet {
  if (state.phase === "idle" || state.phase === "error") {
    return Decoration.none;
  }
  if (state.generatedLength === 0) return Decoration.none;

  const from = state.startPos;
  const to = state.startPos + state.generatedLength;

  return Decoration.set([generatedMark.range(from, to)]);
}

// ── Extension ──────────────────────────────────────────────────────────

export interface InlineGenerateOptions {
  /** Called when user accepts generated text */
  onAccept?: (text: string) => void;
  /** Called when user dismisses generated text */
  onDismiss?: () => void;
}

/**
 * Create the inline generation extension.
 * Manages generated text decorations and Enter/Esc handling during preview.
 */
export function inlineGenerate(options?: InlineGenerateOptions): Extension {
  return [
    generationField,

    // Decorations for generated text
    EditorView.decorations.compute([generationField], (state) => {
      return generationDecorations(state.field(generationField));
    }),

    // Keymaps for preview mode
    keymap.of([
      {
        key: "Enter",
        run(view) {
          const gen = view.state.field(generationField);
          if (gen.phase !== "preview") return false;

          const generatedText = view.state.doc.sliceString(
            gen.startPos,
            gen.startPos + gen.generatedLength,
          );
          const endPos = gen.startPos + gen.generatedLength;
          view.dispatch({
            effects: acceptGeneration.of(),
            selection: { anchor: endPos },
          });
          options?.onAccept?.(generatedText);
          return true;
        },
      },
      {
        key: "Escape",
        run(view) {
          const gen = view.state.field(generationField);
          if (gen.phase !== "preview" && gen.phase !== "generating") {
            return false;
          }

          // Remove the generated text from the document
          if (gen.generatedLength > 0) {
            view.dispatch({
              changes: {
                from: gen.startPos,
                to: gen.startPos + gen.generatedLength,
              },
              effects: dismissGeneration.of(),
            });
          } else {
            view.dispatch({ effects: dismissGeneration.of() });
          }
          options?.onDismiss?.();
          return true;
        },
      },
    ]),
  ];
}

// ── Helper: stream text into editor ────────────────────────────────────

/**
 * Insert a text delta into the editor at the current generation position.
 * Returns the transaction spec to dispatch.
 */
export function insertDelta(
  state: GenerationState,
  text: string,
): TransactionSpec {
  const insertPos = state.startPos + state.generatedLength;
  return {
    changes: { from: insertPos, insert: text },
    effects: appendDelta.of({ text }),
  };
}
