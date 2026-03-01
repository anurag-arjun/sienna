/**
 * Context search — unified search across multiple sources.
 * Routes queries to filesystem, notes, and URL fetching.
 */

export type SearchSourceType = "local" | "note" | "url";

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
 * Classify the query intent to determine which sources to search.
 */
export function classifyQuery(query: string): SearchSourceType[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (isUrl(trimmed)) return ["url"];
  if (isFilePath(trimmed)) return ["local"];
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
  }
}
