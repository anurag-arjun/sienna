import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useContextSets } from "./useContextSets";

// Mock the context-sets API
vi.mock("../api/context-sets", () => ({
  contextSetsApi: {
    findContextSetsByTags: vi.fn(),
    listContextSetItems: vi.fn(),
    assembleContextForTags: vi.fn(),
  },
}));

import { contextSetsApi } from "../api/context-sets";

const mockFind = vi.mocked(contextSetsApi.findContextSetsByTags);
const mockListItems = vi.mocked(contextSetsApi.listContextSetItems);
const mockAssemble = vi.mocked(contextSetsApi.assembleContextForTags);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useContextSets", () => {
  it("returns empty when no tags", () => {
    mockFind.mockResolvedValue([]);
    const { result } = renderHook(() => useContextSets([]));
    expect(result.current.matchedSets).toEqual([]);
    expect(result.current.totalItems).toBe(0);
  });

  it("loads matching sets and their items when tags change", async () => {
    const mockSet = { id: "set-1", name: "Rust Files", trigger_tags: ["plan"] };
    const mockItems = [
      { id: "item-1", context_set: "set-1", type: "local", reference: "/a.rs", label: "a.rs", pinned: false, sort_order: 0 },
      { id: "item-2", context_set: "set-1", type: "local", reference: "/b.rs", label: "b.rs", pinned: true, sort_order: 1 },
    ];

    mockFind.mockResolvedValue([mockSet]);
    mockListItems.mockResolvedValue(mockItems);

    const { result } = renderHook(() => useContextSets(["plan"]));

    await waitFor(() => {
      expect(result.current.matchedSets).toHaveLength(1);
    });

    expect(result.current.matchedSets[0].set.name).toBe("Rust Files");
    expect(result.current.matchedSets[0].items).toHaveLength(2);
    expect(result.current.totalItems).toBe(2);
    expect(mockFind).toHaveBeenCalledWith(["plan"]);
  });

  it("clears sets when tags become empty", async () => {
    const mockSet = { id: "set-1", name: "Test", trigger_tags: ["chat"] };
    mockFind.mockResolvedValue([mockSet]);
    mockListItems.mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ tags }) => useContextSets(tags),
      { initialProps: { tags: ["chat"] } },
    );

    await waitFor(() => {
      expect(result.current.matchedSets).toHaveLength(1);
    });

    rerender({ tags: [] });

    await waitFor(() => {
      expect(result.current.matchedSets).toHaveLength(0);
    });
  });

  it("assembleContent calls the backend API", async () => {
    mockFind.mockResolvedValue([]);
    mockAssemble.mockResolvedValue([
      {
        set_name: "My Set",
        set_id: "s1",
        item_id: "i1",
        type: "local",
        reference: "/file.rs",
        label: "file.rs",
        content: "fn main() {}",
      },
    ]);

    const { result } = renderHook(() => useContextSets(["plan"]));

    let assembled: Awaited<ReturnType<typeof result.current.assembleContent>>;
    await act(async () => {
      assembled = await result.current.assembleContent();
    });

    expect(assembled!).toHaveLength(1);
    expect(assembled![0].label).toBe("file.rs");
    expect(mockAssemble).toHaveBeenCalledWith(["plan"]);
  });

  it("assembleContent returns empty for no tags", async () => {
    const { result } = renderHook(() => useContextSets([]));

    let assembled: Awaited<ReturnType<typeof result.current.assembleContent>>;
    await act(async () => {
      assembled = await result.current.assembleContent();
    });

    expect(assembled!).toEqual([]);
    expect(mockAssemble).not.toHaveBeenCalled();
  });
});
