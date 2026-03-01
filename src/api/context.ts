/**
 * Context IPC API — frontend bindings for context tray commands.
 */

import { invoke } from "@tauri-apps/api/core";

// ── Types ──────────────────────────────────────────────────────────────

export interface NoteContext {
  id: string;
  note_id: string;
  type: string;
  reference: string;
  label: string;
  content_cache: string | null;
  sort_order: number;
}

export interface CreateNoteContext {
  note_id: string;
  type: string;
  reference: string;
  label: string;
  content_cache?: string;
  sort_order?: number;
}

export interface FileMeta {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
}

// ── API Functions ──────────────────────────────────────────────────────

export async function addNoteContext(
  input: CreateNoteContext,
): Promise<NoteContext> {
  return invoke<NoteContext>("add_note_context", { input });
}

export async function listNoteContext(
  noteId: string,
): Promise<NoteContext[]> {
  return invoke<NoteContext[]>("list_note_context", { noteId });
}

export async function removeNoteContext(id: string): Promise<void> {
  return invoke<void>("remove_note_context", { id });
}

export async function reorderNoteContext(
  id: string,
  sortOrder: number,
): Promise<void> {
  return invoke<void>("reorder_note_context", { id, sortOrder });
}

export async function readFileContent(path: string): Promise<string> {
  return invoke<string>("read_file_content", { path });
}

export async function getFileMeta(path: string): Promise<FileMeta> {
  return invoke<FileMeta>("get_file_meta", { path });
}

export const contextApi = {
  addNoteContext,
  listNoteContext,
  removeNoteContext,
  reorderNoteContext,
  readFileContent,
  getFileMeta,
};
