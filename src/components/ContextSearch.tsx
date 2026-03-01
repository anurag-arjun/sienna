import { useState, useCallback, useRef, useEffect } from "react";
import {
  classifyQuery,
  groupBySource,
  sourceLabel,
  sourceIcon,
  isUrl,
  isFilePath,
  isGitHubRef,
  parseGitHubRef,
  isNotionRef,
  parseNotionRef,
  type SearchResult,
  type SearchSourceType,
} from "../lib/context-search";
import { notesApi } from "../api/notes";
import { contextApi } from "../api/context";
import { githubApi } from "../api/github";
import { notionApi } from "../api/notion";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";

/**
 * Fetch content for a GitHub reference string.
 * Format: "github:type:owner/repo..." where type is file, issue, or tree.
 */
async function fetchGitHubContent(reference: string): Promise<string | null> {
  try {
    if (reference.startsWith("github:file:")) {
      const parts = reference.slice("github:file:".length);
      const [owner, repo, ...pathParts] = parts.split("/");
      const path = pathParts.join("/");
      return await githubApi.getFile(owner, repo, path);
    }
    if (reference.startsWith("github:issue:")) {
      const match = reference.match(/github:issue:(.+?)\/(.+?)#(\d+)/);
      if (!match) return null;
      return await githubApi.getIssue(match[1], match[2], parseInt(match[3], 10));
    }
    if (reference.startsWith("github:tree:")) {
      const parts = reference.slice("github:tree:".length);
      const [owner, repo] = parts.split("/");
      const tree = await githubApi.getTree(owner, repo);
      // Format as a file listing
      const files = tree
        .filter((e) => e.entry_type === "blob")
        .map((e) => {
          const size = e.size ? ` (${formatSize(e.size)})` : "";
          return `${e.path}${size}`;
        });
      return `# ${owner}/${repo} — File Tree\n\n${files.join("\n")}`;
    }
    return null;
  } catch (err) {
    console.error("GitHub fetch failed:", err);
    return null;
  }
}

/**
 * Fetch content for a Notion reference string.
 * Format: "notion:page:<page-id>"
 */
async function fetchNotionContent(reference: string): Promise<string | null> {
  try {
    if (reference.startsWith("notion:page:")) {
      const pageId = reference.slice("notion:page:".length);
      return await notionApi.getPage(pageId);
    }
    return null;
  } catch (err) {
    console.error("Notion fetch failed:", err);
    return null;
  }
}

interface ContextSearchProps {
  /** Note ID to attach context items to */
  noteId: string | undefined;
  /** Called when a result is added as context */
  onAdd: (path: string) => Promise<void>;
}

/**
 * Universal search field for the context tray.
 * Routes queries to filesystem, notes, and URL sources.
 */
export function ContextSearch({ noteId, onAdd }: ContextSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setResults([]);
        return;
      }

      const sources = classifyQuery(trimmed);
      setSearching(true);

      try {
        const allResults: SearchResult[] = [];

        // Search notes
        if (sources.includes("note")) {
          try {
            const notes = await notesApi.listNotes({
              search: trimmed,
              limit: 5,
            });
            for (const note of notes) {
              allResults.push({
                source: "note",
                label: note.title || "Untitled",
                reference: note.id,
                preview:
                  note.content?.slice(0, 120).replace(/\n/g, " ") ?? "",
                size: note.content?.length,
              });
            }
          } catch {
            // Note search failure is non-fatal
          }
        }

        // Direct file path — try to stat it
        if (sources.includes("local") && isFilePath(trimmed)) {
          try {
            const meta = await contextApi.getFileMeta(trimmed);
            if (!meta.is_dir) {
              allResults.push({
                source: "local",
                label: meta.name,
                reference: meta.path,
                preview: `${formatSize(meta.size)}`,
                size: meta.size,
              });
            }
          } catch {
            // File doesn't exist, skip
          }
        }

        // URL — show as addable result
        if (sources.includes("url") && isUrl(trimmed)) {
          allResults.push({
            source: "url",
            label: trimmed,
            reference: trimmed,
            preview: "Paste to add as context",
          });
        }

        // Notion reference — search or direct page
        if (sources.includes("notion") && isNotionRef(trimmed)) {
          const ref_ = parseNotionRef(trimmed);
          if (ref_) {
            if (ref_.type === "page") {
              // Direct page reference
              allResults.push({
                source: "notion",
                label: `Notion page`,
                reference: `notion:page:${ref_.value}`,
                preview: "Fetch page content",
              });
            } else {
              // Search Notion workspace
              try {
                const pages = await notionApi.search(ref_.value, 8);
                for (const page of pages) {
                  const icon = page.icon ?? (page.object === "database" ? "📊" : "📄");
                  allResults.push({
                    source: "notion",
                    label: `${icon} ${page.title}`,
                    reference: `notion:page:${page.id}`,
                    preview: `${page.object} · edited ${page.last_edited.slice(0, 10)}`,
                  });
                }
              } catch {
                allResults.push({
                  source: "notion",
                  label: "Notion search failed",
                  reference: "",
                  preview: "Check your integration token",
                });
              }
            }
          }
        }

        // GitHub reference — parse and show options
        if (sources.includes("github") && isGitHubRef(trimmed)) {
          const ref_ = parseGitHubRef(trimmed);
          if (ref_) {
            if (ref_.number) {
              // Issue or PR reference
              allResults.push({
                source: "github",
                label: `${ref_.owner}/${ref_.repo}#${ref_.number}`,
                reference: `github:issue:${ref_.owner}/${ref_.repo}#${ref_.number}`,
                preview: "Fetch issue or PR",
              });
            } else if (ref_.path) {
              // File reference
              allResults.push({
                source: "github",
                label: `${ref_.owner}/${ref_.repo}/${ref_.path}`,
                reference: `github:file:${ref_.owner}/${ref_.repo}/${ref_.path}`,
                preview: "Fetch file from repo",
              });
            } else {
              // Repo root — show tree
              allResults.push({
                source: "github",
                label: `${ref_.owner}/${ref_.repo}`,
                reference: `github:tree:${ref_.owner}/${ref_.repo}`,
                preview: "Browse repository tree",
              });
            }
          }
        }

        setResults(allResults);
      } finally {
        setSearching(false);
      }
    },
    [],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(value), 250);
    },
    [doSearch],
  );

  const handleAdd = useCallback(
    async (result: SearchResult) => {
      if (!noteId) return;
      setAdding(result.reference);
      try {
        if (result.source === "local") {
          await onAdd(result.reference);
        } else if (result.source === "note") {
          // Add note content as context
          const note = await notesApi.getNote(result.reference);
          if (note) {
            await contextApi.addNoteContext({
              note_id: noteId,
              type: "note",
              reference: note.id,
              label: note.title || "Untitled",
              content_cache: note.content ?? "",
            });
            await onAdd("");
          }
        } else if (result.source === "github") {
          const content = await fetchGitHubContent(result.reference);
          if (content) {
            await contextApi.addNoteContext({
              note_id: noteId,
              type: "github",
              reference: result.reference,
              label: result.label,
              content_cache: content,
            });
            await onAdd("");
          }
        } else if (result.source === "notion") {
          const content = await fetchNotionContent(result.reference);
          if (content) {
            await contextApi.addNoteContext({
              note_id: noteId,
              type: "notion",
              reference: result.reference,
              label: result.label,
              content_cache: content,
            });
            await onAdd("");
          }
        }
        // Clear the result after adding
        setResults((prev) =>
          prev.filter((r) => r.reference !== result.reference),
        );
        setQuery("");
      } finally {
        setAdding(null);
      }
    },
    [noteId, onAdd],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Enter adds the first result
      if (e.key === "Enter" && results.length > 0) {
        e.preventDefault();
        handleAdd(results[0]);
      }
    },
    [results, handleAdd],
  );

  const handleBrowse = useCallback(async () => {
    if (!noteId) return;
    try {
      const selected = await openFileDialog({
        multiple: true,
        title: "Add files to context",
      });
      if (!selected) return;

      const paths = Array.isArray(selected) ? selected : [selected];
      for (const path of paths) {
        if (path) await onAdd(path);
      }
    } catch (err) {
      console.error("File dialog failed:", err);
    }
  }, [noteId, onAdd]);

  const grouped = groupBySource(results);

  return (
    <div data-testid="context-search">
      {/* Search input + Browse button */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search files, notes, or paste URL…"
            className="w-full bg-surface-1/80 text-text-primary text-sm rounded-lg px-3 py-2 border border-accent-muted/30 focus:border-accent-blue/50 focus:outline-none placeholder:text-text-tertiary"
            data-testid="context-search-input"
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary text-xs">
              …
            </span>
          )}
        </div>
        <button
          onClick={handleBrowse}
          disabled={!noteId}
          className="shrink-0 bg-surface-1/80 text-text-secondary text-sm rounded-lg px-3 py-2 border border-accent-muted/30 hover:border-accent-blue/50 hover:text-text-primary transition-colors disabled:opacity-40 cursor-pointer"
          title="Browse files"
          data-testid="context-browse-button"
        >
          📂
        </button>
      </div>

      {/* Results grouped by source */}
      {Array.from(grouped.entries()).map(([source, items]) => (
        <div key={source} className="mb-2" data-testid={`search-group-${source}`}>
          <div className="flex items-center gap-1 px-1 mb-1">
            <span className="text-[10px] opacity-60">{sourceIcon(source)}</span>
            <span className="text-[10px] text-text-tertiary uppercase tracking-wide">
              {sourceLabel(source)}
            </span>
          </div>
          {items.map((result) => (
            <SearchResultRow
              key={result.reference}
              result={result}
              adding={adding === result.reference}
              onAdd={handleAdd}
              disabled={!noteId}
            />
          ))}
        </div>
      ))}

      {query.trim() && !searching && results.length === 0 && (
        <p className="text-text-tertiary text-xs text-center py-2 select-none">
          No results
        </p>
      )}
    </div>
  );
}

// ── Search Result Row ────────────────────────────────────────────────

interface SearchResultRowProps {
  result: SearchResult;
  adding: boolean;
  onAdd: (result: SearchResult) => void;
  disabled: boolean;
}

function SearchResultRow({
  result,
  adding,
  onAdd,
  disabled,
}: SearchResultRowProps) {
  return (
    <button
      onClick={() => onAdd(result)}
      disabled={disabled || adding}
      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-3/60 transition-colors disabled:opacity-40 cursor-pointer"
      data-testid="search-result"
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary truncate">{result.label}</div>
        {result.preview && (
          <div className="text-[11px] text-text-tertiary truncate">
            {result.preview}
          </div>
        )}
      </div>
      <span className="text-text-tertiary text-xs shrink-0">
        {adding ? "…" : "+"}
      </span>
    </button>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
