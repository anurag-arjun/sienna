import { useState, useEffect, useCallback } from "react";
import { NoteList } from "./NoteList";
import type { Note } from "../api/notes";
import { notesApi } from "../api/notes";

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

/**
 * Library panel — slides in from the left on Cmd+O.
 *
 * Shows all notes sorted by last edited. Minimal chrome.
 * Click a note to navigate to it. Esc or Cmd+O to close.
 */
export function LibraryPanel({
  open,
  onClose,
  onSelectNote,
  activeNoteId,
}: LibraryPanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch notes when panel opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setLoading(true);
    notesApi
      .listNotes({ limit: 100 })
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

        {/* Note list */}
        <NoteList
          notes={notes}
          selectedId={activeNoteId}
          onSelect={handleSelect}
          loading={loading}
        />

        {/* Footer — note count */}
        <div className="px-4 py-2 border-t border-accent-muted/15">
          <span className="text-text-tertiary text-[10px]">
            {notes.length} note{notes.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </>
  );
}
