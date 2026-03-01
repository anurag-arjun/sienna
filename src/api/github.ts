/**
 * GitHub IPC API — frontend bindings for GitHub context commands.
 */

import { invoke } from "@tauri-apps/api/core";

// ── Types ──────────────────────────────────────────────────────────────

export interface GitHubRepo {
  full_name: string;
  description: string | null;
  default_branch: string;
  private: boolean;
  html_url: string;
}

export interface GitHubTreeEntry {
  path: string;
  entry_type: string; // "blob" or "tree"
  size: number | null;
  sha: string;
}

// ── API Functions ──────────────────────────────────────────────────────

/** Set and validate a GitHub PAT. Returns the authenticated username. */
export async function setPat(pat: string): Promise<string> {
  return invoke<string>("github_set_pat", { pat });
}

/** Get the stored PAT (if any). */
export async function getPat(): Promise<string | null> {
  return invoke<string | null>("github_get_pat");
}

/** Clear the stored PAT. */
export async function clearPat(): Promise<void> {
  return invoke<void>("github_clear_pat");
}

/** List repos for the authenticated user. */
export async function listRepos(page?: number): Promise<GitHubRepo[]> {
  return invoke<GitHubRepo[]>("github_list_repos", { page });
}

/** Get the file tree for a repo. */
export async function getTree(
  owner: string,
  repo: string,
  branch?: string,
): Promise<GitHubTreeEntry[]> {
  return invoke<GitHubTreeEntry[]>("github_get_tree", { owner, repo, branch });
}

/** Get the content of a file from a repo. */
export async function getFile(
  owner: string,
  repo: string,
  path: string,
  branch?: string,
): Promise<string> {
  return invoke<string>("github_get_file", { owner, repo, path, branch });
}

/** Get an issue with comments, formatted as context text. */
export async function getIssue(
  owner: string,
  repo: string,
  number: number,
): Promise<string> {
  return invoke<string>("github_get_issue", { owner, repo, number });
}

/** Get a PR with diff, formatted as context text. */
export async function getPrDiff(
  owner: string,
  repo: string,
  number: number,
): Promise<string> {
  return invoke<string>("github_get_pr_diff", { owner, repo, number });
}

/** Push (create or update) a file to a repo. Returns the commit URL. */
export async function pushFile(
  owner: string,
  repo: string,
  path: string,
  branch: string,
  content: string,
  message: string,
): Promise<string> {
  return invoke<string>("github_push_file", { owner, repo, path, branch, content, message });
}

export const githubApi = {
  setPat,
  getPat,
  clearPat,
  listRepos,
  getTree,
  getFile,
  getIssue,
  getPrDiff,
  pushFile,
};
