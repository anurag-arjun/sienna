/**
 * Context Sets IPC API — frontend bindings for persistent context collections.
 */

import { invoke } from "@tauri-apps/api/core";

// ── Types ──────────────────────────────────────────────────────────────

export interface ContextSet {
  id: string;
  name: string;
  trigger_tags: string[];
}

export interface CreateContextSet {
  name: string;
  trigger_tags: string[];
}

export interface UpdateContextSet {
  name?: string;
  trigger_tags?: string[];
}

export interface ContextSetItem {
  id: string;
  context_set: string;
  type: string;
  reference: string;
  label: string;
  pinned: boolean;
  sort_order: number;
}

export interface CreateContextSetItem {
  context_set: string;
  type: string;
  reference: string;
  label: string;
  pinned?: boolean;
  sort_order?: number;
}

export interface AssembledContext {
  set_name: string;
  set_id: string;
  item_id: string;
  type: string;
  reference: string;
  label: string;
  content: string | null;
}

// ── API Functions ──────────────────────────────────────────────────────

export async function createContextSet(
  input: CreateContextSet,
): Promise<ContextSet> {
  return invoke<ContextSet>("create_context_set", { input });
}

export async function getContextSet(
  id: string,
): Promise<ContextSet | null> {
  return invoke<ContextSet | null>("get_context_set", { id });
}

export async function updateContextSet(
  id: string,
  input: UpdateContextSet,
): Promise<ContextSet> {
  return invoke<ContextSet>("update_context_set", { id, input });
}

export async function deleteContextSet(id: string): Promise<void> {
  return invoke<void>("delete_context_set", { id });
}

export async function listContextSets(): Promise<ContextSet[]> {
  return invoke<ContextSet[]>("list_context_sets");
}

export async function addContextSetItem(
  input: CreateContextSetItem,
): Promise<ContextSetItem> {
  return invoke<ContextSetItem>("add_context_set_item", { input });
}

export async function listContextSetItems(
  contextSetId: string,
): Promise<ContextSetItem[]> {
  return invoke<ContextSetItem[]>("list_context_set_items", { contextSetId });
}

export async function removeContextSetItem(id: string): Promise<void> {
  return invoke<void>("remove_context_set_item", { id });
}

export async function findContextSetsByTags(
  tags: string[],
): Promise<ContextSet[]> {
  return invoke<ContextSet[]>("find_context_sets_by_tags", { tags });
}

export async function assembleContextForTags(
  tags: string[],
): Promise<AssembledContext[]> {
  return invoke<AssembledContext[]>("assemble_context_for_tags", { tags });
}

export const contextSetsApi = {
  createContextSet,
  getContextSet,
  updateContextSet,
  deleteContextSet,
  listContextSets,
  addContextSetItem,
  listContextSetItems,
  removeContextSetItem,
  findContextSetsByTags,
  assembleContextForTags,
};
