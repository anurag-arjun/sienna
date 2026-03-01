import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { keymap, placeholder, drawSelection, EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { moodTheme } from "./theme";
import { inlineMarkdownRendering } from "./inline-render";

/**
 * Base set of CodeMirror extensions for Mood Editor.
 * Markdown mode with code block language support, history, search, and theme.
 */
export function createBaseExtensions(options?: {
  placeholder?: string;
  onChange?: (content: string) => void;
}) {
  return [
    // Markdown language with nested code block highlighting
    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
    }),

    // Editing essentials
    history(),
    drawSelection(),

    // Keymaps
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
    ]),

    // Theme
    moodTheme,

    // Hybrid inline Markdown rendering (cursor-aware)
    inlineMarkdownRendering(),

    // Line wrapping — writing app, not code editor
    EditorView.lineWrapping,

    // Placeholder text
    ...(options?.placeholder
      ? [placeholder(options.placeholder)]
      : []),

    // Change callback
    ...(options?.onChange
      ? [
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              options.onChange!(update.state.doc.toString());
            }
          }),
        ]
      : []),

    // Disable default tab behavior (we'll use Tab for AI invocation later)
    EditorState.tabSize.of(2),
  ];
}
