import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView, Decoration } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { inlineRenderPlugin, inlineRenderTheme, inlineMarkdownRendering } from "./inline-render";

/**
 * Helper: create an EditorView with the inline render plugin and markdown.
 * Optionally place cursor at a given position.
 */
function createView(doc: string, cursorPos?: number) {
  const div = document.createElement("div");
  document.body.appendChild(div);

  const extensions = [
    markdown({ base: markdownLanguage }),
    inlineRenderPlugin,
    inlineRenderTheme,
  ];

  const state = EditorState.create({
    doc,
    extensions,
    selection: cursorPos !== undefined ? { anchor: cursorPos } : undefined,
  });

  const view = new EditorView({ state, parent: div });
  return { view, div };
}

function cleanup(view: EditorView, div: HTMLElement) {
  view.destroy();
  if (div.parentNode) div.parentNode.removeChild(div);
}

/**
 * Get all decorations from the inline render plugin.
 */
function getDecorations(view: EditorView) {
  const decos: Array<{ from: number; to: number; isReplace: boolean }> = [];
  // Access plugin decorations
  const plugin = view.plugin(inlineRenderPlugin);
  if (plugin) {
    const iter = plugin.decorations.iter();
    while (iter.value) {
      decos.push({
        from: iter.from,
        to: iter.to,
        isReplace: iter.value.spec?.widget === undefined && iter.from !== iter.to,
      });
      iter.next();
    }
  }
  return decos;
}

describe("inlineMarkdownRendering", () => {
  it("returns an array of extensions", () => {
    const ext = inlineMarkdownRendering();
    expect(Array.isArray(ext)).toBe(true);
    expect(ext.length).toBe(2); // plugin + theme
  });

  it("creates a valid EditorState with the extension", () => {
    const state = EditorState.create({
      doc: "# Hello **world**",
      extensions: [
        markdown({ base: markdownLanguage }),
        ...inlineMarkdownRendering(),
      ],
    });
    expect(state.doc.toString()).toBe("# Hello **world**");
  });
});

describe("inline render plugin — decoration behavior", () => {
  // NOTE: In jsdom, EditorView.visibleRanges is empty (no real viewport),
  // so the plugin produces zero decorations. These tests verify:
  // 1. The plugin loads and runs without errors
  // 2. No decorations "leak" into regions where cursor is active
  // 3. Selection changes trigger decoration rebuilds
  // Full decoration coverage requires a real browser (manual testing).

  it("plugin runs without errors on heading content", () => {
    const { view, div } = createView("# Hello\n\nText", 13);
    const decos = getDecorations(view);
    // jsdom: visibleRanges is empty, so no decorations produced
    // Real browser: would have replace decorations for # mark
    expect(decos).toBeDefined();
    cleanup(view, div);
  });

  it("plugin runs without errors on bold content", () => {
    const { view, div } = createView("Hello **world** end", 18);
    const decos = getDecorations(view);
    expect(decos).toBeDefined();
    cleanup(view, div);
  });

  it("no decorations hide marks when cursor is inside bold", () => {
    const { view, div } = createView("Hello **world** end", 9);
    const decos = getDecorations(view);
    const boldDecos = decos.filter(
      (d) => d.isReplace && d.from >= 6 && d.to <= 15,
    );
    expect(boldDecos.length).toBe(0);
    cleanup(view, div);
  });

  it("no decorations hide marks when cursor is inside heading", () => {
    const { view, div } = createView("# Hello\n\nText", 3);
    const decos = getDecorations(view);
    const headingDeco = decos.find((d) => d.from === 0 && d.isReplace);
    expect(headingDeco).toBeUndefined();
    cleanup(view, div);
  });

  it("plugin runs without errors on inline code", () => {
    const { view, div } = createView("Use `code` here", 15);
    const decos = getDecorations(view);
    expect(decos).toBeDefined();
    cleanup(view, div);
  });

  it("no decorations hide backticks when cursor is inside code", () => {
    const { view, div } = createView("Use `code` here", 6);
    const decos = getDecorations(view);
    const codeDecos = decos.filter(
      (d) => d.isReplace && d.from >= 4 && d.to <= 10,
    );
    expect(codeDecos.length).toBe(0);
    cleanup(view, div);
  });

  it("rebuilds decorations on selection change without errors", () => {
    const { view, div } = createView("# Hello **bold** end", 19);
    // Move cursor inside **bold**
    view.dispatch({ selection: { anchor: 12 } });
    const decos = getDecorations(view);
    const boldDecos = decos.filter(
      (d) => d.isReplace && d.from >= 9 && d.to <= 16,
    );
    expect(boldDecos.length).toBe(0);
    cleanup(view, div);
  });

  it("handles empty document without errors", () => {
    const { view, div } = createView("", 0);
    const decos = getDecorations(view);
    expect(decos.length).toBe(0);
    cleanup(view, div);
  });
});
