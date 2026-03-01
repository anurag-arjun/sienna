import { describe, it, expect } from "vitest";
import { extractTag, resolveMode, getTemplate, getModeForTag } from "./note-mode";

describe("extractTag", () => {
  it("extracts #chat from first line", () => {
    expect(extractTag("#chat")).toBe("chat");
  });

  it("extracts #plan from first line", () => {
    expect(extractTag("#plan some title")).toBe("plan");
  });

  it("extracts #blog from first line", () => {
    expect(extractTag("#blog")).toBe("blog");
  });

  it("extracts #tweet from first line", () => {
    expect(extractTag("#tweet")).toBe("tweet");
  });

  it("extracts #scratch from first line", () => {
    expect(extractTag("#scratch")).toBe("scratch");
  });

  it("returns null for no tag", () => {
    expect(extractTag("just some text")).toBeNull();
  });

  it("returns null for unrecognized tag", () => {
    expect(extractTag("#unknown")).toBeNull();
  });

  it("only checks first line", () => {
    expect(extractTag("no tag here\n#chat")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(extractTag("#CHAT")).toBe("chat");
    expect(extractTag("#Plan")).toBe("plan");
  });

  it("extracts tag with surrounding text", () => {
    expect(extractTag("my #plan for the day")).toBe("plan");
  });

  it("returns null for empty content", () => {
    expect(extractTag("")).toBeNull();
  });
});

describe("resolveMode", () => {
  it("returns send enter behavior for #chat", () => {
    const mode = resolveMode("#chat");
    expect(mode.enterBehavior).toBe("send");
    expect(mode.noteType).toBe("conversation");
  });

  it("returns newline enter behavior for #plan", () => {
    const mode = resolveMode("#plan");
    expect(mode.enterBehavior).toBe("newline");
    expect(mode.noteType).toBe("document");
  });

  it("returns newline enter behavior for #blog", () => {
    const mode = resolveMode("#blog");
    expect(mode.enterBehavior).toBe("newline");
  });

  it("returns newline enter behavior for #tweet", () => {
    const mode = resolveMode("#tweet");
    expect(mode.enterBehavior).toBe("newline");
  });

  it("returns default mode for no tag", () => {
    const mode = resolveMode("just text");
    expect(mode.enterBehavior).toBe("newline");
    expect(mode.label).toBe("write");
  });
});

describe("getTemplate", () => {
  it("returns template starting with tag", () => {
    const tmpl = getTemplate("plan");
    expect(tmpl.startsWith("#plan")).toBe(true);
  });

  it("plan template has sections", () => {
    const tmpl = getTemplate("plan");
    expect(tmpl).toContain("## Goal");
    expect(tmpl).toContain("## Context");
    expect(tmpl).toContain("## Approach");
    expect(tmpl).toContain("## Open Questions");
  });

  it("blog template has title section", () => {
    const tmpl = getTemplate("blog");
    expect(tmpl).toContain("## Title");
  });

  it("chat template is just the tag", () => {
    const tmpl = getTemplate("chat");
    expect(tmpl).toBe("#chat");
  });

  it("tweet template is minimal", () => {
    const tmpl = getTemplate("tweet");
    expect(tmpl.startsWith("#tweet")).toBe(true);
  });
});

describe("getModeForTag", () => {
  it("returns correct config for each tag", () => {
    expect(getModeForTag("chat").icon).toBe("◆");
    expect(getModeForTag("plan").icon).toBe("▣");
    expect(getModeForTag("blog").icon).toBe("¶");
    expect(getModeForTag("tweet").icon).toBe("✦");
    expect(getModeForTag("scratch").icon).toBe("✎");
  });
});
