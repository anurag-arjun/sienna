/**
 * Pi agent IPC API — frontend bindings for Tauri backend pi commands.
 *
 * Usage:
 *   const sessionId = await piApi.createSession({ provider: 'anthropic', model: 'claude-sonnet-4-20250514' });
 *   piApi.onEvent((event) => console.log(event));
 *   await piApi.prompt(sessionId, 'Hello!');
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ── Types ──────────────────────────────────────────────────────────────

export interface CreateSessionRequest {
  provider?: string;
  model?: string;
  api_key?: string;
  system_prompt?: string;
  append_system_prompt?: string;
  working_directory?: string;
  session_path?: string;
  session_dir?: string;
  no_session?: boolean;
  enabled_tools?: string[];
}

export interface SessionState {
  session_id: string | null;
  provider: string;
  model_id: string;
  thinking_level: string | null;
  save_enabled: boolean;
  message_count: number;
}

/** A simplified message hydrated from pi session JSONL. */
export interface SessionMessage {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
}

/** A forkable user message entry from the session. */
export interface ForkableMessage {
  entry_id: string;
  text: string;
}

/** Result of forking a session. */
export interface ForkResult {
  session_id: string;
  session_path: string | null;
  selected_text: string;
}

/** Discriminated union of events emitted by the pi backend. */
export type PiEvent =
  | { type: 'agent_start'; session_id: string }
  | { type: 'text_delta'; session_id: string; content_index: number; delta: string }
  | { type: 'text_end'; session_id: string; content_index: number; content: string }
  | { type: 'thinking_delta'; session_id: string; content_index: number; delta: string }
  | { type: 'tool_start'; session_id: string; tool_call_id: string; tool_name: string }
  | { type: 'tool_end'; session_id: string; tool_call_id: string; tool_name: string; is_error: boolean }
  | { type: 'turn_end'; session_id: string; turn_index: number }
  | { type: 'agent_end'; session_id: string; error: string | null }
  | { type: 'error'; session_id: string; message: string };

// ── API Functions ──────────────────────────────────────────────────────

/** Create a new pi agent session. Returns the session ID. */
export async function createSession(request: CreateSessionRequest = {}): Promise<string> {
  return invoke<string>('pi_create_session', { request });
}

/** Send a prompt to an active session. Events arrive via onEvent listener. */
export async function prompt(sessionId: string, message: string): Promise<void> {
  return invoke<void>('pi_prompt', { sessionId, message });
}

/** Steer an in-progress generation. */
export async function steer(sessionId: string, message: string): Promise<void> {
  return invoke<void>('pi_steer', { sessionId, message });
}

/** Abort an in-progress generation. */
export async function abort(sessionId: string): Promise<void> {
  return invoke<void>('pi_abort', { sessionId });
}

/** Get session state snapshot. */
export async function getState(sessionId: string): Promise<SessionState> {
  return invoke<SessionState>('pi_get_state', { sessionId });
}

/** Switch model for a session. */
export async function setModel(sessionId: string, provider: string, modelId: string): Promise<void> {
  return invoke<void>('pi_set_model', { sessionId, provider, modelId });
}

/** Get messages from the session's JSONL history (hydration). */
export async function getMessages(sessionId: string): Promise<SessionMessage[]> {
  return invoke<SessionMessage[]>('pi_get_messages', { sessionId });
}

/** Get forkable user message entries from the session. */
export async function getForkMessages(sessionId: string): Promise<ForkableMessage[]> {
  return invoke<ForkableMessage[]>('pi_get_fork_messages', { sessionId });
}

/** Fork a session at a specific user message entry. Returns the new session info. */
export async function forkSession(sessionId: string, entryId: string): Promise<ForkResult> {
  return invoke<ForkResult>('pi_fork_session', { sessionId, entryId });
}

/** Destroy a session and free resources. */
export async function destroySession(sessionId: string): Promise<void> {
  return invoke<void>('pi_destroy_session', { sessionId });
}

/** Subscribe to pi events from all sessions. Returns an unlisten function. */
export async function onEvent(callback: (event: PiEvent) => void): Promise<UnlistenFn> {
  return listen<PiEvent>('pi-event', (e) => callback(e.payload));
}

/** Subscribe to events for a specific session. Returns an unlisten function. */
export async function onSessionEvent(
  sessionId: string,
  callback: (event: PiEvent) => void,
): Promise<UnlistenFn> {
  return listen<PiEvent>('pi-event', (e) => {
    if (e.payload.session_id === sessionId) {
      callback(e.payload);
    }
  });
}

// ── Convenience export ─────────────────────────────────────────────────

export const piApi = {
  createSession,
  prompt,
  steer,
  abort,
  getState,
  getMessages,
  getForkMessages,
  forkSession,
  setModel,
  destroySession,
  onEvent,
  onSessionEvent,
};
