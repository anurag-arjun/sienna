import { describe, it, expect, beforeEach } from "vitest";
import {
  FONT_OPTIONS,
  DEFAULT_FONT,
  findFont,
  loadFont,
  applyEditorFont,
} from "./fonts";

describe("fonts", () => {
  it("has three font options", () => {
    expect(FONT_OPTIONS).toHaveLength(3);
  });

  it("default font is Inter", () => {
    expect(DEFAULT_FONT.id).toBe("inter");
    expect(DEFAULT_FONT.style).toBe("sans");
  });

  it("findFont returns matching font", () => {
    expect(findFont("literata").name).toBe("Literata");
    expect(findFont("ia-writer-quattro").name).toBe("iA Writer Quattro");
  });

  it("findFont returns default for unknown id", () => {
    expect(findFont("nonexistent")).toBe(DEFAULT_FONT);
  });

  it("each font has required fields", () => {
    for (const font of FONT_OPTIONS) {
      expect(font.id).toBeTruthy();
      expect(font.name).toBeTruthy();
      expect(font.family).toBeTruthy();
      expect(["sans", "serif", "mono"]).toContain(font.style);
    }
  });

  it("non-default fonts have Google Fonts URLs", () => {
    const nonDefault = FONT_OPTIONS.filter((f) => f.id !== "inter");
    for (const font of nonDefault) {
      expect(font.url).toBeTruthy();
      expect(font.url).toContain("fonts.googleapis.com");
    }
  });

  it("Inter has no URL (system font)", () => {
    expect(DEFAULT_FONT.url).toBeUndefined();
  });

  it("loadFont is idempotent for system fonts", () => {
    // Should not throw for fonts without URLs
    loadFont(DEFAULT_FONT);
  });

  it("applyEditorFont sets CSS variable", () => {
    applyEditorFont(findFont("literata"));
    const value = document.documentElement.style.getPropertyValue("--font-editor");
    expect(value).toContain("Literata");
  });

  it("applyEditorFont resets to default", () => {
    applyEditorFont(DEFAULT_FONT);
    const value = document.documentElement.style.getPropertyValue("--font-editor");
    expect(value).toContain("Inter");
  });
});
