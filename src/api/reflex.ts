// Typed frontend bindings for Reflex IPC commands

import { invoke } from "@tauri-apps/api/core";

export type AnnotationType =
  | "consistency"
  | "connection"
  | "continuity"
  | "structure"
  | "question";

export interface Annotation {
  type: AnnotationType;
  message: string;
  confidence: number;
  ref?: string;
}

export interface AnalyzeRequest {
  text: string;
  before?: string;
  after?: string;
  mode?: string;
  context?: string;
  note_id?: string;
}

export async function analyzeParagraph(
  request: AnalyzeRequest
): Promise<Annotation[]> {
  return invoke<Annotation[]>("reflex_analyze_paragraph", { request });
}

export async function toggleReflex(enabled: boolean): Promise<boolean> {
  return invoke<boolean>("reflex_toggle", { enabled });
}

export async function isReflexEnabled(): Promise<boolean> {
  return invoke<boolean>("reflex_is_enabled");
}

export async function invalidateReflexCache(): Promise<void> {
  return invoke<void>("reflex_invalidate_cache");
}
