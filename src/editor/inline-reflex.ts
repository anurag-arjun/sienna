/**
 * Reflex — CM6 extension for ambient AI margin annotations.
 *
 * Tracks paragraph boundaries in the document, debounces changes,
 * and calls the backend to analyze each changed paragraph.
 * Annotations are stored per-paragraph in a StateField.
 */

import {
  StateField,
  StateEffect,
  type Extension,
  type EditorState,
} from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { Annotation, AnalyzeRequest } from "../api/reflex";

// ── State Effects ──────────────────────────────────────────────────────

/** Set annotations for a specific paragraph index */
export const setAnnotations = StateEffect.define<{
  paragraphIndex: number;
  annotations: Annotation[];
}>();

/** Clear all annotations */
export const clearAnnotations = StateEffect.define<void>();

/** Toggle Reflex on/off */
export const toggleReflex = StateEffect.define<boolean>();

// ── Paragraph Detection ────────────────────────────────────────────────

export interface Paragraph {
  /** Index in the paragraph list */
  index: number;
  /** Start offset in the document */
  from: number;
  /** End offset in the document */
  to: number;
  /** The paragraph text */
  text: string;
}

/**
 * Split document text into paragraphs.
 * Boundaries: blank lines (double newline) or heading markers (# at line start).
 */
export function detectParagraphs(doc: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = doc.split("\n");
  let currentStart = 0;
  let currentLines: string[] = [];
  let charOffset = 0;
  let paragraphFrom = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBlank = line.trim() === "";
    const isHeading = /^#{1,6}\s/.test(line);

    if (isBlank) {
      // Flush current paragraph
      if (currentLines.length > 0) {
        const text = currentLines.join("\n");
        if (text.trim()) {
          paragraphs.push({
            index: paragraphs.length,
            from: paragraphFrom,
            to: charOffset - 1, // exclude trailing newline
            text,
          });
        }
        currentLines = [];
      }
      charOffset += line.length + 1; // +1 for newline
      paragraphFrom = charOffset;
      continue;
    }

    if (isHeading && currentLines.length > 0) {
      // Heading starts a new paragraph — flush current first
      const text = currentLines.join("\n");
      if (text.trim()) {
        paragraphs.push({
          index: paragraphs.length,
          from: paragraphFrom,
          to: charOffset - 1,
          text,
        });
      }
      currentLines = [line];
      paragraphFrom = charOffset;
    } else {
      if (currentLines.length === 0) {
        paragraphFrom = charOffset;
      }
      currentLines.push(line);
    }

    charOffset += line.length + 1;
  }

  // Flush remaining
  if (currentLines.length > 0) {
    const text = currentLines.join("\n");
    if (text.trim()) {
      paragraphs.push({
        index: paragraphs.length,
        from: paragraphFrom,
        to: Math.min(charOffset - 1, doc.length),
        text,
      });
    }
  }

  return paragraphs;
}

// ── State ──────────────────────────────────────────────────────────────

export interface ReflexState {
  enabled: boolean;
  /** Annotations keyed by paragraph index */
  annotations: Map<number, Annotation[]>;
}

const defaultState: ReflexState = {
  enabled: true,
  annotations: new Map(),
};

export const reflexField = StateField.define<ReflexState>({
  create() {
    return { ...defaultState, annotations: new Map() };
  },
  update(state, tr) {
    let changed = false;
    let newAnnotations = state.annotations;
    let enabled = state.enabled;

    for (const effect of tr.effects) {
      if (effect.is(setAnnotations)) {
        if (!changed) {
          newAnnotations = new Map(state.annotations);
          changed = true;
        }
        newAnnotations.set(effect.value.paragraphIndex, effect.value.annotations);
      }
      if (effect.is(clearAnnotations)) {
        return { enabled: state.enabled, annotations: new Map() };
      }
      if (effect.is(toggleReflex)) {
        enabled = effect.value;
        if (!effect.value) {
          return { enabled: false, annotations: new Map() };
        }
        return { enabled: true, annotations: state.annotations };
      }
    }

    if (changed) {
      return { enabled, annotations: newAnnotations };
    }
    return state;
  },
});

