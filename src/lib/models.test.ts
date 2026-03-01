import { describe, it, expect } from "vitest";
import {
  MODEL_REGISTRY,
  groupByProvider,
  findModel,
  modelAttribution,
  DEFAULT_MODEL,
} from "./models";

describe("models", () => {
  it("registry has models for all three providers", () => {
    const providers = new Set(MODEL_REGISTRY.map((m) => m.provider));
    expect(providers.has("anthropic")).toBe(true);
    expect(providers.has("openai")).toBe(true);
    expect(providers.has("google")).toBe(true);
  });

  it("every model has required fields", () => {
    for (const m of MODEL_REGISTRY) {
      expect(m.id).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect(m.provider).toBeTruthy();
      expect(m.shortName).toBeTruthy();
    }
  });

  it("groupByProvider groups correctly", () => {
    const groups = groupByProvider();
    expect(groups.length).toBe(3);

    const anthropic = groups.find((g) => g.provider === "anthropic");
    expect(anthropic).toBeTruthy();
    expect(anthropic!.label).toBe("Anthropic");
    expect(anthropic!.models.length).toBeGreaterThan(0);
  });

  it("findModel returns correct model", () => {
    const model = findModel("claude-sonnet-4-20250514");
    expect(model).toBeTruthy();
    expect(model!.name).toBe("Claude Sonnet 4");
    expect(model!.provider).toBe("anthropic");
  });

  it("findModel returns undefined for unknown", () => {
    expect(findModel("nonexistent")).toBeUndefined();
  });

  it("modelAttribution returns shortName for known models", () => {
    expect(modelAttribution("claude-sonnet-4-20250514")).toBe("Sonnet 4");
    expect(modelAttribution("gpt-4.1")).toBe("GPT-4.1");
  });

  it("modelAttribution falls back to raw ID for unknown models", () => {
    expect(modelAttribution("custom-model-v1")).toBe("custom-model-v1");
  });

  it("DEFAULT_MODEL is the first in registry", () => {
    expect(DEFAULT_MODEL).toBe(MODEL_REGISTRY[0]);
    expect(DEFAULT_MODEL.provider).toBe("anthropic");
  });
});
