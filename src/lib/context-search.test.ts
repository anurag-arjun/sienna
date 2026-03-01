import { describe, it, expect } from "vitest";
import {
  isUrl,
  isFilePath,
  classifyQuery,
  groupBySource,
  sourceLabel,
  type SearchResult,
} from "./context-search";

describe("context-search", () => {
  describe("isUrl", () => {
    it("detects http URLs", () => {
      expect(isUrl("http://example.com")).toBe(true);
      expect(isUrl("https://github.com/repo")).toBe(true);
    });

    it("rejects non-URLs", () => {
      expect(isUrl("hello world")).toBe(false);
      expect(isUrl("/home/user/file.rs")).toBe(false);
      expect(isUrl("")).toBe(false);
    });
  });

  describe("isFilePath", () => {
    it("detects absolute paths", () => {
      expect(isFilePath("/home/user/file.rs")).toBe(true);
    });

    it("detects relative paths", () => {
      expect(isFilePath("./src/main.rs")).toBe(true);
      expect(isFilePath("../lib.rs")).toBe(true);
      expect(isFilePath("~/docs/plan.md")).toBe(true);
    });

    it("rejects non-paths", () => {
      expect(isFilePath("hello")).toBe(false);
      expect(isFilePath("https://foo.com")).toBe(false);
    });
  });

  describe("classifyQuery", () => {
    it("returns url for URLs", () => {
      expect(classifyQuery("https://example.com")).toEqual(["url"]);
    });

    it("returns local for file paths", () => {
      expect(classifyQuery("/home/file.rs")).toEqual(["local"]);
    });

    it("returns local+note for generic text", () => {
      expect(classifyQuery("main.rs")).toEqual(["local", "note"]);
    });

    it("returns empty for blank", () => {
      expect(classifyQuery("")).toEqual([]);
      expect(classifyQuery("  ")).toEqual([]);
    });
  });

  describe("groupBySource", () => {
    it("groups results by source", () => {
      const results: SearchResult[] = [
        { source: "local", label: "a.rs", reference: "/a.rs", preview: "" },
        { source: "note", label: "Note 1", reference: "id-1", preview: "" },
        { source: "local", label: "b.rs", reference: "/b.rs", preview: "" },
      ];
      const groups = groupBySource(results);
      expect(groups.get("local")?.length).toBe(2);
      expect(groups.get("note")?.length).toBe(1);
    });

    it("returns empty map for empty results", () => {
      expect(groupBySource([]).size).toBe(0);
    });
  });

  describe("sourceLabel", () => {
    it("returns display labels", () => {
      expect(sourceLabel("local")).toBe("Files");
      expect(sourceLabel("note")).toBe("Notes");
      expect(sourceLabel("url")).toBe("URLs");
    });
  });
});
