/**
 * Notes IPC API — frontend bindings for Tauri note commands.
 */

import { invoke } from "@tauri-apps/api/core";

// ── Types ──────────────────────────────────────────────────────────────

export interface Note {
  id: string;
  type: string;
  title: string;
  content: string | null;
  pi_session: string | null;
  status: string;
  pinned: boolean;
  context_set: string | null;
  created_at: number;
  updated_at: number;
  tags: string[];
}

export interface CreateNote {
  note_type: string;
  title: string;
  content?: string;
  pi_session?: string;
  tags?: string[];
}

export interface UpdateNote {
  title?: string;
  content?: string;
  status?: string;
  pinned?: boolean;
  pi_session?: string;
}

export interface NoteFilter {
  status?: string;
  note_type?: string;
  tag?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

// ── API Functions ──────────────────────────────────────────────────────

export async function createNote(input: CreateNote): Promise<Note> {
  return invoke<Note>("create_note", { input });
}

export async function getNote(id: string): Promise<Note | null> {
  return invoke<Note | null>("get_note", { id });
}

export async function updateNote(id: string, input: UpdateNote): Promise<Note> {
  return invoke<Note>("update_note", { id, input });
}

export async function deleteNote(id: string): Promise<void> {
  return invoke<void>("delete_note", { id });
}

export async function listNotes(filter: NoteFilter = {}): Promise<Note[]> {
  return invoke<Note[]>("list_notes", { filter });
}

export interface NoteLink {
  source_id: string;
  target_id: string;
  link_type: string;
}

export async function addNoteLink(link: NoteLink): Promise<void> {
  return invoke<void>("add_note_link", { link });
}

export async function getNoteLinks(noteId: string): Promise<NoteLink[]> {
  return invoke<NoteLink[]>("get_note_links", { noteId });
}

export const notesApi = {
  createNote,
  getNote,
  updateNote,
  deleteNote,
  listNotes,
  addNoteLink,
  getNoteLinks,
};
