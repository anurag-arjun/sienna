import { useRef, useEffect, useCallback } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createBaseExtensions } from "./extensions";

interface EditorProps {
  /** Initial document content */
  initialContent?: string;
  /** Placeholder text shown when empty */
  placeholder?: string;
  /** Called on every document change */
  onChange?: (content: string) => void;
  /** Whether the editor should auto-focus */
  autoFocus?: boolean;
}

/**
 * CodeMirror 6 Markdown editor component.
 * Single-surface writing area with warm dark theme.
 */
export function Editor({
  initialContent = "",
  placeholder = "Start writing…",
  onChange,
  autoFocus = true,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Stable onChange ref to avoid recreating extensions
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const stableOnChange = useCallback((content: string) => {
    onChangeRef.current?.(content);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: initialContent,
      extensions: createBaseExtensions({
        placeholder,
        onChange: stableOnChange,
      }),
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    if (autoFocus) {
      // Small delay to ensure mount is complete
      requestAnimationFrame(() => view.focus());
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only create once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 w-full [&_.cm-editor]:h-full [&_.cm-scroller]:h-full"
    />
  );
}
