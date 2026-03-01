import { describe, it, expect, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  invokeField,
  activateInvoke,
  dismissInvoke,
  submitInvoke,
  inlineInvoke,
} from "./inline-invoke";

function createState(doc: string, extensions = [invokeField]) {
  return EditorState.create({ doc, extensions });
}

describe("inline-invoke", () => {
  describe("invokeField state", () => {
    it("starts inactive", () => {
      const state = createState("hello");
      const invoke = state.field(invokeField);
      expect(invoke.active).toBe(false);
      expect(invoke.pos).toBe(0);
      expect(invoke.instruction).toBe("");
    });

    it("activates on activateInvoke effect", () => {
      const state = createState("hello");
      const tr = state.update({
        effects: activateInvoke.of({ pos: 0 }),
      });
      const invoke = tr.state.field(invokeField);
      expect(invoke.active).toBe(true);
      expect(invoke.pos).toBe(0);
    });

    it("deactivates on dismissInvoke effect", () => {
      let state = createState("hello");
      state = state.update({
        effects: activateInvoke.of({ pos: 0 }),
      }).state;
      expect(state.field(invokeField).active).toBe(true);

      state = state.update({
        effects: dismissInvoke.of(),
      }).state;
      expect(state.field(invokeField).active).toBe(false);
    });

    it("deactivates on submitInvoke effect", () => {
      let state = createState("hello");
      state = state.update({
        effects: activateInvoke.of({ pos: 0 }),
      }).state;

      state = state.update({
        effects: submitInvoke.of({ instruction: "write a poem" }),
      }).state;
      expect(state.field(invokeField).active).toBe(false);
    });

    it("records position on activate", () => {
      const state = createState("line1\nline2");
      const tr = state.update({
        effects: activateInvoke.of({ pos: 6 }),
      });
      expect(tr.state.field(invokeField).pos).toBe(6);
    });
  });

  describe("inlineInvoke extension", () => {
    it("creates extension without errors", () => {
      const ext = inlineInvoke();
      expect(ext).toBeTruthy();
    });

    it("creates extension with onSubmit callback", () => {
      const onSubmit = vi.fn();
      const ext = inlineInvoke({ onSubmit });
      expect(ext).toBeTruthy();
    });

    it("can be included in EditorState", () => {
      const state = EditorState.create({
        doc: "hello",
        extensions: [inlineInvoke()],
      });
      const invoke = state.field(invokeField);
      expect(invoke.active).toBe(false);
    });
  });
});
