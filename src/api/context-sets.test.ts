import { describe, it, expect, vi } from "vitest";
import { contextSetsApi } from "./context-sets";

// The actual invoke calls go through the Tauri IPC mock from test setup
// These tests verify the API shape and that functions exist

describe("context-sets API", () => {
  it("exports all expected functions", () => {
    expect(contextSetsApi.createContextSet).toBeTypeOf("function");
    expect(contextSetsApi.getContextSet).toBeTypeOf("function");
    expect(contextSetsApi.updateContextSet).toBeTypeOf("function");
    expect(contextSetsApi.deleteContextSet).toBeTypeOf("function");
    expect(contextSetsApi.listContextSets).toBeTypeOf("function");
    expect(contextSetsApi.addContextSetItem).toBeTypeOf("function");
    expect(contextSetsApi.listContextSetItems).toBeTypeOf("function");
    expect(contextSetsApi.removeContextSetItem).toBeTypeOf("function");
    expect(contextSetsApi.findContextSetsByTags).toBeTypeOf("function");
    expect(contextSetsApi.assembleContextForTags).toBeTypeOf("function");
  });

  it("invokes Tauri commands with correct names", async () => {
    // These will fail with "command not found" from the mock, but we verify they call invoke
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = vi.mocked(invoke);

    try {
      await contextSetsApi.listContextSets();
    } catch {
      // Expected - mock doesn't handle this command
    }

    expect(mockInvoke).toHaveBeenCalledWith("list_context_sets");
  });
});
