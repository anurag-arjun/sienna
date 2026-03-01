import { describe, it, expect, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  generationField,
  startGeneration,
  appendDelta,
  completeGeneration,
  acceptGeneration,
  dismissGeneration,
  errorGeneration,
  insertDelta,
  inlineGenerate,
} from "./inline-generate";

function createState(doc: string, extensions = [generationField]) {
  return EditorState.create({ doc, extensions });
}

describe("inline-generate", () => {
  describe("generationField state", () => {
    it("starts idle", () => {
      const state = createState("hello");
      const gen = state.field(generationField);
      expect(gen.phase).toBe("idle");
      expect(gen.startPos).toBe(0);
      expect(gen.generatedLength).toBe(0);
    });

    it("transitions to generating on startGeneration", () => {
      const state = createState("hello");
      const next = state.update({
        effects: startGeneration.of({ pos: 5 }),
      }).state;
      const gen = next.field(generationField);
      expect(gen.phase).toBe("generating");
      expect(gen.startPos).toBe(5);
      expect(gen.generatedLength).toBe(0);
    });

    it("tracks length on appendDelta", () => {
      let state = createState("hello");
      state = state.update({
        effects: startGeneration.of({ pos: 5 }),
      }).state;

      state = state.update({
        effects: appendDelta.of({ text: " world" }),
      }).state;
      expect(state.field(generationField).generatedLength).toBe(6);

      state = state.update({
        effects: appendDelta.of({ text: "!" }),
      }).state;
      expect(state.field(generationField).generatedLength).toBe(7);
    });

    it("transitions to preview on completeGeneration", () => {
      let state = createState("hello");
      state = state.update({
        effects: startGeneration.of({ pos: 5 }),
      }).state;
      state = state.update({
        effects: appendDelta.of({ text: " world" }),
      }).state;
      state = state.update({
        effects: completeGeneration.of(),
      }).state;
      expect(state.field(generationField).phase).toBe("preview");
    });

    it("returns to idle on acceptGeneration", () => {
      let state = createState("hello");
      state = state.update({
        effects: startGeneration.of({ pos: 5 }),
      }).state;
      state = state.update({
        effects: completeGeneration.of(),
      }).state;
      state = state.update({
        effects: acceptGeneration.of(),
      }).state;
      expect(state.field(generationField).phase).toBe("idle");
    });

    it("returns to idle on dismissGeneration", () => {
      let state = createState("hello");
      state = state.update({
        effects: startGeneration.of({ pos: 5 }),
      }).state;
      state = state.update({
        effects: dismissGeneration.of(),
      }).state;
      expect(state.field(generationField).phase).toBe("idle");
    });

    it("handles errorGeneration", () => {
      let state = createState("hello");
      state = state.update({
        effects: errorGeneration.of({ message: "API error" }),
      }).state;
      const gen = state.field(generationField);
      expect(gen.phase).toBe("error");
      expect(gen.error).toBe("API error");
    });

    it("ignores appendDelta when not generating", () => {
      const state = createState("hello");
      const next = state.update({
        effects: appendDelta.of({ text: "x" }),
      }).state;
      expect(next.field(generationField).phase).toBe("idle");
      expect(next.field(generationField).generatedLength).toBe(0);
    });
  });

  describe("insertDelta helper", () => {
    it("creates correct transaction spec", () => {
      const gen = { phase: "generating" as const, startPos: 5, generatedLength: 3, error: null };
      const spec = insertDelta(gen, "abc");
      expect(spec.changes).toEqual({ from: 8, insert: "abc" });
    });
  });

  describe("inlineGenerate extension", () => {
    it("creates extension without errors", () => {
      const ext = inlineGenerate();
      expect(ext).toBeTruthy();
    });

    it("can be included in EditorState", () => {
      const state = EditorState.create({
        doc: "hello",
        extensions: [inlineGenerate()],
      });
      const gen = state.field(generationField);
      expect(gen.phase).toBe("idle");
    });

    it("accepts callbacks", () => {
      const onAccept = vi.fn();
      const onDismiss = vi.fn();
      const ext = inlineGenerate({ onAccept, onDismiss });
      expect(ext).toBeTruthy();
    });
  });
});
