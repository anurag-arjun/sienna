import { describe, it, expect, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  detectParagraphs,
  reflexField,
  setAnnotations,
  clearAnnotations,
  toggleReflex,
  ReflexAnnotationWidget,
} from "./inline-reflex";
import type { Annotation } from "../api/reflex";

// ── Paragraph Detection ────────────────────────────────────────────────

describe("detectParagraphs", () => {
  it("splits on blank lines", () => {
    const doc = "First paragraph.\n\nSecond paragraph.";
    const paras = detectParagraphs(doc);
    expect(paras).toHaveLength(2);
    expect(paras[0].text).toBe("First paragraph.");
    expect(paras[1].text).toBe("Second paragraph.");
  });

  it("splits on headings", () => {
    const doc = "Some intro text.\n# Heading\nBody under heading.";
    const paras = detectParagraphs(doc);
    expect(paras).toHaveLength(2);
    expect(paras[0].text).toBe("Some intro text.");
    expect(paras[1].text).toBe("# Heading\nBody under heading.");
  });

  it("handles multiple blank lines", () => {
    const doc = "First.\n\n\n\nSecond.";
    const paras = detectParagraphs(doc);
    expect(paras).toHaveLength(2);
    expect(paras[0].text).toBe("First.");
    expect(paras[1].text).toBe("Second.");
  });

  it("returns empty for blank document", () => {
    expect(detectParagraphs("")).toHaveLength(0);
    expect(detectParagraphs("   \n\n  ")).toHaveLength(0);
  });

  it("handles single paragraph", () => {
    const doc = "Just one paragraph with multiple lines.\nStill the same.";
    const paras = detectParagraphs(doc);
    expect(paras).toHaveLength(1);
    expect(paras[0].text).toBe(doc);
  });

  it("tracks correct offsets", () => {
    const doc = "First.\n\nSecond.";
    const paras = detectParagraphs(doc);
    expect(paras[0].from).toBe(0);
    expect(paras[0].to).toBe(6); // "First." is 6 chars
    expect(paras[1].from).toBe(8); // after "First.\n\n"
  });

  it("handles heading levels 1-6", () => {
    const doc = "Intro.\n## H2\nContent.\n### H3\nMore content.";
    const paras = detectParagraphs(doc);
    expect(paras.length).toBeGreaterThanOrEqual(2);
  });

  it("does not split on hash in middle of text", () => {
    const doc = "Issue #42 is a bug.\nAlso #tag works.";
    const paras = detectParagraphs(doc);
    expect(paras).toHaveLength(1);
  });
});

// ── StateField ─────────────────────────────────────────────────────────

describe("reflexField", () => {
  function createState() {
    return EditorState.create({
      doc: "Test document",
      extensions: [reflexField],
    });
  }

  it("starts enabled with empty annotations", () => {
    const state = createState();
    const reflex = state.field(reflexField);
    expect(reflex.enabled).toBe(true);
    expect(reflex.annotations.size).toBe(0);
  });

  it("setAnnotations updates state", () => {
    const state = createState();
    const annotations: Annotation[] = [
      { type: "consistency", message: "Looks good", confidence: 0.9 },
    ];
    const tr = state.update({
      effects: setAnnotations.of({ paragraphIndex: 0, annotations }),
    });
    const reflex = tr.state.field(reflexField);
    expect(reflex.annotations.size).toBe(1);
    expect(reflex.annotations.get(0)).toEqual(annotations);
  });

  it("setAnnotations for multiple paragraphs", () => {
    let state = createState();
    state = state.update({
      effects: setAnnotations.of({
        paragraphIndex: 0,
        annotations: [{ type: "structure", message: "Short", confidence: 0.7 }],
      }),
    }).state;
    state = state.update({
      effects: setAnnotations.of({
        paragraphIndex: 2,
        annotations: [{ type: "connection", message: "Related", confidence: 0.8 }],
      }),
    }).state;
    const reflex = state.field(reflexField);
    expect(reflex.annotations.size).toBe(2);
    expect(reflex.annotations.has(0)).toBe(true);
    expect(reflex.annotations.has(2)).toBe(true);
  });

  it("clearAnnotations empties the map", () => {
    let state = createState();
    state = state.update({
      effects: setAnnotations.of({
        paragraphIndex: 0,
        annotations: [{ type: "question", message: "Why?", confidence: 0.9 }],
      }),
    }).state;
    state = state.update({ effects: clearAnnotations.of() }).state;
    const reflex = state.field(reflexField);
    expect(reflex.annotations.size).toBe(0);
  });

  it("toggleReflex disables and clears", () => {
    let state = createState();
    state = state.update({
      effects: setAnnotations.of({
        paragraphIndex: 0,
        annotations: [{ type: "continuity", message: "See Jan 15", confidence: 0.8 }],
      }),
    }).state;
    state = state.update({ effects: toggleReflex.of(false) }).state;
    const reflex = state.field(reflexField);
    expect(reflex.enabled).toBe(false);
    expect(reflex.annotations.size).toBe(0);
  });

  it("toggleReflex re-enables preserving empty state", () => {
    let state = createState();
    state = state.update({ effects: toggleReflex.of(false) }).state;
    state = state.update({ effects: toggleReflex.of(true) }).state;
    const reflex = state.field(reflexField);
    expect(reflex.enabled).toBe(true);
  });
});

