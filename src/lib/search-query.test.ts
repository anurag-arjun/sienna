import { describe, it, expect } from "vitest";
import { parseSearchQuery } from "./search-query";

describe("parseSearchQuery", () => {
  it("returns defaults for empty query", () => {
    const filter = parseSearchQuery("", { status: "active" });
    expect(filter).toEqual({ status: "active" });
  });

  it("extracts FTS search terms", () => {
    const filter = parseSearchQuery("rust programming");
    expect(filter.search).toBe("rust programming");
  });

  it("extracts tag qualifier", () => {
    const filter = parseSearchQuery("tag:plan");
    expect(filter.tag).toBe("plan");
    expect(filter.search).toBeUndefined();
  });

  it("extracts status qualifier", () => {
    const filter = parseSearchQuery("status:completed");
    expect(filter.status).toBe("completed");
  });

  it("extracts type qualifier", () => {
    const filter = parseSearchQuery("type:conversation");
    expect(filter.note_type).toBe("conversation");
  });

  it("combines qualifier with free text", () => {
    const filter = parseSearchQuery("tag:plan rust ideas");
    expect(filter.tag).toBe("plan");
    expect(filter.search).toBe("rust ideas");
  });

  it("handles multiple qualifiers", () => {
    const filter = parseSearchQuery("status:active tag:chat type:conversation");
    expect(filter.status).toBe("active");
    expect(filter.tag).toBe("chat");
    expect(filter.note_type).toBe("conversation");
    expect(filter.search).toBeUndefined();
  });

  it("status:all removes default status filter", () => {
    const filter = parseSearchQuery("status:all", { status: "active" });
    expect(filter.status).toBeUndefined();
  });

  it("preserves defaults when not overridden", () => {
    const filter = parseSearchQuery("hello", { status: "active" });
    expect(filter.status).toBe("active");
    expect(filter.search).toBe("hello");
  });

  it("treats unknown qualifiers as search text", () => {
    const filter = parseSearchQuery("foo:bar hello");
    expect(filter.search).toBe("foo:bar hello");
  });

  it("treats empty qualifier value as search text", () => {
    const filter = parseSearchQuery("tag: hello");
    expect(filter.search).toBe("tag: hello");
  });
});
