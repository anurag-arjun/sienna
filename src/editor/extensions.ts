import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { keymap, placeholder, drawSelection, EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { createMoodTheme, moodTheme } from "./theme";
import { inlineMarkdownRendering } from "./inline-render";
import { inlineInvoke, type InlineInvokeOptions } from "./inline-invoke";
import { inlineGenerate } from "./inline-generate";
import { inlineConversation, type InlineConversationOptions } from "./inline-conversation";
import { inlineReflex, type ReflexPluginOptions } from "./inline-reflex";

/**
 * Base set of CodeMirror extensions for Sienna.
 * Markdown mode with code block language support, history, search, and theme.
 */
export function createBaseExtensions(options?: {
  placeholder?: string;
  onChange?: (content: string) => void;
  onInlineInvoke?: InlineInvokeOptions["onSubmit"];
  onInlineConversation?: InlineConversationOptions;
  reflex?: ReflexPluginOptions & { onClickRef?: (ref: string) => void };
  /** Whether the theme is dark (default: true) */
  dark?: boolean;
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

    // Theme (dark flag controls CM6 internal defaults like selection fallback)
    options?.dark === false ? createMoodTheme(false) : moodTheme,

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

    // Inline AI invocation (Tab at line start) + generation
    inlineInvoke({ onSubmit: options?.onInlineInvoke }),
    inlineGenerate(),

    // Inline conversation (Ctrl+Return in document)
    inlineConversation(options?.onInlineConversation),

    // Reflex — ambient AI margin annotations
    ...(options?.reflex ? [inlineReflex(options.reflex)] : []),

    // Tab size for indentation
    EditorState.tabSize.of(2),
  ];
}