// ── Debounced Analysis Plugin ──────────────────────────────────────────

const DEBOUNCE_MS = 2500;

export interface ReflexPluginOptions {
  /** Called to analyze a paragraph. Should call the backend IPC. */
  onAnalyze: (request: AnalyzeRequest) => Promise<Annotation[]>;
  /** Note ID for cross-note context */
  noteId?: string;
  /** Document mode/tag */
  mode?: string;
}

/**
 * Create the Reflex ViewPlugin that watches doc changes and
 * triggers debounced paragraph analysis.
 */
export function createReflexPlugin(options: ReflexPluginOptions) {
  return ViewPlugin.fromClass(
    class {
      /** Pending debounce timers keyed by paragraph index */
      private timers: Map<number, ReturnType<typeof setTimeout>> = new Map();
      /** Last known paragraph hashes for change detection */
      private paragraphHashes: Map<number, string> = new Map();

      constructor(private view: EditorView) {
        // Initial analysis of all paragraphs
        this.analyzeAll();
      }

      update(update: ViewUpdate) {
        if (!update.docChanged) return;

        const state = update.state.field(reflexField);
        if (!state.enabled) return;

        const doc = update.state.doc.toString();
        const paragraphs = detectParagraphs(doc);

        // Find which paragraphs changed
        for (const para of paragraphs) {
          const hash = para.text.trim();
          const prev = this.paragraphHashes.get(para.index);

          if (prev !== hash) {
            this.paragraphHashes.set(para.index, hash);
            this.debounceParagraph(para, paragraphs);
          }
        }

        // Clean up stale entries beyond current paragraph count
        for (const [idx] of this.paragraphHashes) {
          if (idx >= paragraphs.length) {
            this.paragraphHashes.delete(idx);
            this.cancelTimer(idx);
          }
        }
      }

      destroy() {
        for (const timer of this.timers.values()) {
          clearTimeout(timer);
        }
        this.timers.clear();
      }

      private analyzeAll() {
        const state = this.view.state.field(reflexField);
        if (!state.enabled) return;

        const doc = this.view.state.doc.toString();
        const paragraphs = detectParagraphs(doc);

        for (const para of paragraphs) {
          this.paragraphHashes.set(para.index, para.text.trim());
          this.debounceParagraph(para, paragraphs);
        }
      }

      private cancelTimer(index: number) {
        const existing = this.timers.get(index);
        if (existing) {
          clearTimeout(existing);
          this.timers.delete(index);
        }
      }

      private debounceParagraph(paragraph: Paragraph, allParagraphs: Paragraph[]) {
        this.cancelTimer(paragraph.index);

        const timer = setTimeout(() => {
          this.timers.delete(paragraph.index);
          this.analyzeParagraph(paragraph, allParagraphs);
        }, DEBOUNCE_MS);

        this.timers.set(paragraph.index, timer);
      }

      private async analyzeParagraph(paragraph: Paragraph, allParagraphs: Paragraph[]) {
        // Check if still enabled
        const state = this.view.state.field(reflexField);
        if (!state.enabled) return;

        const before = paragraph.index > 0
          ? allParagraphs[paragraph.index - 1]?.text
          : undefined;
        const after = paragraph.index < allParagraphs.length - 1
          ? allParagraphs[paragraph.index + 1]?.text
          : undefined;

        const request: AnalyzeRequest = {
          text: paragraph.text,
          before,
          after,
          mode: options.mode,
          note_id: options.noteId,
        };

        try {
          const annotations = await options.onAnalyze(request);
          // Dispatch the annotations to the state field
          this.view.dispatch({
            effects: setAnnotations.of({
              paragraphIndex: paragraph.index,
              annotations,
            }),
          });
        } catch {
          // Silently ignore analysis failures
        }
      }
    }
  );
}

// ── Extension Factory ──────────────────────────────────────────────────

/**
 * Create the full Reflex extension (state field + analysis plugin).
 */
export function inlineReflex(options: ReflexPluginOptions): Extension {
  return [reflexField, createReflexPlugin(options)];
}
