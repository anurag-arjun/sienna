import { useState, useCallback } from "react";
import type { MergedContextItem } from "../hooks/useContextItems";

interface ContextCardProps {
  item: MergedContextItem;
  /** Max size in bytes across all items, for relative size bar */
  maxSize: number;
  onRemove: (id: string) => void;
}

/** Icon by context type */
function typeIcon(type: string): string {
  switch (type) {
    case "local":
      return "📁";
    case "github":
      return "⚙";
    case "notion":
      return "📄";
    case "note":
      return "✎";
    case "url":
      return "🔗";
    case "clipboard":
      return "📋";
    default:
      return "·";
  }
}

/**
 * Format file size for display.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Extract preview lines from content cache.
 */
function getPreview(content: string | null, lines: number = 3): string {
  if (!content) return "";
  return content
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .slice(0, lines)
    .join("\n");
}

/**
 * Context Card — displays a single context item in the tray.
 * Shows filename, preview lines, relative size bar, expand/remove controls.
 */
export function ContextCard({ item, maxSize, onRemove }: ContextCardProps) {
  const [expanded, setExpanded] = useState(false);

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove(item.id);
    },
    [item.id, onRemove],
  );

  const contentSize = item.content_cache?.length ?? 0;
  const sizeRatio = maxSize > 0 ? contentSize / maxSize : 0;
  const preview = getPreview(item.content_cache);
  const isFromSet = !!item.fromSet;

  return (
    <div
      className={`group rounded-lg transition-colors mb-2 cursor-pointer ${
        isFromSet
          ? "bg-surface-3/30 hover:bg-surface-3/50 opacity-70"
          : "bg-surface-3/50 hover:bg-surface-3"
      }`}
      onClick={handleToggle}
      data-testid="context-card"
      data-from-set={item.fromSet ?? undefined}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-xs opacity-60 select-none" data-testid="context-card-icon">
          {typeIcon(item.type)}
        </span>
        <span
          className={`text-sm truncate flex-1 ${isFromSet ? "text-text-secondary" : "text-text-primary"}`}
          data-testid="context-card-label"
        >
          {item.label}
        </span>
        {isFromSet && (
          <span
            className="text-[9px] text-text-tertiary opacity-50 select-none"
            data-testid="context-card-set-name"
          >
            {item.fromSet}
          </span>
        )}
        <span className="text-[10px] text-text-tertiary tabular-nums">
          {formatSize(contentSize)}
        </span>
        <button
          onClick={handleRemove}
          className="text-text-tertiary text-xs opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity ml-1"
          title="Remove"
          data-testid="context-card-remove"
        >
          ×
        </button>
      </div>

      {/* Size bar */}
      <div className="px-3 pb-1">
        <div className="h-0.5 bg-accent-muted/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-blue/40 rounded-full transition-all"
            style={{ width: `${Math.max(2, sizeRatio * 100)}%` }}
            data-testid="context-card-sizebar"
          />
        </div>
      </div>

      {/* Preview / expanded content */}
      {!expanded && preview && (
        <div className="px-3 pb-2">
          <pre
            className="text-[11px] text-text-tertiary font-mono leading-tight whitespace-pre-wrap line-clamp-3 select-none"
            data-testid="context-card-preview"
          >
            {preview}
          </pre>
        </div>
      )}

      {expanded && item.content_cache && (
        <div className="px-3 pb-2 max-h-64 overflow-y-auto">
          <pre
            className="text-[11px] text-text-secondary font-mono leading-tight whitespace-pre-wrap"
            data-testid="context-card-full"
          >
            {item.content_cache}
          </pre>
        </div>
      )}
    </div>
  );
}
