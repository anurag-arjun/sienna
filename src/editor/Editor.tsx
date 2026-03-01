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
  /** Ref to get the current editor content imperatively */
  contentRef?: React.MutableRefObject<(() => string) | null>;
  /** Ref to access the EditorView for dispatching effects */
  viewRef?: React.MutableRefObject<EditorView | null>;
  /** Called when inline AI instruction is submitted */
  onInlineInvoke?: (instruction: string, pos: number) => void;
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
  contentRef,
  viewRef: externalViewRef,
  onInlineInvoke,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Stable refs to avoid recreating extensions
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onInlineInvokeRef = useRef(onInlineInvoke);
  onInlineInvokeRef.current = onInlineInvoke;

  const stableOnChange = useCallback((content: string) => {
    onChangeRef.current?.(content);
  }, []);

  const stableOnInlineInvoke = useCallback((instruction: string, pos: number) => {
    onInlineInvokeRef.current?.(instruction, pos);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: initialContent,
      extensions: createBaseExtensions({
        placeholder,
        onChange: stableOnChange,
        onInlineInvoke: stableOnInlineInvoke,
      }),
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    // Expose view ref externally for dispatching effects
    if (externalViewRef) {
      externalViewRef.current = view;
    }

    // Expose content getter
    if (contentRef) {
      contentRef.current = () => view.state.doc.toString();
    }

    if (autoFocus) {
      // Small delay to ensure mount is complete
      requestAnimationFrame(() => view.focus());
    }

    return () => {
      view.destroy();
      viewRef.current = null;
      if (externalViewRef) {
        externalViewRef.current = null;
      }
      if (contentRef) {
        contentRef.current = null;
      }
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
