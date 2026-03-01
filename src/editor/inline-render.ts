/**
 * Hybrid inline Markdown rendering with cursor-aware toggle.
 *
 * When the cursor is NOT inside a Markdown element, formatting chars are hidden
 * and the content is styled as rendered Markdown. When the cursor enters an
 * element, raw syntax reappears for editing.
 *
 * Supported elements: headings, bold, italic, strikethrough, inline code, links, images.
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { type EditorState, type Range, RangeSet } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

// ── Formatting node types we hide ──────────────────────────────────────

/** Markdown syntax tree node names that contain formatting characters. */
const FORMATTING_NODES = new Set([
  // Headings: ATXHeading1..6 contain HeaderMark (the # chars)
  "HeaderMark",
  // Emphasis: contains EmphasisMark (* or _)
  "EmphasisMark",
  // StrongEmphasis: contains EmphasisMark (** or __)
  // Strikethrough: contains StrikethroughMark
  "StrikethroughMark",
  // InlineCode: contains CodeMark (`)
  "CodeMark",
  // Link: contains LinkMark [ ] ( )
  "LinkMark",
  // Image: contains LinkMark ! [ ] ( )
]);

/** Block-level nodes where we style the whole line. */
const BLOCK_NODES = new Set([
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
  "Blockquote",
  "FencedCode",
]);

/** Nodes where the cursor being inside means we show raw syntax. */
const ACTIVATABLE_NODES = new Set([
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
  "Emphasis",
  "StrongEmphasis",
  "Strikethrough",
  "InlineCode",
  "Link",
  "Image",
]);

// ── Placeholder widget for link text ───────────────────────────────────

class LinkWidget extends WidgetType {
  constructor(readonly url: string) {
    super();
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-rendered-link-icon";
    span.textContent = " ↗";
    span.title = this.url;
    return span;
  }
  eq(other: LinkWidget) {
    return this.url === other.url;
  }
}

// ── Core decoration builder ────────────────────────────────────────────

/**
 * Returns the set of active (cursor-occupied) node ranges.
 * When the cursor is inside an activatable node, that whole node
 * should show raw syntax.
 */
function getActiveRanges(state: EditorState): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  const tree = syntaxTree(state);

  for (const sel of state.selection.ranges) {
    const cursor = sel.head;
    // Walk up from cursor to find activatable ancestor nodes
    let node = tree.resolveInner(cursor, 1);
    while (node) {
      if (ACTIVATABLE_NODES.has(node.name)) {
        ranges.push({ from: node.from, to: node.to });
      }
      if (!node.parent) break;
      node = node.parent;
    }
    // Also check the other direction
    node = tree.resolveInner(cursor, -1);
    while (node) {
      if (ACTIVATABLE_NODES.has(node.name)) {
        // Deduplicate
        if (!ranges.some((r) => r.from === node!.from && r.to === node!.to)) {
          ranges.push({ from: node.from, to: node.to });
        }
      }
      if (!node.parent) break;
      node = node.parent;
    }
  }

  return ranges;
}

/**
 * Check if a position falls within any active range.
 */
function isInActiveRange(
  pos: number,
  endPos: number,
  activeRanges: Array<{ from: number; to: number }>,
): boolean {
  return activeRanges.some((r) => pos < r.to && endPos > r.from);
}

/**
 * Build decorations for the visible portion of the document.
 */
function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const tree = syntaxTree(state);
  const activeRanges = getActiveRanges(state);
  const decorations: Range<Decoration>[] = [];

  // Iterate through visible ranges for performance
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        // Skip if cursor is in this node's activatable parent
        if (isInActiveRange(node.from, node.to, activeRanges)) {
          return;
        }

        // Hide formatting marks
        if (FORMATTING_NODES.has(node.name)) {
          decorations.push(
            Decoration.replace({}).range(node.from, node.to),
          );
        }

        // For links, add a small icon widget after the link text
        if (node.name === "Link") {
          // Extract URL from the link node
          const urlNode = node.node.getChild("URL");
          if (urlNode) {
            const url = state.sliceDoc(urlNode.from, urlNode.to);
            decorations.push(
              Decoration.widget({
                widget: new LinkWidget(url),
                side: 1,
              }).range(node.to),
            );
          }
        }
      },
    });
  }

  // Sort by position (required by RangeSet)
  decorations.sort((a, b) => a.from - b.from || a.to - b.to);

  return RangeSet.of(decorations);
}

// ── View Plugin ────────────────────────────────────────────────────────

/**
 * CodeMirror ViewPlugin that manages inline Markdown rendering decorations.
 */
export const inlineRenderPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      // Rebuild decorations when doc changes, selection changes, or viewport changes
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// ── Rendered styles ────────────────────────────────────────────────────

/**
 * Additional theme styles for the rendered link icon.
 */
export const inlineRenderTheme = EditorView.baseTheme({
  ".cm-rendered-link-icon": {
    color: "var(--color-accent-blue)",
    fontSize: "0.8em",
    opacity: "0.6",
    cursor: "pointer",
  },
});

/**
 * Combined extension for inline Markdown rendering.
 * Add this to your editor extensions array.
 */
export function inlineMarkdownRendering() {
  return [inlineRenderPlugin, inlineRenderTheme];
}
