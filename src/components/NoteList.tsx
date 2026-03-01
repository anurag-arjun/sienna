import { useMemo } from "react";
import type { Note } from "../api/notes";

interface NoteListProps {
  notes: Note[];
  /** Currently selected note ID */
  selectedId?: string;
  /** Called when a note is selected */
  onSelect: (note: Note) => void;
  /** Called when a tag chip is clicked (filters by tag) */
  onTagClick?: (tag: string) => void;
  /** Whether the list is loading */
  loading?: boolean;
}

/**
 * Note list — renders notes as a compact, scannable list.
 *
 * Each item shows: type icon, title (first line), excerpt,
 * relative date, status dot, and tag chips.
 */
export function NoteList({
  notes,
  selectedId,
  onSelect,
  onTagClick,
  loading = false,
}: NoteListProps) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-text-tertiary text-sm animate-pulse">
          Loading…
        </span>
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-text-tertiary text-sm italic select-none">
          No notes yet
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" data-testid="note-list">
      {notes.map((note) => (
        <NoteItem
          key={note.id}
          note={note}
          selected={note.id === selectedId}
          onSelect={onSelect}
          onTagClick={onTagClick}
        />
      ))}
    </div>
  );
}

// ── Note Item ──────────────────────────────────────────────────────────

interface NoteItemProps {
  note: Note;
  selected: boolean;
  onSelect: (note: Note) => void;
  onTagClick?: (tag: string) => void;
}

function NoteItem({ note, selected, onSelect, onTagClick }: NoteItemProps) {
  const excerpt = useMemo(() => getExcerpt(note), [note]);
  const relDate = useMemo(() => relativeDate(note.updated_at), [note.updated_at]);

  return (
    <button
      onClick={() => onSelect(note)}
      className={`
        w-full text-left px-3 py-2.5 border-b border-accent-muted/15
        transition-colors duration-150 cursor-pointer
        hover:bg-surface-3/50
        ${selected ? "bg-surface-3/70" : ""}
      `}
      data-testid="note-item"
    >
      <div className="flex items-start gap-2.5">
        {/* Type icon */}
        <span
          className="text-text-tertiary text-xs mt-0.5 shrink-0 w-4 text-center"
          data-testid="note-type-icon"
          title={note.type}
        >
          {note.type === "conversation" ? "◆" : "✎"}
        </span>

        <div className="flex-1 min-w-0">
          {/* Title + status dot */}
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor(note.status)}`}
              data-testid="status-dot"
              title={note.status}
            />
            <span className="text-text-primary text-sm font-medium truncate">
              {note.title || "Untitled"}
            </span>
          </div>

          {/* Excerpt */}
          {excerpt && (
            <p className="text-text-secondary text-xs mt-0.5 truncate">
              {excerpt}
            </p>
          )}

          {/* Date + tags */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-text-tertiary text-[10px]">{relDate}</span>
            {note.tags.map((tag) => (
              <span
                key={tag}
                role={onTagClick ? "button" : undefined}
                onClick={
                  onTagClick
                    ? (e) => {
                        e.stopPropagation();
                        onTagClick(tag);
                      }
                    : undefined
                }
                className={`text-[10px] text-accent-warm/70 bg-accent-warm/10 px-1.5 py-0 rounded ${
                  onTagClick ? "cursor-pointer hover:bg-accent-warm/20" : ""
                }`}
                data-testid="tag-chip"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function getExcerpt(note: Note): string {
  if (!note.content) return "";
  // Skip first line (it's the title), take next line as excerpt
  const lines = note.content.split("\n").filter((l) => l.trim());
  const excerptLine = lines.length > 1 ? lines[1] : lines[0] || "";
  return excerptLine.slice(0, 120);
}

function statusColor(status: string): string {
  switch (status) {
    case "active":
      return "bg-status-active";
    case "completed":
      return "bg-status-completed";
    case "dropped":
      return "bg-status-dropped";
    default:
      return "bg-text-tertiary";
  }
}

function relativeDate(epochSecs: number): string {
  const now = Date.now() / 1000;
  const diff = now - epochSecs;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

  const date = new Date(epochSecs * 1000);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
