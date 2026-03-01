/**
 * Notion IPC API — frontend bindings for Notion context commands.
 */

import { invoke } from "@tauri-apps/api/core";

// ── Types ──────────────────────────────────────────────────────────────

export interface NotionSearchResult {
  id: string;
  title: string;
  object: string; // "page" or "database"
  icon: string | null;
  last_edited: string;
  url: string;
}

// ── API Functions ──────────────────────────────────────────────────────

/** Set and validate a Notion integration token. Returns workspace name. */
export async function setToken(token: string): Promise<string> {
  return invoke<string>("notion_set_token", { token });
}

/** Get the stored token (if any). */
export async function getToken(): Promise<string | null> {
  return invoke<string | null>("notion_get_token");
}

/** Clear the stored token. */
export async function clearToken(): Promise<void> {
  return invoke<void>("notion_clear_token");
}

/** Search for pages and databases in the workspace. */
export async function search(
  query: string,
  pageSize?: number,
): Promise<NotionSearchResult[]> {
  return invoke<NotionSearchResult[]>("notion_search", { query, pageSize });
}

/** Get a page's content as Markdown. */
export async function getPage(pageId: string): Promise<string> {
  return invoke<string>("notion_get_page", { pageId });
}

export const notionApi = {
  setToken,
  getToken,
  clearToken,
  search,
  getPage,
};
