import { describe, it, expect } from "vitest";
import {
  isUrl,
  isFilePath,
  isGitHubRef,
  parseGitHubRef,
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

  describe("isGitHubRef", () => {
    it("detects owner/repo", () => {
      expect(isGitHubRef("facebook/react")).toBe(true);
      expect(isGitHubRef("anurag-arjun/mood-editor")).toBe(true);
    });

    it("detects owner/repo#number", () => {
      expect(isGitHubRef("owner/repo#42")).toBe(true);
    });

    it("detects owner/repo/path", () => {
      expect(isGitHubRef("owner/repo/src/main.rs")).toBe(true);
    });

    it("rejects non-GitHub refs", () => {
      expect(isGitHubRef("hello")).toBe(false);
      expect(isGitHubRef("just-one-part")).toBe(false);
      expect(isGitHubRef("https://github.com")).toBe(false);
      expect(isGitHubRef("/absolute/path")).toBe(false);
    });
  });

  describe("parseGitHubRef", () => {
    it("parses owner/repo", () => {
      expect(parseGitHubRef("owner/repo")).toEqual({ owner: "owner", repo: "repo" });
    });

    it("parses owner/repo#123", () => {
      expect(parseGitHubRef("owner/repo#123")).toEqual({
        owner: "owner",
        repo: "repo",
        number: 123,
      });
    });

    it("parses owner/repo/path/to/file.ts", () => {
      expect(parseGitHubRef("owner/repo/src/main.ts")).toEqual({
        owner: "owner",
        repo: "repo",
        path: "src/main.ts",
      });
    });

    it("returns null for invalid refs", () => {
      expect(parseGitHubRef("notaref")).toBeNull();
    });
  });

  describe("classifyQuery", () => {
    it("returns url for URLs", () => {
      expect(classifyQuery("https://example.com")).toEqual(["url"]);
    });

    it("returns local for file paths", () => {
      expect(classifyQuery("/home/file.rs")).toEqual(["local"]);
    });

    it("returns github for owner/repo patterns", () => {
      expect(classifyQuery("facebook/react")).toEqual(["github"]);
      expect(classifyQuery("owner/repo#42")).toEqual(["github"]);
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
      expect(sourceLabel("github")).toBe("GitHub");
    });
  });
});
