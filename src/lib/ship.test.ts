import { describe, it, expect } from "vitest";
import { stripMarkdown, suggestFilename } from "./ship";

describe("ship", () => {
  describe("stripMarkdown", () => {
    it("removes headings", () => {
      expect(stripMarkdown("# Hello\n## World")).toBe("Hello\nWorld");
    });

    it("removes bold and italic", () => {
      expect(stripMarkdown("**bold** and *italic*")).toBe("bold and italic");
      expect(stripMarkdown("__bold__ and _italic_")).toBe("bold and italic");
    });

    it("removes links, keeps text", () => {
      expect(stripMarkdown("[click here](http://example.com)")).toBe("click here");
    });

    it("removes images, keeps alt text", () => {
      expect(stripMarkdown("![alt text](image.png)")).toBe("alt text");
    });

    it("strips fenced code blocks, keeps content", () => {
      const md = "```js\nconsole.log('hi');\n```";
      expect(stripMarkdown(md)).toBe("console.log('hi');");
    });

    it("removes inline code backticks", () => {
      expect(stripMarkdown("Use `console.log` here")).toBe("Use console.log here");
    });

    it("removes blockquote markers", () => {
      expect(stripMarkdown("> quoted text")).toBe("quoted text");
    });

    it("removes list markers", () => {
      expect(stripMarkdown("- item one\n- item two")).toBe("item one\nitem two");
      expect(stripMarkdown("1. first\n2. second")).toBe("first\nsecond");
    });

    it("removes strikethrough", () => {
      expect(stripMarkdown("~~deleted~~")).toBe("deleted");
    });

    it("removes horizontal rules", () => {
      expect(stripMarkdown("above\n---\nbelow")).toBe("above\n\nbelow");
    });

    it("handles complex document", () => {
      const md = `# Plan

**Goal:** Build the thing.

- Step 1: Do [this](http://x.com)
- Step 2: Do *that*

> Important note

\`\`\`
code here
\`\`\``;
      const text = stripMarkdown(md);
      expect(text).toContain("Plan");
      expect(text).toContain("Goal: Build the thing.");
      expect(text).toContain("Step 1: Do this");
      expect(text).not.toContain("**");
      expect(text).not.toContain("[");
      expect(text).not.toContain("```");
    });
  });

  describe("suggestFilename", () => {
    it("converts title to kebab-case with .md", () => {
      expect(suggestFilename("My Cool Plan")).toBe("my-cool-plan.md");
    });

    it("uses .txt for tweet tag", () => {
      expect(suggestFilename("Thread about AI", "tweet")).toBe("thread-about-ai.txt");
    });

    it("returns untitled.md for empty title", () => {
      expect(suggestFilename("")).toBe("untitled.md");
    });

    it("strips special characters", () => {
      expect(suggestFilename("Plan: v2.0 (final!)")).toBe("plan-v20-final.md");
    });

    it("truncates long titles", () => {
      const long = "a".repeat(100);
      expect(suggestFilename(long).length).toBeLessThanOrEqual(64);
    });
  });
});
