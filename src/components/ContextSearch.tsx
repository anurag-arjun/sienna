import { useState, useCallback, useRef, useEffect } from "react";
import {
  classifyQuery,
  groupBySource,
  sourceLabel,
  sourceIcon,
  isUrl,
  isFilePath,
  type SearchResult,
  type SearchSourceType,
} from "../lib/context-search";
import { notesApi } from "../api/notes";
import { contextApi } from "../api/context";

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
            // Trigger refresh via onAdd with empty — caller handles refresh
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

  const grouped = groupBySource(results);

  return (
    <div data-testid="context-search">
      {/* Search input */}
      <div className="relative mb-3">
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
