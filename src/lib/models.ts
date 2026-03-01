/**
 * Model registry — available models and provider grouping.
 * Used by the model picker for selection and attribution.
 */

export interface ModelInfo {
  /** Provider/model ID (e.g. "anthropic/claude-sonnet-4-20250514") */
  id: string;
  /** Display name */
  name: string;
  /** Provider key */
  provider: string;
  /** Short label for attribution (e.g. "Sonnet 4") */
  shortName: string;
}

export interface ProviderGroup {
  provider: string;
  label: string;
  models: ModelInfo[];
}

/**
 * Built-in model registry.
 * Covers Anthropic, OpenAI, and Google — the cloud providers mood-editor supports.
 */
export const MODEL_REGISTRY: ModelInfo[] = [
  // Anthropic
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic", shortName: "Sonnet 4" },
  { id: "claude-opus-4-20250514", name: "Claude Opus 4", provider: "anthropic", shortName: "Opus 4" },
  { id: "claude-haiku-3-5-20241022", name: "Claude Haiku 3.5", provider: "anthropic", shortName: "Haiku 3.5" },

  // OpenAI
  { id: "gpt-4.1", name: "GPT-4.1", provider: "openai", shortName: "GPT-4.1" },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "openai", shortName: "4.1 Mini" },
  { id: "o3", name: "o3", provider: "openai", shortName: "o3" },
  { id: "o4-mini", name: "o4-mini", provider: "openai", shortName: "o4-mini" },

  // Google
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google", shortName: "2.5 Pro" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google", shortName: "2.5 Flash" },
];

/** Group models by provider. */
export function groupByProvider(models: ModelInfo[] = MODEL_REGISTRY): ProviderGroup[] {
  const providerLabels: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
  };

  const groups = new Map<string, ModelInfo[]>();
  for (const m of models) {
    const list = groups.get(m.provider) ?? [];
    list.push(m);
    groups.set(m.provider, list);
  }

  return Array.from(groups.entries()).map(([provider, providerModels]) => ({
    provider,
    label: providerLabels[provider] ?? provider,
    models: providerModels,
  }));
}

/** Find a model by its ID. */
export function findModel(id: string): ModelInfo | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

/** Get the short attribution label for a model ID. */
export function modelAttribution(modelId: string): string {
  const model = findModel(modelId);
  return model?.shortName ?? modelId;
}

/** Default model. */
export const DEFAULT_MODEL: ModelInfo = MODEL_REGISTRY[0];
