/**
 * Import IPC API — frontend bindings for conversation import commands.
 */

import { invoke } from "@tauri-apps/api/core";

export interface ImportResult {
  conversations_imported: number;
  messages_imported: number;
  errors: string[];
}

export async function importClaudeExport(
  filePath: string,
): Promise<ImportResult> {
  return invoke<ImportResult>("import_claude_export", { filePath });
}

export const importApi = {
  importClaudeExport,
};
