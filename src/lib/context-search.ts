/**
 * Context search — unified search across multiple sources.
 * Routes queries to filesystem, notes, and URL fetching.
 */

export type SearchSourceType = "local" | "note" | "url" | "github" | "notion";

export interface SearchResult {
  source: SearchSourceType;
  label: string;
  reference: string;
  preview: string;
  size?: number;
}

/**
 * Detect if a query is a URL.
 */
export function isUrl(query: string): boolean {
  const trimmed = query.trim();
  return /^https?:\/\/\S+/.test(trimmed);
}

/**
 * Detect if a query looks like a file path.
 */
export function isFilePath(query: string): boolean {
  const trimmed = query.trim();
  return (
    trimmed.startsWith("/") ||
    trimmed.startsWith("~/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  );
}

/**
 * Detect if a query is a Notion reference.
 * Matches: notion:search term, or a Notion URL.
 */
export function isNotionRef(query: string): boolean {
  const trimmed = query.trim();
  return (
    trimmed.startsWith("notion:") ||
    /^https?:\/\/(www\.)?notion\.(so|site)\//.test(trimmed)
  );
}

/**
 * Parse a Notion reference.
 * - "notion:search term" → search query
 * - Notion URL with page ID → page ID
 */
export function parseNotionRef(query: string): {
  type: "search" | "page";
  value: string;
} | null {
  const trimmed = query.trim();

  if (trimmed.startsWith("notion:")) {
    const term = trimmed.slice("notion:".length).trim();
    return term ? { type: "search", value: term } : null;
  }

  // Notion URL: extract page ID from the last segment
  // Format: https://www.notion.so/workspace/Page-Title-<32hex>
  // or: https://www.notion.so/<32hex>
  const urlMatch = trimmed.match(
    /^https?:\/\/(?:www\.)?notion\.(?:so|site)\/(?:\S+?-)?([a-f0-9]{32})\b/i,
  );
  if (urlMatch) {
    // Format as UUID with dashes
    const hex = urlMatch[1];
    const pageId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return { type: "page", value: pageId };
  }

  return null;
}

/**
 * Detect if a query looks like a GitHub reference.
 * Matches: owner/repo, owner/repo#123, owner/repo/path/to/file
 */
export function isGitHubRef(query: string): boolean {
  const trimmed = query.trim();
  return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(#\d+|\/\S+)?$/.test(trimmed);
}

/**
 * Parse a GitHub reference into its parts.
 */
export function parseGitHubRef(query: string): {
  owner: string;
  repo: string;
  number?: number;
  path?: string;
} | null {
  const trimmed = query.trim();

  // owner/repo#123 (issue or PR)
  const issueMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)#(\d+)$/);
  if (issueMatch) {
    return { owner: issueMatch[1], repo: issueMatch[2], number: parseInt(issueMatch[3], 10) };
  }

  // owner/repo/path/to/file
  const pathMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/(.+)$/);
  if (pathMatch) {
    return { owner: pathMatch[1], repo: pathMatch[2], path: pathMatch[3] };
  }

  // owner/repo (repo root)
  const repoMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (repoMatch) {
    return { owner: repoMatch[1], repo: repoMatch[2] };
  }

  return null;
}

/**
 * Classify the query intent to determine which sources to search.
 */
export function classifyQuery(query: string): SearchSourceType[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (isNotionRef(trimmed)) return ["notion"];
  if (isUrl(trimmed)) return ["url"];
  if (isFilePath(trimmed)) return ["local"];
  if (isGitHubRef(trimmed)) return ["github"];
  // Generic text searches both files and notes
  return ["local", "note"];
}

/**
 * Group search results by source type.
 */
export function groupBySource(
  results: SearchResult[],
): Map<SearchSourceType, SearchResult[]> {
  const groups = new Map<SearchSourceType, SearchResult[]>();
  for (const result of results) {
    const group = groups.get(result.source) ?? [];
    group.push(result);
    groups.set(result.source, group);
  }
  return groups;
}

/**
 * Source type display labels.
 */
export function sourceLabel(source: SearchSourceType): string {
  switch (source) {
    case "local":
      return "Files";
    case "note":
      return "Notes";
    case "url":
      return "URLs";
    case "github":
      return "GitHub";
    case "notion":
      return "Notion";
  }
}

/**
 * Source type icon.
 */
export function sourceIcon(source: SearchSourceType): string {
  switch (source) {
    case "local":
      return "📁";
    case "note":
      return "✎";
    case "url":
      return "🔗";
    case "github":
      return "⌥";
    case "notion":
      return "◻";
  }
}