// ── Widget Rendering ───────────────────────────────────────────────────

describe("ReflexAnnotationWidget", () => {
  it("renders correct icon for each type", () => {
    const types: Array<{ type: Annotation["type"]; icon: string }> = [
      { type: "consistency", icon: "✓" },
      { type: "connection", icon: "↗" },
      { type: "continuity", icon: "…" },
      { type: "structure", icon: "≈" },
      { type: "question", icon: "?" },
    ];

    for (const { type, icon } of types) {
      const widget = new ReflexAnnotationWidget([
        { type, message: "Test", confidence: 0.9 },
      ]);
      const dom = widget.toDOM();
      const iconEl = dom.querySelector(".reflex-icon");
      expect(iconEl?.textContent).toBe(icon);
    }
  });

  it("renders multiple annotations", () => {
    const widget = new ReflexAnnotationWidget([
      { type: "consistency", message: "Verified", confidence: 0.9 },
      { type: "connection", message: "Related", confidence: 0.8 },
    ]);
    const dom = widget.toDOM();
    const rows = dom.querySelectorAll(".reflex-annotation");
    expect(rows.length).toBe(2);
  });

  it("sets title attribute for hover tooltip", () => {
    const widget = new ReflexAnnotationWidget([
      { type: "structure", message: "42 words in this sentence", confidence: 0.7 },
    ]);
    const dom = widget.toDOM();
    const row = dom.querySelector(".reflex-annotation");
    expect(row?.getAttribute("title")).toBe("42 words in this sentence");
  });

  it("applies type-specific class", () => {
    const widget = new ReflexAnnotationWidget([
      { type: "question", message: "Unattributed", confidence: 0.9 },
    ]);
    const dom = widget.toDOM();
    const row = dom.querySelector(".reflex-annotation");
    expect(row?.classList.contains("reflex-type-question")).toBe(true);
  });

  it("makes connection annotations clickable", () => {
    const onClick = vi.fn();
    const widget = new ReflexAnnotationWidget(
      [{ type: "connection", message: "See draft", confidence: 0.8, ref: "note-123" }],
      onClick,
    );
    const dom = widget.toDOM();
    const row = dom.querySelector(".reflex-clickable");
    expect(row).toBeTruthy();
    (row as HTMLElement).click();
    expect(onClick).toHaveBeenCalledWith("note-123");
  });

  it("eq returns true for identical annotations", () => {
    const a = new ReflexAnnotationWidget([
      { type: "consistency", message: "OK", confidence: 0.9 },
    ]);
    const b = new ReflexAnnotationWidget([
      { type: "consistency", message: "OK", confidence: 0.9 },
    ]);
    expect(a.eq(b)).toBe(true);
  });

  it("eq returns false for different annotations", () => {
    const a = new ReflexAnnotationWidget([
      { type: "consistency", message: "OK", confidence: 0.9 },
    ]);
    const b = new ReflexAnnotationWidget([
      { type: "question", message: "Why?", confidence: 0.9 },
    ]);
    expect(a.eq(b)).toBe(false);
  });

  it("has fade-in class on container", () => {
    const widget = new ReflexAnnotationWidget([
      { type: "structure", message: "Short", confidence: 0.7 },
    ]);
    const dom = widget.toDOM();
    expect(dom.classList.contains("reflex-fade-in")).toBe(true);
  });
});
