import type { NoteFilter } from "../api/notes";

/**
 * Parse a search query string into a NoteFilter.
 *
 * Supports qualifiers:
 *   tag:plan        → filter by tag
 *   status:active   → filter by status
 *   status:all      → show all statuses (override default)
 *   type:document   → filter by note type
 *   type:conversation
 *
 * Everything else becomes the FTS search term.
 *
 * Examples:
 *   "rust programming"        → { search: "rust programming" }
 *   "tag:plan rust"           → { tag: "plan", search: "rust" }
 *   "status:completed tag:chat" → { status: "completed", tag: "chat" }
 */
export function parseSearchQuery(
  query: string,
  defaults: Partial<NoteFilter> = {},
): NoteFilter {
  const filter: NoteFilter = { ...defaults };
  const freeTerms: string[] = [];

  const tokens = query.trim().split(/\s+/);

  for (const token of tokens) {
    if (!token) continue;

    const colonIdx = token.indexOf(":");
    if (colonIdx > 0) {
      const key = token.slice(0, colonIdx).toLowerCase();
      const value = token.slice(colonIdx + 1);

      if (!value) {
        freeTerms.push(token);
        continue;
      }

      switch (key) {
        case "tag":
          filter.tag = value;
          break;
        case "status":
          if (value === "all") {
            delete filter.status;
          } else {
            filter.status = value;
          }
          break;
        case "type":
          filter.note_type = value;
          break;
        default:
          // Unknown qualifier — treat as search text
          freeTerms.push(token);
      }
    } else {
      freeTerms.push(token);
    }
  }

  if (freeTerms.length > 0) {
    filter.search = freeTerms.join(" ");
  }

  return filter;
}
