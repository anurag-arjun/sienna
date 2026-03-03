import { useRef, useEffect, useCallback } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createBaseExtensions } from "./extensions";
import type { ReflexPluginOptions } from "./inline-reflex";

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
  /** Inline conversation callbacks */
  onInlineConversationSend?: (conversationId: string, text: string) => void;
  onInlineConversationCollapse?: (conversationId: string) => void;
  onInlineConversationExpand?: (conversationId: string) => void;
  /** Reflex options (ambient AI annotations). Omit to disable. */
  reflex?: ReflexPluginOptions & { onClickRef?: (ref: string) => void };
  /** Whether the theme is dark (default: true). Affects CM6 internal defaults. */
  dark?: boolean;
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
  onInlineConversationSend,
  onInlineConversationCollapse,
  onInlineConversationExpand,
  reflex,
  dark = true,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Stable refs to avoid recreating extensions
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onInlineInvokeRef = useRef(onInlineInvoke);
  onInlineInvokeRef.current = onInlineInvoke;
  const onInlineConvSendRef = useRef(onInlineConversationSend);
  onInlineConvSendRef.current = onInlineConversationSend;
  const onInlineConvCollapseRef = useRef(onInlineConversationCollapse);
  onInlineConvCollapseRef.current = onInlineConversationCollapse;
  const onInlineConvExpandRef = useRef(onInlineConversationExpand);
  onInlineConvExpandRef.current = onInlineConversationExpand;

  const stableOnChange = useCallback((content: string) => {
    onChangeRef.current?.(content);
  }, []);

  const stableOnInlineInvoke = useCallback((instruction: string, pos: number) => {
    onInlineInvokeRef.current?.(instruction, pos);
  }, []);

  const stableOnInlineConvSend = useCallback((id: string, text: string) => {
    onInlineConvSendRef.current?.(id, text);
  }, []);
  const stableOnInlineConvCollapse = useCallback((id: string) => {
    onInlineConvCollapseRef.current?.(id);
  }, []);
  const stableOnInlineConvExpand = useCallback((id: string) => {
    onInlineConvExpandRef.current?.(id);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: initialContent,
      extensions: createBaseExtensions({
        placeholder,
        onChange: stableOnChange,
        onInlineInvoke: stableOnInlineInvoke,
        onInlineConversation: {
          onSend: stableOnInlineConvSend,
          onCollapse: stableOnInlineConvCollapse,
          onExpand: stableOnInlineConvExpand,
        },
        reflex,
        dark,
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
