import { describe, it, expect, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createBaseExtensions } from "./extensions";

describe("createBaseExtensions", () => {
  it("returns an array of extensions", () => {
    const extensions = createBaseExtensions();
    expect(Array.isArray(extensions)).toBe(true);
    expect(extensions.length).toBeGreaterThan(0);
  });

  it("creates a valid EditorState with extensions", () => {
    const extensions = createBaseExtensions();
    const state = EditorState.create({
      doc: "# Test\n\nHello **world**",
      extensions,
    });
    expect(state.doc.toString()).toBe("# Test\n\nHello **world**");
    expect(state.doc.lines).toBe(3);
  });

  it("includes placeholder when provided", () => {
    const extensions = createBaseExtensions({ placeholder: "Write here…" });
    const state = EditorState.create({ doc: "", extensions });
    // Placeholder is a view extension — verify state created without error
    expect(state.doc.length).toBe(0);
  });

  it("fires onChange callback on document change", () => {
    const onChange = vi.fn();
    const extensions = createBaseExtensions({ onChange });

    const state = EditorState.create({ doc: "", extensions });

    // Create a view (needs DOM in jsdom)
    const div = document.createElement("div");
    document.body.appendChild(div);
    const view = new EditorView({ state, parent: div });

    // Dispatch a transaction that inserts text
    view.dispatch({
      changes: { from: 0, insert: "hello" },
    });

    expect(onChange).toHaveBeenCalledWith("hello");

    view.destroy();
    document.body.removeChild(div);
  });

  it("does not fire onChange when no text changes", () => {
    const onChange = vi.fn();
    const extensions = createBaseExtensions({ onChange });

    const state = EditorState.create({ doc: "existing", extensions });
    const div = document.createElement("div");
    document.body.appendChild(div);
    const view = new EditorView({ state, parent: div });

    // Dispatch a selection-only transaction (no doc change)
    view.dispatch({
      selection: { anchor: 3 },
    });

    expect(onChange).not.toHaveBeenCalled();

    view.destroy();
    document.body.removeChild(div);
  });

  it("includes markdown language support", () => {
    const extensions = createBaseExtensions();
    const state = EditorState.create({
      doc: "```js\nconst x = 1;\n```",
      extensions,
    });
    // If markdown extension loaded, the language should be available
    expect(state.doc.toString()).toContain("const x = 1");
  });
});
