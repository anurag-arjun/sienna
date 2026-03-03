import { EditorView } from "@codemirror/view";

/**
 * CM6 theme spec shared between dark and light modes.
 * All colors use CSS custom properties — the actual palette comes from
 * index.css and adapts automatically when .theme-light is on <body>.
 */
const themeSpec = {
  "&": {
    backgroundColor: "transparent",
    color: "var(--color-text-primary)",
    fontSize: "16px",
    lineHeight: "1.6",
    fontFamily: "var(--font-sans)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    caretColor: "var(--color-accent-warm)",
    padding: "0",
    fontFamily: "var(--font-editor)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--color-accent-warm)",
    borderLeftWidth: "2px",
  },
  ".cm-selectionBackground": {
    backgroundColor:
      "color-mix(in srgb, var(--color-accent-warm) 25%, transparent) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor:
      "color-mix(in srgb, var(--color-accent-warm) 30%, transparent) !important",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-line": {
    padding: "0",
  },
  // Markdown syntax highlighting
  ".cm-header-1": {
    fontSize: "1.75em",
    fontWeight: "700",
    lineHeight: "1.3",
    color: "var(--color-text-primary)",
  },
  ".cm-header-2": {
    fontSize: "1.4em",
    fontWeight: "600",
    lineHeight: "1.35",
    color: "var(--color-text-primary)",
  },
  ".cm-header-3": {
    fontSize: "1.15em",
    fontWeight: "600",
    lineHeight: "1.4",
    color: "var(--color-text-primary)",
  },
  ".cm-header-4, .cm-header-5, .cm-header-6": {
    fontSize: "1em",
    fontWeight: "600",
    color: "var(--color-text-secondary)",
  },
  ".cm-strong": {
    fontWeight: "600",
    color: "var(--color-text-primary)",
  },
  ".cm-emphasis": {
    fontStyle: "italic",
    color: "var(--color-text-primary)",
  },
  ".cm-strikethrough": {
    textDecoration: "line-through",
    color: "var(--color-text-tertiary)",
  },
  ".cm-link": {
    color: "var(--color-accent-blue)",
    textDecoration: "none",
  },
  ".cm-url": {
    color: "var(--color-text-tertiary)",
  },
  ".cm-monospace": {
    fontFamily: "var(--font-mono)",
    fontSize: "0.9em",
    backgroundColor: "var(--color-surface-3)",
    borderRadius: "3px",
    padding: "1px 4px",
  },
  // Fenced code blocks
  ".cm-line.cm-codeblock": {
    fontFamily: "var(--font-mono)",
    fontSize: "0.9em",
    backgroundColor: "var(--color-surface-2)",
  },
  // Blockquote
  ".cm-quote": {
    color: "var(--color-text-secondary)",
    borderLeft: "3px solid var(--color-accent-muted)",
    paddingLeft: "12px",
  },
  // Markdown formatting chars (# * _ etc) — subtle
  ".cm-formatting": {
    color: "var(--color-text-tertiary)",
  },
  // Placeholder
  ".cm-placeholder": {
    color: "var(--color-text-tertiary)",
    fontStyle: "italic",
  },
  // Scrollbar inside editor
  ".cm-scroller": {
    overflow: "auto",
    scrollbarWidth: "thin",
    scrollbarColor: "var(--color-accent-muted) transparent",
  },
};

/**
 * Create a CM6 theme for the given mode.
 * The `dark` flag tells CM6 about the base theme for internal defaults
 * (e.g. fallback selection colors). All actual colors come from CSS vars.
 */
export function createMoodTheme(dark: boolean) {
  return EditorView.theme(themeSpec, { dark });
}

/**
 * Default dark theme — used when no theme preference is set.
 * Kept as a named export for backward compatibility.
 */
export const moodTheme = createMoodTheme(true);
