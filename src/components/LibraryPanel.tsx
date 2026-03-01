import { useState, useEffect, useCallback, useRef } from "react";
import { NoteList } from "./NoteList";
import type { Note, NoteFilter } from "../api/notes";
import { notesApi } from "../api/notes";
import { useDebounce } from "../hooks/useDebounce";
import { parseSearchQuery } from "../lib/search-query";

interface LibraryPanelProps {
  /** Whether the panel is open */
  open: boolean;
  /** Called when user wants to close the panel */
  onClose: () => void;
  /** Called when user selects a note */
  onSelectNote: (note: Note) => void;
  /** Currently active note ID */
  activeNoteId?: string;
}

/** Default filter: only active notes */
const DEFAULT_FILTER: Partial<NoteFilter> = { status: "active" };

/**
 * Library panel — slides in from the left on Cmd+O.
 *
 * Full-text search with qualifier support (tag:, status:, type:).
 * Hides completed/dropped notes by default (use status:all to show).
 * Click a note to navigate, Esc or Cmd+O to close.
 */
export function LibraryPanel({
  open,
  onClose,
  onSelectNote,
  activeNoteId,
}: LibraryPanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounce(query, 80);

  // Fetch notes when panel opens or search changes
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const filter: NoteFilter = {
      ...parseSearchQuery(debouncedQuery, DEFAULT_FILTER),
      limit: 100,
    };

    setLoading(true);
    notesApi
      .listNotes(filter)
      .then((result) => {
        if (!cancelled) {
          setNotes(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load notes:", err);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, debouncedQuery]);

  // Focus search input when panel opens, clear on close
  useEffect(() => {
    if (open) {
      // Small delay to let transition start
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    } else {
      setQuery("");
    }
  }, [open]);

  // Escape closes panel
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const handleSelect = useCallback(
    (note: Note) => {
      onSelectNote(note);
      onClose();
    },
    [onSelectNote, onClose],
  );

  // Click a tag to filter by it
  const handleTagClick = useCallback((tag: string) => {
    setQuery((prev) => {
      // Replace existing tag: qualifier or append
      const withoutTag = prev.replace(/\btag:\S*/g, "").trim();
      return withoutTag ? `tag:${tag} ${withoutTag}` : `tag:${tag}`;
    });
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`
          fixed inset-0 bg-surface-0/60 z-40
          transition-opacity duration-200
          ${open ? "opacity-100" : "opacity-0 pointer-events-none"}
        `}
        onClick={onClose}
        data-testid="library-backdrop"
      />

      {/* Panel */}
      <div
        className={`
          fixed top-0 left-0 bottom-0 w-72 z-50
          bg-surface-2 border-r border-accent-muted/20
          flex flex-col
          transition-transform duration-200 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
        data-testid="library-panel"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-accent-muted/15 flex items-center justify-between">
          <span className="text-text-secondary text-xs font-medium uppercase tracking-wider">
            Library
          </span>
          <button
            onClick={onClose}
            className="text-text-tertiary text-xs hover:text-text-secondary transition-colors cursor-pointer"
            data-testid="library-close"
          >
            Esc
          </button>
        </div>

        {/* Search input */}
        <div className="px-3 py-2 border-b border-accent-muted/15">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search… (tag: status: type:)"
            className="
              w-full bg-surface-3/50 text-text-primary text-sm
              placeholder:text-text-tertiary placeholder:text-xs
              px-2.5 py-1.5 rounded
              border border-accent-muted/20
              focus:outline-none focus:border-accent-warm/40
              transition-colors duration-150
            "
            data-testid="library-search"
          />
          {/* Active filter hint */}
          {query && (
            <button
              onClick={() => setQuery("")}
              className="mt-1 text-[10px] text-accent-warm/60 hover:text-accent-warm cursor-pointer"
              data-testid="library-clear-search"
            >
              ✕ clear
            </button>
          )}
        </div>

        {/* Note list */}
        <NoteList
          notes={notes}
          selectedId={activeNoteId}
          onSelect={handleSelect}
          onTagClick={handleTagClick}
          loading={loading}
        />

        {/* Footer — note count + status hint */}
        <div className="px-4 py-2 border-t border-accent-muted/15 flex items-center justify-between">
          <span className="text-text-tertiary text-[10px]">
            {notes.length} note{notes.length !== 1 ? "s" : ""}
          </span>
          {!query && (
            <span className="text-text-tertiary text-[10px] opacity-60">
              active only
            </span>
          )}
        </div>
      </div>
    </>
  );
}
